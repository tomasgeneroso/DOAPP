import mongoose, { Schema, Document } from "mongoose";

export interface IPhoneVerificationCode extends Document {
  userId?: mongoose.Types.ObjectId;
  phone: string;
  code: string;
  used: boolean;
  usedAt?: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent?: string;
  createdAt: Date;
}

const PhoneVerificationCodeSchema = new Schema<IPhoneVerificationCode>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    phone: {
      type: String,
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
PhoneVerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Generar código de 6 dígitos
 */
PhoneVerificationCodeSchema.statics.generateCode = async function (
  phone: string,
  ipAddress: string,
  userAgent?: string,
  userId?: mongoose.Types.ObjectId
): Promise<{ code: string; expiresAt: Date }> {
  // Generar código de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Expira en 10 minutos
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Invalidar códigos anteriores del mismo teléfono
  await this.updateMany(
    { phone, used: false },
    { $set: { used: true, usedAt: new Date() } }
  );

  // Crear nuevo código
  await this.create({
    userId,
    phone,
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
PhoneVerificationCodeSchema.statics.verifyCode = async function (
  phone: string,
  code: string
): Promise<IPhoneVerificationCode | null> {
  const verificationCode = await this.findOne({
    phone,
    code,
    used: false,
    expiresAt: { $gt: new Date() },
  });

  return verificationCode;
};

export default mongoose.model<IPhoneVerificationCode>(
  "PhoneVerificationCode",
  PhoneVerificationCodeSchema
);
