import jwt, { Secret, SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { RefreshToken } from "../models/sql/RefreshToken.model.js";
import { config } from "../config/env.js";
import { Op } from 'sequelize';

// Generar access token (JWT corto)
export const generateAccessToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: (config.jwtExpire || "7d") as any,
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
    userId,
    token,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdByIp: ip,
    userAgent,
  } as any);

  return token;
};

// Revocar refresh token
export const revokeRefreshToken = async (
  token: string,
  ip: string,
  reason?: string
): Promise<void> => {
  const refreshToken = await RefreshToken.findOne({ where: { token } });

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
  await RefreshToken.update(
    {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason || "All tokens revoked",
    },
    { where: { userId, isRevoked: false } as any }
  );
};

// Validar y renovar refresh token
export const refreshAccessToken = async (
  token: string,
  ip: string
): Promise<{ accessToken: string; refreshToken: string } | null> => {
  const refreshToken = await RefreshToken.findOne({ where: { token } });

  if (!refreshToken) return null;
  if (refreshToken.isRevoked) return null;
  if (new Date() >= refreshToken.expiresAt) return null;

  const userId = (refreshToken as any).userId || (refreshToken as any).user;
  const accessToken = generateAccessToken(userId.toString());

  const newRefreshToken = await generateRefreshToken(
    userId.toString(),
    ip,
    refreshToken.userAgent
  );

  refreshToken.isRevoked = true;
  refreshToken.revokedAt = new Date();
  refreshToken.revokedReason = "Replaced by rotation";
  refreshToken.replacedByToken = newRefreshToken;
  await refreshToken.save();

  return { accessToken, refreshToken: newRefreshToken };
};

// Limpiar tokens expirados
export const cleanupExpiredTokens = async (): Promise<number> => {
  const count = await RefreshToken.destroy({
    where: {
      expiresAt: { [Op.lt]: new Date() },
      isRevoked: true,
    } as any,
  });
  return count;
};
