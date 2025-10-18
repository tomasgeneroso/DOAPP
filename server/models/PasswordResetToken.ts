import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export interface IPasswordResetToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  used: boolean;
  usedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  used: {
    type: Boolean,
    default: false,
    index: true,
  },
  usedAt: {
    type: Date,
  },
  ipAddress: String,
  userAgent: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Index for automatic cleanup
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to generate token
PasswordResetTokenSchema.statics.generateToken = async function (
  userId: mongoose.Types.ObjectId,
  ipAddress?: string,
  userAgent?: string
) {
  // Invalidate any existing tokens for this user
  await this.updateMany(
    { userId, used: false },
    { used: true, usedAt: new Date() }
  );

  // Generate secure random token
  const token = crypto.randomBytes(32).toString("hex");

  // Token expires in 24 hours (increased from 1 hour for better UX)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const resetToken = await this.create({
    userId,
    token,
    expiresAt,
    ipAddress,
    userAgent,
  });

  return { token: resetToken.token, expiresAt };
};

// Method to verify token
PasswordResetTokenSchema.statics.verifyToken = async function (token: string) {
  const resetToken = await this.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() },
  }).populate("userId");

  return resetToken;
};

export const PasswordResetToken = mongoose.model<IPasswordResetToken>(
  "PasswordResetToken",
  PasswordResetTokenSchema
);
