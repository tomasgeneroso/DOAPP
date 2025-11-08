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

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'alert';
export type NotificationCategory = 'ticket' | 'contract' | 'user' | 'payment' | 'system' | 'admin';
export type NotificationChannel = 'in_app' | 'email' | 'push';

@Table({
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['recipient_id', 'read', 'created_at'] },
    { fields: ['recipient_id', 'category'] },
    { fields: ['read'] },
  ],
})
export class Notification extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  recipientId!: string;

  @BelongsTo(() => User)
  recipient!: User;

  @Default('info')
  @Column(DataType.STRING(20))
  type!: NotificationType;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  category!: NotificationCategory;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: { len: [1, 200] },
  })
  title!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: { len: [1, 1000] },
  })
  message!: string;

  @Column(DataType.STRING(50))
  relatedModel?: string;

  @Column(DataType.UUID)
  relatedId?: string;

  @Column(DataType.STRING(255))
  actionUrl?: string;

  @Column({
    type: DataType.STRING(50),
    validate: { len: [0, 50] },
  })
  actionText?: string;

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  read!: boolean;

  @Column(DataType.DATE)
  readAt?: Date;

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  sentVia!: NotificationChannel[];

  @Default(false)
  @Column(DataType.BOOLEAN)
  emailSent!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  pushSent!: boolean;

  async markAsRead(): Promise<void> {
    this.read = true;
    this.readAt = new Date();
    await this.save();
  }
}

export default Notification;
