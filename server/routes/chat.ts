import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import Conversation from "../models/Conversation";
import ChatMessage from "../models/ChatMessage";
import Contract from "../models/Contract";
import { body, validationResult } from "express-validator";
import { socketService } from "../index.js";

const router = Router();

/**
 * Get all conversations for the authenticated user
 * GET /api/chat/conversations
 */
router.get("/conversations", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const { type, page = 1, limit = 20 } = req.query;

    const query: any = {
      participants: userId,
      archived: false,
    };

    if (type) {
      query.type = type;
    }

    const conversations = await Conversation.find(query)
      .populate("participants", "name avatar lastLogin")
      .populate("contractId", "title status")
      .sort({ lastMessageAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Conversation.countDocuments(query);

    res.json({
      success: true,
      data: conversations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Get conversations error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get a single conversation by ID
 * GET /api/chat/conversations/:id
 */
router.get("/conversations/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(id)
      .populate("participants", "name avatar lastLogin")
      .populate("contractId", "title status")
      .populate("jobId", "title price");

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversación no encontrada",
      });
      return;
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p: any) => p._id.toString() === userId.toString()
    );

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta conversación",
      });
      return;
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error: any) {
    console.error("Get conversation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Create a new conversation (direct message)
 * POST /api/chat/conversations
 */
router.post(
  "/conversations",
  protect,
  [body("participantId").isMongoId().withMessage("ID de participante inválido")],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const userId = req.user._id;
      const { participantId, message } = req.body;

      // Check if conversation already exists
      const existingConversation = await Conversation.findOne({
        participants: { $all: [userId, participantId] },
        type: "direct",
      });

      if (existingConversation) {
        res.json({
          success: true,
          data: existingConversation,
          message: "Conversación ya existe",
        });
        return;
      }

      // Create new conversation
      const conversation = await Conversation.create({
        participants: [userId, participantId],
        type: "direct",
      });

      // Create initial message if provided
      if (message) {
        const chatMessage = await ChatMessage.create({
          conversationId: conversation._id,
          sender: userId,
          message,
        });

        await chatMessage.populate("sender", "name avatar");

        conversation.lastMessage = message.substring(0, 200);
        conversation.lastMessageAt = new Date();
        conversation.unreadCount.set(participantId.toString(), 1);
        await conversation.save();

        // Emit Socket.io event for real-time update
        const io = socketService.getIO();
        io.to(`conversation:${conversation._id.toString()}`).emit("message:new", chatMessage);
      }

      await conversation.populate("participants", "name avatar lastLogin");

      res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (error: any) {
      console.error("Create conversation error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get conversation for a specific contract
 * GET /api/chat/contract/:contractId
 */
router.get("/contract/:contractId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user._id;

    // Verify user is part of the contract
    const contract = await Contract.findById(contractId);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    const isParticipant =
      contract.client.toString() === userId.toString() ||
      contract.doer.toString() === userId.toString();

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta conversación",
      });
      return;
    }

    // Find or create conversation for this contract
    let conversation = await Conversation.findOne({ contractId })
      .populate("participants", "name avatar lastLogin")
      .populate("contractId", "title status");

    if (!conversation) {
      // Create conversation for this contract
      conversation = await Conversation.create({
        participants: [contract.client, contract.doer],
        contractId,
        type: "contract",
      });

      await conversation.populate("participants", "name avatar lastLogin");
      await conversation.populate("contractId", "title status");
    }

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error: any) {
    console.error("Get contract conversation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get messages for a conversation
 * GET /api/chat/conversations/:id/messages
 */
router.get("/conversations/:id/messages", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 50, before } = req.query;

    // Verify user is participant
    const conversation = await Conversation.findById(id);

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversación no encontrada",
      });
      return;
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver estos mensajes",
      });
      return;
    }

    // Build query
    const query: any = {
      conversationId: id,
      deleted: false,
    };

    if (before) {
      query.createdAt = { $lt: new Date(before as string) };
    }

    const messages = await ChatMessage.find(query)
      .populate("sender", "name avatar")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await ChatMessage.countDocuments(query);

    res.json({
      success: true,
      data: messages.reverse(), // Return in chronological order
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Send a message to a conversation
 * POST /api/chat/conversations/:id/messages
 */
router.post(
  "/conversations/:id/messages",
  protect,
  [
    body("message").trim().notEmpty().withMessage("El mensaje es requerido"),
    body("type").optional().isIn(["text", "proposal", "system"]).withMessage("Tipo de mensaje inválido"),
    body("proposalAmount").optional().isNumeric().withMessage("Monto de propuesta inválido"),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { id } = req.params;
      const userId = req.user._id;
      const { message, type = "text", proposalAmount } = req.body;

      // Verify user is participant
      const conversation = await Conversation.findById(id);

      if (!conversation) {
        res.status(404).json({
          success: false,
          message: "Conversación no encontrada",
        });
        return;
      }

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === userId.toString()
      );

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para enviar mensajes en esta conversación",
        });
        return;
      }

      // Create message
      const chatMessage = await ChatMessage.create({
        conversationId: id,
        sender: userId,
        message,
        type,
        proposalAmount: type === "proposal" ? proposalAmount : undefined,
      });

      // Update conversation
      conversation.lastMessage = message.substring(0, 200);
      conversation.lastMessageAt = new Date();

      // Update unread count for other participants
      conversation.participants.forEach((participantId) => {
        if (participantId.toString() !== userId.toString()) {
          const currentCount = conversation.unreadCount.get(participantId.toString()) || 0;
          conversation.unreadCount.set(participantId.toString(), currentCount + 1);
        }
      });

      await conversation.save();

      // Populate sender info
      await chatMessage.populate("sender", "name avatar");

      // Emit Socket.io event for real-time update
      const io = socketService.getIO();
      io.to(`conversation:${id}`).emit("message:new", chatMessage);

      // Also emit to all participants' personal rooms for notification updates
      conversation.participants.forEach((participantId) => {
        io.to(`user:${participantId.toString()}`).emit("conversation:updated", {
          conversationId: id,
          lastMessage: message.substring(0, 200),
          lastMessageAt: conversation.lastMessageAt,
        });
      });

      res.status(201).json({
        success: true,
        data: chatMessage,
      });
    } catch (error: any) {
      console.error("Send message error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Delete a message
 * DELETE /api/chat/messages/:id
 */
router.delete("/messages/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const message = await ChatMessage.findById(id);

    if (!message) {
      res.status(404).json({
        success: false,
        message: "Mensaje no encontrado",
      });
      return;
    }

    // Only sender can delete their message
    if (message.sender.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo puedes eliminar tus propios mensajes",
      });
      return;
    }

    message.deleted = true;
    message.deletedAt = new Date();
    message.message = "[Mensaje eliminado]";
    await message.save();

    res.json({
      success: true,
      message: "Mensaje eliminado",
    });
  } catch (error: any) {
    console.error("Delete message error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Archive a conversation
 * PUT /api/chat/conversations/:id/archive
 */
router.put("/conversations/:id/archive", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(id);

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversación no encontrada",
      });
      return;
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId.toString()
    );

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para archivar esta conversación",
      });
      return;
    }

    // Add user to archivedBy array
    if (!conversation.archivedBy.includes(userId)) {
      conversation.archivedBy.push(userId);
    }

    // Mark as archived if all participants have archived it
    if (conversation.archivedBy.length === conversation.participants.length) {
      conversation.archived = true;
    }

    await conversation.save();

    res.json({
      success: true,
      message: "Conversación archivada",
    });
  } catch (error: any) {
    console.error("Archive conversation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get unread message count
 * GET /api/chat/unread-count
 */
router.get("/unread-count", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      participants: userId,
      archived: false,
    });

    let totalUnread = 0;
    conversations.forEach((conversation) => {
      const count = conversation.unreadCount.get(userId.toString()) || 0;
      totalUnread += count;
    });

    res.json({
      success: true,
      data: {
        total: totalUnread,
      },
    });
  } catch (error: any) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
