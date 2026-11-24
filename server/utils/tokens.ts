import jwt, { Secret, SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { RefreshToken } from "../models/sql/RefreshToken.model.js";
import { User } from "../models/sql/User.model.js";
import { config } from "../config/env.js";
import { Op } from 'sequelize';

// Generar access token (JWT corto)
export const generateAccessToken = (userId: string): string => {
  const options: SignOptions = {
    expiresIn: (config.jwtExpire || "7d") as any,
  };
  return jwt.sign({ id: userId }, config.jwtSecret as Secret, options);
};

/**
 * El token de refresco se guarda como HASH (SHA-256): quien llevara una copia de la base no podía usar las sesiones (auditoría de seguridad, 2026-11-24).
 * Los que ya estaban guardados en claro se siguen aceptando hasta que vencen (se busca por el hash o por el valor tal cual): nadie queda sin sesión por el cambio.
 */
export const hashDelRefresh = (token: string): string => crypto.createHash("sha256").update(String(token)).digest("hex");
const posiblesValores = (token: string): string[] => [hashDelRefresh(token), String(token)];

// Generar refresh token (largo, guardado en DB)
export const generateRefreshToken = async (
  userId: string,
  ip: string,
  userAgent?: string
): Promise<string> => {
  const token = crypto.randomBytes(40).toString("hex");

  await RefreshToken.create({
    userId,
    token: hashDelRefresh(token),
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
  const refreshToken = await RefreshToken.findOne({ where: { token: { [Op.in]: posiblesValores(token) } } as any });

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
  // Los tokens de acceso (JWT) duran 7 días y no se guardan: se cierran todos poniendo «desde cuándo valen» en ahora (vigenciaDeSesion.ts).
  await User.update({ tokensValidAfter: new Date() } as any, { where: { id: userId } });
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
  const refreshToken = await RefreshToken.findOne({ where: { token: { [Op.in]: posiblesValores(token) } } as any });

  if (!refreshToken) return null;
  if (refreshToken.isRevoked) return null;
  if (new Date() >= refreshToken.expiresAt) return null;

  // El token se gasta ANTES de emitir el nuevo y en un solo paso: con dos pedidos a la vez con el mismo token, el segundo ya no lo encuentra sin usar
  // (antes los dos pasaban y salían dos sesiones nuevas).
  const [gastados] = await RefreshToken.update(
    { isRevoked: true, revokedAt: new Date(), revokedReason: "Replaced by rotation" } as any,
    { where: { id: refreshToken.id, isRevoked: false } as any },
  );
  if (!gastados) return null;

  const userId = (refreshToken as any).userId || (refreshToken as any).user;
  const accessToken = generateAccessToken(userId.toString());

  const newRefreshToken = await generateRefreshToken(
    userId.toString(),
    ip,
    refreshToken.userAgent
  );

  await RefreshToken.update({ replacedByToken: hashDelRefresh(newRefreshToken) } as any, { where: { id: refreshToken.id } });

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
