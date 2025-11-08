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
import { Payment } from './Payment.model.js';

/**
 * Membership Model - PostgreSQL/Sequelize
 *
 * Sistema de membresía mensual con:
 * - PRO: €5.99/mes - 3 contratos/mes al 3% comisión
 * - SUPER_PRO: €8.99/mes - 3 contratos/mes al 2% comisión + analytics
 * - Tracking de contratos usados
 * - Integración MercadoPago subscriptions
 * - Auto-renovación
 */

// ============================================
// TYPES
// ============================================

export type MembershipPlan = 'PRO' | 'SUPER_PRO';

export type MembershipStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'payment_failed'
  | 'pending';

export interface IContractUsage {
  contractId: string; // UUID
  usedAt: Date;
  wasFree: boolean;
  commissionPaid: number;
  commissionPercentage: number;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'memberships',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'], unique: true },
    { fields: ['status', 'end_date'] },
    { fields: ['mercadopago_subscription_id'], unique: true },
    { fields: ['next_payment_date', 'status'] },
  ],
})
export class Membership extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index({ unique: true })
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User)
  user!: User;

  @ForeignKey(() => Payment)
  @Column(DataType.UUID)
  lastPaymentId?: string;

  @BelongsTo(() => Payment)
  lastPayment?: Payment;

  // ============================================
  // PLAN INFO
  // ============================================

  @AllowNull(false)
  @Default('PRO')
  @Column(DataType.STRING(20))
  plan!: MembershipPlan;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: MembershipStatus;

  // ============================================
  // SUBSCRIPTION DETAILS
  // ============================================

  @AllowNull(false)
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  endDate!: Date; // Fecha de renovación

  @Default(true)
  @Column(DataType.BOOLEAN)
  autoRenew!: boolean;

  // ============================================
  // PRICING
  // ============================================

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  priceUSD!: number; // €5.99 o €8.99

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  priceARS!: number; // Precio en ARS al momento de compra

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  exchangeRateAtPurchase!: number; // Tasa de cambio USD→ARS

  // ============================================
  // MERCADOPAGO INTEGRATION
  // ============================================

  @Index({ unique: true })
  @Column(DataType.STRING(255))
  mercadopagoSubscriptionId?: string;

  @Column(DataType.STRING(255))
  mercadopagoPreapprovalId?: string;

  @Column(DataType.DATE)
  lastPaymentDate?: Date;

  @Index
  @Column(DataType.DATE)
  nextPaymentDate?: Date;

  // ============================================
  // CONTRACT TRACKING
  // ============================================

  @Default(3)
  @Column(DataType.INTEGER)
  freeContractsTotal!: number; // Total de contratos gratis por mes

  @Default(0)
  @Column(DataType.INTEGER)
  freeContractsUsed!: number; // Contratos gratis usados este mes

  @Default(3)
  @Column(DataType.INTEGER)
  freeContractsRemaining!: number; // Contratos gratis restantes este mes

  @Default(0)
  @Column(DataType.INTEGER)
  totalContractsCount!: number; // Total histórico

  @Default([])
  @Column(DataType.JSONB)
  contractsHistory!: IContractUsage[];

  // ============================================
  // BENEFITS
  // ============================================

  @Default(3.0)
  @Column(DataType.DECIMAL(5, 2))
  reducedCommissionPercentage!: number; // 3% PRO, 2% SUPER_PRO después de agotar gratis

  // ============================================
  // CANCELLATION
  // ============================================

  @Column(DataType.DATE)
  cancelledAt?: Date;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  cancellationReason?: string;

  @Column(DataType.DATE)
  willExpireAt?: Date; // Cuando cancela pero aún tiene días pagados

  // ============================================
  // NOTIFICATIONS
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  paymentFailureNotified!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  expirationWarningNotified!: boolean;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateMembership(instance: Membership) {
    // Set commission rate based on plan
    if (instance.plan === 'PRO') {
      instance.reducedCommissionPercentage = 3.0;
      instance.freeContractsTotal = 3;
    } else if (instance.plan === 'SUPER_PRO') {
      instance.reducedCommissionPercentage = 2.0;
      instance.freeContractsTotal = 3;
    }

    // Validate dates
    if (instance.startDate && instance.endDate && instance.startDate >= instance.endDate) {
      throw new Error('Start date must be before end date');
    }

    // Trim cancellation reason
    if (instance.cancellationReason) {
      instance.cancellationReason = instance.cancellationReason.trim();
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if membership is active
   */
  isActive(): boolean {
    return this.status === 'active' && this.endDate > new Date();
  }

  /**
   * Check if membership has expired
   */
  isExpired(): boolean {
    return this.endDate <= new Date();
  }

  /**
   * Check if membership is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Check if has free contracts remaining
   */
  hasFreeContractsRemaining(): boolean {
    return this.freeContractsRemaining > 0;
  }

  /**
   * Use a contract (track usage)
   */
  async useContract(
    contractId: string,
    contractAmount: number
  ): Promise<{
    isFree: boolean;
    commissionPercentage: number;
    commissionAmount: number;
  }> {
    let isFree = false;
    let commissionPercentage = 8.0; // Default sin membresía
    let commissionAmount = 0;

    if (this.hasFreeContractsRemaining()) {
      // Usar contrato gratis
      isFree = true;
      commissionPercentage = 0;
      commissionAmount = 0;
      this.freeContractsUsed += 1;
      this.freeContractsRemaining -= 1;
    } else {
      // Usar con comisión reducida
      commissionPercentage = this.reducedCommissionPercentage;
      commissionAmount = (contractAmount * commissionPercentage) / 100;
    }

    this.totalContractsCount += 1;
    this.contractsHistory.push({
      contractId,
      usedAt: new Date(),
      wasFree: isFree,
      commissionPaid: commissionAmount,
      commissionPercentage,
    });

    await this.save();

    return { isFree, commissionPercentage, commissionAmount };
  }

  /**
   * Reset monthly contract counters (cron job)
   */
  async resetMonthlyCounters(): Promise<void> {
    this.freeContractsUsed = 0;
    this.freeContractsRemaining = this.freeContractsTotal;
    await this.save();
  }

  /**
   * Cancel membership
   */
  async cancel(reason?: string): Promise<void> {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.cancellationReason = reason;
    this.autoRenew = false;

    // Si tiene días pagados restantes, marca cuando expirará
    if (this.endDate > new Date()) {
      this.willExpireAt = this.endDate;
    }

    await this.save();
  }

  /**
   * Renew membership
   */
  async renew(paymentId: string, newEndDate: Date): Promise<void> {
    this.status = 'active';
    this.endDate = newEndDate;
    this.lastPaymentId = paymentId;
    this.lastPaymentDate = new Date();
    this.nextPaymentDate = newEndDate;

    // Reset counters on renewal
    await this.resetMonthlyCounters();

    await this.save();
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(): Promise<void> {
    this.status = 'payment_failed';
    this.paymentFailureNotified = false; // Reset para enviar notificación
    await this.save();
  }

  /**
   * Expire membership
   */
  async expire(): Promise<void> {
    this.status = 'expired';
    await this.save();
  }

  /**
   * Reactivate membership
   */
  async reactivate(): Promise<void> {
    if (this.isExpired()) {
      throw new Error('Cannot reactivate expired membership');
    }

    this.status = 'active';
    await this.save();
  }

  /**
   * Get commission rate for next contract
   */
  getNextContractCommissionRate(): number {
    if (this.hasFreeContractsRemaining()) {
      return 0;
    }
    return this.reducedCommissionPercentage;
  }

  /**
   * Get days until expiration
   */
  getDaysUntilExpiration(): number {
    const now = new Date();
    const diffTime = this.endDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if expiring soon (7 days)
   */
  isExpiringSoon(): boolean {
    const daysLeft = this.getDaysUntilExpiration();
    return daysLeft > 0 && daysLeft <= 7;
  }

  /**
   * Get total contracts used this month
   */
  getTotalContractsThisMonth(): number {
    return this.freeContractsUsed;
  }

  /**
   * Get savings compared to no membership
   */
  getSavingsEstimate(averageContractAmount: number): number {
    const standardCommission = 0.08; // 8%
    const proCommission = this.reducedCommissionPercentage / 100;

    const totalSavings =
      this.freeContractsUsed * averageContractAmount * standardCommission +
      (this.totalContractsCount - this.freeContractsUsed) *
        averageContractAmount *
        (standardCommission - proCommission);

    return totalSavings;
  }

  /**
   * Get plan display name
   */
  getPlanDisplayName(): string {
    return this.plan === 'PRO' ? 'PRO' : 'SUPER PRO';
  }

  /**
   * Check if has SUPER_PRO benefits
   */
  hasSuperProBenefits(): boolean {
    return this.plan === 'SUPER_PRO' && this.isActive();
  }
}

export default Membership;
