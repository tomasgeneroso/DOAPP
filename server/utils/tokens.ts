import jwt, { Secret, SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import RefreshToken from "../models/RefreshToken.js";
import { config } from "../config/env.js";

// Generar access token (JWT corto)
export const generateAccessToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: "15m", // 15 minutos
  };

  return jwt.sign({ id: userId }, config.jwtSecret as Secret, options);
};

// Generar refresh token (largo, guardado en DB)
export const generateRefreshToken = async (
  userId: string,
  ip: string,
  userAgent?: string
): Promise<string> => {
  const token = crypto.randomBytes(40).toString("hex");

  await RefreshToken.create({
    user: userId,
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
    createdByIp: ip,
    userAgent,
  });

  return token;
};

// Revocar refresh token
export const revokeRefreshToken = async (
  token: string,
  ip: string,
  reason?: string
): Promise<void> => {
  const refreshToken = await RefreshToken.findOne({ token });

  if (refreshToken && !refreshToken.isRevoked) {
    refreshToken.isRevoked = true;
    refreshToken.revokedAt = new Date();
    refreshToken.revokedByIp = ip;
    refreshToken.revokedReason = reason || "Revoked by user";
    await refreshToken.save();
  }
};

// Revocar todos los refresh tokens de un usuario
export const revokeAllUserTokens = async (
  userId: string,
  reason?: string
): Promise<void> => {
  await RefreshToken.updateMany(
    { user: userId, isRevoked: false },
    {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason || "All tokens revoked",
    }
  );
};

// Validar y renovar refresh token
export const refreshAccessToken = async (
  token: string,
  ip: string
): Promise<{ accessToken: string; refreshToken: string } | null> => {
  const refreshToken = await RefreshToken.findOne({ token }).populate("user");

  if (!refreshToken) {
    return null;
  }

  // Verificar si está revocado
  if (refreshToken.isRevoked) {
    return null;
  }

  // Verificar si expiró
  if (new Date() >= refreshToken.expiresAt) {
    return null;
  }

  // Generar nuevo access token
  const accessToken = generateAccessToken(refreshToken.user.toString());

  // Generar nuevo refresh token (rotation)
  const newRefreshToken = await generateRefreshToken(
    refreshToken.user.toString(),
    ip,
    refreshToken.userAgent
  );

  // Revocar el token viejo y apuntar al nuevo
  refreshToken.isRevoked = true;
  refreshToken.revokedAt = new Date();
  refreshToken.revokedReason = "Replaced by rotation";
  refreshToken.replacedByToken = newRefreshToken;
  await refreshToken.save();

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
};

// Limpiar tokens expirados (llamar periódicamente)
export const cleanupExpiredTokens = async (): Promise<number> => {
  const result = await RefreshToken.deleteMany({
    expiresAt: { $lt: new Date() },
    isRevoked: true,
  });

  return result.deletedCount || 0;
};
