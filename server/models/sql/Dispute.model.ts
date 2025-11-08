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
import { Contract } from './Contract.model.js';
import { Payment } from './Payment.model.js';

/**
 * Dispute Model - PostgreSQL/Sequelize
 *
 * Sistema completo de resolución de disputas con:
 * - Adjuntos multimedia (imágenes, videos, PDFs)
 * - Sistema de mensajería interno
 * - Asignación a admins/support
 * - Múltiples tipos de resolución (full_release, full_refund, partial_refund)
 * - Audit log completo
 * - Priorización y categorización
 */

// ============================================
// TYPES
// ============================================

export type DisputeStatus =
  | 'open'
  | 'in_review'
  | 'awaiting_info'
  | 'resolved_released'
  | 'resolved_refunded'
  | 'resolved_partial'
  | 'cancelled';

export type DisputePriority = 'low' | 'medium' | 'high' | 'urgent';

export type DisputeCategory =
  | 'service_not_delivered'
  | 'incomplete_work'
  | 'quality_issues'
  | 'payment_issues'
  | 'breach_of_contract'
  | 'other';

export type ResolutionType =
  | 'full_release'
  | 'full_refund'
  | 'partial_refund'
  | 'no_action';

export type ImportanceLevel = 'low' | 'medium' | 'high' | 'critical';

export interface IAttachment {
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'pdf' | 'other';
  fileSize: number;
  uploadedAt: Date;
}

export interface IDisputeMessage {
  from: string; // User UUID
  message: string;
  attachments?: IAttachment[];
  createdAt: Date;
}

export interface IAuditLog {
  action: string;
  performedBy: string; // User UUID
  timestamp: Date;
  details?: string;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'disputes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['contract_id'] },
    { fields: ['payment_id'] },
    { fields: ['initiated_by', 'status'] },
    { fields: ['against', 'status'] },
    { fields: ['assigned_to', 'status'] },
    { fields: ['status', 'created_at'] },
    { fields: ['priority', 'status'] },
    { fields: ['category'] },
  ],
})
export class Dispute extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Contract)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  contractId!: string;

  @BelongsTo(() => Contract)
  contract!: Contract;

  @ForeignKey(() => Payment)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  paymentId!: string;

  @BelongsTo(() => Payment)
  payment!: Payment;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  initiatedBy!: string; // Cliente o doer que inició la disputa

  @BelongsTo(() => User, 'initiatedBy')
  initiator!: User;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  against!: string; // La otra parte

  @BelongsTo(() => User, 'against')
  defendant!: User;

  // ============================================
  // BASIC INFO
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: {
        args: [1, 200],
        msg: 'La razón no puede exceder 200 caracteres',
      },
    },
  })
  reason!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 2000],
        msg: 'La descripción no puede exceder 2000 caracteres',
      },
    },
  })
  detailedDescription!: string;

  @Default([])
  @Column(DataType.JSONB)
  evidence!: IAttachment[]; // Pruebas iniciales (fotos, videos, PDFs)

  // ============================================
  // STATUS & CATEGORIZATION
  // ============================================

  @Default('open')
  @Index
  @Column(DataType.STRING(30))
  status!: DisputeStatus;

  @Default('medium')
  @Index
  @Column(DataType.STRING(20))
  priority!: DisputePriority;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(30))
  category!: DisputeCategory;

  // ============================================
  // ASSIGNMENT TRACKING
  // ============================================

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  assignedTo?: string; // Admin o support que maneja el caso

  @BelongsTo(() => User, 'assignedTo')
  assignee?: User;

  @Column(DataType.DATE)
  assignedAt?: Date;

  // ============================================
  // RESOLUTION
  // ============================================

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 2000],
    },
  })
  resolution?: string;

  @Column(DataType.DATE)
  resolvedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  resolvedBy?: string; // Admin que resolvió

  @BelongsTo(() => User, 'resolvedBy')
  resolver?: User;

  @Column(DataType.STRING(30))
  resolutionType?: ResolutionType;

  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  refundAmount?: number; // Si es refund parcial

  @Default(false)
  @Column(DataType.BOOLEAN)
  platformFeeRefunded!: boolean; // Si se devolvió la comisión de la plataforma (NO por defecto)

  // ============================================
  // COMMUNICATION
  // ============================================

  @Default([])
  @Column(DataType.JSONB)
  messages!: IDisputeMessage[];

  // ============================================
  // EMAIL TRACKING
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  emailSentToSupport!: boolean;

  @Column(DataType.DATE)
  emailSentAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  emailSentToParties!: boolean;

  // ============================================
  // AUDIT
  // ============================================

  @Default('medium')
  @Column(DataType.STRING(20))
  importanceLevel!: ImportanceLevel;

  @Default([])
  @Column(DataType.JSONB)
  logs!: IAuditLog[];

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if dispute is open (not resolved)
   */
  isOpen(): boolean {
    return this.status === 'open' || this.status === 'in_review' || this.status === 'awaiting_info';
  }

  /**
   * Check if dispute is resolved
   */
  isResolved(): boolean {
    return this.status.startsWith('resolved_') || this.status === 'cancelled';
  }

  /**
   * Check if dispute is assigned
   */
  isAssigned(): boolean {
    return !!this.assignedTo;
  }

  /**
   * Assign dispute to admin/support
   */
  async assignTo(userId: string): Promise<void> {
    this.assignedTo = userId;
    this.assignedAt = new Date();

    this.addLog('dispute_assigned', userId, `Disputa asignada`);
    await this.save();
  }

  /**
   * Add message to dispute
   */
  addMessage(from: string, message: string, attachments?: IAttachment[]): void {
    this.messages.push({
      from,
      message,
      attachments,
      createdAt: new Date(),
    });
  }

  /**
   * Add evidence (attachment)
   */
  addEvidence(attachment: IAttachment): void {
    this.evidence.push(attachment);
  }

  /**
   * Add log entry
   */
  addLog(action: string, performedBy: string, details?: string): void {
    this.logs.push({
      action,
      performedBy,
      timestamp: new Date(),
      details,
    });
  }

  /**
   * Resolve dispute with full release to doer
   */
  async resolveWithFullRelease(adminId: string, resolutionText: string): Promise<void> {
    if (this.isResolved()) {
      throw new Error('Dispute is already resolved');
    }

    this.status = 'resolved_released';
    this.resolution = resolutionText;
    this.resolvedAt = new Date();
    this.resolvedBy = adminId;
    this.resolutionType = 'full_release';

    this.addLog('dispute_resolved_release', adminId, 'Fondos liberados completamente al doer');
    await this.save();
  }

  /**
   * Resolve dispute with full refund to client
   */
  async resolveWithFullRefund(adminId: string, resolutionText: string): Promise<void> {
    if (this.isResolved()) {
      throw new Error('Dispute is already resolved');
    }

    this.status = 'resolved_refunded';
    this.resolution = resolutionText;
    this.resolvedAt = new Date();
    this.resolvedBy = adminId;
    this.resolutionType = 'full_refund';

    this.addLog('dispute_resolved_refund', adminId, 'Fondos reembolsados completamente al cliente');
    await this.save();
  }

  /**
   * Resolve dispute with partial refund
   */
  async resolveWithPartialRefund(
    adminId: string,
    resolutionText: string,
    refundAmount: number
  ): Promise<void> {
    if (this.isResolved()) {
      throw new Error('Dispute is already resolved');
    }

    this.status = 'resolved_partial';
    this.resolution = resolutionText;
    this.resolvedAt = new Date();
    this.resolvedBy = adminId;
    this.resolutionType = 'partial_refund';
    this.refundAmount = refundAmount;

    this.addLog(
      'dispute_resolved_partial',
      adminId,
      `Reembolso parcial de $${refundAmount}`
    );
    await this.save();
  }

  /**
   * Cancel dispute (no action taken)
   */
  async cancel(adminId: string, reason: string): Promise<void> {
    if (this.isResolved()) {
      throw new Error('Dispute is already resolved');
    }

    this.status = 'cancelled';
    this.resolution = reason;
    this.resolvedAt = new Date();
    this.resolvedBy = adminId;
    this.resolutionType = 'no_action';

    this.addLog('dispute_cancelled', adminId, reason);
    await this.save();
  }

  /**
   * Update priority
   */
  async updatePriority(priority: DisputePriority, userId: string): Promise<void> {
    const oldPriority = this.priority;
    this.priority = priority;

    this.addLog(
      'priority_updated',
      userId,
      `Prioridad cambiada de ${oldPriority} a ${priority}`
    );
    await this.save();
  }

  /**
   * Update status
   */
  async updateStatus(status: DisputeStatus, userId: string): Promise<void> {
    const oldStatus = this.status;
    this.status = status;

    this.addLog(
      'status_updated',
      userId,
      `Estado cambiado de ${oldStatus} a ${status}`
    );
    await this.save();
  }

  /**
   * Get total evidence count
   */
  getTotalEvidenceCount(): number {
    return this.evidence.length;
  }

  /**
   * Get total messages count
   */
  getTotalMessagesCount(): number {
    return this.messages.length;
  }

  /**
   * Get dispute age in days
   */
  getAgeInDays(): number {
    const createdAt = this.createdAt as Date;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - createdAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if dispute is overdue (>7 days without resolution)
   */
  isOverdue(): boolean {
    if (this.isResolved()) return false;
    return this.getAgeInDays() > 7;
  }

  /**
   * Check if requires urgent attention
   */
  requiresUrgentAttention(): boolean {
    return (
      this.priority === 'urgent' ||
      this.importanceLevel === 'critical' ||
      this.isOverdue()
    );
  }
}

export default Dispute;
