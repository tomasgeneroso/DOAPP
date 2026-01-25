import jwt, { Secret } from 'jsonwebtoken';
import { config } from '../config.js';
import { RefreshToken } from '../models/RefreshToken.model.js';
import { sessions } from '../redis.js';

interface TokenPayload {
  id: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(userId: string): string {
  return jwt.sign(
    { id: userId },
    config.jwt.secret as Secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Generate refresh token (long-lived, stored in DB)
 */
export async function generateRefreshToken(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const refreshToken = await RefreshToken.generateToken(
    userId,
    ipAddress,
    userAgent
  );
  return refreshToken.token;
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  ipAddress?: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const storedToken = await RefreshToken.verifyToken(refreshToken);

  if (!storedToken || !storedToken.user) {
    return null;
  }

  // Revoke old refresh token
  await storedToken.revoke('Token refreshed');

  // Generate new tokens
  const accessToken = generateAccessToken(storedToken.userId);
  const newRefreshToken = await RefreshToken.generateToken(
    storedToken.userId,
    ipAddress,
    storedToken.userAgent || undefined
  );

  // Store session in Redis
  await sessions.set(storedToken.userId, accessToken);

  return {
    accessToken,
    refreshToken: newRefreshToken.token,
  };
}

/**
 * Revoke refresh token
 */
export async function revokeRefreshToken(
  token: string,
  ipAddress?: string,
  reason?: string
): Promise<boolean> {
  const refreshToken = await RefreshToken.findOne({
    where: { token, revoked: false },
  });

  if (!refreshToken) {
    return false;
  }

  await refreshToken.revoke(reason || 'Manual revocation');
  return true;
}

/**
 * Revoke all tokens for a user
 */
export async function revokeAllUserTokens(
  userId: string,
  reason?: string
): Promise<number> {
  // Revoke all refresh tokens in DB
  const count = await RefreshToken.revokeAllForUser(userId, reason);

  // Clear all sessions in Redis
  await sessions.revokeAll(userId);

  return count;
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
