import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  Default,
  AllowNull,
  Index,
  BeforeValidate,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Contract } from './Contract.model.js';
import { Job } from './Job.model.js';
import { ChatMessage } from './ChatMessage.model.js';

/**
 * Conversation Model - PostgreSQL/Sequelize
 *
 * Sistema de conversaciones entre usuarios con soporte para:
 * - Chat directo entre usuarios
 * - Chat relacionado a contratos
 * - Chat de soporte
 * - Conteo de mensajes no leídos por participante
 * - Archivo de conversaciones
 */

export type ConversationType = 'contract' | 'direct' | 'support';

@Table({
  tableName: 'conversations',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['participants'] },
    { fields: ['contract_id'], unique: true },
    { fields: ['job_id'] },
    { fields: ['type'] },
    { fields: ['last_message_at'] },
  ],
})
export class Conversation extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // PARTICIPANTS (JSONB Array of UUIDs)
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.ARRAY(DataType.UUID))
  participants!: string[];

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Contract)
  @Index({ unique: true })
  @Column(DataType.UUID)
  contractId?: string;

  @BelongsTo(() => Contract)
  contract?: Contract;

  @ForeignKey(() => Job)
  @Index
  @Column(DataType.UUID)
  jobId?: string;

  @BelongsTo(() => Job)
  job?: Job;

  // ============================================
  // TYPE & STATUS
  // ============================================

  @Default('direct')
  @Index
  @Column(DataType.STRING(20))
  type!: ConversationType;

  @Column({
    type: DataType.STRING(200),
    validate: {
      len: [0, 200],
    },
  })
  lastMessage?: string;

  @Index
  @Column(DataType.DATE)
  lastMessageAt?: Date;

  // ============================================
  // UNREAD COUNT (JSONB Object: userId -> count)
  // ============================================

  @Default({})
  @Column(DataType.JSONB)
  unreadCount!: Record<string, number>;

  // ============================================
  // ARCHIVE
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  archived!: boolean;

  @Default([])
  @Column(DataType.ARRAY(DataType.UUID))
  archivedBy!: string[];

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @HasMany(() => ChatMessage, 'conversationId')
  messages!: ChatMessage[];

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if user is participant
   */
  isParticipant(userId: string): boolean {
    return this.participants.includes(userId);
  }

  /**
   * Get unread count for specific user
   */
  getUnreadCount(userId: string): number {
    return this.unreadCount[userId] || 0;
  }

  /**
   * Increment unread count for user
   */
  async incrementUnread(userId: string): Promise<void> {
    if (!this.unreadCount) this.unreadCount = {};
    this.unreadCount[userId] = (this.unreadCount[userId] || 0) + 1;
    await this.save();
  }

  /**
   * Reset unread count for user
   */
  async resetUnread(userId: string): Promise<void> {
    if (!this.unreadCount) this.unreadCount = {};
    this.unreadCount[userId] = 0;
    await this.save();
  }

  /**
   * Update last message info
   */
  async updateLastMessage(message: string, timestamp: Date): Promise<void> {
    this.lastMessage = message.substring(0, 200);
    this.lastMessageAt = timestamp;
    await this.save();
  }

  /**
   * Archive conversation for user
   */
  async archiveFor(userId: string): Promise<void> {
    if (!this.archivedBy.includes(userId)) {
      this.archivedBy.push(userId);
      await this.save();
    }
  }

  /**
   * Unarchive conversation for user
   */
  async unarchiveFor(userId: string): Promise<void> {
    this.archivedBy = this.archivedBy.filter(id => id !== userId);
    await this.save();
  }

  /**
   * Check if archived for user
   */
  isArchivedFor(userId: string): boolean {
    return this.archivedBy.includes(userId);
  }

  /**
   * Get other participant (for 2-person conversations)
   */
  getOtherParticipant(userId: string): string | null {
    if (this.participants.length !== 2) return null;
    return this.participants.find(p => p !== userId) || null;
  }

  // ============================================
  // HOOKS
  // ============================================

  /**
   * Validate at least 2 participants
   */
  @BeforeValidate
  static validateParticipants(instance: Conversation) {
    if (!instance.participants || instance.participants.length < 2) {
      throw new Error('Conversation must have at least 2 participants');
    }
  }
}

export default Conversation;
