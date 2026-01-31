import express, { Request, Response } from "express";
import { User } from "../../models/sql/User.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Ticket } from "../../models/sql/Ticket.model.js";
import { Dispute } from "../../models/sql/Dispute.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { AuditLog } from "../../models/sql/AuditLog.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { logAudit } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";
import { Op, fn, col, literal } from 'sequelize';
import { logger } from "../../services/logger.js";

const router = express.Router();

router.use(protect);
router.use(requirePermission("admin:analytics"));

// @route   GET /api/admin/analytics/overview
// @desc    Resumen general de métricas
// @access  Marketing+
router.get("/overview", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    // Build Sequelize where clause
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
    }

    const [
      totalUsers,
      activeUsers,
      totalContracts,
      completedContracts,
      totalTickets,
      openTickets,
      bannedUsers,
    ] = await Promise.all([
      User.count({ where }),
      User.count({ where: { ...where, lastLogin: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      Contract.count({ where }),
      Contract.count({ where: { ...where, status: "completed" } }),
      Ticket.count({ where }),
      Ticket.count({ where: { ...where, status: { [Op.in]: ["open", "assigned", "in_progress"] } } }),
      User.count({ where: { ...where, isBanned: true } }),
    ]);

    // TODO: implement avgTrustScore with Sequelize raw query
    const avgTrustScore = 0;

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          banned: bannedUsers,
          avgTrustScore,
        },
        contracts: {
          total: totalContracts,
          completed: completedContracts,
          completionRate: totalContracts > 0 ? (completedContracts / totalContracts) * 100 : 0,
        },
        tickets: {
          total: totalTickets,
          open: openTickets,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/analytics/users
// @desc    Métricas de usuarios
// @access  Marketing+
router.get("/users", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = "30d" } = req.query;

    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // TODO: implement newUsers aggregation with Sequelize raw query
    const newUsers: any[] = [];

    // TODO: implement usersByRole aggregation with Sequelize raw query
    const usersByRole: any[] = [];

    // TODO: implement usersByVerification aggregation with Sequelize raw query
    const usersByVerification: any[] = [];

    const topRatedUsers = await User.findAll({
      attributes: ["name", "email", "avatar", "rating", "reviewsCount", "completedJobs"],
      order: [["rating", "DESC"], ["reviewsCount", "DESC"]],
      limit: 10,
    });

    res.json({
      success: true,
      data: {
        newUsers,
        usersByRole,
        usersByVerification,
        topRatedUsers,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/analytics/contracts
// @desc    Métricas de contratos
// @access  Marketing+
router.get("/contracts", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = "30d" } = req.query;

    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // TODO: implement contractsByStatus aggregation with Sequelize raw query
    const contractsByStatus: any[] = [];

    // TODO: implement contractsByDay aggregation with Sequelize raw query
    const contractsByDay: any[] = [];

    // TODO: implement avgContractValue aggregation with Sequelize raw query
    const avgContractValue = 0;

    // TODO: implement totalRevenue aggregation with Sequelize raw query
    const totalRevenue = 0;

    res.json({
      success: true,
      data: {
        contractsByStatus,
        contractsByDay,
        avgContractValue,
        totalRevenue,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/analytics/tickets
// @desc    Métricas de tickets
// @access  Support+
router.get("/tickets", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = "30d" } = req.query;

    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // TODO: implement ticketsByStatus aggregation with Sequelize raw query
    const ticketsByStatus: any[] = [];

    // TODO: implement ticketsByCategory aggregation with Sequelize raw query
    const ticketsByCategory: any[] = [];

    // TODO: implement ticketsByPriority aggregation with Sequelize raw query
    const ticketsByPriority: any[] = [];

    // TODO: implement avgResolutionTime aggregation with Sequelize raw query
    const avgResolutionTime = 0;

    res.json({
      success: true,
      data: {
        ticketsByStatus,
        ticketsByCategory,
        ticketsByPriority,
        avgResolutionTimeHours: avgResolutionTime / (1000 * 60 * 60),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/analytics/audit
// @desc    Métricas de audit logs
// @access  SuperAdmin+
router.get(
  "/audit",
  requirePermission("admin:audit_log"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { period = "30d" } = req.query;

      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // TODO: implement actionsByCategory aggregation with Sequelize raw query
      const actionsByCategory: any[] = [];

      // TODO: implement actionsBySeverity aggregation with Sequelize raw query
      const actionsBySeverity: any[] = [];

      // TODO: implement topAdmins aggregation with Sequelize raw query
      const topAdmins: any[] = [];

      res.json({
        success: true,
        data: {
          actionsByCategory,
          actionsBySeverity,
          topAdmins,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   GET /api/admin/analytics/user-activity
// @desc    Métricas de actividad por usuario (disputas, tickets, contratos, pagos)
// @access  Admin+
router.get("/user-activity", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = "30d", limit = 20 } = req.query;

    const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Top users who opened disputes
    const disputesOpened = await Dispute.findAll({
      attributes: [
        'initiatedBy',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        createdAt: { [Op.gte]: dateLimit },
      },
      group: ['initiatedBy'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get user info for disputes opened
    const disputeOpenerIds = disputesOpened.map((d: any) => d.initiatedBy);
    const disputeOpeners = await User.findAll({
      where: { id: { [Op.in]: disputeOpenerIds } },
      attributes: ['id', 'name', 'email', 'avatar'],
    });
    const disputeOpenersMap = new Map(disputeOpeners.map(u => [u.id, u]));

    // Top admins who resolved disputes
    const disputesResolved = await Dispute.findAll({
      attributes: [
        'resolvedBy',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        resolvedAt: { [Op.gte]: dateLimit },
        resolvedBy: { [Op.ne]: null },
      },
      group: ['resolvedBy'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get admin info for disputes resolved
    const disputeResolverIds = disputesResolved.map((d: any) => d.resolvedBy);
    const disputeResolvers = await User.findAll({
      where: { id: { [Op.in]: disputeResolverIds } },
      attributes: ['id', 'name', 'email', 'avatar', 'adminRole'],
    });
    const disputeResolversMap = new Map(disputeResolvers.map(u => [u.id, u]));

    // Top users who created tickets
    const ticketsCreated = await Ticket.findAll({
      attributes: [
        'createdBy',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        createdAt: { [Op.gte]: dateLimit },
      },
      group: ['createdBy'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get user info for tickets created
    const ticketCreatorIds = ticketsCreated.map((t: any) => t.createdBy);
    const ticketCreators = await User.findAll({
      where: { id: { [Op.in]: ticketCreatorIds } },
      attributes: ['id', 'name', 'email', 'avatar'],
    });
    const ticketCreatorsMap = new Map(ticketCreators.map(u => [u.id, u]));

    // Top admins who resolved tickets (status = resolved or closed)
    const ticketsResolved = await Ticket.findAll({
      attributes: [
        'assignedTo',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        updatedAt: { [Op.gte]: dateLimit },
        status: { [Op.in]: ['resolved', 'closed'] },
        assignedTo: { [Op.ne]: null },
      },
      group: ['assignedTo'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get admin info for tickets resolved
    const ticketResolverIds = ticketsResolved.map((t: any) => t.assignedTo);
    const ticketResolvers = await User.findAll({
      where: { id: { [Op.in]: ticketResolverIds } },
      attributes: ['id', 'name', 'email', 'avatar', 'adminRole'],
    });
    const ticketResolversMap = new Map(ticketResolvers.map(u => [u.id, u]));

    // Top clients who created contracts
    const contractsCreatedByClient = await Contract.findAll({
      attributes: [
        'clientId',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('price')), 'totalValue'],
      ],
      where: {
        createdAt: { [Op.gte]: dateLimit },
      },
      group: ['clientId'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get user info for contract creators
    const contractCreatorIds = contractsCreatedByClient.map((c: any) => c.clientId);
    const contractCreators = await User.findAll({
      where: { id: { [Op.in]: contractCreatorIds } },
      attributes: ['id', 'name', 'email', 'avatar'],
    });
    const contractCreatorsMap = new Map(contractCreators.map(u => [u.id, u]));

    // Top doers who completed contracts
    const contractsCompletedByDoer = await Contract.findAll({
      attributes: [
        'doerId',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('price')), 'totalValue'],
      ],
      where: {
        updatedAt: { [Op.gte]: dateLimit },
        status: 'completed',
      },
      group: ['doerId'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get user info for doers
    const doerIds = contractsCompletedByDoer.map((c: any) => c.doerId);
    const doers = await User.findAll({
      where: { id: { [Op.in]: doerIds } },
      attributes: ['id', 'name', 'email', 'avatar'],
    });
    const doersMap = new Map(doers.map(u => [u.id, u]));

    // Top admins who released payments
    const paymentsReleased = await Payment.findAll({
      attributes: [
        'escrowReleasedBy',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('amount')), 'totalAmount'],
      ],
      where: {
        escrowReleasedAt: { [Op.gte]: dateLimit },
        escrowReleasedBy: { [Op.ne]: null },
      },
      group: ['escrowReleasedBy'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get admin info for payment releasers
    const paymentReleaserIds = paymentsReleased.map((p: any) => p.escrowReleasedBy);
    const paymentReleasers = await User.findAll({
      where: { id: { [Op.in]: paymentReleaserIds } },
      attributes: ['id', 'name', 'email', 'avatar', 'adminRole'],
    });
    const paymentReleasersMap = new Map(paymentReleasers.map(u => [u.id, u]));

    // Top clients who created jobs
    const jobsCreated = await Job.findAll({
      attributes: [
        'clientId',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('price')), 'totalValue'],
      ],
      where: {
        createdAt: { [Op.gte]: dateLimit },
      },
      group: ['clientId'],
      order: [[literal('count'), 'DESC']],
      limit: Number(limit),
      raw: true,
    });

    // Get user info for job creators
    const jobCreatorIds = jobsCreated.map((j: any) => j.clientId);
    const jobCreators = await User.findAll({
      where: { id: { [Op.in]: jobCreatorIds } },
      attributes: ['id', 'name', 'email', 'avatar'],
    });
    const jobCreatorsMap = new Map(jobCreators.map(u => [u.id, u]));

    res.json({
      success: true,
      data: {
        period,
        dateLimit,
        disputes: {
          opened: disputesOpened.map((d: any) => ({
            user: disputeOpenersMap.get(d.initiatedBy),
            count: parseInt(d.count),
          })),
          resolved: disputesResolved.map((d: any) => ({
            admin: disputeResolversMap.get(d.resolvedBy),
            count: parseInt(d.count),
          })),
        },
        tickets: {
          created: ticketsCreated.map((t: any) => ({
            user: ticketCreatorsMap.get(t.createdBy),
            count: parseInt(t.count),
          })),
          resolved: ticketsResolved.map((t: any) => ({
            admin: ticketResolversMap.get(t.assignedTo),
            count: parseInt(t.count),
          })),
        },
        contracts: {
          createdByClient: contractsCreatedByClient.map((c: any) => ({
            user: contractCreatorsMap.get(c.clientId),
            count: parseInt(c.count),
            totalValue: parseFloat(c.totalValue) || 0,
          })),
          completedByDoer: contractsCompletedByDoer.map((c: any) => ({
            user: doersMap.get(c.doerId),
            count: parseInt(c.count),
            totalValue: parseFloat(c.totalValue) || 0,
          })),
        },
        payments: {
          released: paymentsReleased.map((p: any) => ({
            admin: paymentReleasersMap.get(p.escrowReleasedBy),
            count: parseInt(p.count),
            totalAmount: parseFloat(p.totalAmount) || 0,
          })),
        },
        jobs: {
          created: jobsCreated.map((j: any) => ({
            user: jobCreatorsMap.get(j.clientId),
            count: parseInt(j.count),
            totalValue: parseFloat(j.totalValue) || 0,
          })),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/analytics/user/:userId/activity
// @desc    Métricas de actividad de un usuario específico
// @access  Admin+
router.get("/user/:userId/activity", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'avatar', 'adminRole', 'createdAt'],
    });

    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    // Disputes opened by this user
    const disputesOpened = await Dispute.count({
      where: { initiatedBy: userId },
    });

    // Disputes resolved by this user (if admin)
    const disputesResolved = await Dispute.count({
      where: { resolvedBy: userId },
    });

    // Disputes against this user
    const disputesAgainst = await Dispute.count({
      where: { against: userId },
    });

    // Tickets created by this user
    const ticketsCreated = await Ticket.count({
      where: { createdBy: userId },
    });

    // Tickets resolved by this user (if admin)
    const ticketsResolved = await Ticket.count({
      where: {
        assignedTo: userId,
        status: { [Op.in]: ['resolved', 'closed'] },
      },
    });

    // Contracts as client
    const contractsAsClient = await Contract.count({
      where: { clientId: userId },
    });

    const contractsCompletedAsClient = await Contract.count({
      where: { clientId: userId, status: 'completed' },
    });

    // Contracts as doer
    const contractsAsDoer = await Contract.count({
      where: { doerId: userId },
    });

    const contractsCompletedAsDoer = await Contract.count({
      where: { doerId: userId, status: 'completed' },
    });

    // Jobs created
    const jobsCreated = await Job.count({
      where: { clientId: userId },
    });

    // Payments released (if admin)
    const paymentsReleased = await Payment.count({
      where: { escrowReleasedBy: userId },
    });

    // Total spent as client
    const totalSpentResult = await Contract.sum('price', {
      where: { clientId: userId, status: 'completed' },
    });

    // Total earned as doer
    const totalEarnedResult = await Contract.sum('workerPaymentAmount', {
      where: { doerId: userId, status: 'completed' },
    });

    res.json({
      success: true,
      data: {
        user,
        activity: {
          disputes: {
            opened: disputesOpened,
            resolved: disputesResolved,
            against: disputesAgainst,
          },
          tickets: {
            created: ticketsCreated,
            resolved: ticketsResolved,
          },
          contracts: {
            asClient: {
              total: contractsAsClient,
              completed: contractsCompletedAsClient,
            },
            asDoer: {
              total: contractsAsDoer,
              completed: contractsCompletedAsDoer,
            },
          },
          jobs: {
            created: jobsCreated,
          },
          payments: {
            released: paymentsReleased,
          },
          financials: {
            totalSpent: totalSpentResult || 0,
            totalEarned: totalEarnedResult || 0,
          },
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/analytics/export
// @desc    Exportar datos (CSV/JSON)
// @access  Marketing+
router.get(
  "/export",
  requirePermission("admin:analytics"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { type = "users", format = "json", startDate, endDate } = req.query;

      // Build Sequelize where clause
      const where: any = {};
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
      }

      let data: any[] = [];

      switch (type) {
        case "users":
          data = await User.findAll({
            where,
            attributes: { exclude: ["password", "twoFactorSecret", "twoFactorBackupCodes"] },
          });
          break;
        case "contracts":
          data = await Contract.findAll({
            where,
            include: [
              { association: "client" },
              { association: "doer" },
              { association: "job" },
            ],
          });
          break;
        case "tickets":
          data = await Ticket.findAll({
            where,
            include: [
              { association: "createdBy" },
              { association: "assignedTo" },
            ],
          });
          break;
        default:
          res.status(400).json({
            success: false,
            message: "Tipo de exportación inválido",
          });
          return;
      }

      await logAudit({
        req,
        action: "export_data",
        category: "system",
        severity: "medium",
        description: `Exportación de datos de ${type}`,
        metadata: { type, format, recordCount: data.length },
      });

      if (format === "csv") {
        // TODO: Implementar conversión a CSV
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${type}_export.csv"`);
        res.json({ success: false, message: "CSV export not implemented yet" });
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${type}_export.json"`);
        res.json({
          success: true,
          data,
          exportedAt: new Date(),
          recordCount: data.length,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   GET /api/admin/analytics/logs
// @desc    Ver logs del sistema (errores silenciosos, pagos, notificaciones)
// @access  Owner only
router.get(
  "/logs",
  requirePermission("admin:owner"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { category = "silent_errors", limit = 100 } = req.query;

      const validCategories = [
        "silent_errors",
        "payments",
        "notifications",
        "proposals",
        "contracts",
        "auth",
        "security",
        "all"
      ];

      if (!validCategories.includes(category as string)) {
        res.status(400).json({
          success: false,
          message: `Categoría inválida. Válidas: ${validCategories.join(", ")}`
        });
        return;
      }

      const logs = await logger.getRecentLogs(
        category as string,
        Math.min(Number(limit), 500)
      );

      res.json({
        success: true,
        data: {
          category,
          logs,
          count: logs.length,
          retrievedAt: new Date()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al obtener logs"
      });
    }
  }
);

// @route   GET /api/admin/analytics/logs/categories
// @desc    Ver categorías de logs disponibles
// @access  Owner only
router.get(
  "/logs/categories",
  requirePermission("admin:owner"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      res.json({
        success: true,
        data: {
          categories: [
            { id: "silent_errors", name: "Errores Silenciosos", description: "Errores que no interrumpen el flujo pero se registran" },
            { id: "payments", name: "Pagos", description: "Operaciones de pago y MercadoPago" },
            { id: "notifications", name: "Notificaciones", description: "Creación y envío de notificaciones" },
            { id: "proposals", name: "Propuestas", description: "Postulaciones a trabajos" },
            { id: "contracts", name: "Contratos", description: "Operaciones de contratos" },
            { id: "auth", name: "Autenticación", description: "Login, registro, tokens" },
            { id: "security", name: "Seguridad", description: "Eventos de seguridad" },
            { id: "all", name: "Todos", description: "Todos los logs combinados" }
          ]
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor"
      });
    }
  }
);

// ============================================================
// ADMIN ACTIVITY SUMMARY - Role-based prioritized activities
// ============================================================

/**
 * Define role permissions for different activity types
 * Each role can see specific activities based on their responsibilities
 */
const ROLE_ACTIVITIES: Record<string, string[]> = {
  owner: ['*'], // Can see everything
  super_admin: ['*'], // Can see everything
  admin: ['tickets', 'disputes', 'contracts', 'jobs', 'users', 'cancellation_requests', 'pending_payments'],
  support: ['tickets', 'disputes', 'cancellation_requests'],
  marketing: ['jobs', 'users', 'analytics', 'advertisements'],
  dpo: ['users', 'audit_logs', 'data_requests'],
};

/**
 * Priority weights for different activity types
 * Higher = more urgent
 */
const PRIORITY_WEIGHTS: Record<string, number> = {
  urgent: 100,
  high: 75,
  medium: 50,
  low: 25,
};

interface ActivityItem {
  id: string;
  type: string;
  category: string;
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  priorityScore: number;
  createdAt: Date;
  data: any;
  actionUrl: string;
}

// @route   GET /api/admin/analytics/activity-summary
// @desc    Get prioritized activity summary based on admin role
// @access  Admin+
router.get(
  "/activity-summary",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const adminRole = req.user.adminRole || 'admin';
      const allowedActivities = ROLE_ACTIVITIES[adminRole] || ROLE_ACTIVITIES.admin;
      const canSeeAll = allowedActivities.includes('*');

      const activities: ActivityItem[] = [];
      const now = new Date();

      // Helper function to check if activity type is allowed
      const canSee = (type: string) => canSeeAll || allowedActivities.includes(type);

      // 1. CANCELLATION REQUESTS (support, admin, owner, super_admin)
      if (canSee('cancellation_requests')) {
        const { ContractCancellationRequest } = await import("../../models/sql/ContractCancellationRequest.model.js");
        const pendingCancellations = await ContractCancellationRequest.findAll({
          where: { status: 'pending' },
          include: [
            { model: Job, as: 'job', attributes: ['id', 'title'] },
            { model: User, as: 'requester', attributes: ['id', 'name'] },
          ],
          order: [
            [literal("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END"), 'ASC'],
            ['createdAt', 'ASC']
          ],
          limit: 20,
        });

        for (const req of pendingCancellations) {
          const reqData = req as any;
          const hoursOld = (now.getTime() - new Date(req.createdAt).getTime()) / (1000 * 60 * 60);
          let adjustedPriority = req.priority as 'urgent' | 'high' | 'medium' | 'low';

          // Escalate priority if too old
          if (hoursOld > 48 && adjustedPriority !== 'urgent') {
            adjustedPriority = 'urgent';
          } else if (hoursOld > 24 && ['low', 'medium'].includes(adjustedPriority)) {
            adjustedPriority = 'high';
          }

          activities.push({
            id: req.id,
            type: 'cancellation_request',
            category: 'contracts',
            title: `Solicitud de cancelación: ${reqData.job?.title || 'Contrato'}`,
            description: `${reqData.requester?.name} solicitó cancelar contrato - ${req.reason.substring(0, 100)}${req.reason.length > 100 ? '...' : ''}`,
            priority: adjustedPriority,
            priorityScore: PRIORITY_WEIGHTS[adjustedPriority] + (hoursOld * 0.5), // Add time bonus
            createdAt: req.createdAt,
            data: { requestId: req.id, contractId: req.contractId, category: req.category },
            actionUrl: `/admin/contracts/cancellation-requests/${req.id}`,
          });
        }
      }

      // 2. OPEN TICKETS (support, admin, owner, super_admin)
      if (canSee('tickets')) {
        const openTickets = await Ticket.findAll({
          where: { status: { [Op.in]: ['open', 'in_progress'] } },
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
          order: [
            [literal("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END"), 'ASC'],
            ['createdAt', 'ASC']
          ],
          limit: 20,
        });

        for (const ticket of openTickets) {
          const ticketData = ticket as any;
          const hoursOld = (now.getTime() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60);
          let adjustedPriority = ticket.priority as 'urgent' | 'high' | 'medium' | 'low';

          if (hoursOld > 48 && adjustedPriority !== 'urgent') {
            adjustedPriority = 'urgent';
          } else if (hoursOld > 24 && ['low', 'medium'].includes(adjustedPriority)) {
            adjustedPriority = 'high';
          }

          activities.push({
            id: ticket.id,
            type: 'ticket',
            category: 'support',
            title: `Ticket: ${ticket.subject}`,
            description: `De ${ticketData.user?.name || 'Usuario'} - Categoría: ${ticket.category}`,
            priority: adjustedPriority,
            priorityScore: PRIORITY_WEIGHTS[adjustedPriority] + (hoursOld * 0.3),
            createdAt: ticket.createdAt,
            data: { ticketId: ticket.id, category: ticket.category, status: ticket.status },
            actionUrl: `/admin/tickets/${ticket.id}`,
          });
        }
      }

      // 3. OPEN DISPUTES (support, admin, owner, super_admin)
      if (canSee('disputes')) {
        const openDisputes = await Dispute.findAll({
          where: { status: { [Op.in]: ['open', 'in_review'] } },
          include: [
            { model: User, as: 'complainant', attributes: ['id', 'name'] },
            { model: Contract, as: 'contract', include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }] },
          ],
          order: [['createdAt', 'ASC']],
          limit: 20,
        });

        for (const dispute of openDisputes) {
          const disputeData = dispute as any;
          const hoursOld = (now.getTime() - new Date(dispute.createdAt).getTime()) / (1000 * 60 * 60);

          // Disputes are always high priority, escalate to urgent if old
          let priority: 'urgent' | 'high' | 'medium' | 'low' = 'high';
          if (hoursOld > 48) priority = 'urgent';

          activities.push({
            id: dispute.id,
            type: 'dispute',
            category: 'disputes',
            title: `Disputa: ${disputeData.contract?.job?.title || 'Contrato'}`,
            description: `De ${disputeData.complainant?.name || 'Usuario'} - ${dispute.reason?.substring(0, 80) || 'Sin razón'}${dispute.reason?.length > 80 ? '...' : ''}`,
            priority,
            priorityScore: PRIORITY_WEIGHTS[priority] + (hoursOld * 0.8), // Disputes get higher time bonus
            createdAt: dispute.createdAt,
            data: { disputeId: dispute.id, contractId: dispute.contractId, status: dispute.status },
            actionUrl: `/admin/disputes/${dispute.id}`,
          });
        }
      }

      // 4. PENDING CONTRACT APPROVALS (admin, owner, super_admin)
      if (canSee('contracts')) {
        const pendingContracts = await Contract.findAll({
          where: { status: { [Op.in]: ['pending', 'in_review'] } },
          include: [
            { model: Job, as: 'job', attributes: ['id', 'title'] },
            { model: User, as: 'client', attributes: ['id', 'name'] },
          ],
          order: [['createdAt', 'ASC']],
          limit: 15,
        });

        for (const contract of pendingContracts) {
          const contractData = contract as any;
          const hoursOld = (now.getTime() - new Date(contract.createdAt).getTime()) / (1000 * 60 * 60);

          activities.push({
            id: contract.id,
            type: 'contract_approval',
            category: 'contracts',
            title: `Aprobar contrato: ${contractData.job?.title || 'Sin título'}`,
            description: `Cliente: ${contractData.client?.name || 'Usuario'} - $${contract.price}`,
            priority: hoursOld > 24 ? 'high' : 'medium',
            priorityScore: PRIORITY_WEIGHTS[hoursOld > 24 ? 'high' : 'medium'] + (hoursOld * 0.2),
            createdAt: contract.createdAt,
            data: { contractId: contract.id, jobId: contract.jobId, price: contract.price },
            actionUrl: `/admin/contracts/${contract.id}`,
          });
        }
      }

      // 5. PENDING JOB APPROVALS (admin, owner, super_admin)
      if (canSee('jobs')) {
        const pendingJobs = await Job.findAll({
          where: { status: 'pending_approval' },
          include: [{ model: User, as: 'client', attributes: ['id', 'name'] }],
          order: [['createdAt', 'ASC']],
          limit: 15,
        });

        for (const job of pendingJobs) {
          const jobData = job as any;
          const hoursOld = (now.getTime() - new Date(job.createdAt).getTime()) / (1000 * 60 * 60);

          activities.push({
            id: job.id,
            type: 'job_approval',
            category: 'jobs',
            title: `Aprobar trabajo: ${job.title}`,
            description: `De ${jobData.client?.name || 'Usuario'} - $${job.price}`,
            priority: hoursOld > 24 ? 'high' : 'medium',
            priorityScore: PRIORITY_WEIGHTS[hoursOld > 24 ? 'high' : 'medium'] + (hoursOld * 0.2),
            createdAt: job.createdAt,
            data: { jobId: job.id, price: job.price, category: job.category },
            actionUrl: `/admin/jobs/${job.id}`,
          });
        }
      }

      // 6. PENDING PAYMENTS (admin, owner, super_admin)
      if (canSee('pending_payments')) {
        const pendingPayments = await Payment.findAll({
          where: { status: 'pending_verification' },
          include: [
            { model: Contract, as: 'contract', include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }] },
          ],
          order: [['createdAt', 'ASC']],
          limit: 15,
        });

        for (const payment of pendingPayments) {
          const paymentData = payment as any;
          const hoursOld = (now.getTime() - new Date(payment.createdAt).getTime()) / (1000 * 60 * 60);

          activities.push({
            id: payment.id,
            type: 'payment_verification',
            category: 'payments',
            title: `Verificar pago: ${paymentData.contract?.job?.title || 'Contrato'}`,
            description: `Monto: $${payment.amount} - Esperando verificación`,
            priority: hoursOld > 48 ? 'high' : 'medium',
            priorityScore: PRIORITY_WEIGHTS[hoursOld > 48 ? 'high' : 'medium'] + (hoursOld * 0.3),
            createdAt: payment.createdAt,
            data: { paymentId: payment.id, amount: payment.amount, contractId: payment.contractId },
            actionUrl: `/admin/payments/${payment.id}`,
          });
        }
      }

      // 7. PENDING WITHDRAWALS (admin, owner, super_admin - but only owner can see amounts)
      if (canSee('pending_payments')) {
        const { WithdrawalRequest } = await import("../../models/sql/WithdrawalRequest.model.js");
        const pendingWithdrawals = await WithdrawalRequest.findAll({
          where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } },
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
          order: [['createdAt', 'ASC']],
          limit: 15,
        });

        for (const withdrawal of pendingWithdrawals) {
          const withdrawalData = withdrawal as any;
          const hoursOld = (now.getTime() - new Date(withdrawal.createdAt).getTime()) / (1000 * 60 * 60);

          let statusText = 'Pendiente revisión';
          if (withdrawal.status === 'approved') statusText = 'Aprobado, pendiente proceso';
          if (withdrawal.status === 'processing') statusText = 'En proceso de transferencia';

          activities.push({
            id: withdrawal.id,
            type: 'withdrawal',
            category: 'payments',
            title: `Retiro: ${withdrawalData.user?.name || 'Usuario'}`,
            description: `$${withdrawal.amount} - ${statusText}`,
            priority: withdrawal.status === 'processing' ? 'high' : (hoursOld > 48 ? 'high' : 'medium'),
            priorityScore: PRIORITY_WEIGHTS[withdrawal.status === 'processing' ? 'high' : (hoursOld > 48 ? 'high' : 'medium')] + (hoursOld * 0.4),
            createdAt: withdrawal.createdAt,
            data: { withdrawalId: withdrawal.id, amount: withdrawal.amount, status: withdrawal.status },
            actionUrl: `/admin/withdrawals/${withdrawal.id}`,
          });
        }
      }

      // Sort all activities by priority score (descending)
      activities.sort((a, b) => b.priorityScore - a.priorityScore);

      // Group by priority for the response
      const groupedActivities = {
        urgent: activities.filter(a => a.priority === 'urgent'),
        high: activities.filter(a => a.priority === 'high'),
        medium: activities.filter(a => a.priority === 'medium'),
        low: activities.filter(a => a.priority === 'low'),
      };

      // Count by type
      const countsByType = activities.reduce((acc, activity) => {
        acc[activity.type] = (acc[activity.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        success: true,
        data: {
          adminRole,
          allowedActivityTypes: canSeeAll ? 'all' : allowedActivities,
          totalPendingActivities: activities.length,
          countsByPriority: {
            urgent: groupedActivities.urgent.length,
            high: groupedActivities.high.length,
            medium: groupedActivities.medium.length,
            low: groupedActivities.low.length,
          },
          countsByType,
          activities: activities.slice(0, 50), // Limit to 50 items
          groupedActivities: {
            urgent: groupedActivities.urgent.slice(0, 10),
            high: groupedActivities.high.slice(0, 15),
            medium: groupedActivities.medium.slice(0, 15),
            low: groupedActivities.low.slice(0, 10),
          },
        },
      });
    } catch (error: any) {
      console.error("Error fetching activity summary:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   GET /api/admin/analytics/activity-summary/by-role
// @desc    Get activity visibility configuration by role
// @access  Admin+
router.get(
  "/activity-summary/by-role",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const roleDescriptions: Record<string, { activities: string[], description: string }> = {
        owner: {
          activities: ['Todo'],
          description: 'Acceso completo a todas las actividades, incluyendo balance de empresa y configuración crítica.'
        },
        super_admin: {
          activities: ['Todo'],
          description: 'Acceso completo a todas las actividades administrativas.'
        },
        admin: {
          activities: ['Tickets', 'Disputas', 'Contratos', 'Trabajos', 'Usuarios', 'Solicitudes de cancelación', 'Pagos pendientes'],
          description: 'Gestión general de la plataforma, usuarios y contratos.'
        },
        support: {
          activities: ['Tickets', 'Disputas', 'Solicitudes de cancelación'],
          description: 'Atención al cliente y resolución de problemas.'
        },
        marketing: {
          activities: ['Trabajos', 'Usuarios', 'Analytics', 'Anuncios'],
          description: 'Marketing, analytics y gestión de contenido promocional.'
        },
        dpo: {
          activities: ['Usuarios', 'Logs de auditoría', 'Solicitudes de datos'],
          description: 'Protección de datos, GDPR y auditoría de seguridad.'
        },
      };

      res.json({
        success: true,
        data: {
          currentRole: req.user.adminRole,
          roleConfigurations: roleDescriptions,
        },
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
