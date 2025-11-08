import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Contract } from './Contract.model.js';

/**
 * Payment Model - PostgreSQL/Sequelize
 *
 * Modelo de pagos con soporte completo para:
 * - MercadoPago (principal para Argentina)
 * - PayPal (legacy, solo usuarios antiguos)
 * - Sistema de escrow (retención de fondos)
 * - Confirmación bilateral
 * - Disputas
 * - Reembolsos
 * - Pagos de membresía y publicación de trabajos
 */

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'held_escrow'
  | 'awaiting_confirmation'
  | 'disputed'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type PaymentType =
  | 'contract_payment'
  | 'escrow_deposit'
  | 'escrow_release'
  | 'refund'
  | 'membership'
  | 'job_publication'
  | 'contract';

export type PaymentMethod = 'paypal' | 'mercadopago';

@Table({
  tableName: 'payments',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['status', 'created_at'] },
    { fields: ['payer_id'] },
    { fields: ['recipient_id'] },
    { fields: ['contract_id'] },
    { fields: ['payment_type'] },
    { fields: ['payment_method'] },
    { fields: ['mercadopago_payment_id'], unique: true },
    { fields: ['paypal_order_id'], unique: true },
  ],
})
export class Payment extends Model {
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
  @Index
  @Column(DataType.UUID)
  contractId?: string; // Opcional para membresías y publicaciones

  @BelongsTo(() => Contract)
  contract?: Contract;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  payerId!: string;

  @BelongsTo(() => User, 'payerId')
  payer!: User;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  recipientId?: string; // Opcional para membresías y publicaciones

  @BelongsTo(() => User, 'recipientId')
  recipient?: User;

  // ============================================
  // AMOUNT & CURRENCY
  // ============================================

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
  })
  amount!: number;

  @Default('ARS')
  @Column(DataType.STRING(10))
  currency!: string;

  @Column(DataType.DECIMAL(12, 2))
  amountUsd?: number;

  @Column(DataType.DECIMAL(12, 2))
  amountArs?: number;

  @Column(DataType.DECIMAL(10, 4))
  exchangeRate?: number;

  // ============================================
  // STATUS & TYPE
  // ============================================

  @Default('pending')
  @Index
  @Column(DataType.STRING(30))
  status!: PaymentStatus;

  @Index
  @Column(DataType.STRING(30))
  paymentType!: PaymentType;

  @Default('mercadopago')
  @Index
  @Column(DataType.STRING(20))
  paymentMethod!: PaymentMethod;

  // ============================================
  // PAYPAL FIELDS (Legacy)
  // ============================================

  @Index({ unique: true })
  @Column(DataType.STRING(255))
  paypalOrderId?: string;

  @Column(DataType.STRING(255))
  paypalCaptureId?: string;

  @Column(DataType.STRING(255))
  paypalPayerId?: string;

  @Column(DataType.STRING(255))
  paypalPayerEmail?: string;

  // ============================================
  // MERCADOPAGO FIELDS (Principal)
  // ============================================

  @Index({ unique: true })
  @Column(DataType.STRING(255))
  mercadopagoPaymentId?: string;

  @Column(DataType.STRING(255))
  mercadopagoPreferenceId?: string;

  @Column(DataType.STRING(50))
  mercadopagoStatus?: string;

  @Column(DataType.STRING(100))
  mercadopagoStatusDetail?: string;

  // ============================================
  // ESCROW MANAGEMENT
  // ============================================

  @Default(true) // Por defecto todos los pagos en Argentina van a escrow
  @Column(DataType.BOOLEAN)
  isEscrow!: boolean;

  @Column(DataType.DATE)
  escrowReleasedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  escrowReleasedBy?: string;

  @BelongsTo(() => User, 'escrowReleasedBy')
  releaser?: User;

  // ============================================
  // BILATERAL CONFIRMATION
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  payerConfirmed!: boolean;

  @Column(DataType.DATE)
  payerConfirmedAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  recipientConfirmed!: boolean;

  @Column(DataType.DATE)
  recipientConfirmedAt?: Date;

  // ============================================
  // DISPUTE
  // ============================================

  @Column(DataType.UUID)
  disputeId?: string;

  @Column(DataType.DATE)
  disputedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  disputedBy?: string;

  @BelongsTo(() => User, 'disputedBy')
  disputer?: User;

  @Column(DataType.TEXT)
  disputeReason?: string;

  // ============================================
  // REFUND
  // ============================================

  @Column(DataType.TEXT)
  refundReason?: string;

  @Column(DataType.DATE)
  refundedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  refundedBy?: string;

  @BelongsTo(() => User, 'refundedBy')
  refunder?: User;

  // ============================================
  // METADATA
  // ============================================

  @Column(DataType.TEXT)
  description?: string;

  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if both parties confirmed
   */
  isBothPartiesConfirmed(): boolean {
    return this.payerConfirmed && this.recipientConfirmed;
  }

  /**
   * Check if payment is in escrow
   */
  isInEscrow(): boolean {
    return this.isEscrow && this.status === 'held_escrow' && !this.escrowReleasedAt;
  }

  /**
   * Check if payment can be released
   */
  canBeReleased(): boolean {
    return this.isInEscrow() && this.isBothPartiesConfirmed();
  }

  /**
   * Check if payment is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if payment is refunded
   */
  isRefunded(): boolean {
    return this.status === 'refunded';
  }

  /**
   * Check if payment is disputed
   */
  isDisputed(): boolean {
    return this.status === 'disputed' || !!this.disputeId;
  }

  /**
   * Confirm payment by user
   */
  async confirmPayment(userId: string): Promise<boolean> {
    if (userId === this.payerId) {
      this.payerConfirmed = true;
      this.payerConfirmedAt = new Date();
    } else if (userId === this.recipientId) {
      this.recipientConfirmed = true;
      this.recipientConfirmedAt = new Date();
    } else {
      return false;
    }

    await this.save();

    // Auto-release if both confirmed and in escrow
    if (this.canBeReleased()) {
      await this.releaseEscrow();
    }

    return this.isBothPartiesConfirmed();
  }

  /**
   * Release funds from escrow
   */
  async releaseEscrow(releasedBy?: string): Promise<void> {
    if (!this.isInEscrow()) {
      throw new Error('Payment is not in escrow');
    }

    this.escrowReleasedAt = new Date();
    this.escrowReleasedBy = releasedBy;
    this.status = 'completed';
    await this.save();
  }

  /**
   * Process refund
   */
  async processRefund(reason: string, refundedBy: string): Promise<void> {
    if (this.status === 'refunded') {
      throw new Error('Payment already refunded');
    }

    this.refundReason = reason;
    this.refundedAt = new Date();
    this.refundedBy = refundedBy;
    this.status = 'refunded';
    await this.save();
  }

  /**
   * Mark as disputed
   */
  async markAsDisputed(disputedBy: string, reason: string, disputeId: string): Promise<void> {
    this.status = 'disputed';
    this.disputedAt = new Date();
    this.disputedBy = disputedBy;
    this.disputeReason = reason;
    this.disputeId = disputeId;
    await this.save();
  }

  /**
   * Get payment provider name
   */
  getProviderName(): string {
    return this.paymentMethod === 'paypal' ? 'PayPal' : 'MercadoPago';
  }

  /**
   * Get external payment ID
   */
  getExternalPaymentId(): string | undefined {
    return this.paymentMethod === 'paypal' ? this.paypalOrderId : this.mercadopagoPaymentId;
  }
}

export default Payment;
