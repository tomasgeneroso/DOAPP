import express, { Request, Response } from "express";
import { User } from "../../models/sql/User.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Ticket } from "../../models/sql/Ticket.model.js";
import { AuditLog } from "../../models/sql/AuditLog.model.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { logAudit } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";
import { Op } from 'sequelize';
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
