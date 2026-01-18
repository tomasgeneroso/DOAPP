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

export default router;
