import mongoose, { Document, Schema } from "mongoose";

export interface IRefreshToken extends Document {
  user: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdByIp: string;
  userAgent?: string;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedByIp?: string;
  revokedReason?: string;
  replacedByToken?: string;
  createdAt: Date;
  updatedAt: Date;
  isExpired: boolean;
  isActive: boolean;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdByIp: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    revokedAt: {
      type: Date,
    },
    revokedByIp: {
      type: String,
    },
    revokedReason: {
      type: String,
    },
    replacedByToken: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual para verificar si el token expiró
refreshTokenSchema.virtual("isExpired").get(function () {
  return Date.now() >= this.expiresAt.getTime();
});

// Virtual para verificar si el token está activo
refreshTokenSchema.virtual("isActive").get(function () {
  return !this.isRevoked && !this.isExpired;
});

// Índices
refreshTokenSchema.index({ token: 1 }, { unique: true });
refreshTokenSchema.index({ expiresAt: 1, isRevoked: 1 });

// Auto-eliminar tokens expirados después de 30 días
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 días

export default mongoose.model<IRefreshToken>("RefreshToken", refreshTokenSchema);
