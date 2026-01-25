import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';

export type NotificationType =
  | 'message'
  | 'proposal'
  | 'contract'
  | 'payment'
  | 'review'
  | 'job'
  | 'system'
  | 'membership';

@Table({
  tableName: 'notifications',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['is_read'] },
    { fields: ['created_at'] },
  ],
})
export class Notification extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  type!: NotificationType;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  title!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  message!: string;

  @Column(DataType.TEXT)
  link?: string;

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isRead!: boolean;

  @Column(DataType.DATE)
  readAt?: Date;

  // Reference to related entity
  @Column(DataType.UUID)
  referenceId?: string;

  @Column(DataType.STRING(50))
  referenceType?: string;

  // Sender info (for messages, etc.)
  @Column(DataType.UUID)
  senderId?: string;

  @Column(DataType.STRING(100))
  senderName?: string;

  @Column(DataType.TEXT)
  senderAvatar?: string;

  // Push notification status
  @Default(false)
  @Column(DataType.BOOLEAN)
  pushSent!: boolean;

  @Column(DataType.DATE)
  pushSentAt?: Date;

  // Email notification status
  @Default(false)
  @Column(DataType.BOOLEAN)
  emailSent!: boolean;

  @Column(DataType.DATE)
  emailSentAt?: Date;

  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  async markAsRead(): Promise<void> {
    if (!this.isRead) {
      this.isRead = true;
      this.readAt = new Date();
      await this.save();
    }
  }

  async markPushSent(): Promise<void> {
    this.pushSent = true;
    this.pushSentAt = new Date();
    await this.save();
  }

  async markEmailSent(): Promise<void> {
    this.emailSent = true;
    this.emailSentAt = new Date();
    await this.save();
  }

  static async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      link?: string;
      referenceId?: string;
      referenceType?: string;
      senderId?: string;
      senderName?: string;
      senderAvatar?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<Notification> {
    return Notification.create({
      userId,
      type,
      title,
      message,
      ...options,
    });
  }

  static async getUnreadCount(userId: string): Promise<number> {
    return Notification.count({
      where: { userId, isRead: false },
    });
  }

  static async markAllAsRead(userId: string): Promise<number> {
    const [affectedCount] = await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { userId, isRead: false } }
    );
    return affectedCount;
  }
}

export default Notification;
