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
import { Job } from './Job.model.js';

/**
 * Contract Cancellation Request Model
 *
 * Handles requests to cancel contracts that require admin approval.
 * When a user requests cancellation:
 * - The request is created with reason
 * - The associated job is paused
 * - Admin reviews and approves/rejects
 */

export type CancellationRequestStatus = 'pending' | 'approved' | 'rejected';
export type CancellationRequestPriority = 'low' | 'medium' | 'high' | 'urgent';

@Table({
  tableName: 'contract_cancellation_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['contract_id'] },
    { fields: ['job_id'] },
    { fields: ['requested_by'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { fields: ['assigned_to'] },
    { fields: ['status', 'priority'] },
  ],
})
export class ContractCancellationRequest extends Model {
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
  contract?: Contract;

  @ForeignKey(() => Job)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  jobId!: string;

  @BelongsTo(() => Job)
  job?: Job;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  requestedBy!: string;

  @BelongsTo(() => User, 'requestedBy')
  requester?: User;

  // Who the request is against (the other party)
  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  otherPartyId!: string;

  @BelongsTo(() => User, 'otherPartyId')
  otherParty?: User;

  // ============================================
  // REQUEST DETAILS
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [10, 2000],
        msg: 'La razón debe tener entre 10 y 2000 caracteres',
      },
    },
  })
  reason!: string;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: CancellationRequestStatus;

  @Default('medium')
  @Index
  @Column(DataType.STRING(20))
  priority!: CancellationRequestPriority;

  // Type of cancellation request
  @AllowNull(false)
  @Column(DataType.STRING(50))
  requestType!: 'full_cancellation' | 'modification_request' | 'dispute_escalation';

  // Category for better routing
  @AllowNull(true)
  @Column(DataType.STRING(50))
  category?: 'non_compliance' | 'quality_issues' | 'communication' | 'payment' | 'scope_change' | 'other';

  // Evidence/attachments
  @Default([])
  @Column(DataType.JSONB)
  attachments!: string[];

  // ============================================
  // ADMIN HANDLING
  // ============================================

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  assignedTo?: string;

  @BelongsTo(() => User, 'assignedTo')
  assignedAdmin?: User;

  @Column(DataType.DATE)
  assignedAt?: Date;

  // Resolution
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  resolvedBy?: string;

  @BelongsTo(() => User, 'resolvedBy')
  resolver?: User;

  @Column(DataType.DATE)
  resolvedAt?: Date;

  @Column(DataType.TEXT)
  resolutionNote?: string;

  // Resolution outcome
  @Column(DataType.STRING(50))
  resolution?: 'approved' | 'rejected' | 'partial' | 'referred_to_dispute';

  // Refund handling
  @Default(false)
  @Column(DataType.BOOLEAN)
  refundApproved!: boolean;

  @Column(DataType.DECIMAL(12, 2))
  refundAmount?: number;

  // ============================================
  // WORKFLOW
  // ============================================

  // Previous job status (to restore if rejected)
  @Column(DataType.STRING(50))
  previousJobStatus?: string;

  // Previous contract status (to restore if rejected)
  @Column(DataType.STRING(50))
  previousContractStatus?: string;

  // Internal notes for admins
  @Default([])
  @Column(DataType.JSONB)
  adminNotes!: Array<{
    adminId: string;
    adminName: string;
    note: string;
    createdAt: Date;
  }>;

  // History of status changes
  @Default([])
  @Column(DataType.JSONB)
  statusHistory!: Array<{
    status: string;
    changedBy: string;
    changedAt: Date;
    note?: string;
  }>;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Approve the cancellation request
   */
  async approve(adminId: string, note: string, refundAmount?: number): Promise<void> {
    this.status = 'approved';
    this.resolution = 'approved';
    this.resolvedBy = adminId;
    this.resolvedAt = new Date();
    this.resolutionNote = note;

    if (refundAmount !== undefined) {
      this.refundApproved = true;
      this.refundAmount = refundAmount;
    }

    this.statusHistory = [
      ...this.statusHistory,
      {
        status: 'approved',
        changedBy: adminId,
        changedAt: new Date(),
        note,
      },
    ];

    await this.save();
  }

  /**
   * Reject the cancellation request
   */
  async reject(adminId: string, note: string): Promise<void> {
    this.status = 'rejected';
    this.resolution = 'rejected';
    this.resolvedBy = adminId;
    this.resolvedAt = new Date();
    this.resolutionNote = note;

    this.statusHistory = [
      ...this.statusHistory,
      {
        status: 'rejected',
        changedBy: adminId,
        changedAt: new Date(),
        note,
      },
    ];

    await this.save();
  }

  /**
   * Assign to admin
   */
  async assignToAdmin(adminId: string): Promise<void> {
    this.assignedTo = adminId;
    this.assignedAt = new Date();

    this.statusHistory = [
      ...this.statusHistory,
      {
        status: 'assigned',
        changedBy: adminId,
        changedAt: new Date(),
        note: 'Assigned to admin',
      },
    ];

    await this.save();
  }

  /**
   * Add admin note
   */
  async addNote(adminId: string, adminName: string, note: string): Promise<void> {
    this.adminNotes = [
      ...this.adminNotes,
      {
        adminId,
        adminName,
        note,
        createdAt: new Date(),
      },
    ];
    await this.save();
  }
}

export default ContractCancellationRequest;
