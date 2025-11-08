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
import { Payment } from './Payment.model.js';

/**
 * Advertisement Model - PostgreSQL/Sequelize
 *
 * Sistema de publicidad con 3 modelos:
 * - Model 1 (3x1 Banner): $50/día
 * - Model 2 (1x2 Sidebar): $35/día
 * - Model 3 (1x1 Card): $20/día
 *
 * Features:
 * - Targeting por categorías, tags, ubicaciones
 * - Analytics (impressions, clicks, CTR)
 * - Sistema de aprobación admin
 * - Prioridad de visualización (paid feature)
 */

// ============================================
// TYPES
// ============================================

export type AdType = 'model1' | 'model2' | 'model3';

export type AdStatus = 'pending' | 'active' | 'paused' | 'expired' | 'rejected';

export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export type AdPlacement = 'jobs_list' | 'search_results' | 'dashboard' | 'all';

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'advertisements',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['advertiser_id', 'status'] },
    { fields: ['status', 'start_date', 'end_date'] },
    { fields: ['placement', 'status', 'priority'] },
    { fields: ['payment_status'] },
    { fields: ['start_date'] },
    { fields: ['end_date'] },
  ],
})
export class Advertisement extends Model {
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
  advertiserId!: string;

  @BelongsTo(() => User, 'advertiserId')
  advertiser!: User;

  @ForeignKey(() => Payment)
  @Column(DataType.UUID)
  paymentId?: string;

  @BelongsTo(() => Payment)
  payment?: Payment;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  approvedBy?: string;

  @BelongsTo(() => User, 'approvedBy')
  approver?: User;

  // ============================================
  // BASIC INFO
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.STRING(100),
    validate: {
      len: {
        args: [1, 100],
        msg: 'Title cannot exceed 100 characters',
      },
    },
  })
  title!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 500],
        msg: 'Description cannot exceed 500 characters',
      },
    },
  })
  description!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  imageUrl!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      isUrl: {
        msg: 'Invalid URL format',
      },
    },
  })
  targetUrl!: string;

  // ============================================
  // AD TYPE & STATUS
  // ============================================

  @AllowNull(false)
  @Default('model3')
  @Column(DataType.STRING(20))
  adType!: AdType;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: AdStatus;

  // ============================================
  // PRICING
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(10, 2),
    validate: {
      min: 0,
    },
  })
  pricePerDay!: number;

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  totalPrice!: number;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  paymentStatus!: PaymentStatus;

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
  // TARGETING
  // ============================================

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  targetCategories!: string[];

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  targetTags!: string[];

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  targetLocations!: string[];

  // ============================================
  // ANALYTICS
  // ============================================

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 0,
    },
  })
  impressions!: number;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 0,
    },
  })
  clicks!: number;

  @Default(0.0)
  @Column({
    type: DataType.DECIMAL(5, 2),
    validate: {
      min: 0,
      max: 100,
    },
  })
  ctr!: number; // Click-through rate percentage

  // ============================================
  // PRIORITY & PLACEMENT
  // ============================================

  @Default(0)
  @Index
  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 0,
    },
  })
  priority!: number; // Higher = shown first

  @Default('jobs_list')
  @Index
  @Column(DataType.STRING(30))
  placement!: AdPlacement;

  // ============================================
  // APPROVAL
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  isApproved!: boolean;

  @Column(DataType.DATE)
  approvedAt?: Date;

  @Column(DataType.TEXT)
  rejectionReason?: string;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateAdvertisement(instance: Advertisement) {
    // Trim strings
    if (instance.title) {
      instance.title = instance.title.trim();
    }
    if (instance.description) {
      instance.description = instance.description.trim();
    }
    if (instance.rejectionReason) {
      instance.rejectionReason = instance.rejectionReason.trim();
    }

    // Validate dates
    if (instance.startDate && instance.endDate && instance.endDate <= instance.startDate) {
      throw new Error('End date must be after start date');
    }

    // Validate URL format
    if (instance.targetUrl && !/^https?:\/\/.+/.test(instance.targetUrl)) {
      throw new Error('Invalid URL format');
    }
  }

  @BeforeSave
  static autoExpire(instance: Advertisement) {
    // Auto-expire ads past their end date
    const now = new Date();
    if (instance.status === 'active' && now > instance.endDate) {
      instance.status = 'expired';
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Calculate and update CTR
   */
  calculateCTR(): number {
    if (this.impressions === 0) {
      this.ctr = 0;
    } else {
      this.ctr = (this.clicks / this.impressions) * 100;
    }
    return this.ctr;
  }

  /**
   * Record impression
   */
  async recordImpression(): Promise<void> {
    this.impressions += 1;
    this.calculateCTR();
    await this.save();
  }

  /**
   * Record click
   */
  async recordClick(): Promise<void> {
    this.clicks += 1;
    this.calculateCTR();
    await this.save();
  }

  /**
   * Get duration in days
   */
  getDurationDays(): number {
    const diff = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if ad is active (all conditions met)
   */
  isActive(): boolean {
    const now = new Date();
    return (
      this.status === 'active' &&
      this.paymentStatus === 'paid' &&
      this.isApproved &&
      now >= this.startDate &&
      now <= this.endDate
    );
  }

  /**
   * Check if ad is pending approval
   */
  isPendingApproval(): boolean {
    return this.status === 'pending' && this.paymentStatus === 'paid';
  }

  /**
   * Approve ad
   */
  async approve(adminId: string): Promise<void> {
    if (this.isApproved) {
      throw new Error('Advertisement is already approved');
    }

    this.isApproved = true;
    this.approvedBy = adminId;
    this.approvedAt = new Date();

    // Auto-activate if payment is complete and dates are valid
    if (this.paymentStatus === 'paid' && this.startDate <= new Date()) {
      this.status = 'active';
    }

    await this.save();
  }

  /**
   * Reject ad
   */
  async reject(adminId: string, reason: string): Promise<void> {
    if (this.isApproved) {
      throw new Error('Cannot reject approved advertisement');
    }

    this.status = 'rejected';
    this.rejectionReason = reason;
    this.approvedBy = adminId;

    await this.save();
  }

  /**
   * Pause ad
   */
  async pause(): Promise<void> {
    if (!this.isActive()) {
      throw new Error('Only active ads can be paused');
    }

    this.status = 'paused';
    await this.save();
  }

  /**
   * Resume ad
   */
  async resume(): Promise<void> {
    if (this.status !== 'paused') {
      throw new Error('Only paused ads can be resumed');
    }

    // Check if still within valid date range
    const now = new Date();
    if (now > this.endDate) {
      this.status = 'expired';
    } else if (this.paymentStatus === 'paid' && this.isApproved) {
      this.status = 'active';
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
   * Get CPM (cost per mille/thousand impressions)
   */
  getCPM(): number {
    if (this.impressions === 0) return 0;
    return (this.totalPrice / this.impressions) * 1000;
  }

  /**
   * Get CPC (cost per click)
   */
  getCPC(): number {
    if (this.clicks === 0) return 0;
    return this.totalPrice / this.clicks;
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary(): {
    impressions: number;
    clicks: number;
    ctr: number;
    cpm: number;
    cpc: number;
  } {
    return {
      impressions: this.impressions,
      clicks: this.clicks,
      ctr: this.ctr,
      cpm: this.getCPM(),
      cpc: this.getCPC(),
    };
  }

  /**
   * Static: Get active ads for placement
   */
  static async getActiveAds(
    placement?: AdPlacement,
    limit: number = 10
  ): Promise<Advertisement[]> {
    const now = new Date();
    const where: any = {
      status: 'active',
      paymentStatus: 'paid',
      isApproved: true,
      startDate: {
        [require('sequelize').Op.lte]: now,
      },
      endDate: {
        [require('sequelize').Op.gte]: now,
      },
    };

    if (placement && placement !== 'all') {
      where.placement = {
        [require('sequelize').Op.in]: [placement, 'all'],
      };
    }

    return await Advertisement.findAll({
      where,
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      include: [
        {
          model: User,
          as: 'advertiser',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });
  }

  /**
   * Static: Get base price for ad type
   */
  static getBasePriceForType(adType: AdType): number {
    const prices: Record<AdType, number> = {
      model1: 50, // 3x1 Banner
      model2: 35, // 1x2 Sidebar
      model3: 20, // 1x1 Card
    };
    return prices[adType];
  }

  /**
   * Static: Calculate total price
   */
  static calculateTotalPrice(
    adType: AdType,
    days: number,
    priority: number = 0
  ): number {
    const basePrice = Advertisement.getBasePriceForType(adType);
    const priorityMultiplier = 1 + priority * 0.1; // 10% per priority level
    return basePrice * days * priorityMultiplier;
  }
}

export default Advertisement;
