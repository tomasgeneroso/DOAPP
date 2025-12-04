import express, { Request, Response } from "express";
import { Ticket } from "../../models/sql/Ticket.model.js";
import { User } from "../../models/sql/User.model.js";
import { Notification } from "../../models/sql/Notification.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
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

    const { rows: tickets, count: total } = await Ticket.findAndCountAll({
      where: query,
      limit: parseInt(limit as string),
      offset: skip,
      order: Object.entries(sortOptions).map(([key, value]) => [key, value === -1 ? 'DESC' : 'ASC']),
      include: [
        { model: User, as: 'createdBy', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'assignedTo', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'relatedUser', attributes: ['name', 'email'] },
        { model: Contract, as: 'relatedContract' }
      ]
    });

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
    const ticket = await Ticket.findByPk(req.params.id, {
      include: [
        { model: User, as: 'createdBy', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'assignedTo', attributes: ['name', 'email', 'avatar', 'adminRole'] },
        { model: User, as: 'relatedUser', attributes: ['name', 'email'] },
        { model: Contract, as: 'relatedContract' },
        { model: User, as: 'closedBy', attributes: ['name', 'email'] }
      ]
    });

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Usuarios normales solo ven sus tickets
    const createdById = typeof ticket.createdBy === 'object' ? ticket.createdBy.id : ticket.createdBy;
    if (!req.user.adminRole && createdById.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este ticket",
      });
      return;
    }

    // Filtrar mensajes internos si no es staff
    if (!req.user.adminRole && ticket.messages) {
      ticket.messages = ticket.messages.filter((msg: any) => !msg.isInternal);
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

    await ticket.reload({
      include: [{ model: User, as: 'createdBy', attributes: ['name', 'email', 'avatar'] }]
    });

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

    const ticket = await Ticket.findByPk(req.params.id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        message: "Ticket no encontrado",
      });
      return;
    }

    // Usuarios normales solo pueden comentar en sus tickets
    const createdById = typeof ticket.createdBy === 'object' ? ticket.createdBy.id : ticket.createdBy;
    if (!req.user.adminRole && createdById.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para comentar en este ticket",
      });
      return;
    }

    // Solo staff puede hacer comentarios internos
    const messageIsInternal = req.user.adminRole ? isInternal : false;

    const messages = ticket.messages || [];
    messages.push({
      author: req.user._id,
      message,
      isInternal: messageIsInternal,
      createdAt: new Date(),
    } as any);

    await ticket.update({ messages });
    await ticket.reload();

    // Notificar al creador si el mensaje es de staff
    if (req.user.adminRole && !messageIsInternal) {
      const notifyRecipientId = typeof ticket.createdBy === 'object' ? ticket.createdBy.id : ticket.createdBy;
      await Notification.create({
        recipientId: notifyRecipientId,
        type: "info",
        category: "ticket",
        title: `Nuevo mensaje en ticket ${ticket.ticketNumber}`,
        message: `${req.user.name} ha respondido a tu ticket`,
        relatedModel: "Ticket",
        relatedId: ticket.id,
        actionUrl: `/admin/tickets/${ticket.id}`,
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

      const ticket = await Ticket.findByPk(req.params.id);

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      await ticket.update({
        assignedTo,
        status: assignedTo ? "assigned" : "open",
      });

      await ticket.reload({
        include: [
          { model: User, as: 'createdBy', attributes: ['name', 'email'] },
          { model: User, as: 'assignedTo', attributes: ['name', 'email'] }
        ]
      });

      await logAudit({
        req,
        action: "assign_ticket",
        category: "ticket",
        severity: "low",
        description: `Ticket ${ticket.ticketNumber} asignado`,
        targetModel: "Ticket",
        targetId: ticket.id.toString(),
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

      const ticket = await Ticket.findByPk(req.params.id);

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      await ticket.update({ status });
      await ticket.reload({
        include: [{ model: User, as: 'createdBy', attributes: ['name', 'email'] }]
      });

      await logAudit({
        req,
        action: "update_ticket_status",
        category: "ticket",
        severity: "low",
        description: `Estado de ticket ${ticket.ticketNumber} cambiado a ${status}`,
        targetModel: "Ticket",
        targetId: ticket.id.toString(),
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

      const ticket = await Ticket.findByPk(req.params.id);

      if (!ticket) {
        res.status(404).json({
          success: false,
          message: "Ticket no encontrado",
        });
        return;
      }

      await ticket.update({
        status: "closed",
        resolution,
        closedAt: new Date(),
        closedBy: req.user._id,
      });

      await ticket.reload({
        include: [
          { model: User, as: 'createdBy', attributes: ['name', 'email'] },
          { model: User, as: 'closedBy', attributes: ['name', 'email'] }
        ]
      });

      await logAudit({
        req,
        action: "close_ticket",
        category: "ticket",
        severity: "low",
        description: `Ticket ${ticket.ticketNumber} cerrado`,
        targetModel: "Ticket",
        targetId: ticket.id.toString(),
        targetIdentifier: ticket.ticketNumber,
        metadata: { resolution },
      });

      // Notificar al creador
      const createdById = typeof ticket.createdBy === 'object' ? ticket.createdBy.id : ticket.createdBy;
      await Notification.create({
        recipientId: createdById,
        type: "success",
        category: "ticket",
        title: `Ticket ${ticket.ticketNumber} cerrado`,
        message: resolution || "Tu ticket ha sido cerrado",
        relatedModel: "Ticket",
        relatedId: ticket.id,
        actionUrl: `/admin/tickets/${ticket.id}`,
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

/**
 * POST /api/admin/tickets/create
 * Create a ticket on behalf of a user (admin only)
 */
router.post("/create", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, subject, category, priority, message } = req.body;

    if (!userId || !subject || !category || !priority || !message) {
      res.status(400).json({
        success: false,
        message: "Faltan campos requeridos",
      });
      return;
    }

    // Verify user exists
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Create ticket
    const ticket = await Ticket.create({
      createdBy: userId,
      subject,
      category,
      priority,
      status: "open",
      messages: [
        {
          sender: userId,
          message,
          isAdminResponse: false,
        },
      ],
    });

    await ticket.reload({
      include: [{ model: User, as: 'createdBy', attributes: ['name', 'email', 'avatar'] }]
    });

    res.status(201).json({
      success: true,
      message: "Ticket creado exitosamente",
      data: ticket,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
