import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { Conversation } from "../models/sql/Conversation.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import { Job } from "../models/sql/Job.model.js";
import { body, validationResult } from "express-validator";
import { Op } from 'sequelize';

const router = Router();

/**
 * Get unread messages count
 * GET /api/chat/unread-count
 * Returns:
 * - unreadCount: total number of unread messages
 * - unreadConversations: number of conversations with unread messages
 */
router.get("/unread-count", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.findAll({
      where: {
        participants: {
          [Op.contains]: [userId],
        },
        archived: false,
      },
    });

    let totalUnread = 0;
    let unreadConversations = 0;

    conversations.forEach((conversation) => {
      const unreadCountMap = conversation.unreadCount as Record<string, number> | null;
      const count = unreadCountMap?.[userId.toString()] || 0;
      totalUnread += count;
      if (count > 0) {
        unreadConversations++;
      }
    });

    res.json({
      success: true,
      unreadCount: totalUnread,
      unreadConversations,
    });
  } catch (error: any) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener mensajes no leídos",
    });
  }
});

/**
 * Get all conversations for the authenticated user
 * GET /api/chat/conversations
 */
router.get("/conversations", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { type, page = 1, limit = 20 } = req.query;

    const where: any = {
      participants: {
        [Op.contains]: [userId],
      },
      archived: false,
    };

    if (type) {
      where.type = type;
    }

    // Only show conversations that have at least one message
    const conversationsWithMessages = await ChatMessage.findAll({
      attributes: [[ChatMessage.sequelize!.fn('DISTINCT', ChatMessage.sequelize!.col('conversation_id')), 'conversationId']],
      raw: true,
    });

    const conversationIds = conversationsWithMessages.map((c: any) => c.conversationId);
    where.id = { [Op.in]: conversationIds };

    const conversations = await Conversation.findAll({
      where,
      include: [
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'status', 'jobId'],
          include: [{
            model: Job,
            as: 'job',
            attributes: ['title'],
          }],
        },
        {
          model: Job,
          as: 'job',
          attributes: ['title'],
        },
      ],
      order: [['lastMessageAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    // Collect all participant IDs
    const allParticipantIds = new Set<string>();
    conversations.forEach(conv => {
      conv.participants.forEach(id => allParticipantIds.add(id));
    });

    // Load all participant users in one query
    const participantUsers = await User.findAll({
      where: { id: { [Op.in]: Array.from(allParticipantIds) } },
      attributes: ['id', 'name', 'avatar', 'username'],
    });

    const usersMap = new Map(participantUsers.map(u => [u.id, u]));

    // Transform conversations to include participant objects
    const conversationsData = conversations.map(conv => {
      const data = conv.toJSON();
      data.participants = conv.participants.map(id => {
        const user = usersMap.get(id);
        return user ? {
          id: user.id,
          _id: user.id,
          name: user.name,
          avatar: user.avatar,
          username: user.username,
        } : { id, _id: id, name: 'Usuario', avatar: null };
      });
      return data;
    });

    const total = await Conversation.count({ where });

    res.json({
      success: true,
      data: conversationsData,
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
    const userId = req.user.id;

    // Validate UUID
    if (!id || id.trim() === '') {
      res.status(400).json({
        success: false,
        message: "ID de conversación inválido",
      });
      return;
    }

    const conversation = await Conversation.findByPk(id, {
      include: [
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'status', 'jobId'],
          include: [{
            model: Job,
            as: 'job',
            attributes: ['title'],
          }],
        },
        {
          model: Job,
          as: 'job',
          attributes: ['title'],
        },
      ],
    });

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversación no encontrada",
      });
      return;
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.includes(userId);

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta conversación",
      });
      return;
    }

    // Load participant user data
    const participantUsers = await User.findAll({
      where: { id: { [Op.in]: conversation.participants } },
      attributes: ['id', 'name', 'avatar', 'username'],
    });

    // Transform response to include participant objects
    const conversationData = conversation.toJSON();
    conversationData.participants = participantUsers.map(u => ({
      id: u.id,
      _id: u.id,
      name: u.name,
      avatar: u.avatar,
      username: u.username,
    }));

    res.json({
      success: true,
      data: conversationData,
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
  [body("participantId").isUUID().withMessage("ID de participante inválido")],
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

      const userId = req.user.id;
      const { participantId, message } = req.body;

      // Check if conversation already exists
      const existingConversation = await Conversation.findOne({
        where: {
          participants: {
            [Op.contains]: [userId, participantId],
          },
          type: "direct",
        },
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
          conversationId: conversation.id,
          senderId: userId,
          message,
        });

        conversation.lastMessage = message.substring(0, 200);
        conversation.lastMessageAt = new Date();
        if (!conversation.unreadCount) {
          conversation.unreadCount = {};
        }
        conversation.unreadCount[participantId.toString()] = 1;
        await conversation.save();
      }

      const populatedConversation = await Conversation.findByPk(conversation.id);

      res.status(201).json({
        success: true,
        data: populatedConversation,
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
    const userId = req.user.id;

    // Verify user is part of the contract
    const contract = await Contract.findByPk(contractId);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    const isParticipant =
      contract.clientId === userId ||
      contract.doerId === userId;

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta conversación",
      });
      return;
    }

    // Find or create conversation for this contract
    let conversation = await Conversation.findOne({
      where: { contractId },
      include: [
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'status', 'jobId'],
          include: [{
            model: Job,
            as: 'job',
            attributes: ['title'],
          }],
        },
      ],
    });

    if (!conversation) {
      // Create conversation for this contract
      conversation = await Conversation.create({
        participants: [contract.clientId, contract.doerId],
        contractId,
        type: "contract",
      });

      conversation = await Conversation.findByPk(conversation.id, {
        include: [
          {
            model: Contract,
            as: 'contract',
            attributes: ['id', 'status', 'jobId'],
            include: [{
              model: Job,
              as: 'job',
              attributes: ['title'],
            }],
          },
        ],
      });
    }

    // Load participant user data
    const participantUsers = await User.findAll({
      where: { id: { [Op.in]: conversation!.participants } },
      attributes: ['id', 'name', 'avatar', 'username'],
    });

    // Transform response to include participant objects
    const conversationData = conversation!.toJSON();
    conversationData.participants = participantUsers.map(u => ({
      id: u.id,
      _id: u.id,
      name: u.name,
      avatar: u.avatar,
      username: u.username,
    }));

    res.json({
      success: true,
      data: conversationData,
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
    const userId = req.user.id;
    const { page = 1, limit = 50, before } = req.query;

    // Validate UUID
    if (!id || id.trim() === '') {
      res.status(400).json({
        success: false,
        message: "ID de conversación inválido",
      });
      return;
    }

    // Verify user is participant
    const conversation = await Conversation.findByPk(id);

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversación no encontrada",
      });
      return;
    }

    const isParticipant = conversation.participants.includes(userId);

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver estos mensajes",
      });
      return;
    }

    // Build query
    const where: any = {
      conversationId: id,
      deleted: false,
    };

    if (before) {
      where.createdAt = { [Op.lt]: new Date(before as string) };
    }

    const messages = await ChatMessage.findAll({
      where,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    const total = await ChatMessage.count({ where });

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
 * Send a message in a conversation
 * POST /api/chat/conversations/:id/messages
 */
router.post(
  "/conversations/:id/messages",
  protect,
  [body("content").notEmpty().withMessage("El contenido del mensaje es requerido")],
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

      const { id: conversationId } = req.params;
      const userId = req.user.id;
      const { content } = req.body;

      // Verify conversation exists
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        res.status(404).json({
          success: false,
          message: "Conversación no encontrada",
        });
        return;
      }

      // Verify user is participant
      const isParticipant = conversation.participants.includes(userId);

      if (!isParticipant) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para enviar mensajes en esta conversación",
        });
        return;
      }

      // Create message
      const message = await ChatMessage.create({
        conversationId,
        senderId: userId,
        message: content,
      });

      // Update conversation last message
      conversation.lastMessage = content.substring(0, 100);
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Populate sender info (include id for message alignment in frontend)
      const populatedMessage = await ChatMessage.findByPk(message.id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name', 'avatar'],
          },
        ],
      });

      res.status(201).json({
        success: true,
        message: populatedMessage,
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
    const userId = req.user.id;

    const message = await ChatMessage.findByPk(id);

    if (!message) {
      res.status(404).json({
        success: false,
        message: "Mensaje no encontrado",
      });
      return;
    }

    // Only sender can delete their message
    if (message.senderId !== userId) {
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
    const userId = req.user.id;

    const conversation = await Conversation.findByPk(id);

    if (!conversation) {
      res.status(404).json({
        success: false,
        message: "Conversación no encontrada",
      });
      return;
    }

    const isParticipant = conversation.participants.includes(userId);

    if (!isParticipant) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para archivar esta conversación",
      });
      return;
    }

    // Add user to archivedBy array
    if (!conversation.archivedBy) {
      conversation.archivedBy = [];
    }
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
 * Get unread message count (duplicate endpoint - same as first one)
 * GET /api/chat/unread-count
 */
router.get("/unread-count-duplicate", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.findAll({
      where: {
        participants: {
          [Op.contains]: [userId],
        },
        archived: false,
      },
    });

    let totalUnread = 0;
    conversations.forEach((conversation) => {
      const unreadCount = conversation.unreadCount as Record<string, number> | null;
      const count = unreadCount?.[userId.toString()] || 0;
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
