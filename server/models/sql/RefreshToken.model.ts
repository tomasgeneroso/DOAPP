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

/**
 * RefreshToken Model - PostgreSQL/Sequelize
 *
 * Sistema de tokens de refresco JWT con:
 * - Tracking de IP y user agent
 * - Revocación de tokens
 * - Reemplazo de tokens
 * - Expiración automática
 */

@Table({
  tableName: 'refresh_tokens',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['token'], unique: true },
    { fields: ['user_id'] },
    { fields: ['expires_at', 'is_revoked'] },
    { fields: ['is_revoked'] },
  ],
})
export class RefreshToken extends Model {
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
  @Column(DataType.TEXT)
  token!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  expiresAt!: Date;

  // ============================================
  // TRACKING INFO
  // ============================================

  @AllowNull(false)
  @Column(DataType.STRING(45))
  createdByIp!: string; // IPv4 or IPv6

  @Column(DataType.TEXT)
  userAgent?: string;

  // ============================================
  // REVOCATION
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isRevoked!: boolean;

  @Column(DataType.DATE)
  revokedAt?: Date;

  @Column(DataType.STRING(45))
  revokedByIp?: string;

  @Column(DataType.TEXT)
  revokedReason?: string;

  @Column(DataType.TEXT)
  replacedByToken?: string; // Token that replaced this one

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
   * Check if token is active (not revoked and not expired)
   */
  isActive(): boolean {
    return !this.isRevoked && !this.isExpired();
  }

  /**
   * Revoke token
   */
  async revoke(ip: string, reason?: string, replacedBy?: string): Promise<void> {
    if (this.isRevoked) {
      throw new Error('Token is already revoked');
    }

    this.isRevoked = true;
    this.revokedAt = new Date();
    this.revokedByIp = ip;
    this.revokedReason = reason;
    this.replacedByToken = replacedBy;

    await this.save();
  }

  /**
   * Get token age in days
   */
  getAgeInDays(): number {
    const now = new Date();
    const created = this.createdAt as Date;
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get days until expiration
   */
  getDaysUntilExpiration(): number {
    const now = new Date();
    const diffTime = this.expiresAt.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if token is about to expire (within 24 hours)
   */
  isAboutToExpire(): boolean {
    const hoursUntilExpiration =
      (this.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    return hoursUntilExpiration > 0 && hoursUntilExpiration <= 24;
  }

  /**
   * Get masked token (show first and last 6 chars)
   */
  getMaskedToken(): string {
    if (!this.token || this.token.length < 20) {
      return '****';
    }
    return `${this.token.slice(0, 6)}...${this.token.slice(-6)}`;
  }

  /**
   * Static: Clean up expired and revoked tokens older than 30 days
   */
  static async cleanupOldTokens(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await RefreshToken.destroy({
      where: {
        expiresAt: {
          [require('sequelize').Op.lt]: thirtyDaysAgo,
        },
        isRevoked: true,
      },
    });

    return result;
  }

  /**
   * Static: Revoke all tokens for a user
   */
  static async revokeAllForUser(
    userId: string,
    ip: string,
    reason?: string
  ): Promise<number> {
    const tokens = await RefreshToken.findAll({
      where: {
        userId,
        isRevoked: false,
      },
    });

    for (const token of tokens) {
      await token.revoke(ip, reason);
    }

    return tokens.length;
  }

  /**
   * Static: Find active token by token string
   */
  static async findActiveToken(tokenString: string): Promise<RefreshToken | null> {
    const token = await RefreshToken.findOne({
      where: {
        token: tokenString,
        isRevoked: false,
      },
    });

    if (!token || token.isExpired()) {
      return null;
    }

    return token;
  }
}

export default RefreshToken;
