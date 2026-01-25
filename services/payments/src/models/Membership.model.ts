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

export type MembershipTier = 'free' | 'pro' | 'super_pro';
export type MembershipStatus = 'active' | 'cancelled' | 'expired' | 'pending';

@Table({
  tableName: 'memberships',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['tier'] },
    { fields: ['status'] },
    { fields: ['expires_at'] },
  ],
})
export class Membership extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  tier!: MembershipTier;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: MembershipStatus;

  @AllowNull(false)
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  expiresAt!: Date;

  // Pricing
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  price!: number;

  @Default('EUR')
  @Column(DataType.STRING(3))
  currency!: string;

  // MercadoPago subscription
  @Column(DataType.STRING(100))
  mercadopagoSubscriptionId?: string;

  @Column(DataType.STRING(50))
  mercadopagoStatus?: string;

  // Usage
  @Default(0)
  @Column(DataType.INTEGER)
  contractsUsedThisMonth!: number;

  @Default(3)
  @Column(DataType.INTEGER)
  contractsPerMonth!: number;

  @Column(DataType.DATE)
  lastResetAt?: Date;

  // Cancellation
  @Column(DataType.DATE)
  cancelledAt?: Date;

  @Column(DataType.TEXT)
  cancellationReason?: string;

  // Auto-renewal
  @Default(true)
  @Column(DataType.BOOLEAN)
  autoRenew!: boolean;

  // Methods
  isActive(): boolean {
    return this.status === 'active' && this.expiresAt > new Date();
  }

  isExpired(): boolean {
    return this.expiresAt <= new Date();
  }

  hasContractsRemaining(): boolean {
    return this.contractsUsedThisMonth < this.contractsPerMonth;
  }

  getContractsRemaining(): number {
    return Math.max(0, this.contractsPerMonth - this.contractsUsedThisMonth);
  }

  async useContract(): Promise<boolean> {
    if (!this.hasContractsRemaining()) return false;
    this.contractsUsedThisMonth += 1;
    await this.save();
    return true;
  }

  async resetMonthlyUsage(): Promise<void> {
    this.contractsUsedThisMonth = 0;
    this.lastResetAt = new Date();
    await this.save();
  }

  async cancel(reason?: string): Promise<void> {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.cancellationReason = reason;
    this.autoRenew = false;
    await this.save();
  }

  async renew(months: number = 1): Promise<void> {
    const newExpiry = new Date(this.expiresAt);
    newExpiry.setMonth(newExpiry.getMonth() + months);
    this.expiresAt = newExpiry;
    this.status = 'active';
    await this.save();
  }

  getCommissionRate(): number {
    switch (this.tier) {
      case 'pro':
        return 3;
      case 'super_pro':
        return 2;
      default:
        return 8;
    }
  }
}

export default Membership;
