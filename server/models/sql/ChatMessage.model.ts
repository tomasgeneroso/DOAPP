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
 * ChatMessage Model - PostgreSQL/Sequelize
 *
 * Mensajes de chat con soporte para:
 * - Texto, imágenes, archivos, mensajes del sistema
 * - Estado de lectura
 * - Soft delete
 * - Metadata para mensajes del sistema
 */

export type MessageType = 'text' | 'image' | 'file' | 'system';

@Table({
  tableName: 'chat_messages',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['conversation_id', 'created_at'] },
    { fields: ['sender_id', 'conversation_id'] },
    { fields: ['conversation_id', 'read'] },
    { fields: ['conversation_id'] },
    { fields: ['sender_id'] },
    { fields: ['read'] },
  ],
})
export class ChatMessage extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  conversationId!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  senderId!: string;

  @BelongsTo(() => User, 'senderId')
  sender!: User;

  // ============================================
  // MESSAGE CONTENT
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: [1, 5000],
    },
  })
  message!: string;

  @Default('text')
  @Column(DataType.STRING(20))
  type!: MessageType;

  // ============================================
  // FILE ATTACHMENT
  // ============================================

  @Column(DataType.TEXT)
  fileUrl?: string;

  @Column(DataType.STRING(255))
  fileName?: string;

  @Column(DataType.INTEGER)
  fileSize?: number;

  // ============================================
  // METADATA (for system messages)
  // ============================================

  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  // ============================================
  // READ STATUS
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  read!: boolean;

  @Column(DataType.DATE)
  readAt?: Date;

  // ============================================
  // SOFT DELETE
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  deleted!: boolean;

  @Column(DataType.DATE)
  deletedAt?: Date;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Mark message as read
   */
  async markAsRead(): Promise<void> {
    if (this.read) return;

    this.read = true;
    this.readAt = new Date();
    await this.save();
  }

  /**
   * Soft delete message
   */
  async softDelete(): Promise<void> {
    this.deleted = true;
    this.deletedAt = new Date();
    await this.save();
  }

  /**
   * Check if message is a file
   */
  hasFile(): boolean {
    return this.type === 'file' || this.type === 'image';
  }

  /**
   * Check if message is from system
   */
  isSystem(): boolean {
    return this.type === 'system';
  }

  /**
   * Get file extension
   */
  getFileExtension(): string | null {
    if (!this.fileName) return null;
    const parts = this.fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
  }

  /**
   * Get formatted file size
   */
  getFormattedFileSize(): string | null {
    if (!this.fileSize) return null;

    const kb = this.fileSize / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;

    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;

    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  /**
   * Get preview text (truncated message)
   */
  getPreview(maxLength: number = 100): string {
    if (this.deleted) return '[Mensaje eliminado]';
    if (this.type === 'system') return this.message;
    if (this.type === 'image') return '📷 Imagen';
    if (this.type === 'file') return `📎 ${this.fileName || 'Archivo'}`;

    if (this.message.length <= maxLength) return this.message;
    return this.message.substring(0, maxLength) + '...';
  }
}

export default ChatMessage;
