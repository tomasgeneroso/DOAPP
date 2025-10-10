import mongoose, { Document, Schema } from "mongoose";

export interface IAuditLog extends Document {
  // Quién realizó la acción
  performedBy: mongoose.Types.ObjectId;
  adminRole: string;

  // Qué acción se realizó
  action: string; // e.g., "ban_user", "update_contract", "assign_role", "delete_ticket"
  category: "user" | "contract" | "ticket" | "role" | "permission" | "system";
  severity: "low" | "medium" | "high" | "critical";

  // Sobre qué/quién
  targetModel?: string; // "User", "Contract", "Ticket", etc.
  targetId?: mongoose.Types.ObjectId;
  targetIdentifier?: string; // email, ticket number, etc.

  // Detalles
  description: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  metadata?: Record<string, any>;

  // Contexto
  ip: string;
  userAgent: string;

  // Verificación (para acciones críticas)
  passwordVerified?: boolean;
  twoFactorVerified?: boolean;

  // Firma SHA256 para integridad
  signature?: string;

  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    adminRole: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["user", "contract", "ticket", "role", "permission", "system"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },
    targetModel: {
      type: String,
    },
    targetId: {
      type: Schema.Types.ObjectId,
    },
    targetIdentifier: {
      type: String,
    },
    description: {
      type: String,
      required: true,
    },
    changes: [{
      field: String,
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
    }],
    metadata: {
      type: Schema.Types.Mixed,
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    passwordVerified: {
      type: Boolean,
      default: false,
    },
    twoFactorVerified: {
      type: Boolean,
      default: false,
    },
    signature: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Índices para búsquedas eficientes
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ targetId: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, severity: -1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
