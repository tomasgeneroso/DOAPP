import crypto from "crypto";
import { Request } from "express";
import { AuditLog } from "../models/sql/AuditLog.model.js";

/**
 * Generate SHA256 hash for audit integrity
 */
export function generateHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Get client IP from request
 */
export function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

/**
 * Get user agent from request
 */
export function getUserAgent(req: Request): string {
  return req.headers["user-agent"] || "unknown";
}

/**
 * Create audit log entry with signature
 */
export async function createAuditLog(params: {
  userId?: any;
  action: string;
  entity: "user" | "contract" | "payment" | "ticket" | "role" | "system";
  entityId?: string;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  metadata?: Record<string, any>;
  ownerPasswordVerified?: boolean;
  twoFactorVerified?: boolean;
}) {
  try {
    const timestamp = new Date().toISOString();
    const dataToHash = JSON.stringify({
      userId: params.userId?.toString() || "system",
      action: params.action,
      entity: params.entity,
      entityId: params.entityId || "",
      timestamp,
      description: params.description,
    });

    const signature = generateHash(dataToHash);

    const auditEntry = await AuditLog.logAdminAction({
      performedBy: params.userId?.toString() || 'system',
      adminRole: 'system',
      action: params.action,
      category: params.entity,
      description: params.description,
      targetModel: params.entity,
      targetId: params.entityId,
      ip: params.ipAddress || "unknown",
      userAgent: params.userAgent || "unknown",
      changes: params.changes || [],
      metadata: params.metadata || {},
      signature,
      passwordVerified: params.ownerPasswordVerified || false,
      twoFactorVerified: params.twoFactorVerified || false,
    });

    return auditEntry;
  } catch (error) {
    console.error("[Audit Log] Error creating log:", error);
    // Don't throw error to avoid breaking the main operation
    return null;
  }
}

/**
 * Verify audit log integrity
 */
export function verifyAuditLogIntegrity(log: any): boolean {
  const dataToHash = JSON.stringify({
    userId: log.userId?.toString() || "system",
    action: log.action,
    entity: log.entity,
    entityId: log.entityId || "",
    timestamp: log.createdAt.toISOString(),
    description: log.description,
  });

  const expectedHash = generateHash(dataToHash);
  return expectedHash === log.signature;
}

/**
 * Log user authentication events
 */
export async function logAuthEvent(
  userId: any,
  action: "login" | "logout" | "register" | "password_change" | "2fa_enabled" | "2fa_disabled",
  req: Request,
  success: boolean = true
) {
  return createAuditLog({
    userId,
    action: `auth.${action}`,
    entity: "user",
    entityId: userId?.toString(),
    description: `User ${action} ${success ? "successful" : "failed"}`,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: { success },
  });
}

/**
 * Log administrative actions
 */
export async function logAdminAction(
  adminId: any,
  action: string,
  entity: "user" | "contract" | "payment" | "ticket" | "role" | "system",
  entityId: string,
  description: string,
  req: Request,
  changes?: { field: string; oldValue: any; newValue: any }[],
  ownerPasswordVerified: boolean = false,
  twoFactorVerified: boolean = false
) {
  return createAuditLog({
    userId: adminId,
    action: `admin.${action}`,
    entity,
    entityId,
    description,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    changes,
    ownerPasswordVerified,
    twoFactorVerified,
  });
}

/**
 * Log payment events
 */
export async function logPaymentEvent(
  userId: any,
  action: "created" | "captured" | "refunded" | "escrow_released",
  paymentId: string,
  description: string,
  metadata?: Record<string, any>
) {
  return createAuditLog({
    userId,
    action: `payment.${action}`,
    entity: "payment",
    entityId: paymentId,
    description,
    metadata,
  });
}

/**
 * Log contract events
 */
export async function logContractEvent(
  userId: any,
  action: "created" | "updated" | "accepted" | "rejected" | "cancelled" | "completed",
  contractId: string,
  description: string,
  req?: Request,
  changes?: { field: string; oldValue: any; newValue: any }[]
) {
  return createAuditLog({
    userId,
    action: `contract.${action}`,
    entity: "contract",
    entityId: contractId,
    description,
    ipAddress: req ? getClientIp(req) : undefined,
    userAgent: req ? getUserAgent(req) : undefined,
    changes,
  });
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  action: string,
  description: string,
  req: Request,
  userId?: any
) {
  return createAuditLog({
    userId,
    action: `security.${action}`,
    entity: "system",
    description,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    metadata: {
      suspicious: true,
      path: req.path,
      method: req.method,
      body: JSON.stringify(req.body),
    },
  });
}

/**
 * Cleanup old audit logs (older than retention period)
 */
export async function cleanupOldAuditLogs(retentionDays: number = 90) {
  try {
    const deletedCount = await AuditLog.cleanupOldLogs(retentionDays);
    console.log(`[Audit Log] Cleaned up ${deletedCount} old logs`);
    return deletedCount;
  } catch (error) {
    console.error("[Audit Log] Error cleaning up logs:", error);
    return 0;
  }
}

export default {
  createAuditLog,
  verifyAuditLogIntegrity,
  logAuthEvent,
  logAdminAction,
  logPaymentEvent,
  logContractEvent,
  logSuspiciousActivity,
  cleanupOldAuditLogs,
  generateHash,
  getClientIp,
  getUserAgent,
};
