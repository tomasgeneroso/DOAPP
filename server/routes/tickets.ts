import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import Ticket from "../models/Ticket";
import { protect, AuthRequest } from "../middleware/auth";

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
  [
    body("subject").notEmpty().withMessage("El asunto es requerido").trim(),
    body("category").isIn(["bug", "feature", "support", "report_user", "report_contract", "dispute", "payment", "other"]).withMessage("Categoría inválida"),
    body("priority").optional().isIn(["low", "medium", "high", "urgent"]),
    body("message").notEmpty().withMessage("El mensaje es requerido").trim(),
    body("relatedUser").optional().isMongoId(),
    body("relatedContract").optional().isMongoId(),
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

      const { subject, category, priority, message, relatedUser, relatedContract, tags } = req.body;

      const ticket = await Ticket.create({
        subject,
        category,
        priority: priority || "medium",
        createdBy: req.user._id,
        relatedUser,
        relatedContract,
        tags: tags || [],
        messages: [
          {
            author: req.user._id,
            message,
            isInternal: false,
          },
        ],
      });

      await ticket.populate("createdBy", "name email");

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

    const query: any = isAdmin ? {} : { createdBy: req.user._id };

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const tickets = await Ticket.find(query)
      .populate("createdBy", "name email")
      .populate("assignedTo", "name email")
      .sort({ priority: -1, createdAt: -1 });

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
    const ticket = await Ticket.findById(req.params.id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar")
      .populate("messages.author", "name email avatar")
      .populate("relatedUser", "name email")
      .populate("relatedContract", "job");

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Check permissions
    const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);
    const isOwner = ticket.createdBy._id.toString() === req.user._id.toString();

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

      const ticket = await Ticket.findById(req.params.id);

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      // Check permissions
      const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);
      const isOwner = ticket.createdBy.toString() === req.user._id.toString();

      if (!isAdmin && !isOwner) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para responder este ticket",
        });
        return;
      }

      const { message, isInternal } = req.body;

      ticket.messages.push({
        author: req.user._id,
        message,
        isInternal: isInternal && isAdmin ? true : false, // Only admins can create internal messages
        createdAt: new Date(),
      } as any);

      // Update status if ticket was waiting for user response and user is responding
      if (ticket.status === "waiting_user" && isOwner) {
        ticket.status = "in_progress";
      }

      await ticket.save();
      await ticket.populate("messages.author", "name email avatar");

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

    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Check permissions
    const isAdmin = req.user.adminRole && ["owner", "super_admin", "admin", "support"].includes(req.user.adminRole);
    const isOwner = ticket.createdBy.toString() === req.user._id.toString();

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
    ticket.closedBy = req.user._id;

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
