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
import { Payment } from './Payment.model.js';

/**
 * BalanceTransaction Model - PostgreSQL/Sequelize
 *
 * Sistema de transacciones de balance con:
 * - Tracking completo de movimientos (refund, payment, bonus, adjustment, withdrawal)
 * - Balance antes/después para auditoría
 * - Vinculación con contratos y pagos
 * - Metadata flexible para detalles adicionales
 * - Estados de transacción (pending, completed, failed)
 */

// ============================================
// TYPES
// ============================================

export type TransactionType =
  | 'refund'
  | 'payment'
  | 'bonus'
  | 'adjustment'
  | 'withdrawal';

export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface ITransactionMetadata {
  previousPrice?: number;
  newPrice?: number;
  reason?: string;
  [key: string]: any;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'balance_transactions',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'created_at'] },
    { fields: ['user_id', 'type'] },
    { fields: ['related_contract_id'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['created_at'] },
  ],
})
export class BalanceTransaction extends Model {
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
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User)
  user!: User;

  @ForeignKey(() => Contract)
  @Index
  @Column(DataType.UUID)
  relatedContractId?: string;

  @BelongsTo(() => Contract)
  relatedContract?: Contract;

  @ForeignKey(() => Payment)
  @Column(DataType.UUID)
  relatedPaymentId?: string;

  @BelongsTo(() => Payment)
  relatedPayment?: Payment;

  // ============================================
  // TRANSACTION INFO
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  type!: TransactionType;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  amount!: number; // Amount in ARS

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  balanceBefore!: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  balanceAfter!: number;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 500],
        msg: 'Description must be between 1 and 500 characters',
      },
    },
  })
  description!: string;

  // ============================================
  // METADATA
  // ============================================

  @Default({})
  @Column(DataType.JSONB)
  metadata!: ITransactionMetadata;

  // ============================================
  // STATUS
  // ============================================

  @Default('completed')
  @Index
  @Column(DataType.STRING(20))
  status!: TransactionStatus;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateTransaction(instance: BalanceTransaction) {
    // Trim description
    if (instance.description) {
      instance.description = instance.description.trim();
    }

    // Validate balance calculation
    if (
      instance.balanceBefore !== undefined &&
      instance.amount !== undefined &&
      instance.balanceAfter !== undefined
    ) {
      const expectedBalance = Number(instance.balanceBefore) + Number(instance.amount);
      const actualBalance = Number(instance.balanceAfter);

      // Allow small floating point differences (0.01 ARS)
      if (Math.abs(expectedBalance - actualBalance) > 0.01) {
        throw new Error(
          `Balance calculation error: ${instance.balanceBefore} + ${instance.amount} = ${expectedBalance}, but balanceAfter is ${actualBalance}`
        );
      }
    }

    // Validate amount sign based on type
    if (instance.amount !== undefined) {
      const amount = Number(instance.amount);
      if (instance.type === 'withdrawal' && amount > 0) {
        throw new Error('Withdrawal amount must be negative');
      }
      if (
        (instance.type === 'refund' || instance.type === 'payment' || instance.type === 'bonus') &&
        amount < 0
      ) {
        throw new Error(`${instance.type} amount must be positive`);
      }
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if transaction is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if transaction is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if transaction is failed
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Mark as completed
   */
  async markAsCompleted(): Promise<void> {
    if (this.isCompleted()) {
      throw new Error('Transaction is already completed');
    }

    this.status = 'completed';
    await this.save();
  }

  /**
   * Mark as failed
   */
  async markAsFailed(reason?: string): Promise<void> {
    if (this.isCompleted()) {
      throw new Error('Cannot fail a completed transaction');
    }

    this.status = 'failed';
    if (reason) {
      this.metadata = {
        ...this.metadata,
        failureReason: reason,
      };
    }
    await this.save();
  }

  /**
   * Check if this is a credit transaction (adds money)
   */
  isCredit(): boolean {
    return Number(this.amount) > 0;
  }

  /**
   * Check if this is a debit transaction (removes money)
   */
  isDebit(): boolean {
    return Number(this.amount) < 0;
  }

  /**
   * Get absolute amount
   */
  getAbsoluteAmount(): number {
    return Math.abs(Number(this.amount));
  }

  /**
   * Get transaction type display name
   */
  getTypeDisplayName(): string {
    const names: Record<TransactionType, string> = {
      refund: 'Reembolso',
      payment: 'Pago recibido',
      bonus: 'Bonificación',
      adjustment: 'Ajuste',
      withdrawal: 'Retiro',
    };
    return names[this.type];
  }

  /**
   * Get transaction sign (+ or -)
   */
  getSign(): '+' | '-' {
    return this.isCredit() ? '+' : '-';
  }

  /**
   * Check if related to contract
   */
  isRelatedToContract(): boolean {
    return !!this.relatedContractId;
  }

  /**
   * Check if related to payment
   */
  isRelatedToPayment(): boolean {
    return !!this.relatedPaymentId;
  }

  /**
   * Get formatted amount with sign
   */
  getFormattedAmount(): string {
    const sign = this.getSign();
    const amount = this.getAbsoluteAmount().toFixed(2);
    return `${sign}$${amount} ARS`;
  }

  /**
   * Get age in days
   */
  getAgeInDays(): number {
    const now = new Date();
    const created = this.createdAt as Date;
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Static: Create refund transaction
   */
  static async createRefund(
    userId: string,
    amount: number,
    balanceBefore: number,
    description: string,
    contractId?: string,
    metadata?: ITransactionMetadata
  ): Promise<BalanceTransaction> {
    return await BalanceTransaction.create({
      userId,
      type: 'refund',
      amount: Math.abs(amount), // Ensure positive
      balanceBefore,
      balanceAfter: balanceBefore + Math.abs(amount),
      description,
      relatedContractId: contractId,
      metadata: metadata || {},
      status: 'completed',
    });
  }

  /**
   * Static: Create payment transaction
   */
  static async createPayment(
    userId: string,
    amount: number,
    balanceBefore: number,
    description: string,
    contractId?: string,
    paymentId?: string,
    metadata?: ITransactionMetadata
  ): Promise<BalanceTransaction> {
    return await BalanceTransaction.create({
      userId,
      type: 'payment',
      amount: Math.abs(amount), // Ensure positive
      balanceBefore,
      balanceAfter: balanceBefore + Math.abs(amount),
      description,
      relatedContractId: contractId,
      relatedPaymentId: paymentId,
      metadata: metadata || {},
      status: 'completed',
    });
  }

  /**
   * Static: Create withdrawal transaction
   */
  static async createWithdrawal(
    userId: string,
    amount: number,
    balanceBefore: number,
    description: string,
    metadata?: ITransactionMetadata
  ): Promise<BalanceTransaction> {
    return await BalanceTransaction.create({
      userId,
      type: 'withdrawal',
      amount: -Math.abs(amount), // Ensure negative
      balanceBefore,
      balanceAfter: balanceBefore - Math.abs(amount),
      description,
      metadata: metadata || {},
      status: 'pending',
    });
  }

  /**
   * Static: Create bonus transaction
   */
  static async createBonus(
    userId: string,
    amount: number,
    balanceBefore: number,
    description: string,
    metadata?: ITransactionMetadata
  ): Promise<BalanceTransaction> {
    return await BalanceTransaction.create({
      userId,
      type: 'bonus',
      amount: Math.abs(amount), // Ensure positive
      balanceBefore,
      balanceAfter: balanceBefore + Math.abs(amount),
      description,
      metadata: metadata || {},
      status: 'completed',
    });
  }

  /**
   * Static: Create adjustment transaction
   */
  static async createAdjustment(
    userId: string,
    amount: number,
    balanceBefore: number,
    description: string,
    metadata?: ITransactionMetadata
  ): Promise<BalanceTransaction> {
    return await BalanceTransaction.create({
      userId,
      type: 'adjustment',
      amount,
      balanceBefore,
      balanceAfter: balanceBefore + amount,
      description,
      metadata: metadata || {},
      status: 'completed',
    });
  }
}

export default BalanceTransaction;
