import { User } from '../models/User.model.js';
import { PasswordResetToken } from '../models/PasswordResetToken.model.js';
import { revokeAllUserTokens } from './jwt.service.js';

interface PasswordResetResult {
  success: boolean;
  message: string;
  token?: string;
}

/**
 * Request password reset
 */
export async function requestPasswordReset(
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<PasswordResetResult> {
  const user = await User.findOne({ where: { email: email.toLowerCase() } });

  if (!user) {
    // Don't reveal if email exists
    return {
      success: true,
      message: 'Si el email existe, recibirás un enlace de recuperación',
    };
  }

  const { token } = await PasswordResetToken.generateToken(
    user.id,
    ipAddress,
    userAgent
  );

  return {
    success: true,
    message: 'Si el email existe, recibirás un enlace de recuperación',
    token, // For sending email
  };
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<PasswordResetResult> {
  const resetToken = await PasswordResetToken.verifyToken(token);

  if (!resetToken) {
    return {
      success: false,
      message: 'Token inválido o expirado',
    };
  }

  const user = await User.findByPk(resetToken.userId);

  if (!user) {
    return {
      success: false,
      message: 'Usuario no encontrado',
    };
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Mark token as used
  await resetToken.markAsUsed();

  // Revoke all sessions for security
  await revokeAllUserTokens(user.id, 'Password reset');

  return {
    success: true,
    message: 'Contraseña actualizada correctamente',
  };
}

/**
 * Change password (when user is logged in)
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<PasswordResetResult> {
  const user = await User.findByPk(userId);

  if (!user) {
    return {
      success: false,
      message: 'Usuario no encontrado',
    };
  }

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    return {
      success: false,
      message: 'Contraseña actual incorrecta',
    };
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Revoke all other sessions
  await revokeAllUserTokens(user.id, 'Password changed');

  return {
    success: true,
    message: 'Contraseña actualizada correctamente',
  };
}
