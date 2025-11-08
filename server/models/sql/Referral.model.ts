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

/**
 * Referral Model - PostgreSQL/Sequelize
 *
 * Sistema de referidos para los primeros 1000 usuarios:
 *
 * Beneficios del referidor (quien refiere):
 * - 1er referido completa contrato: 2 contratos gratis
 * - 2do referido completa contrato: 1 contrato gratis
 * - 3er referido completa contrato: 3% comisión permanente
 * - Máximo 3 referidos por usuario
 *
 * Beneficios del referido:
 * - 1 contrato gratis al registrarse (primeros 1000 usuarios)
 */

// ============================================
// TYPES
// ============================================

export type ReferralStatus =
  | 'pending'
  | 'registered'
  | 'completed'
  | 'expired'
  | 'cancelled';

export type RewardType = 'two_free' | 'one_free' | 'reduced_commission';

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'referrals',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['referrer_id', 'status'] },
    { fields: ['referred_user_id'] },
    { fields: ['referral_code'], unique: true },
    { fields: ['used_code'] },
    { fields: ['status', 'created_at'] },
  ],
})
export class Referral extends Model {
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
  referrerId!: string; // Usuario que refiere

  @BelongsTo(() => User, 'referrerId')
  referrer!: User;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  referredUserId?: string; // Usuario referido (cuando se registra)

  @BelongsTo(() => User, 'referredUserId')
  referred?: User;

  // ============================================
  // REFERRAL CODES
  // ============================================

  @AllowNull(false)
  @Index({ unique: true })
  @Column(DataType.STRING(20))
  referralCode!: string; // Código único del referidor

  @Index
  @Column(DataType.STRING(20))
  usedCode?: string; // Código que usó el referido al registrarse

  // ============================================
  // STATUS TRACKING
  // ============================================

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: ReferralStatus;

  @Column(DataType.DATE)
  registeredAt?: Date; // Cuando el referido se registró

  @Column(DataType.DATE)
  firstContractCompletedAt?: Date; // Cuando el referido completó su primer contrato

  // ============================================
  // REWARDS FOR REFERRER
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  rewardGranted!: boolean;

  @Column(DataType.STRING(30))
  rewardType?: RewardType; // 1er, 2do, 3er referido

  @Column(DataType.DATE)
  rewardGrantedAt?: Date;

  // ============================================
  // USAGE TRACKING
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  referrerRewardUsed!: boolean; // Si el referidor ya usó el beneficio

  @Default(false)
  @Column(DataType.BOOLEAN)
  referredFirstContractFree!: boolean; // Si el referido usó su contrato gratis

  // ============================================
  // METADATA
  // ============================================

  @Column(DataType.STRING(100))
  source?: string; // De dónde vino el referido (ej: "facebook", "twitter")

  @Column(DataType.JSONB)
  metadata?: any; // Datos adicionales

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateReferral(instance: Referral) {
    // Uppercase codes
    if (instance.referralCode) {
      instance.referralCode = instance.referralCode.toUpperCase();
    }
    if (instance.usedCode) {
      instance.usedCode = instance.usedCode.toUpperCase();
    }

    // Trim source
    if (instance.source) {
      instance.source = instance.source.trim();
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if referral is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if referral is registered
   */
  isRegistered(): boolean {
    return this.status === 'registered';
  }

  /**
   * Check if referral is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Mark as registered
   */
  async markAsRegistered(userId: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending referrals can be registered');
    }

    this.status = 'registered';
    this.referredUserId = userId;
    this.registeredAt = new Date();

    await this.save();
  }

  /**
   * Mark first contract as completed
   */
  async markFirstContractCompleted(): Promise<void> {
    if (!this.isRegistered()) {
      throw new Error('Referral must be registered before completing contract');
    }

    this.status = 'completed';
    this.firstContractCompletedAt = new Date();

    await this.save();
  }

  /**
   * Grant reward to referrer
   */
  async grantReward(rewardType: RewardType): Promise<void> {
    if (this.rewardGranted) {
      throw new Error('Reward already granted');
    }

    this.rewardGranted = true;
    this.rewardType = rewardType;
    this.rewardGrantedAt = new Date();

    await this.save();
  }

  /**
   * Mark referrer reward as used
   */
  async markReferrerRewardUsed(): Promise<void> {
    this.referrerRewardUsed = true;
    await this.save();
  }

  /**
   * Mark referred's first contract as free
   */
  async markReferredContractFree(): Promise<void> {
    this.referredFirstContractFree = true;
    await this.save();
  }

  /**
   * Cancel referral
   */
  async cancel(): Promise<void> {
    if (this.isCompleted()) {
      throw new Error('Cannot cancel completed referral');
    }

    this.status = 'cancelled';
    await this.save();
  }

  /**
   * Expire referral
   */
  async expire(): Promise<void> {
    if (this.isCompleted()) {
      throw new Error('Cannot expire completed referral');
    }

    this.status = 'expired';
    await this.save();
  }

  /**
   * Get reward description
   */
  getRewardDescription(): string {
    switch (this.rewardType) {
      case 'two_free':
        return '2 contratos gratis';
      case 'one_free':
        return '1 contrato gratis';
      case 'reduced_commission':
        return '3% de comisión permanente';
      default:
        return 'Sin recompensa';
    }
  }

  /**
   * Check if reward is available
   */
  isRewardAvailable(): boolean {
    return this.rewardGranted && !this.referrerRewardUsed;
  }

  /**
   * Get days since registration
   */
  getDaysSinceRegistration(): number | null {
    if (!this.registeredAt) return null;

    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.registeredAt.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get days until first contract
   */
  getDaysUntilFirstContract(): number | null {
    if (!this.registeredAt || !this.firstContractCompletedAt) return null;

    const diffTime = Math.abs(
      this.firstContractCompletedAt.getTime() - this.registeredAt.getTime()
    );
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if referred user is active (completed contract)
   */
  isReferredUserActive(): boolean {
    return !!this.firstContractCompletedAt;
  }

  /**
   * Get conversion rate (registered → completed)
   */
  static async getConversionRate(): Promise<number> {
    const registered = await Referral.count({
      where: { status: 'registered' },
    });

    const completed = await Referral.count({
      where: { status: 'completed' },
    });

    if (registered === 0) return 0;
    return (completed / registered) * 100;
  }

  /**
   * Static: Generate unique referral code
   */
  static generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Static: Validate referral code format
   */
  static isValidReferralCode(code: string): boolean {
    return /^[A-Z0-9]{8}$/.test(code);
  }
}

export default Referral;
