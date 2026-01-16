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
  Unique,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Job } from './Job.model.js';

/**
 * Proposal Model - PostgreSQL/Sequelize
 *
 * Modelo de propuestas de freelancers para trabajos
 * - Un freelancer solo puede enviar una propuesta por trabajo
 * - Soporte para contraofertas con precio diferente
 * - Estados: pending, approved, rejected, cancelled, withdrawn
 */

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';

@Table({
  tableName: 'proposals',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['job_id', 'freelancer_id'], unique: true }, // Un freelancer solo una propuesta por trabajo
    { fields: ['job_id', 'status'] },
    { fields: ['freelancer_id', 'status'] },
    { fields: ['client_id', 'status'] },
    { fields: ['status'] },
    { fields: ['is_counter_offer'] },
    { fields: ['is_direct_proposal'] }, // Para propuestas directas sin job
  ],
})
export class Proposal extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Job)
  @AllowNull(true) // Nullable for direct proposals without existing job
  @Index
  @Column(DataType.UUID)
  jobId?: string;

  @BelongsTo(() => Job)
  job?: Job;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  freelancerId!: string; // El doer que aplica

  @BelongsTo(() => User, 'freelancerId')
  freelancer!: User;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  clientId!: string; // El cliente dueño del trabajo

  @BelongsTo(() => User, 'clientId')
  client!: User;

  // ============================================
  // PROPOSAL DETAILS
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 1000],
        msg: 'La carta de presentación debe tener entre 1 y 1000 caracteres',
      },
    },
  })
  coverLetter!: string;

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  proposedPrice!: number;

  @AllowNull(false)
  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
    },
  })
  estimatedDuration!: number; // en días

  // ============================================
  // STATUS
  // ============================================

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: ProposalStatus;

  // ============================================
  // COUNTER OFFER
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isCounterOffer!: boolean;

  @Column(DataType.DECIMAL(12, 2))
  originalJobPrice?: number;

  // ============================================
  // DIRECT PROPOSAL (without existing job)
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isDirectProposal!: boolean;

  // For direct proposals: who proposed to whom
  // freelancerId = recipient (the worker being offered the contract)
  // clientId = sender (the client proposing the contract)
  @Column(DataType.UUID)
  conversationId?: string; // Chat where proposal was sent

  // Direct proposal details (when no job exists)
  @Column(DataType.STRING(200))
  directTitle?: string;

  @Column(DataType.TEXT)
  directDescription?: string;

  @Column(DataType.STRING(100))
  directLocation?: string;

  @Column(DataType.STRING(50))
  directCategory?: string;

  @Column(DataType.DATE)
  directStartDate?: Date;

  @Column(DataType.DATE)
  directEndDate?: Date;

  // ============================================
  // REJECTION/CANCELLATION REASONS
  // ============================================

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  rejectionReason?: string;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  cancellationReason?: string;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  withdrawnReason?: string;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if proposal is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if proposal is approved
   */
  isApproved(): boolean {
    return this.status === 'approved';
  }

  /**
   * Check if proposal is rejected
   */
  isRejected(): boolean {
    return this.status === 'rejected';
  }

  /**
   * Approve proposal
   */
  async approve(): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending proposals can be approved');
    }
    this.status = 'approved';
    await this.save();
  }

  /**
   * Reject proposal
   */
  async reject(reason?: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending proposals can be rejected');
    }
    this.status = 'rejected';
    this.rejectionReason = reason;
    await this.save();
  }

  /**
   * Withdraw proposal
   */
  async withdraw(reason?: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending proposals can be withdrawn');
    }
    this.status = 'withdrawn';
    this.withdrawnReason = reason;
    await this.save();
  }

  /**
   * Check if price differs from original job price
   */
  isDifferentPrice(): boolean {
    if (!this.originalJobPrice) return false;
    return Math.abs(this.proposedPrice - this.originalJobPrice) > 0.01;
  }
}

export default Proposal;
