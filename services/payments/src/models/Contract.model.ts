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

export type ContractStatus =
  | 'pending'
  | 'active'
  | 'in_progress'
  | 'pending_confirmation'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export type PaymentStatus =
  | 'pending'
  | 'held_escrow'
  | 'released'
  | 'refunded'
  | 'partial_refund';

@Table({
  tableName: 'contracts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['client_id'] },
    { fields: ['doer_id'] },
    { fields: ['job_id'] },
    { fields: ['status'] },
    { fields: ['payment_status'] },
    { fields: ['created_at'] },
  ],
})
export class Contract extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  jobId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  clientId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  doerId!: string;

  @Column(DataType.UUID)
  proposalId?: string;

  // Pricing
  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  amount!: number;

  @Column(DataType.DECIMAL(12, 2))
  originalAmount?: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  commissionAmount!: number;

  @Default(8)
  @Column(DataType.DECIMAL(5, 2))
  commissionRate!: number;

  @Column(DataType.DECIMAL(12, 2))
  doerAmount?: number;

  // Status
  @Default('pending')
  @Index
  @Column(DataType.STRING(30))
  status!: ContractStatus;

  @Default('pending')
  @Index
  @Column(DataType.STRING(30))
  paymentStatus!: PaymentStatus;

  // Confirmation
  @Default(false)
  @Column(DataType.BOOLEAN)
  clientConfirmed!: boolean;

  @Column(DataType.DATE)
  clientConfirmedAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  doerConfirmed!: boolean;

  @Column(DataType.DATE)
  doerConfirmedAt?: Date;

  // Dates
  @AllowNull(false)
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  endDate!: Date;

  @Column(DataType.DATE)
  completedAt?: Date;

  @Column(DataType.DATE)
  cancelledAt?: Date;

  // Extension
  @Default(false)
  @Column(DataType.BOOLEAN)
  hasExtension!: boolean;

  @Column(DataType.DATE)
  extensionEndDate?: Date;

  @Column(DataType.DECIMAL(12, 2))
  extensionAmount?: number;

  @Column(DataType.STRING(20))
  extensionStatus?: 'pending' | 'approved' | 'rejected';

  // Payment
  @Column(DataType.UUID)
  paymentId?: string;

  @Column(DataType.STRING(100))
  mercadopagoPaymentId?: string;

  // Terms
  @Column(DataType.TEXT)
  terms?: string;

  @Column(DataType.TEXT)
  notes?: string;

  // Cancellation
  @Column(DataType.TEXT)
  cancellationReason?: string;

  @Column(DataType.UUID)
  cancelledBy?: string;

  // Dispute
  @Column(DataType.UUID)
  disputeId?: string;

  // Methods
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isPendingConfirmation(): boolean {
    return this.status === 'pending_confirmation';
  }

  isDisputed(): boolean {
    return this.status === 'disputed';
  }

  canBeCompleted(): boolean {
    return this.clientConfirmed && this.doerConfirmed && this.status === 'pending_confirmation';
  }

  async confirmByClient(): Promise<void> {
    this.clientConfirmed = true;
    this.clientConfirmedAt = new Date();
    if (this.doerConfirmed) {
      this.status = 'completed';
      this.completedAt = new Date();
      this.paymentStatus = 'released';
    } else {
      this.status = 'pending_confirmation';
    }
    await this.save();
  }

  async confirmByDoer(): Promise<void> {
    this.doerConfirmed = true;
    this.doerConfirmedAt = new Date();
    if (this.clientConfirmed) {
      this.status = 'completed';
      this.completedAt = new Date();
      this.paymentStatus = 'released';
    } else {
      this.status = 'pending_confirmation';
    }
    await this.save();
  }

  async cancel(userId: string, reason: string): Promise<void> {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.cancelledBy = userId;
    this.cancellationReason = reason;
    await this.save();
  }

  async markAsDisputed(disputeId: string): Promise<void> {
    this.status = 'disputed';
    this.disputeId = disputeId;
    await this.save();
  }
}

export default Contract;
