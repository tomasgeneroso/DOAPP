import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import crypto from 'crypto';

@Table({
  tableName: 'password_reset_tokens',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['token'], unique: true },
    { fields: ['user_id'] },
    { fields: ['expires_at'] },
  ],
})
export class PasswordResetToken extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User)
  user?: User;

  @Index
  @Column(DataType.STRING(255))
  token!: string;

  @Column(DataType.DATE)
  expiresAt!: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  used!: boolean;

  @Column(DataType.DATE)
  usedAt?: Date;

  @Column(DataType.STRING(45))
  ipAddress?: string;

  @Column(DataType.STRING(500))
  userAgent?: string;

  // Static methods
  static async generateToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ resetToken: PasswordResetToken; token: string }> {
    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    // Invalidate any existing tokens for this user
    await PasswordResetToken.update(
      { used: true, usedAt: new Date() },
      { where: { userId, used: false } }
    );

    const resetToken = await PasswordResetToken.create({
      userId,
      token: hashedToken,
      expiresAt,
      ipAddress,
      userAgent,
    });

    return { resetToken, token }; // Return unhashed token for email
  }

  static async verifyToken(token: string): Promise<PasswordResetToken | null> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await PasswordResetToken.findOne({
      where: {
        token: hashedToken,
        used: false,
      },
      include: [User],
    });

    if (!resetToken) return null;
    if (resetToken.expiresAt < new Date()) return null;

    return resetToken;
  }

  async markAsUsed(): Promise<void> {
    this.used = true;
    this.usedAt = new Date();
    await this.save();
  }
}

export default PasswordResetToken;
