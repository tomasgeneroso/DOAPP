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

export type MessageType = 'text' | 'image' | 'file' | 'system';

@Table({
  tableName: 'chat_messages',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['conversation_id'] },
    { fields: ['sender_id'] },
    { fields: ['receiver_id'] },
    { fields: ['created_at'] },
  ],
})
export class ChatMessage extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  conversationId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  senderId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  receiverId!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  content!: string;

  @Default('text')
  @Column(DataType.STRING(20))
  type!: MessageType;

  @Column(DataType.TEXT)
  fileUrl?: string;

  @Column(DataType.STRING(255))
  fileName?: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isRead!: boolean;

  @Column(DataType.DATE)
  readAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDeleted!: boolean;

  @Column(DataType.DATE)
  deletedAt?: Date;

  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  async markAsRead(): Promise<void> {
    if (!this.isRead) {
      this.isRead = true;
      this.readAt = new Date();
      await this.save();
    }
  }

  async softDelete(): Promise<void> {
    this.isDeleted = true;
    this.deletedAt = new Date();
    await this.save();
  }
}

export default ChatMessage;
