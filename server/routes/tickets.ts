import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { Ticket } from "../models/sql/Ticket.model.js";
import { User } from "../models/sql/User.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { protect, AuthRequest } from "../middleware/auth";
import { checkPermission } from "../middleware/checkPermission.js";
import { PERMISSIONS } from "../config/permissions.js";
import emailService from "../services/email.js";
import { uploadTicketAttachments, getFileUrl } from "../middleware/upload.js";

const router = Router();
console.log("🎫 Tickets router created successfully");

// Simple test route
router.get("/test", (req, res) => {
  console.log("🎫 Test route hit!");
  res.json({ success: true, message: "Tickets route is working!" });
});

/**
 * Create a new ticket
 * POST /api/tickets
 */
router.post(
  "/",
  protect,
  checkPermission(PERMISSIONS.TICKET_CREATE),
  uploadTicketAttachments,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // Validate required fields manually after upload
      const { subject, category, priority, message, relatedUser, relatedContract, tags } = req.body;

      if (!subject || !subject.trim()) {
        res.status(400).json({
          success: false,
          message: "El asunto es requerido",
        });
        return;
      }

      if (!message || !message.trim()) {
        res.status(400).json({
          success: false,
          message: "El mensaje es requerido",
        });
        return;
      }

      const validCategories = ["bug", "feature", "support", "report_user", "report_contract", "dispute", "payment", "other"];
      if (!category || !validCategories.includes(category)) {
        res.status(400).json({
          success: false,
          message: "Categoría inválida",
        });
        return;
      }

      const files = (req as any).files as Express.Multer.File[];

      // Process uploaded files
      const attachments = files && files.length > 0 ? files.map((file) => {
        let fileType: "image" | "pdf" = file.mimetype === "application/pdf" ? "pdf" : "image";

        return {
          fileName: file.originalname,
          fileUrl: getFileUrl(file.path, req),
          fileType,
          fileSize: file.size,
          uploadedAt: new Date(),
        };
      }) : [];

      // Generate ticket number
      const ticketCount = await Ticket.count();
      const ticketNumber = `TK-${String(ticketCount + 1).padStart(6, '0')}`;

      const ticket = await Ticket.create({
        ticketNumber,
        subject,
        category,
        priority: priority || "medium",
        createdBy: req.user.id,
        relatedUser,
        relatedContract,
        tags: tags || [],
        attachments,
        messages: [
          {
            author: req.user.id,
            message,
            isInternal: false,
            attachments: attachments.length > 0 ? attachments : undefined,
          },
        ],
      });

      await ticket.reload({
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      // Send email notification to user
      const user = await User.findByPk(req.user.id);
      if (user?.email) {
        await emailService.sendTicketCreatedEmail(
          ticket.id,
          ticketNumber,
          subject,
          user.email,
          user.name
        );
      }

      res.status(201).json({
        success: true,
        ticket,
      });
    } catch (error: any) {
      console.error("Create ticket error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get all tickets (user's own tickets or all if admin)
 * GET /api/tickets
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, category, priority } = req.query;
    const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);

    const where: any = isAdmin ? {} : { createdBy: req.user.id };

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    const tickets = await Ticket.findAll({
      where,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    res.json({
      success: true,
      count: tickets.length,
      tickets,
    });
  } catch (error: any) {
    console.error("Get tickets error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get single ticket by ID
 * GET /api/tickets/:id
 */
router.get("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await Ticket.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email', 'avatar'],
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'email', 'avatar'],
        },
        {
          model: User,
          as: 'related',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'job'],
        },
      ],
    });

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Check permissions
    const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);
    const isOwner = ticket.createdBy === req.user.id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este ticket",
      });
      return;
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error("Get ticket error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Add message to ticket
 * POST /api/tickets/:id/messages
 */
router.post(
  "/:id/messages",
  protect,
  uploadTicketAttachments,
  [body("message").notEmpty().withMessage("El mensaje es requerido").trim()],
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

      const ticket = await Ticket.findByPk(req.params.id);
      const files = (req as any).files as Express.Multer.File[];

      // Process uploaded files
      const attachments = files && files.length > 0 ? files.map((file) => {
        let fileType: "image" | "pdf" = file.mimetype === "application/pdf" ? "pdf" : "image";

        return {
          fileName: file.originalname,
          fileUrl: getFileUrl(file.path, req),
          fileType,
          fileSize: file.size,
          uploadedAt: new Date(),
        };
      }) : undefined;

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      // Check permissions
      const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);
      const isOwner = ticket.createdBy === req.user.id;

      if (!isAdmin && !isOwner) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para responder este ticket",
        });
        return;
      }

      const { message, isInternal } = req.body;

      // Use spread to ensure Sequelize detects JSONB change
      ticket.messages = [
        ...ticket.messages,
        {
          author: req.user.id,
          message,
          isInternal: isInternal && isAdmin ? true : false, // Only admins can create internal messages
          attachments,
          createdAt: new Date(),
        } as any
      ];
      ticket.changed('messages', true);

      // Update status if ticket was waiting for user response and user is responding
      if (ticket.status === "waiting_user" && isOwner) {
        ticket.status = "in_progress";
      }

      await ticket.save();

      // Reload ticket with associations
      await ticket.reload({
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email', 'avatar'],
          },
        ],
      });

      // Send email notification to the other party
      const sender = await User.findByPk(req.user.id);
      const recipient = isOwner && ticket.assignedTo
        ? await User.findByPk(ticket.assignedTo) // Notify admin if user replied
        : await User.findByPk(ticket.createdBy); // Notify creator if admin replied

      if (recipient?.email && sender) {
        // Don't send email to the sender (prevent self-notification)
        if (recipient.id !== sender.id) {
          await emailService.sendTicketMessageEmail(
            ticket.id,
            ticket.ticketNumber,
            ticket.subject,
            recipient.email,
            recipient.name,
            sender.name,
            message,
            isAdmin
          );
        }
      }

      res.json({
        success: true,
        ticket,
      });
    } catch (error: any) {
      console.error("Add message error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Close ticket
 * PUT /api/tickets/:id/close
 */
router.put("/:id/close", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { resolution } = req.body;

    const ticket = await Ticket.findByPk(req.params.id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Check permissions
    const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);
    const isOwner = ticket.createdBy === req.user.id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para cerrar este ticket",
      });
      return;
    }

    ticket.status = "closed";
    ticket.resolution = resolution;
    ticket.closedAt = new Date();
    ticket.closedBy = req.user.id;

    await ticket.save();

    res.json({
      success: true,
      message: "Ticket cerrado exitosamente",
      ticket,
    });
  } catch (error: any) {
    console.error("Close ticket error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
