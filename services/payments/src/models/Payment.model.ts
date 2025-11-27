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

export type PaymentType =
  | 'contract'
  | 'publication'
  | 'membership'
  | 'tip'
  | 'refund';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'refunded'
  | 'cancelled';

@Table({
  tableName: 'payments',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['mercadopago_payment_id'] },
    { fields: ['contract_id'] },
    { fields: ['created_at'] },
  ],
})
export class Payment extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  type!: PaymentType;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  amount!: number;

  @Default('ARS')
  @Column(DataType.STRING(3))
  currency!: string;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: PaymentStatus;

  // MercadoPago
  @Index
  @Column(DataType.STRING(100))
  mercadopagoPaymentId?: string;

  @Column(DataType.STRING(100))
  mercadopagoPreferenceId?: string;

  @Column(DataType.STRING(50))
  mercadopagoStatus?: string;

  @Column(DataType.TEXT)
  mercadopagoResponse?: string;

  // References
  @Index
  @Column(DataType.UUID)
  contractId?: string;

  @Column(DataType.UUID)
  jobId?: string;

  @Column(DataType.UUID)
  membershipId?: string;

  // Description
  @Column(DataType.STRING(255))
  description?: string;

  // Metadata
  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  // Dates
  @Column(DataType.DATE)
  paidAt?: Date;

  @Column(DataType.DATE)
  refundedAt?: Date;

  // Methods
  isPending(): boolean {
    return this.status === 'pending';
  }

  isApproved(): boolean {
    return this.status === 'approved';
  }

  async markAsApproved(mpPaymentId: string, mpResponse?: string): Promise<void> {
    this.status = 'approved';
    this.mercadopagoPaymentId = mpPaymentId;
    this.paidAt = new Date();
    if (mpResponse) {
      this.mercadopagoResponse = mpResponse;
    }
    await this.save();
  }

  async markAsRejected(reason?: string): Promise<void> {
    this.status = 'rejected';
    if (reason) {
      this.metadata = { ...this.metadata, rejectionReason: reason };
    }
    await this.save();
  }

  async refund(amount?: number): Promise<void> {
    this.status = 'refunded';
    this.refundedAt = new Date();
    if (amount) {
      this.metadata = { ...this.metadata, refundAmount: amount };
    }
    await this.save();
  }
}

export default Payment;
