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
import { v4 as uuidv4 } from 'uuid';

@Table({
  tableName: 'refresh_tokens',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['token'], unique: true },
    { fields: ['user_id'] },
    { fields: ['expires_at'] },
  ],
})
export class RefreshToken extends Model {
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
  @Column(DataType.STRING(500))
  token!: string;

  @Column(DataType.DATE)
  expiresAt!: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  revoked!: boolean;

  @Column(DataType.DATE)
  revokedAt?: Date;

  @Column(DataType.STRING(255))
  revokedReason?: string;

  @Column(DataType.STRING(45))
  ipAddress?: string;

  @Column(DataType.STRING(500))
  userAgent?: string;

  // Static methods
  static async generateToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    expiresInDays: number = 30
  ): Promise<RefreshToken> {
    const token = uuidv4() + '-' + uuidv4();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    return RefreshToken.create({
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    });
  }

  static async verifyToken(token: string): Promise<RefreshToken | null> {
    const refreshToken = await RefreshToken.findOne({
      where: {
        token,
        revoked: false,
      },
      include: [User],
    });

    if (!refreshToken) return null;
    if (refreshToken.expiresAt < new Date()) {
      await refreshToken.revoke('Token expired');
      return null;
    }

    return refreshToken;
  }

  async revoke(reason?: string): Promise<void> {
    this.revoked = true;
    this.revokedAt = new Date();
    this.revokedReason = reason;
    await this.save();
  }

  static async revokeAllForUser(userId: string, reason?: string): Promise<number> {
    const [affectedCount] = await RefreshToken.update(
      {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
      {
        where: {
          userId,
          revoked: false,
        },
      }
    );
    return affectedCount;
  }
}

export default RefreshToken;
