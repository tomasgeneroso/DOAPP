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
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * UserAnalytics Model - PostgreSQL/Sequelize
 *
 * Analytics completos para SUPER_PRO membership con:
 * - Profile visits tracking
 * - Conversations analytics
 * - Contracts performance
 * - Search appearances
 * - Engagement metrics
 * - Peak activity patterns
 */

// ============================================
// TYPES
// ============================================

export interface IProfileView {
  visitorId?: string; // UUID or undefined for anonymous
  timestamp: Date;
  referrer?: string;
}

export interface IConversationPartner {
  userId: string;
  hadContract: boolean;
  contractsCount: number;
  lastMessageAt: Date;
}

export interface ICategoryStats {
  category: string;
  count: number;
  earnings: number;
}

export interface IMonthlyStats {
  month: string; // YYYY-MM
  completed: number;
  earnings: number;
  averageValue: number;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'user_analytics',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'], unique: true },
    { fields: ['last_calculated'] },
  ],
})
export class UserAnalytics extends Model {
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

  // ============================================
  // PROFILE VIEWS
  // ============================================

  @Default(0)
  @Index
  @Column(DataType.INTEGER)
  profileViewsTotal!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  profileViewsUnique!: number;

  @Default([])
  @Column(DataType.JSONB)
  profileViewsHistory!: IProfileView[];

  // ============================================
  // CONVERSATIONS
  // ============================================

  @Default(0)
  @Column(DataType.INTEGER)
  conversationsTotal!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  conversationsWithCompletedContract!: number;

  @Default([])
  @Column(DataType.JSONB)
  conversationPartners!: IConversationPartner[];

  // ============================================
  // CONTRACTS
  // ============================================

  @Default(0)
  @Column(DataType.INTEGER)
  contractsTotalCompleted!: number;

  @Default(0)
  @Index
  @Column(DataType.DECIMAL(12, 2))
  contractsTotalEarnings!: number;

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  contractsAverageRating!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  contractsRepeatClients!: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  contractsSuccessRate!: number; // Percentage

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  contractsAverageCompletionTime!: number; // Days

  @Default([])
  @Column(DataType.JSONB)
  contractsByCategory!: ICategoryStats[];

  @Default([])
  @Column(DataType.JSONB)
  contractsMonthlyStats!: IMonthlyStats[];

  // ============================================
  // SEARCH & DISCOVERY
  // ============================================

  @Default(0)
  @Column(DataType.INTEGER)
  searchAppearancesTotal!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  searchClickedFromSearch!: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  searchClickThroughRate!: number; // Percentage

  // ============================================
  // ENGAGEMENT
  // ============================================

  @Default(0)
  @Column(DataType.INTEGER)
  engagementProposalsSent!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  engagementProposalsAccepted!: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  engagementAcceptanceRate!: number; // Percentage

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  engagementAverageResponseTime!: number; // Hours

  @Default(0)
  @Column(DataType.INTEGER)
  engagementJobsPosted!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  engagementJobsCompleted!: number;

  // ============================================
  // PEAK ACTIVITY
  // ============================================

  @Column(DataType.STRING(20))
  peakActivityMostActiveDay?: string; // Monday, Tuesday, etc.

  @Column(DataType.INTEGER)
  peakActivityMostActiveHour?: number; // 0-23

  @Column(DataType.STRING(20))
  peakActivityMostActiveMonth?: string; // January, February, etc.

  // ============================================
  // METADATA
  // ============================================

  @Default(() => new Date())
  @Index
  @Column(DataType.DATE)
  lastCalculated!: Date;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Record profile view
   */
  async recordProfileView(visitorId?: string, referrer?: string): Promise<void> {
    this.profileViewsTotal += 1;

    // Check if unique visitor
    if (
      visitorId &&
      !this.profileViewsHistory.some((v) => v.visitorId === visitorId)
    ) {
      this.profileViewsUnique += 1;
    }

    // Add to history (keep last 100)
    this.profileViewsHistory.push({
      visitorId,
      timestamp: new Date(),
      referrer,
    });

    if (this.profileViewsHistory.length > 100) {
      this.profileViewsHistory = this.profileViewsHistory.slice(-100);
    }

    await this.save();
  }

  /**
   * Calculate search CTR
   */
  calculateSearchCTR(): void {
    if (this.searchAppearancesTotal === 0) {
      this.searchClickThroughRate = 0;
    } else {
      this.searchClickThroughRate =
        (this.searchClickedFromSearch / this.searchAppearancesTotal) * 100;
    }
  }

  /**
   * Calculate engagement acceptance rate
   */
  calculateAcceptanceRate(): void {
    if (this.engagementProposalsSent === 0) {
      this.engagementAcceptanceRate = 0;
    } else {
      this.engagementAcceptanceRate =
        (this.engagementProposalsAccepted / this.engagementProposalsSent) * 100;
    }
  }

  /**
   * Add conversation partner
   */
  addConversationPartner(
    partnerId: string,
    hadContract: boolean = false
  ): void {
    const existing = this.conversationPartners.find((p) => p.userId === partnerId);

    if (existing) {
      existing.lastMessageAt = new Date();
      if (hadContract) {
        existing.hadContract = true;
        existing.contractsCount += 1;
      }
    } else {
      this.conversationPartners.push({
        userId: partnerId,
        hadContract,
        contractsCount: hadContract ? 1 : 0,
        lastMessageAt: new Date(),
      });

      this.conversationsTotal += 1;
      if (hadContract) {
        this.conversationsWithCompletedContract += 1;
      }
    }
  }

  /**
   * Add contract stats
   */
  addContractStats(
    category: string,
    earnings: number,
    rating: number,
    month: string
  ): void {
    // Update totals
    this.contractsTotalCompleted += 1;
    this.contractsTotalEarnings = Number(this.contractsTotalEarnings) + earnings;

    // Update average rating
    this.contractsAverageRating =
      (Number(this.contractsAverageRating) * (this.contractsTotalCompleted - 1) +
        rating) /
      this.contractsTotalCompleted;

    // Update category stats
    const categoryStats = this.contractsByCategory.find((c) => c.category === category);
    if (categoryStats) {
      categoryStats.count += 1;
      categoryStats.earnings += earnings;
    } else {
      this.contractsByCategory.push({
        category,
        count: 1,
        earnings,
      });
    }

    // Update monthly stats
    const monthlyStats = this.contractsMonthlyStats.find((m) => m.month === month);
    if (monthlyStats) {
      monthlyStats.completed += 1;
      monthlyStats.earnings += earnings;
      monthlyStats.averageValue = monthlyStats.earnings / monthlyStats.completed;
    } else {
      this.contractsMonthlyStats.push({
        month,
        completed: 1,
        earnings,
        averageValue: earnings,
      });
    }
  }

  /**
   * Mark as recalculated
   */
  async markAsRecalculated(): Promise<void> {
    this.lastCalculated = new Date();
    await this.save();
  }

  /**
   * Get top earning category
   */
  getTopEarningCategory(): ICategoryStats | null {
    if (this.contractsByCategory.length === 0) return null;

    return this.contractsByCategory.reduce((max, current) =>
      current.earnings > max.earnings ? current : max
    );
  }

  /**
   * Get best performing month
   */
  getBestPerformingMonth(): IMonthlyStats | null {
    if (this.contractsMonthlyStats.length === 0) return null;

    return this.contractsMonthlyStats.reduce((max, current) =>
      current.earnings > max.earnings ? current : max
    );
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary(): {
    profileViews: { total: number; unique: number };
    contracts: { completed: number; earnings: number; rating: number };
    engagement: { proposalsSent: number; acceptanceRate: number };
    search: { appearances: number; ctr: number };
  } {
    return {
      profileViews: {
        total: this.profileViewsTotal,
        unique: this.profileViewsUnique,
      },
      contracts: {
        completed: this.contractsTotalCompleted,
        earnings: Number(this.contractsTotalEarnings),
        rating: Number(this.contractsAverageRating),
      },
      engagement: {
        proposalsSent: this.engagementProposalsSent,
        acceptanceRate: Number(this.engagementAcceptanceRate),
      },
      search: {
        appearances: this.searchAppearancesTotal,
        ctr: Number(this.searchClickThroughRate),
      },
    };
  }

  /**
   * Check if needs recalculation (older than 24 hours)
   */
  needsRecalculation(): boolean {
    const now = new Date();
    const hoursSinceLastCalc =
      (now.getTime() - this.lastCalculated.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastCalc > 24;
  }

  /**
   * Static: Get or create analytics for user
   */
  static async getOrCreate(userId: string): Promise<UserAnalytics> {
    let analytics = await UserAnalytics.findOne({ where: { userId } });

    if (!analytics) {
      analytics = await UserAnalytics.create({
        userId,
        lastCalculated: new Date(),
      });
    }

    return analytics;
  }
}

export default UserAnalytics;
