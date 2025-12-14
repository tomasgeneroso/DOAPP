import { AuditLog } from "../models/sql/AuditLog.model.js";
import type { AuthRequest } from "../types/index.js";

interface LogAuditParams {
  req: AuthRequest;
  action: string;
  category: "user" | "contract" | "ticket" | "role" | "permission" | "system";
  severity?: "low" | "medium" | "high" | "critical";
  description: string;
  targetModel?: string;
  targetId?: string;
  targetIdentifier?: string;
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Helper para registrar acciones de admin en el audit log
 */
export const logAudit = async (params: LogAuditParams): Promise<void> => {
  try {
    const {
      req,
      action,
      category,
      severity = "low",
      description,
      targetModel,
      targetId,
      targetIdentifier,
      changes,
      metadata,
    } = params;

    if (!req.user || !req.user.adminRole) {
      console.warn("Attempted to log audit without admin user");
      return;
    }

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
                req.socket.remoteAddress ||
                "unknown";

    const userAgent = req.headers["user-agent"] || "unknown";

    await AuditLog.create({
      performedBy: req.user.id || req.user._id,
      adminRole: req.user.adminRole,
      action,
      category,
      severity,
      description,
      targetModel,
      targetId,
      targetIdentifier,
      changes,
      metadata,
      ip,
      userAgent,
      passwordVerified: req.passwordVerified || false,
      twoFactorVerified: req.twoFactorVerified || false,
    });
  } catch (error) {
    console.error("Error al registrar audit log:", error);
    // No lanzar error para no interrumpir el flujo
  }
};

/**
 * Helper para crear objeto de cambio para el audit log
 */
export const createChange = (
  field: string,
  oldValue: any,
  newValue: any
): { field: string; oldValue: any; newValue: any } => {
  return { field, oldValue, newValue };
};

/**
 * Helper para comparar objetos y generar array de cambios
 */
export const detectChanges = (
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]
): Array<{ field: string; oldValue: any; newValue: any }> => {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

  for (const field of fields) {
    if (oldObj[field] !== newObj[field]) {
      changes.push({
        field,
        oldValue: oldObj[field],
        newValue: newObj[field],
      });
    }
  }

  return changes;
};

/**
 * Severidades predefinidas por tipo de acción
 */
export const ACTION_SEVERITIES: Record<string, "low" | "medium" | "high" | "critical"> = {
  // User actions
  "ban_user": "high",
  "unban_user": "high",
  "delete_user": "critical",
  "update_user_role": "high",
  "assign_permission": "high",

  // Contract actions
  "ban_contract": "medium",
  "unban_contract": "medium",
  "delete_contract": "high",
  "update_contract": "medium",

  // Ticket actions
  "create_ticket": "low",
  "assign_ticket": "low",
  "close_ticket": "low",

  // Role & Permission actions
  "create_role": "high",
  "update_role": "high",
  "delete_role": "critical",
  "update_permissions": "high",

  // System actions
  "export_data": "medium",
  "import_data": "high",
  "change_system_config": "critical",
};

/**
 * Helper para obtener severidad basada en la acción
 */
export const getSeverityForAction = (action: string): "low" | "medium" | "high" | "critical" => {
  return ACTION_SEVERITIES[action] || "low";
};
