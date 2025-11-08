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
  BeforeCreate,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Contract } from './Contract.model.js';

/**
 * Ticket Model - PostgreSQL/Sequelize
 *
 * Sistema completo de tickets de soporte con:
 * - Auto-generación de número de ticket
 * - Sistema de mensajería interno
 * - Mensajes internos (solo staff)
 * - Adjuntos
 * - Asignación a staff
 * - Múltiples categorías y prioridades
 */

// ============================================
// TYPES
// ============================================

export type TicketCategory =
  | 'bug'
  | 'feature'
  | 'support'
  | 'report_user'
  | 'report_contract'
  | 'dispute'
  | 'payment'
  | 'other';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TicketStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed';

export interface ITicketMessage {
  author: string; // User UUID
  message: string;
  attachments?: string[];
  createdAt: Date;
  isInternal: boolean; // Solo visible para staff
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'tickets',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['ticket_number'], unique: true },
    { fields: ['created_by', 'status'] },
    { fields: ['assigned_to', 'status'] },
    { fields: ['category', 'status'] },
    { fields: ['priority', 'created_at'] },
    { fields: ['status', 'created_at'] },
  ],
})
export class Ticket extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // TICKET NUMBER
  // ============================================

  @AllowNull(false)
  @Index({ unique: true })
  @Column(DataType.STRING(20))
  ticketNumber!: string;

  // ============================================
  // BASIC INFO
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: {
        args: [1, 200],
        msg: 'El asunto no puede exceder 200 caracteres',
      },
    },
  })
  subject!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(30))
  category!: TicketCategory;

  @Default('medium')
  @Index
  @Column(DataType.STRING(20))
  priority!: TicketPriority;

  @Default('open')
  @Index
  @Column(DataType.STRING(20))
  status!: TicketStatus;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  createdBy!: string;

  @BelongsTo(() => User, 'createdBy')
  creator!: User;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  assignedTo?: string;

  @BelongsTo(() => User, 'assignedTo')
  assignee?: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  relatedUser?: string;

  @BelongsTo(() => User, 'relatedUser')
  related?: User;

  @ForeignKey(() => Contract)
  @Column(DataType.UUID)
  relatedContract?: string;

  @BelongsTo(() => Contract)
  contract?: Contract;

  // ============================================
  // MESSAGES
  // ============================================

  @Default([])
  @Column(DataType.JSONB)
  messages!: ITicketMessage[];

  // ============================================
  // METADATA
  // ============================================

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  tags!: string[];

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 1000],
    },
  })
  resolution?: string;

  @Column(DataType.DATE)
  closedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  closedBy?: string;

  @BelongsTo(() => User, 'closedBy')
  closer?: User;

  // ============================================
  // HOOKS
  // ============================================

  @BeforeCreate
  static async generateTicketNumber(instance: Ticket) {
    if (!instance.ticketNumber) {
      // Count existing tickets to generate sequential number
      const count = await Ticket.count();
      instance.ticketNumber = `TK-${String(count + 1).padStart(6, '0')}`;
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if ticket is open (not resolved/closed)
   */
  isOpen(): boolean {
    return this.status !== 'resolved' && this.status !== 'closed';
  }

  /**
   * Check if ticket is assigned
   */
  isAssigned(): boolean {
    return !!this.assignedTo;
  }

  /**
   * Check if ticket is closed
   */
  isClosed(): boolean {
    return this.status === 'closed';
  }

  /**
   * Check if ticket is resolved
   */
  isResolved(): boolean {
    return this.status === 'resolved';
  }

  /**
   * Assign ticket to staff
   */
  async assignTo(userId: string): Promise<void> {
    this.assignedTo = userId;
    if (this.status === 'open') {
      this.status = 'assigned';
    }

    this.addSystemMessage(`Ticket asignado a staff`, true);
    await this.save();
  }

  /**
   * Add message to ticket
   */
  addMessage(
    authorId: string,
    message: string,
    isInternal: boolean = false,
    attachments?: string[]
  ): void {
    this.messages.push({
      author: authorId,
      message,
      attachments,
      createdAt: new Date(),
      isInternal,
    });
  }

  /**
   * Add system message (internal)
   */
  addSystemMessage(message: string, isInternal: boolean = true): void {
    this.messages.push({
      author: 'system',
      message,
      createdAt: new Date(),
      isInternal,
    });
  }

  /**
   * Update status
   */
  async updateStatus(status: TicketStatus, userId?: string): Promise<void> {
    const oldStatus = this.status;
    this.status = status;

    this.addSystemMessage(`Estado cambiado de ${oldStatus} a ${status}`, true);
    await this.save();
  }

  /**
   * Update priority
   */
  async updatePriority(priority: TicketPriority, userId: string): Promise<void> {
    const oldPriority = this.priority;
    this.priority = priority;

    this.addSystemMessage(
      `Prioridad cambiada de ${oldPriority} a ${priority}`,
      true
    );
    await this.save();
  }

  /**
   * Resolve ticket
   */
  async resolve(resolutionText: string, userId: string): Promise<void> {
    if (!this.isOpen()) {
      throw new Error('Solo se pueden resolver tickets abiertos');
    }

    this.status = 'resolved';
    this.resolution = resolutionText;

    this.addSystemMessage('Ticket resuelto', true);
    await this.save();
  }

  /**
   * Close ticket
   */
  async close(userId: string): Promise<void> {
    this.status = 'closed';
    this.closedAt = new Date();
    this.closedBy = userId;

    this.addSystemMessage('Ticket cerrado', true);
    await this.save();
  }

  /**
   * Reopen ticket
   */
  async reopen(userId: string): Promise<void> {
    if (!this.isClosed()) {
      throw new Error('Solo se pueden reabrir tickets cerrados');
    }

    this.status = 'open';
    this.closedAt = undefined;
    this.closedBy = undefined;

    this.addSystemMessage('Ticket reabierto', true);
    await this.save();
  }

  /**
   * Add tag
   */
  async addTag(tag: string): Promise<void> {
    const normalizedTag = tag.trim().toLowerCase();
    if (!this.tags.includes(normalizedTag)) {
      this.tags.push(normalizedTag);
      await this.save();
    }
  }

  /**
   * Remove tag
   */
  async removeTag(tag: string): Promise<void> {
    const normalizedTag = tag.trim().toLowerCase();
    this.tags = this.tags.filter((t) => t !== normalizedTag);
    await this.save();
  }

  /**
   * Get total messages count
   */
  getTotalMessagesCount(): number {
    return this.messages.length;
  }

  /**
   * Get public messages (exclude internal)
   */
  getPublicMessages(): ITicketMessage[] {
    return this.messages.filter((msg) => !msg.isInternal);
  }

  /**
   * Get internal messages (staff only)
   */
  getInternalMessages(): ITicketMessage[] {
    return this.messages.filter((msg) => msg.isInternal);
  }

  /**
   * Get last message
   */
  getLastMessage(): ITicketMessage | null {
    return this.messages.length > 0
      ? this.messages[this.messages.length - 1]
      : null;
  }

  /**
   * Get ticket age in days
   */
  getAgeInDays(): number {
    const createdAt = this.createdAt as Date;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if ticket is overdue (>3 days without resolution)
   */
  isOverdue(): boolean {
    if (!this.isOpen()) return false;
    return this.getAgeInDays() > 3;
  }

  /**
   * Get time to resolution (if resolved)
   */
  getTimeToResolution(): number | null {
    if (!this.isResolved() && !this.isClosed()) return null;

    const createdAt = this.createdAt as Date;
    const resolvedAt = this.closedAt || new Date();
    const diffTime = Math.abs(resolvedAt.getTime() - createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60)); // Hours
  }

  /**
   * Check if requires urgent attention
   */
  requiresUrgentAttention(): boolean {
    return this.priority === 'urgent' || this.isOverdue();
  }
}

export default Ticket;
