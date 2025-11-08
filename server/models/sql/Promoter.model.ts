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
  BeforeSave,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Advertisement } from './Advertisement.model.js';

/**
 * Promoter Model - PostgreSQL/Sequelize
 *
 * Sistema de promotores/anunciantes con:
 * - Información de contacto empresarial
 * - Planes de pago (impression, monthly, yearly, custom)
 * - Analytics de campaña
 * - Gestión de estado y activación
 */

// ============================================
// TYPES
// ============================================

export type AdType = 'banner' | 'sidebar' | 'card';

export type PaymentPlan = 'impression' | 'monthly' | 'yearly' | 'custom';

export type PromoterStatus = 'active' | 'paused' | 'ended' | 'pending';

export type Currency = 'ARS' | 'USD';

export interface IPricing {
  basePrice: number;
  totalPaid: number;
  nextPaymentDate?: Date;
  lastPaymentDate?: Date;
  currency: Currency;
}

export interface IAnalytics {
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
  averageCTR: number;
  averageCPM: number;
  averageCPC: number;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'promoters',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['advertisement_id'] },
    { fields: ['status', 'is_enabled'] },
    { fields: ['start_date', 'end_date'] },
    { fields: ['status'] },
  ],
})
export class Promoter extends Model {
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

  @BelongsTo(() => User, 'userId')
  user!: User;

  @ForeignKey(() => Advertisement)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  advertisementId!: string;

  @BelongsTo(() => Advertisement)
  advertisement!: Advertisement;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  createdBy!: string; // Admin who created

  @BelongsTo(() => User, 'createdBy')
  creator!: User;

  // ============================================
  // COMPANY INFO
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: [1, 200],
    },
  })
  companyName!: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: [1, 200],
    },
  })
  contactName!: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      isEmail: true,
    },
  })
  contactEmail!: string;

  @Column(DataType.STRING(50))
  contactPhone?: string;

  // ============================================
  // SCHEDULING
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(false)
  @Index
  @Column(DataType.DATE)
  endDate!: Date;

  // ============================================
  // AD CONFIG
  // ============================================

  @AllowNull(false)
  @Column(DataType.STRING(20))
  adType!: AdType;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  paymentPlan!: PaymentPlan;

  // ============================================
  // PRICING
  // ============================================

  @Default({
    basePrice: 0,
    totalPaid: 0,
    currency: 'ARS',
  })
  @Column(DataType.JSONB)
  pricing!: IPricing;

  // ============================================
  // STATUS
  // ============================================

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: PromoterStatus;

  @Default(true)
  @Index
  @Column(DataType.BOOLEAN)
  isEnabled!: boolean;

  // ============================================
  // ANALYTICS
  // ============================================

  @Default({
    totalImpressions: 0,
    totalClicks: 0,
    totalCost: 0,
    averageCTR: 0,
    averageCPM: 0,
    averageCPC: 0,
  })
  @Column(DataType.JSONB)
  analytics!: IAnalytics;

  // ============================================
  // NOTES
  // ============================================

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 2000],
    },
  })
  notes?: string;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validatePromoter(instance: Promoter) {
    // Trim strings
    if (instance.companyName) {
      instance.companyName = instance.companyName.trim();
    }
    if (instance.contactName) {
      instance.contactName = instance.contactName.trim();
    }
    if (instance.contactEmail) {
      instance.contactEmail = instance.contactEmail.trim().toLowerCase();
    }
    if (instance.contactPhone) {
      instance.contactPhone = instance.contactPhone.trim();
    }
    if (instance.notes) {
      instance.notes = instance.notes.trim();
    }

    // Validate dates
    if (instance.startDate && instance.endDate && instance.endDate <= instance.startDate) {
      throw new Error('End date must be after start date');
    }

    // Ensure pricing object exists
    if (!instance.pricing) {
      instance.pricing = {
        basePrice: 0,
        totalPaid: 0,
        currency: 'ARS',
      };
    }

    // Ensure analytics object exists
    if (!instance.analytics) {
      instance.analytics = {
        totalImpressions: 0,
        totalClicks: 0,
        totalCost: 0,
        averageCTR: 0,
        averageCPM: 0,
        averageCPC: 0,
      };
    }
  }

  @BeforeSave
  static updateStatus(instance: Promoter) {
    // Auto-update status based on dates
    const now = new Date();

    if (instance.endDate < now && instance.status === 'active') {
      instance.status = 'ended';
    } else if (instance.startDate > now && instance.status !== 'pending') {
      instance.status = 'pending';
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if promoter is active
   */
  isActive(): boolean {
    const now = new Date();
    return (
      this.status === 'active' &&
      this.isEnabled &&
      now >= this.startDate &&
      now <= this.endDate
    );
  }

  /**
   * Check if campaign has ended
   */
  hasEnded(): boolean {
    return this.status === 'ended' || this.endDate < new Date();
  }

  /**
   * Pause campaign
   */
  async pause(): Promise<void> {
    if (this.status !== 'active') {
      throw new Error('Only active campaigns can be paused');
    }

    this.status = 'paused';
    await this.save();
  }

  /**
   * Resume campaign
   */
  async resume(): Promise<void> {
    if (this.status !== 'paused') {
      throw new Error('Only paused campaigns can be resumed');
    }

    const now = new Date();
    if (now > this.endDate) {
      this.status = 'ended';
    } else {
      this.status = 'active';
    }

    await this.save();
  }

  /**
   * End campaign
   */
  async end(): Promise<void> {
    this.status = 'ended';
    await this.save();
  }

  /**
   * Record impression and cost
   */
  async recordImpression(cost?: number): Promise<void> {
    this.analytics.totalImpressions += 1;

    if (cost) {
      this.analytics.totalCost += cost;
    }

    // Recalculate metrics
    this.calculateMetrics();

    await this.save();
  }

  /**
   * Record click
   */
  async recordClick(): Promise<void> {
    this.analytics.totalClicks += 1;

    // Recalculate metrics
    this.calculateMetrics();

    await this.save();
  }

  /**
   * Calculate analytics metrics
   */
  calculateMetrics(): void {
    // CTR (Click-Through Rate)
    if (this.analytics.totalImpressions > 0) {
      this.analytics.averageCTR =
        (this.analytics.totalClicks / this.analytics.totalImpressions) * 100;
    }

    // CPM (Cost Per Mille - per thousand impressions)
    if (this.analytics.totalImpressions > 0) {
      this.analytics.averageCPM =
        (this.analytics.totalCost / this.analytics.totalImpressions) * 1000;
    }

    // CPC (Cost Per Click)
    if (this.analytics.totalClicks > 0) {
      this.analytics.averageCPC = this.analytics.totalCost / this.analytics.totalClicks;
    }
  }

  /**
   * Update payment info
   */
  async recordPayment(amount: number, date: Date = new Date()): Promise<void> {
    this.pricing.totalPaid += amount;
    this.pricing.lastPaymentDate = date;

    // Calculate next payment date based on plan
    if (this.paymentPlan === 'monthly') {
      const nextDate = new Date(date);
      nextDate.setMonth(nextDate.getMonth() + 1);
      this.pricing.nextPaymentDate = nextDate;
    } else if (this.paymentPlan === 'yearly') {
      const nextDate = new Date(date);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      this.pricing.nextPaymentDate = nextDate;
    }

    await this.save();
  }

  /**
   * Get days remaining
   */
  getDaysRemaining(): number {
    const now = new Date();
    const diff = this.endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /**
   * Get campaign duration in days
   */
  getDurationDays(): number {
    const diff = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get ROI estimate (assuming average value per click)
   */
  getROI(averageValuePerClick: number): number {
    const totalRevenue = this.analytics.totalClicks * averageValuePerClick;
    if (this.analytics.totalCost === 0) return 0;
    return ((totalRevenue - this.analytics.totalCost) / this.analytics.totalCost) * 100;
  }

  /**
   * Get campaign summary
   */
  getCampaignSummary(): {
    company: string;
    status: string;
    daysRemaining: number;
    analytics: IAnalytics;
  } {
    return {
      company: this.companyName,
      status: this.status,
      daysRemaining: this.getDaysRemaining(),
      analytics: this.analytics,
    };
  }

  /**
   * Check if payment is due soon (within 7 days)
   */
  isPaymentDueSoon(): boolean {
    if (!this.pricing.nextPaymentDate) return false;

    const now = new Date();
    const daysDiff = Math.ceil(
      (this.pricing.nextPaymentDate.getTime() - now.getTime()) /
        (1000 * 60 * 60 * 24)
    );

    return daysDiff > 0 && daysDiff <= 7;
  }
}

export default Promoter;
