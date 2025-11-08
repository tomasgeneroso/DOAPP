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
  BeforeValidate,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Contract } from './Contract.model.js';
import { Ticket } from './Ticket.model.js';

/**
 * ContractChangeRequest Model - PostgreSQL/Sequelize
 *
 * Sistema de solicitudes de cambio en contratos con:
 * - Cancelación de contratos
 * - Modificación de términos (precio, fechas, descripción)
 * - Escalamiento a soporte
 * - Expiración automática (2 días sin respuesta)
 */

// ============================================
// TYPES
// ============================================

export type ChangeRequestType = 'cancel' | 'modify';

export type ChangeRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'escalated_to_support';

export interface INewTerms {
  price?: number;
  startDate?: Date;
  endDate?: Date;
  description?: string;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'contract_change_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['contract_id', 'status'] },
    { fields: ['status'] },
    { fields: ['requested_by'] },
    { fields: ['created_at'] },
  ],
})
export class ContractChangeRequest extends Model {
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

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  requestedBy!: string;

  @BelongsTo(() => User, 'requestedBy')
  requester!: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  respondedBy?: string;

  @BelongsTo(() => User, 'respondedBy')
  responder?: User;

  @ForeignKey(() => Ticket)
  @Column(DataType.UUID)
  supportTicketId?: string;

  @BelongsTo(() => Ticket)
  supportTicket?: Ticket;

  // ============================================
  // BASIC INFO
  // ============================================

  @AllowNull(false)
  @Column(DataType.STRING(20))
  type!: ChangeRequestType;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 1000],
        msg: 'La razón no puede exceder 1000 caracteres',
      },
    },
  })
  reason!: string;

  @Default('pending')
  @Index
  @Column(DataType.STRING(30))
  status!: ChangeRequestStatus;

  // ============================================
  // NEW TERMS (for modify type)
  // ============================================

  @Column(DataType.JSONB)
  newTerms?: INewTerms;

  // ============================================
  // RESPONSE TRACKING
  // ============================================

  @Column(DataType.DATE)
  respondedAt?: Date;

  @Column(DataType.DATE)
  escalatedAt?: Date;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateRequest(instance: ContractChangeRequest) {
    // Trim reason
    if (instance.reason) {
      instance.reason = instance.reason.trim();
    }

    // Validate newTerms for modify type
    if (instance.type === 'modify') {
      if (!instance.newTerms || Object.keys(instance.newTerms).length === 0) {
        throw new Error(
          'New terms are required for modify type change requests'
        );
      }

      // Validate price if provided
      if (instance.newTerms.price !== undefined && instance.newTerms.price < 0) {
        throw new Error('Price cannot be negative');
      }

      // Validate dates if provided
      if (
        instance.newTerms.startDate &&
        instance.newTerms.endDate &&
        instance.newTerms.startDate >= instance.newTerms.endDate
      ) {
        throw new Error('Start date must be before end date');
      }

      // Trim description if provided
      if (instance.newTerms.description) {
        instance.newTerms.description = instance.newTerms.description.trim();
        if (instance.newTerms.description.length > 500) {
          throw new Error('Description cannot exceed 500 characters');
        }
      }
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if request is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if request has been responded to
   */
  isResponded(): boolean {
    return this.status === 'accepted' || this.status === 'rejected';
  }

  /**
   * Check if request is escalated
   */
  isEscalated(): boolean {
    return this.status === 'escalated_to_support';
  }

  /**
   * Check if request has expired (>2 days without response)
   */
  isExpired(): boolean {
    if (!this.isPending()) return false;

    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    const createdTime = (this.createdAt as Date).getTime();

    return now - createdTime > twoDaysInMs;
  }

  /**
   * Accept change request
   */
  async accept(userId: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending requests can be accepted');
    }

    this.status = 'accepted';
    this.respondedBy = userId;
    this.respondedAt = new Date();

    await this.save();
  }

  /**
   * Reject change request
   */
  async reject(userId: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending requests can be rejected');
    }

    this.status = 'rejected';
    this.respondedBy = userId;
    this.respondedAt = new Date();

    await this.save();
  }

  /**
   * Escalate to support
   */
  async escalateToSupport(ticketId: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending requests can be escalated');
    }

    this.status = 'escalated_to_support';
    this.supportTicketId = ticketId;
    this.escalatedAt = new Date();

    await this.save();
  }

  /**
   * Check if this is a cancellation request
   */
  isCancellation(): boolean {
    return this.type === 'cancel';
  }

  /**
   * Check if this is a modification request
   */
  isModification(): boolean {
    return this.type === 'modify';
  }

  /**
   * Get time since creation in hours
   */
  getAgeInHours(): number {
    const now = new Date().getTime();
    const createdTime = (this.createdAt as Date).getTime();
    return Math.floor((now - createdTime) / (1000 * 60 * 60));
  }

  /**
   * Get time since creation in days
   */
  getAgeInDays(): number {
    return Math.floor(this.getAgeInHours() / 24);
  }

  /**
   * Get proposed price change (if any)
   */
  getProposedPriceChange(): number | null {
    if (!this.isModification() || !this.newTerms?.price) {
      return null;
    }
    return this.newTerms.price;
  }

  /**
   * Get proposed date change (if any)
   */
  getProposedDateChange(): { startDate?: Date; endDate?: Date } | null {
    if (!this.isModification()) {
      return null;
    }

    if (!this.newTerms?.startDate && !this.newTerms?.endDate) {
      return null;
    }

    return {
      startDate: this.newTerms.startDate,
      endDate: this.newTerms.endDate,
    };
  }

  /**
   * Check if request requires urgent attention
   */
  requiresUrgentAttention(): boolean {
    return this.isPending() && this.isExpired();
  }

  /**
   * Get summary of changes
   */
  getChangesSummary(): string {
    if (this.isCancellation()) {
      return 'Solicitud de cancelación de contrato';
    }

    if (!this.newTerms) {
      return 'Solicitud de modificación sin detalles';
    }

    const changes: string[] = [];

    if (this.newTerms.price !== undefined) {
      changes.push(`Precio: $${this.newTerms.price}`);
    }

    if (this.newTerms.startDate) {
      changes.push(`Fecha inicio: ${this.newTerms.startDate.toLocaleDateString()}`);
    }

    if (this.newTerms.endDate) {
      changes.push(`Fecha fin: ${this.newTerms.endDate.toLocaleDateString()}`);
    }

    if (this.newTerms.description) {
      changes.push('Descripción modificada');
    }

    return changes.length > 0
      ? `Modificación: ${changes.join(', ')}`
      : 'Solicitud de modificación';
  }
}

export default ContractChangeRequest;
