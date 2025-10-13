import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export interface IWhatsAppResetCode extends Document {
  userId: mongoose.Types.ObjectId;
  code: string;
  used: boolean;
  usedAt?: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent?: string;
  createdAt: Date;
}

const WhatsAppResetCodeSchema = new Schema<IWhatsAppResetCode>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index para limpiar códigos expirados
WhatsAppResetCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Generar código de 6 dígitos
 */
WhatsAppResetCodeSchema.statics.generateCode = async function (
  userId: mongoose.Types.ObjectId,
  ipAddress: string,
  userAgent?: string
): Promise<{ code: string; expiresAt: Date }> {
  // Generar código de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Expira en 15 minutos
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  // Invalidar códigos anteriores del mismo usuario
  await this.updateMany(
    { userId, used: false },
    { $set: { used: true, usedAt: new Date() } }
  );

  // Crear nuevo código
  await this.create({
    userId,
    code,
    expiresAt,
    ipAddress,
    userAgent,
  });

  return { code, expiresAt };
};

/**
 * Verificar código
 */
WhatsAppResetCodeSchema.statics.verifyCode = async function (
  code: string
): Promise<IWhatsAppResetCode | null> {
  const resetCode = await this.findOne({
    code,
    used: false,
    expiresAt: { $gt: new Date() },
  });

  return resetCode;
};

export default mongoose.model<IWhatsAppResetCode>(
  "WhatsAppResetCode",
  WhatsAppResetCodeSchema
);
