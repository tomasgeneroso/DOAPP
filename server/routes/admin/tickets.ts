import express, { Request, Response } from "express";
import Ticket from "../../models/Ticket.js";
import Notification from "../../models/Notification.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission, requireAdminRole } from "../../middleware/permissions.js";
import { logAudit, getSeverityForAction } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();

router.use(protect);

// @route   GET /api/admin/tickets
// @desc    Obtener todos los tickets (staff) o propios (usuarios)
// @access  Private
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = "1",
      limit = "20",
      status,
      category,
      priority,
      assignedTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    // Si no es staff, solo ver sus propios tickets
    if (!req.user.adminRole) {
      query.createdBy = req.user._id;
    } else {
      // Staff puede filtrar por asignado
      if (assignedTo) query.assignedTo = assignedTo;
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === "desc" ? -1 : 1;

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("createdBy", "name email avatar")
        .populate("assignedTo", "name email avatar")
        .populate("relatedUser", "name email")
        .populate("relatedContract")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit as string)),
      Ticket.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/tickets/:id
// @desc    Obtener detalles de ticket
// @access  Private
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("createdBy", "name email avatar")
      .populate("assignedTo", "name email avatar adminRole")
      .populate("relatedUser", "name email")
      .populate("relatedContract")
      .populate("messages.author", "name email avatar adminRole")
      .populate("closedBy", "name email");

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Usuarios normales solo ven sus tickets
    if (!req.user.adminRole && ticket.createdBy._id.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este ticket",
      });
      return;
    }

    // Filtrar mensajes internos si no es staff
    if (!req.user.adminRole) {
      ticket.messages = ticket.messages.filter((msg) => !msg.isInternal);
    }

    res.json({
      success: true,
      data: ticket,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/admin/tickets
// @desc    Crear ticket
// @access  Private (cualquier usuario autenticado)
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { subject, category, priority, message, relatedUser, relatedContract } = req.body;

    if (!subject || !category || !message) {
      res.status(400).json({
        success: false,
        message: "Asunto, categoría y mensaje son requeridos",
      });
      return;
    }

    const ticket = await Ticket.create({
      subject,
      category,
      priority: priority || "medium",
      createdBy: req.user._id,
      relatedUser,
      relatedContract,
      messages: [
        {
          author: req.user._id,
          message,
          isInternal: false,
        },
      ],
    });

    await ticket.populate("createdBy", "name email avatar");

    // Notificar a staff
    // TODO: Implementar lógica de notificación a support team

    res.status(201).json({
      success: true,
      message: "Ticket creado correctamente",
      data: ticket,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/admin/tickets/:id/messages
// @desc    Agregar mensaje a ticket
// @access  Private
router.post("/:id/messages", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message, isInternal = false } = req.body;

    if (!message) {
      res.status(400).json({
        success: false,
        message: "El mensaje es requerido",
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

    // Usuarios normales solo pueden comentar en sus tickets
    if (!req.user.adminRole && ticket.createdBy.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para comentar en este ticket",
      });
      return;
    }

    // Solo staff puede hacer comentarios internos
    const messageIsInternal = req.user.adminRole ? isInternal : false;

    ticket.messages.push({
      author: req.user._id,
      message,
      isInternal: messageIsInternal,
      createdAt: new Date(),
    });

    await ticket.save();
    await ticket.populate("messages.author", "name email avatar adminRole");

    // Notificar al creador si el mensaje es de staff
    if (req.user.adminRole && !messageIsInternal) {
      await Notification.create({
        recipient: ticket.createdBy,
        type: "info",
        category: "ticket",
        title: `Nuevo mensaje en ticket ${ticket.ticketNumber}`,
        message: `${req.user.name} ha respondido a tu ticket`,
        relatedModel: "Ticket",
        relatedId: ticket._id,
        actionUrl: `/admin/tickets/${ticket._id}`,
        actionText: "Ver ticket",
        sentVia: ["in_app"],
      });
    }

    res.json({
      success: true,
      message: "Mensaje agregado correctamente",
      data: ticket,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/admin/tickets/:id/assign
// @desc    Asignar ticket a staff
// @access  Support+
router.put(
  "/:id/assign",
  requirePermission("tickets:assign"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { assignedTo } = req.body;

      const ticket = await Ticket.findByIdAndUpdate(
        req.params.id,
        {
          assignedTo,
          status: assignedTo ? "assigned" : "open",
        },
        { new: true }
      )
        .populate("createdBy", "name email")
        .populate("assignedTo", "name email");

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      await logAudit({
        req,
        action: "assign_ticket",
        category: "ticket",
        severity: "low",
        description: `Ticket ${ticket.ticketNumber} asignado`,
        targetModel: "Ticket",
        targetId: ticket._id.toString(),
        targetIdentifier: ticket.ticketNumber,
        metadata: { assignedTo },
      });

      res.json({
        success: true,
        message: "Ticket asignado correctamente",
        data: ticket,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/admin/tickets/:id/status
// @desc    Cambiar estado del ticket
// @access  Support+
router.put(
  "/:id/status",
  requirePermission("tickets:update"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          message: "El estado es requerido",
        });
        return;
      }

      const ticket = await Ticket.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).populate("createdBy", "name email");

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      await logAudit({
        req,
        action: "update_ticket_status",
        category: "ticket",
        severity: "low",
        description: `Estado de ticket ${ticket.ticketNumber} cambiado a ${status}`,
        targetModel: "Ticket",
        targetId: ticket._id.toString(),
        targetIdentifier: ticket.ticketNumber,
        metadata: { status },
      });

      res.json({
        success: true,
        message: "Estado actualizado correctamente",
        data: ticket,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/admin/tickets/:id/close
// @desc    Cerrar ticket
// @access  Support+
router.put(
  "/:id/close",
  requirePermission("tickets:close"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { resolution } = req.body;

      const ticket = await Ticket.findByIdAndUpdate(
        req.params.id,
        {
          status: "closed",
          resolution,
          closedAt: new Date(),
          closedBy: req.user._id,
        },
        { new: true }
      )
        .populate("createdBy", "name email")
        .populate("closedBy", "name email");

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      await logAudit({
        req,
        action: "close_ticket",
        category: "ticket",
        severity: "low",
        description: `Ticket ${ticket.ticketNumber} cerrado`,
        targetModel: "Ticket",
        targetId: ticket._id.toString(),
        targetIdentifier: ticket.ticketNumber,
        metadata: { resolution },
      });

      // Notificar al creador
      await Notification.create({
        recipient: ticket.createdBy._id,
        type: "success",
        category: "ticket",
        title: `Ticket ${ticket.ticketNumber} cerrado`,
        message: resolution || "Tu ticket ha sido cerrado",
        relatedModel: "Ticket",
        relatedId: ticket._id,
        actionUrl: `/admin/tickets/${ticket._id}`,
        actionText: "Ver ticket",
        sentVia: ["in_app"],
      });

      res.json({
        success: true,
        message: "Ticket cerrado correctamente",
        data: ticket,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

export default router;
