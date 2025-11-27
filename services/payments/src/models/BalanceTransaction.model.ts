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

export type TransactionType =
  | 'payment'
  | 'refund'
  | 'withdrawal'
  | 'bonus'
  | 'adjustment'
  | 'commission';

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';

@Table({
  tableName: 'balance_transactions',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['contract_id'] },
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

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  type!: TransactionType;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  amount!: number;

  @Default('ARS')
  @Column(DataType.STRING(3))
  currency!: string;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: TransactionStatus;

  // Balance tracking
  @Column(DataType.DECIMAL(12, 2))
  balanceBefore?: number;

  @Column(DataType.DECIMAL(12, 2))
  balanceAfter?: number;

  // References
  @Index
  @Column(DataType.UUID)
  contractId?: string;

  @Column(DataType.UUID)
  paymentId?: string;

  @Column(DataType.UUID)
  withdrawalId?: string;

  // Description
  @Column(DataType.STRING(255))
  description?: string;

  // Metadata
  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  // Methods
  isPending(): boolean {
    return this.status === 'pending';
  }

  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isCredit(): boolean {
    return ['payment', 'refund', 'bonus'].includes(this.type);
  }

  isDebit(): boolean {
    return ['withdrawal', 'commission'].includes(this.type);
  }

  async complete(balanceAfter: number): Promise<void> {
    this.status = 'completed';
    this.balanceAfter = balanceAfter;
    await this.save();
  }

  async fail(reason?: string): Promise<void> {
    this.status = 'failed';
    if (reason) {
      this.metadata = { ...this.metadata, failureReason: reason };
    }
    await this.save();
  }

  static async createTransaction(
    userId: string,
    type: TransactionType,
    amount: number,
    balanceBefore: number,
    options?: {
      contractId?: string;
      paymentId?: string;
      withdrawalId?: string;
      description?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<BalanceTransaction> {
    return BalanceTransaction.create({
      userId,
      type,
      amount,
      status: 'completed',
      balanceBefore,
      balanceAfter: balanceBefore + amount,
      ...options,
    });
  }
}

export default BalanceTransaction;
