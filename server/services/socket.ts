import { Server, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import ChatMessage from "../models/ChatMessage";
import Conversation from "../models/Conversation";
import User from "../models/User";
import Notification from "../models/Notification";
import fcmService from "./fcm";
import emailService from "./email";

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
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
          return next(new Error("Authentication error: User not found"));
        }

        socket.userId = user._id.toString();
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
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      // Verify user is a participant
      const isParticipant = conversation.participants.some(
        (p) => p.toString() === socket.userId
      );

      if (!isParticipant) {
        socket.emit("error", { message: "You are not a participant in this conversation" });
        return;
      }

      socket.join(`conversation:${conversationId}`);

      // Load recent messages
      const messages = await ChatMessage.find({
        conversationId,
        deleted: false,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate("sender", "name avatar");

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
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === socket.userId
      );

      if (!isParticipant) {
        socket.emit("error", { message: "You are not a participant in this conversation" });
        return;
      }

      // Create message
      const chatMessage = await ChatMessage.create({
        conversationId,
        sender: socket.userId,
        message,
        type,
        fileUrl,
        fileName,
        fileSize,
      });

      await chatMessage.populate("sender", "name avatar");

      // Update conversation
      conversation.lastMessage = message.substring(0, 200);
      conversation.lastMessageAt = new Date();

      // Increment unread count for other participants
      conversation.participants.forEach((participantId) => {
        const participantIdStr = participantId.toString();
        if (participantIdStr !== socket.userId) {
          const currentCount = conversation.unreadCount.get(participantIdStr) || 0;
          conversation.unreadCount.set(participantIdStr, currentCount + 1);
        }
      });

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

        if (!isOnline) {
          // Create notification for offline user
          await Notification.create({
            userId: participantId,
            type: "new_message",
            title: "Nuevo mensaje",
            message: `${socket.user.name}: ${message.substring(0, 100)}`,
            metadata: {
              conversationId,
              senderId: socket.userId,
            },
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

      const message = await ChatMessage.findById(messageId);

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
      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return;
      }

      // Mark all unread messages as read
      await ChatMessage.updateMany(
        {
          conversationId,
          sender: { $ne: socket.userId },
          read: false,
        },
        {
          read: true,
          readAt: new Date(),
        }
      );

      // Reset unread count for this user
      conversation.unreadCount.set(socket.userId!, 0);
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
        sender: null, // System message
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
}

export default SocketService;
