import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { initializeDatabase } from './database.js';
import { redis, onlineUsers, pubsub } from './redis.js';
import { ChatMessage } from './models/ChatMessage.model.js';
import { Conversation } from './models/Conversation.model.js';
import { Op } from 'sequelize';

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ===========================================
// MIDDLEWARE
// ===========================================

app.use(helmet());
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(express.json());

if (!config.isProduction) {
  app.use(morgan('dev'));
}

// ===========================================
// SOCKET.IO AUTHENTICATION
// ===========================================

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token as string, config.jwt.secret) as { id: string };
    socket.data.userId = decoded.id;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

// ===========================================
// SOCKET.IO EVENTS
// ===========================================

io.on('connection', async (socket) => {
  const userId = socket.data.userId;
  console.log(`[Chat] User connected: ${userId}`);

  // Mark user as online
  await onlineUsers.setOnline(userId, socket.id);

  // Join user's room
  socket.join(`user:${userId}`);

  // Notify others that user is online
  socket.broadcast.emit('user:online', { userId });

  // Handle joining conversations
  socket.on('conversation:join', async (conversationId: string) => {
    const conversation = await Conversation.findByPk(conversationId);
    if (conversation && conversation.hasParticipant(userId)) {
      socket.join(`conversation:${conversationId}`);
      console.log(`[Chat] User ${userId} joined conversation ${conversationId}`);
    }
  });

  // Handle sending messages
  socket.on('message:send', async (data: {
    conversationId?: string;
    receiverId: string;
    content: string;
    type?: string;
    fileUrl?: string;
    fileName?: string;
  }) => {
    try {
      // Get or create conversation
      const conversation = data.conversationId
        ? await Conversation.findByPk(data.conversationId)
        : await Conversation.findOrCreateConversation(userId, data.receiverId);

      if (!conversation) {
        socket.emit('message:error', { error: 'Conversation not found' });
        return;
      }

      // Create message
      const message = await ChatMessage.create({
        conversationId: conversation.id,
        senderId: userId,
        receiverId: data.receiverId,
        content: data.content,
        type: data.type || 'text',
        fileUrl: data.fileUrl,
        fileName: data.fileName,
      });

      // Update conversation
      await conversation.updateLastMessage(message.id, data.content, userId);

      // Emit to all participants
      io.to(`conversation:${conversation.id}`).emit('message:new', {
        message,
        conversationId: conversation.id,
      });

      // Also emit to receiver's user room (in case they're not in conversation)
      io.to(`user:${data.receiverId}`).emit('message:notification', {
        message,
        conversationId: conversation.id,
        senderId: userId,
      });

      // Publish for other services (notifications)
      await pubsub.publish('chat:message', {
        messageId: message.id,
        conversationId: conversation.id,
        senderId: userId,
        receiverId: data.receiverId,
        content: data.content.substring(0, 100),
      });

      socket.emit('message:sent', { messageId: message.id });
    } catch (error: any) {
      console.error('[Chat] Send message error:', error);
      socket.emit('message:error', { error: error.message });
    }
  });

  // Handle typing indicators
  socket.on('typing:start', (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:indicator', {
      userId,
      isTyping: true,
    });
  });

  socket.on('typing:stop', (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:indicator', {
      userId,
      isTyping: false,
    });
  });

  // Handle message read
  socket.on('message:read', async (data: { conversationId: string; messageId?: string }) => {
    const conversation = await Conversation.findByPk(data.conversationId);
    if (conversation && conversation.hasParticipant(userId)) {
      await conversation.markAsReadFor(userId);

      if (data.messageId) {
        const message = await ChatMessage.findByPk(data.messageId);
        if (message && message.receiverId === userId) {
          await message.markAsRead();
        }
      }

      // Notify sender that messages were read
      const otherUserId = conversation.getOtherParticipant(userId);
      io.to(`user:${otherUserId}`).emit('message:read', {
        conversationId: data.conversationId,
        readBy: userId,
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`[Chat] User disconnected: ${userId}`);
    await onlineUsers.setOffline(userId);
    socket.broadcast.emit('user:offline', { userId });
  });
});

// ===========================================
// HTTP ROUTES
// ===========================================

const getUserId = (req: express.Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// Health check
app.get('/health', async (req, res) => {
  res.json({
    success: true,
    service: config.serviceName,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.engine.clientsCount,
  });
});

// Get conversations
app.get('/conversations', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const conversations = await Conversation.findAll({
      where: {
        [Op.or]: [
          { participant1Id: userId },
          { participant2Id: userId },
        ],
      },
      order: [['lastMessageAt', 'DESC']],
    });

    res.json({
      success: true,
      conversations: conversations.map(c => ({
        ...c.toJSON(),
        unreadCount: c.getUnreadCountFor(userId),
        otherParticipantId: c.getOtherParticipant(userId),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get messages for conversation
app.get('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const conversation = await Conversation.findByPk(req.params.id);
    if (!conversation || !conversation.hasParticipant(userId)) {
      res.status(403).json({ success: false, message: 'Acceso denegado' });
      return;
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows: messages } = await ChatMessage.findAndCountAll({
      where: {
        conversationId: req.params.id,
        isDeleted: false,
      },
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start conversation
app.post('/conversations', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { participantId, jobId, contractId, initialMessage } = req.body;

    if (!participantId) {
      res.status(400).json({ success: false, message: 'participantId requerido' });
      return;
    }

    const conversation = await Conversation.findOrCreateConversation(
      userId,
      participantId,
      { jobId, contractId }
    );

    // Send initial message if provided
    if (initialMessage) {
      const message = await ChatMessage.create({
        conversationId: conversation.id,
        senderId: userId,
        receiverId: participantId,
        content: initialMessage,
        type: 'text',
      });

      await conversation.updateLastMessage(message.id, initialMessage, userId);

      // Emit via socket
      io.to(`user:${participantId}`).emit('message:notification', {
        message,
        conversationId: conversation.id,
        senderId: userId,
      });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check if user is online
app.get('/users/:id/online', async (req, res) => {
  const isOnline = await onlineUsers.isOnline(req.params.id);
  res.json({ success: true, isOnline });
});

// ===========================================
// ERROR HANDLING
// ===========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
  });
});

// ===========================================
// START SERVER
// ===========================================

async function startServer() {
  try {
    await initializeDatabase();

    httpServer.listen(config.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║              DOAPP CHAT SERVICE                       ║
╠═══════════════════════════════════════════════════════╣
║  Port: ${config.port}                                         ║
║  Environment: ${config.nodeEnv.padEnd(39)}║
║  Socket.io: Enabled                                   ║
║  Redis: ${config.redis.url.padEnd(45)}║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error(`[${config.serviceName}] Failed to start:`, error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log(`[${config.serviceName}] SIGTERM received...`);
  io.close();
  redis.disconnect();
  process.exit(0);
});

startServer();

export { io };
export default app;
