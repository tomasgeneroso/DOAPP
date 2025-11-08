import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import crypto from 'crypto';

/**
 * PasswordResetToken Model - PostgreSQL/Sequelize
 *
 * Sistema de tokens para reseteo de contraseña con:
 * - Tokens seguros generados con crypto
 * - Expiración de 24 horas
 * - Tracking de uso
 * - IP y user agent para seguridad
 * - Invalidación automática de tokens previos
 */

@Table({
  tableName: 'password_reset_tokens',
  timestamps: false, // Solo usamos createdAt custom
  underscored: true,
  indexes: [
    { fields: ['token'], unique: true },
    { fields: ['user_id'] },
    { fields: ['used'] },
    { fields: ['expires_at'] },
    { fields: ['created_at'] },
  ],
})
export class PasswordResetToken extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User)
  user!: User;

  // ============================================
  // TOKEN INFO
  // ============================================

  @AllowNull(false)
  @Index({ unique: true })
  @Column(DataType.STRING(64))
  token!: string; // 32 bytes hex = 64 chars

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  expiresAt!: Date;

  // ============================================
  // USAGE TRACKING
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  used!: boolean;

  @Column(DataType.DATE)
  usedAt?: Date;

  // ============================================
  // SECURITY TRACKING
  // ============================================

  @Column(DataType.STRING(45))
  ipAddress?: string;

  @Column(DataType.TEXT)
  userAgent?: string;

  @Default(() => new Date())
  @Index
  @Column(DataType.DATE)
  createdAt!: Date;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if token is expired
   */
  isExpired(): boolean {
    return Date.now() >= this.expiresAt.getTime();
  }

  /**
   * Check if token is valid (not used and not expired)
   */
  isValid(): boolean {
    return !this.used && !this.isExpired();
  }

  /**
   * Mark token as used
   */
  async markAsUsed(): Promise<void> {
    if (this.used) {
      throw new Error('Token is already used');
    }

    if (this.isExpired()) {
      throw new Error('Token has expired');
    }

    this.used = true;
    this.usedAt = new Date();

    await this.save();
  }

  /**
   * Get hours until expiration
   */
  getHoursUntilExpiration(): number {
    const now = new Date();
    const diffTime = this.expiresAt.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60));
  }

  /**
   * Get token age in hours
   */
  getAgeInHours(): number {
    const now = new Date();
    const created = this.createdAt;
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60));
  }

  /**
   * Static: Generate new reset token for user
   */
  static async generateToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; expiresAt: Date }> {
    // Invalidate any existing unused tokens for this user
    await PasswordResetToken.update(
      {
        used: true,
        usedAt: new Date(),
      },
      {
        where: {
          userId,
          used: false,
        },
      }
    );

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Token expires in 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const resetToken = await PasswordResetToken.create({
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
      createdAt: new Date(),
    });

    return {
      token: resetToken.token,
      expiresAt: resetToken.expiresAt,
    };
  }

  /**
   * Static: Verify token and return token object with user
   */
  static async verifyToken(token: string): Promise<PasswordResetToken | null> {
    const resetToken = await PasswordResetToken.findOne({
      where: {
        token,
        used: false,
      },
      include: [User],
    });

    if (!resetToken || resetToken.isExpired()) {
      return null;
    }

    return resetToken;
  }

  /**
   * Static: Find valid token for user
   */
  static async findValidTokenForUser(userId: string): Promise<PasswordResetToken | null> {
    const token = await PasswordResetToken.findOne({
      where: {
        userId,
        used: false,
      },
      order: [['createdAt', 'DESC']],
    });

    if (!token || token.isExpired()) {
      return null;
    }

    return token;
  }

  /**
   * Static: Clean up expired and used tokens older than 7 days
   */
  static async cleanupOldTokens(): Promise<number> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const result = await PasswordResetToken.destroy({
      where: {
        createdAt: {
          [require('sequelize').Op.lt]: sevenDaysAgo,
        },
      },
    });

    return result;
  }

  /**
   * Static: Count active tokens for user
   */
  static async countActiveTokensForUser(userId: string): Promise<number> {
    return await PasswordResetToken.count({
      where: {
        userId,
        used: false,
        expiresAt: {
          [require('sequelize').Op.gt]: new Date(),
        },
      },
    });
  }

  /**
   * Static: Revoke all tokens for user
   */
  static async revokeAllForUser(userId: string): Promise<number> {
    const result = await PasswordResetToken.update(
      {
        used: true,
        usedAt: new Date(),
      },
      {
        where: {
          userId,
          used: false,
        },
      }
    );

    return result[0]; // Number of affected rows
  }

  /**
   * Static: Generate secure token string
   */
  static generateTokenString(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

export default PasswordResetToken;
