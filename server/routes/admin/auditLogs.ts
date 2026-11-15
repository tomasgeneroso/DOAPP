import { Router, Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { AuditLog } from "../../models/sql/AuditLog.model.js";
import { User } from "../../models/sql/User.model.js";
import { leerMetadata } from "../../utils/auditLog.js";
import { Op, literal } from "sequelize";
import { relacionadosParaElRegistro, type RelacionadosDelRegistro } from "../../services/busquedaEnRegistroDeAcciones.js";
import { parecePedazoDeId } from "../../services/vinculosDeId.js";

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
    // Qué se incluyó al buscar por un id (para decírselo a quien busca): el objeto, sus pagos, contratos, personas…
    let incluido: RelacionadosDelRegistro['resumen'] | null = null;
    if (search) {
      const texto = String(search).trim().slice(0, 100);
      const escapado = texto.replace(/[%_\\]/g, "\\$&");
      const condiciones: any[] = [
        { description: { [Op.iLike]: `%${escapado}%` } },
        { action: { [Op.iLike]: `%${escapado}%` } },
        { targetIdentifier: { [Op.iLike]: `%${escapado}%` } },
      ];
      // Un pedazo de id (del principio, del medio o del final: las pantallas muestran unos con los primeros 8 y otros con los últimos 8): el id del objeto
      // sobre el que se actuó, y todo lo que está relacionado con él (publicación ↔ pagos ↔ contratos ↔ personas), también lo que se escribió antes.
      if (parecePedazoDeId(texto) && texto.length >= 4) {
        condiciones.push(literal(`CAST("AuditLog"."targetId" AS TEXT) ILIKE '%${texto.toLowerCase()}%'`));
        condiciones.push(literal(`CAST("AuditLog"."performedBy" AS TEXT) ILIKE '%${texto.toLowerCase()}%'`));
        condiciones.push(literal(`"AuditLog"."metadata"::text ILIKE '%${texto.toLowerCase()}%'`));
        const rel = await relacionadosParaElRegistro(texto);
        if (rel.ids.length) {
          incluido = rel.resumen;
          condiciones.push({ targetId: { [Op.in]: rel.ids } });
          // Lo que HICIERON las personas relacionadas (por ejemplo, un cliente que cancela su publicación)
          if (rel.personas.length) condiciones.push({ performedBy: { [Op.in]: rel.personas } });
          // Ids relacionados escritos dentro de la metadata (un asiento sobre un pago puede nombrar el trabajo o el contrato ahí). Los ids ya son UUID válidos.
          const enMetadata = rel.ids.slice(0, 150).map((id) => `'%${id}%'`).join(', ');
          condiciones.push(literal(`"AuditLog"."metadata"::text ILIKE ANY (ARRAY[${enMetadata}])`));
        }
      }
      where[Op.or] = condiciones;
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
      // Se descomprime al leer. Acceder a r.metadata directo devolvería sólo el
      // resumen en los asientos grandes, y quien lo lea creería que no había nada.
      metadata: leerMetadata(r),
      ip: r.ip,
      adminRole: r.adminRole,
      // Los eventos automáticos no tienen usuario: actor dice quién fue.
      actor: r.actor || null,
      performedBy: r.performedBy,
      admin: r.performer ? { id: r.performer.id, name: r.performer.name, email: r.performer.email } : null,
      createdAt: r.createdAt,
    }));

    res.json({
      success: true,
      data: {
        logs,
        incluido,
        pagination: { total: count, page: pageNum, limit: limitNum, pages: Math.ceil(count / limitNum) },
      },
    });
  } catch (error: any) {
    console.error("Error listing audit logs:", error);
    res.status(500).json({ success: false, message: error.message || "Error al listar el registro de acciones" });
  }
});

export default router;
