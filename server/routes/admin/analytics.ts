import express, { Request, Response } from "express";
import User from "../../models/User.js";
import Contract from "../../models/Contract.js";
import Ticket from "../../models/Ticket.js";
import AuditLog from "../../models/AuditLog.js";
import { protect } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { logAudit } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();

router.use(protect);
router.use(requirePermission("analytics:read"));

// @route   GET /api/admin/analytics/overview
// @desc    Resumen general de métricas
// @access  Marketing+
router.get("/overview", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate as string);
    if (endDate) dateFilter.$lte = new Date(endDate as string);

    const query = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [
      totalUsers,
      activeUsers,
      totalContracts,
      completedContracts,
      totalTickets,
      openTickets,
      bannedUsers,
      avgTrustScore,
    ] = await Promise.all([
      User.countDocuments(query),
      User.countDocuments({ ...query, lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      Contract.countDocuments(query),
      Contract.countDocuments({ ...query, status: "completed" }),
      Ticket.countDocuments(query),
      Ticket.countDocuments({ ...query, status: { $in: ["open", "assigned", "in_progress"] } }),
      User.countDocuments({ ...query, isBanned: true }),
      User.aggregate([{ $group: { _id: null, avg: { $avg: "$trustScore" } } }]),
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          banned: bannedUsers,
          avgTrustScore: avgTrustScore[0]?.avg || 0,
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

    const [
      newUsers,
      usersByRole,
      usersByVerification,
      topRatedUsers,
    ] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $group: { _id: "$verificationLevel", count: { $sum: 1 } } },
      ]),
      User.find()
        .sort({ rating: -1, reviewsCount: -1 })
        .limit(10)
        .select("name email avatar rating reviewsCount completedJobs"),
    ]);

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

    const [
      contractsByStatus,
      contractsByDay,
      avgContractValue,
      totalRevenue,
    ] = await Promise.all([
      Contract.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Contract.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
            revenue: { $sum: "$totalPrice" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Contract.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        { $group: { _id: null, avg: { $avg: "$totalPrice" } } },
      ]),
      Contract.aggregate([
        { $match: { createdAt: { $gte: dateLimit }, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$commission" } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        contractsByStatus,
        contractsByDay,
        avgContractValue: avgContractValue[0]?.avg || 0,
        totalRevenue: totalRevenue[0]?.total || 0,
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

    const [
      ticketsByStatus,
      ticketsByCategory,
      ticketsByPriority,
      avgResolutionTime,
    ] = await Promise.all([
      Ticket.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Ticket.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      Ticket.aggregate([
        { $match: { createdAt: { $gte: dateLimit } } },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      Ticket.aggregate([
        {
          $match: {
            createdAt: { $gte: dateLimit },
            status: "closed",
            closedAt: { $exists: true },
          },
        },
        {
          $project: {
            resolutionTime: {
              $subtract: ["$closedAt", "$createdAt"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$resolutionTime" },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        ticketsByStatus,
        ticketsByCategory,
        ticketsByPriority,
        avgResolutionTimeHours: avgResolutionTime[0]
          ? avgResolutionTime[0].avgTime / (1000 * 60 * 60)
          : 0,
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
  requirePermission("audit:read"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { period = "30d" } = req.query;

      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [actionsByCategory, actionsBySeverity, topAdmins] = await Promise.all([
        AuditLog.aggregate([
          { $match: { createdAt: { $gte: dateLimit } } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ]),
        AuditLog.aggregate([
          { $match: { createdAt: { $gte: dateLimit } } },
          { $group: { _id: "$severity", count: { $sum: 1 } } },
        ]),
        AuditLog.aggregate([
          { $match: { createdAt: { $gte: dateLimit } } },
          { $group: { _id: "$performedBy", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: "$user" },
          {
            $project: {
              count: 1,
              name: "$user.name",
              email: "$user.email",
              adminRole: "$user.adminRole",
            },
          },
        ]),
      ]);

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
  requirePermission("analytics:export"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { type = "users", format = "json", startDate, endDate } = req.query;

      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = new Date(startDate as string);
      if (endDate) dateFilter.$lte = new Date(endDate as string);

      const query = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

      let data: any[] = [];

      switch (type) {
        case "users":
          data = await User.find(query).select("-password -twoFactorSecret -twoFactorBackupCodes").lean();
          break;
        case "contracts":
          data = await Contract.find(query).populate("client doer job").lean();
          break;
        case "tickets":
          data = await Ticket.find(query).populate("createdBy assignedTo").lean();
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

export default router;
