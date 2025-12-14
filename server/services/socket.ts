import { Server, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { Conversation } from "../models/sql/Conversation.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import fcmService from "./fcm";
import emailService from "./email";
import { Op } from 'sequelize';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

interface TypingData {
  conversationId: string;
  isTyping: boolean;
}

interface MessageData {
  conversationId: string;
  message: string;
  type?: "text" | "image" | "file";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

interface ReadReceiptData {
  conversationId: string;
  messageId: string;
}

export class SocketService {
  private io: Server;
  private userSockets: Map<string, string> = new Map(); // userId -> socketId

  constructor(httpServer: HTTPServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.clientUrl,
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];

        if (!token) {
          return next(new Error("Authentication error: No token provided"));
        }

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        const user = await User.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });

        if (!user) {
          return next(new Error("Authentication error: User not found"));
        }

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        next(new Error("Authentication error: Invalid token"));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`✅ User connected: ${socket.userId}`);

      // Store user socket mapping
      if (socket.userId) {
        this.userSockets.set(socket.userId, socket.id);
      }

      // Join user's personal room
      socket.join(`user:${socket.userId}`);

      // Send online status to contacts
      this.broadcastOnlineStatus(socket.userId!, true);

      // Handle joining conversation rooms
      socket.on("join:conversation", async (conversationId: string) => {
        await this.handleJoinConversation(socket, conversationId);
      });

      // Handle leaving conversation rooms
      socket.on("leave:conversation", (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
      });

      // Handle sending messages
      socket.on("message:send", async (data: MessageData) => {
        await this.handleSendMessage(socket, data);
      });

      // Handle typing indicators
      socket.on("typing:start", (data: TypingData) => {
        this.handleTyping(socket, data, true);
      });

      socket.on("typing:stop", (data: TypingData) => {
        this.handleTyping(socket, data, false);
      });

      // Handle read receipts
      socket.on("message:read", async (data: ReadReceiptData) => {
        await this.handleReadReceipt(socket, data);
      });

      // Handle mark all as read
      socket.on("conversation:mark-read", async (conversationId: string) => {
        await this.handleMarkConversationRead(socket, conversationId);
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.userId}`);
        if (socket.userId) {
          this.userSockets.delete(socket.userId);
          this.broadcastOnlineStatus(socket.userId, false);
        }
      });
    });
  }

  private async handleJoinConversation(socket: AuthenticatedSocket, conversationId: string) {
    try {
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      // Verify user is a participant - normalize IDs to strings for comparison
      const userId = socket.userId?.toString() || '';
      // Normalize all participant IDs to strings for comparison
      const participantIds = conversation.participants.map(p => p?.toString() || '');
      const isParticipant = participantIds.includes(userId);

      console.log(`🔍 Join conversation check: userId=${userId}, participants=${JSON.stringify(participantIds)}, isParticipant=${isParticipant}`);

      if (!isParticipant) {
        socket.emit("error", { message: "You are not a participant in this conversation" });
        return;
      }

      socket.join(`conversation:${conversationId}`);

      // Load recent messages
      const messages = await ChatMessage.findAll({
        where: {
          conversationId,
        },
        order: [['createdAt', 'DESC']],
        limit: 50,
        include: [{
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }]
      });

      socket.emit("conversation:history", {
        conversationId,
        messages: messages.reverse(),
      });
    } catch (error: any) {
      console.error("Join conversation error:", error);
      socket.emit("error", { message: error.message });
    }
  }

  private async handleSendMessage(socket: AuthenticatedSocket, data: MessageData) {
    try {
      const { conversationId, message, type = "text", fileUrl, fileName, fileSize } = data;

      // Verify conversation exists and user is participant
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      // Verify user is a participant - normalize IDs to strings for comparison
      const senderId = socket.userId?.toString() || '';
      const participantIds = conversation.participants.map(p => p?.toString() || '');
      const isParticipant = participantIds.includes(senderId);

      if (!isParticipant) {
        console.log(`❌ Message rejected: userId=${senderId}, participants=${JSON.stringify(participantIds)}`);
        socket.emit("error", { message: "You are not a participant in this conversation" });
        return;
      }

      // Create message
      const chatMessage = await ChatMessage.create({
        conversationId,
        senderId: socket.userId,
        message,
        type,
        fileUrl,
        fileName,
        fileSize,
      });

      // Reload with sender data (include id for message alignment in frontend)
      await chatMessage.reload({
        include: [{
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }]
      });

      // Update conversation
      conversation.lastMessage = message.substring(0, 200);
      conversation.lastMessageAt = new Date();

      // Increment unread count for other participants
      conversation.participants.forEach((participantId) => {
        const participantIdStr = participantId.toString();
        if (participantIdStr !== socket.userId) {
          if (!conversation.unreadCount) conversation.unreadCount = {};
          conversation.unreadCount[participantIdStr] = (conversation.unreadCount[participantIdStr] || 0) + 1;
        }
      });
      // Mark unreadCount as changed for Sequelize to detect JSONB update
      conversation.changed('unreadCount', true);

      await conversation.save();

      // Broadcast message to all participants in the conversation
      this.io.to(`conversation:${conversationId}`).emit("message:new", chatMessage);

      // Send push notification to offline participants
      const otherParticipants = conversation.participants.filter(
        (p) => p.toString() !== socket.userId
      );

      for (const participantId of otherParticipants) {
        const participantIdStr = participantId.toString();
        const isOnline = this.userSockets.has(participantIdStr);

        // Notify unread count update to the recipient
        const participantConversations = await Conversation.findAll({
          where: {
            participants: { [Op.contains]: [participantIdStr] },
            archived: false,
          },
          attributes: ['id', 'unreadCount']
        });

        const conversationIds = participantConversations.map(c => c.id);

        const unreadCount = await ChatMessage.count({
          where: {
            conversationId: {
              [Op.in]: conversationIds
            },
            senderId: { [Op.ne]: participantId },
            read: false,
          }
        });

        // Count conversations with unread messages for this user
        let unreadConversationsCount = 0;
        participantConversations.forEach((conv) => {
          const unreadMap = conv.unreadCount as Record<string, number> | null;
          const count = unreadMap?.[participantIdStr] || 0;
          if (count > 0) {
            unreadConversationsCount++;
          }
        });

        this.notifyUnreadMessagesUpdate(participantIdStr, unreadCount, unreadConversationsCount);

        if (!isOnline) {
          // Create notification for offline user
          await Notification.create({
            recipientId: participantIdStr,
            type: "info",
            category: "chat",
            title: "Nuevo mensaje",
            message: `${socket.user.name}: ${message.substring(0, 100)}`,
            data: {
              conversationId,
              senderId: socket.userId,
            },
            read: false,
          });

          // Send push notification
          await fcmService.notifyNewMessage(
            participantIdStr,
            socket.user.name,
            message.substring(0, 100),
            conversationId
          );

          // Send email notification
          await emailService.sendNewMessageNotification(
            participantIdStr,
            socket.user.name,
            message.substring(0, 100),
            conversationId
          );
        }
      }
    } catch (error: any) {
      console.error("Send message error:", error);
      socket.emit("error", { message: error.message });
    }
  }

  private handleTyping(socket: AuthenticatedSocket, data: TypingData, isTyping: boolean) {
    const { conversationId } = data;

    // Broadcast typing status to other participants in the conversation
    socket.to(`conversation:${conversationId}`).emit("typing:update", {
      conversationId,
      userId: socket.userId,
      userName: socket.user.name,
      isTyping,
    });
  }

  private async handleReadReceipt(socket: AuthenticatedSocket, data: ReadReceiptData) {
    try {
      const { conversationId, messageId } = data;

      const message = await ChatMessage.findByPk(messageId);

      if (!message) {
        return;
      }

      // Update message as read
      message.read = true;
      message.readAt = new Date();
      await message.save();

      // Broadcast read receipt to sender
      this.io.to(`conversation:${conversationId}`).emit("message:read", {
        conversationId,
        messageId,
        readBy: socket.userId,
        readAt: message.readAt,
      });
    } catch (error: any) {
      console.error("Read receipt error:", error);
    }
  }

  private async handleMarkConversationRead(socket: AuthenticatedSocket, conversationId: string) {
    try {
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        return;
      }

      // Mark all unread messages as read
      await ChatMessage.update(
        {
          read: true,
          readAt: new Date(),
        },
        {
          where: {
            conversationId,
            senderId: { [Op.ne]: socket.userId },
            read: false,
          }
        }
      );

      // Reset unread count for this user
      if (!conversation.unreadCount) conversation.unreadCount = {};
      conversation.unreadCount[socket.userId!] = 0;
      conversation.changed('unreadCount', true);
      await conversation.save();

      socket.emit("conversation:marked-read", { conversationId });
    } catch (error: any) {
      console.error("Mark conversation read error:", error);
    }
  }

  private broadcastOnlineStatus(userId: string, isOnline: boolean) {
    this.io.emit("user:status", {
      userId,
      isOnline,
      timestamp: new Date(),
    });
  }

  // Public methods to send messages from server-side code
  public async sendSystemMessage(conversationId: string, message: string) {
    try {
      const chatMessage = await ChatMessage.create({
        conversationId,
        senderId: null, // System message
        message,
        type: "system",
      });

      this.io.to(`conversation:${conversationId}`).emit("message:new", chatMessage);
    } catch (error) {
      console.error("Send system message error:", error);
    }
  }

  public async notifyUser(userId: string, event: string, data: any) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  public getIO(): Server {
    return this.io;
  }

  // Broadcast updates to specific users
  public broadcastToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Broadcast contract updates
  public notifyContractUpdate(contractId: string, clientId: string, doerId: string, data: any) {
    this.broadcastToUser(clientId, "contract:updated", { contractId, ...data });
    this.broadcastToUser(doerId, "contract:updated", { contractId, ...data });
  }

  // Broadcast job updates
  public notifyJobUpdate(jobId: string, clientId: string, data: any) {
    this.broadcastToUser(clientId, "job:updated", { jobId, ...data });
    // Broadcast to all users for job listings
    this.io.emit("jobs:refresh", { jobId, ...data });
  }

  // Broadcast proposal updates
  public notifyProposalUpdate(proposalId: string, freelancerId: string, clientId: string, data: any) {
    this.broadcastToUser(freelancerId, "proposal:updated", { proposalId, ...data });
    this.broadcastToUser(clientId, "proposal:updated", { proposalId, ...data });
    // Also refresh the job owner's jobs list
    this.broadcastToUser(clientId, "myjobs:refresh", { proposalId, ...data });
  }

  // Broadcast payment updates
  public notifyPaymentUpdate(paymentId: string, clientId: string, doerId: string, data: any) {
    this.broadcastToUser(clientId, "payment:updated", { paymentId, ...data });
    this.broadcastToUser(doerId, "payment:updated", { paymentId, ...data });
  }

  // Broadcast dashboard refresh
  public notifyDashboardRefresh(userId: string) {
    this.broadcastToUser(userId, "dashboard:refresh", {});
  }

  // Notify unread message count update
  public notifyUnreadMessagesUpdate(userId: string, unreadCount: number, unreadConversations?: number) {
    this.broadcastToUser(userId, "unread:updated", { unreadCount, unreadConversations: unreadConversations ?? 0 });
  }

  // ============================================
  // ADMIN REAL-TIME BROADCASTS
  // ============================================

  // Broadcast new job created (for admin panel)
  public notifyNewJob(job: any) {
    this.io.emit("admin:job:created", { job, timestamp: new Date() });
    // Also notify job listings refresh
    this.io.emit("jobs:refresh", { action: "created", job });
  }

  // Broadcast job status changed
  public notifyJobStatusChanged(job: any, previousStatus: string) {
    this.io.emit("admin:job:updated", { job, previousStatus, timestamp: new Date() });
    this.io.emit("jobs:refresh", { action: "updated", job });
  }

  // Broadcast job updated (general updates, not just status)
  public notifyAdminJobUpdated(job: any) {
    this.io.emit("admin:job:updated", { job, timestamp: new Date() });
    this.io.emit("jobs:refresh", { action: "updated", job });
  }

  // Broadcast new proposal (for admin and job owner)
  public notifyNewProposal(proposal: any, jobOwnerId: string) {
    this.io.emit("admin:proposal:created", { proposal, timestamp: new Date() });
    this.broadcastToUser(jobOwnerId, "proposal:new", { proposal });
    // Also refresh the job owner's jobs list
    this.broadcastToUser(jobOwnerId, "myjobs:refresh", { proposal });
  }

  // Broadcast new contract created
  public notifyNewContract(contract: any) {
    this.io.emit("admin:contract:created", { contract, timestamp: new Date() });
  }

  // Broadcast contract status changed
  public notifyContractStatusChanged(contract: any, previousStatus: string) {
    this.io.emit("admin:contract:updated", { contract, previousStatus, timestamp: new Date() });
  }

  // Broadcast new payment (for admin)
  public notifyNewPayment(payment: any) {
    this.io.emit("admin:payment:created", { payment, timestamp: new Date() });
  }

  // Broadcast payment status changed
  public notifyPaymentStatusChanged(payment: any, previousStatus: string) {
    this.io.emit("admin:payment:updated", { payment, previousStatus, timestamp: new Date() });
  }

  // Broadcast new user registered
  public notifyNewUser(user: any) {
    this.io.emit("admin:user:created", {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      },
      timestamp: new Date()
    });
  }

  // Broadcast new dispute
  public notifyNewDispute(dispute: any) {
    this.io.emit("admin:dispute:created", { dispute, timestamp: new Date() });
  }

  // Broadcast dispute status changed
  public notifyDisputeStatusChanged(dispute: any, previousStatus: string) {
    this.io.emit("admin:dispute:updated", { dispute, previousStatus, timestamp: new Date() });
  }

  // Broadcast new ticket
  public notifyNewTicket(ticket: any) {
    this.io.emit("admin:ticket:created", { ticket, timestamp: new Date() });
  }

  // ============================================
  // USER NOTIFICATION BROADCASTS
  // ============================================

  // Send notification to specific user
  public notifyUser(userId: string, notification: any) {
    this.broadcastToUser(userId, "notification:new", notification);
  }

  // Broadcast ticket status changed
  public notifyTicketStatusChanged(ticket: any, previousStatus: string) {
    this.io.emit("admin:ticket:updated", { ticket, previousStatus, timestamp: new Date() });
  }

  // Broadcast new withdrawal request
  public notifyNewWithdrawal(withdrawal: any) {
    this.io.emit("admin:withdrawal:created", { withdrawal, timestamp: new Date() });
  }

  // Broadcast withdrawal status changed
  public notifyWithdrawalStatusChanged(withdrawal: any, previousStatus: string) {
    this.io.emit("admin:withdrawal:updated", { withdrawal, previousStatus, timestamp: new Date() });
  }

  // Generic admin notification
  public notifyAdminEvent(event: string, data: any) {
    this.io.emit(`admin:${event}`, { ...data, timestamp: new Date() });
  }
}

export default SocketService;
