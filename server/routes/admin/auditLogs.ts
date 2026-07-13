import { Router, Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { AuditLog } from "../../models/sql/AuditLog.model.js";
import { User } from "../../models/sql/User.model.js";
import { Op } from "sequelize";

const router = Router();

/**
 * GET /api/admin/audit-logs
 * Paginated list of admin actions (all roles). Filters: category, action,
 * adminId, severity, search (description/action/target), date range.
 * Access: admin:audit_log permission (owner / super_admin / dpo).
 */
router.get("/", protect, requirePermission("audit:read"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      category,
      severity,
      action,
      adminId,
      search,
      dateFrom,
      dateTo,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const where: any = {};
    if (category && category !== "all") where.category = category;
    if (severity && severity !== "all") where.severity = severity;
    if (action) where.action = action;
    if (adminId) where.performedBy = adminId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        where.createdAt[Op.lt] = end;
      }
    }
    if (search) {
      where[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { action: { [Op.iLike]: `%${search}%` } },
        { targetIdentifier: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: "performer", attributes: ["id", "name", "email", "avatar"], required: false }],
      order: [["createdAt", "DESC"]],
      offset: (pageNum - 1) * limitNum,
      limit: limitNum,
    });

    const logs = rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      category: r.category,
      severity: r.severity,
      description: r.description,
      targetModel: r.targetModel,
      targetId: r.targetId,
      targetIdentifier: r.targetIdentifier,
      changes: r.changes,
      metadata: r.metadata,
      ip: r.ip,
      adminRole: r.adminRole,
      performedBy: r.performedBy,
      admin: r.performer ? { id: r.performer.id, name: r.performer.name, email: r.performer.email } : null,
      createdAt: r.createdAt,
    }));

    res.json({
      success: true,
      data: {
        logs,
        pagination: { total: count, page: pageNum, limit: limitNum, pages: Math.ceil(count / limitNum) },
      },
    });
  } catch (error: any) {
    console.error("Error listing audit logs:", error);
    res.status(500).json({ success: false, message: error.message || "Error al listar el registro de acciones" });
  }
});

export default router;
