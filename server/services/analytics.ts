import { User } from "../models/sql/User.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { Ticket } from "../models/sql/Ticket.model.js";
import { Op, fn, col, literal } from 'sequelize';

/**
 * Analytics Service
 * Provides platform analytics and metrics (Sequelize/PostgreSQL)
 */
class AnalyticsService {
  /**
   * Get platform overview metrics
   */
  async getPlatformOverview(): Promise<any> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalJobs,
      totalContracts,
      totalPayments,
      activeUsers,
      activeJobs,
      activeContracts,
      completedContracts,
      totalRevenue,
    ] = await Promise.all([
      User.count(),
      Job.count(),
      Contract.count(),
      Payment.count(),
      User.count({ where: { lastLogin: { [Op.gte]: thirtyDaysAgo } } }),
      Job.count({ where: { status: "open" } }),
      Contract.count({ where: { status: { [Op.in]: ["pending", "accepted", "in_progress"] } } }),
      Contract.count({ where: { status: "completed" } }),
      Payment.sum('platformFee', { where: { status: "completed" } }),
    ]);

    const result = {
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      jobs: {
        total: totalJobs,
        active: activeJobs,
      },
      contracts: {
        total: totalContracts,
        active: activeContracts,
        completed: completedContracts,
        completionRate: totalContracts > 0 ? (completedContracts / totalContracts) * 100 : 0,
      },
      payments: {
        total: totalPayments,
        revenue: totalRevenue || 0,
      },
    };

    return result;
  }

  /**
   * Get user growth metrics
   */
  async getUserGrowth(days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get users created in the period grouped by date
    const users = await User.findAll({
      where: {
        createdAt: { [Op.gte]: startDate },
      },
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('COUNT', col('id')), 'count'],
      ],
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']],
      raw: true,
    });

    return users.map((u: any) => ({
      _id: u.date,
      count: parseInt(u.count, 10),
    }));
  }

  /**
   * Get job statistics
   */
  async getJobStats(): Promise<any> {
    // Category stats
    const categoryStats = await Job.findAll({
      where: { status: "open" },
      attributes: [
        'category',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['category'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit: 10,
      raw: true,
    });

    // Average price
    const avgPrice = await Job.findOne({
      where: { status: "open" },
      attributes: [[fn('AVG', col('price')), 'avgPrice']],
      raw: true,
    });

    // Price range
    const priceRange = await Job.findOne({
      where: { status: "open" },
      attributes: [
        [fn('MIN', col('price')), 'minPrice'],
        [fn('MAX', col('price')), 'maxPrice'],
      ],
      raw: true,
    });

    const result = {
      byCategory: categoryStats.map((c: any) => ({
        _id: c.category,
        count: parseInt(c.count, 10),
      })),
      averagePrice: parseFloat((avgPrice as any)?.avgPrice) || 0,
      priceRange: {
        minPrice: parseFloat((priceRange as any)?.minPrice) || 0,
        maxPrice: parseFloat((priceRange as any)?.maxPrice) || 0,
      },
    };

    return result;
  }

  /**
   * Get contract analytics
   */
  async getContractAnalytics(days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Status breakdown
    const statusBreakdown = await Contract.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    // Average duration for completed contracts (in days)
    const completedContracts = await Contract.findAll({
      where: {
        status: "completed",
        startDate: { [Op.ne]: null },
        endDate: { [Op.ne]: null },
      },
      attributes: ['startDate', 'endDate'],
      raw: true,
    });

    let avgDuration = 0;
    if (completedContracts.length > 0) {
      const durations = completedContracts.map((c: any) => {
        const start = new Date(c.startDate).getTime();
        const end = new Date(c.endDate).getTime();
        return (end - start) / (1000 * 60 * 60 * 24); // Convert to days
      });
      avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    // Success rate for contracts created in the period
    const [totalInPeriod, completedInPeriod] = await Promise.all([
      Contract.count({ where: { createdAt: { [Op.gte]: startDate } } }),
      Contract.count({ where: { createdAt: { [Op.gte]: startDate }, status: "completed" } }),
    ]);

    const result = {
      statusBreakdown: statusBreakdown.map((s: any) => ({
        _id: s.status,
        count: parseInt(s.count, 10),
      })),
      averageDuration: avgDuration,
      successRate: totalInPeriod > 0 ? (completedInPeriod / totalInPeriod) * 100 : 0,
    };

    return result;
  }

  /**
   * Get payment analytics
   */
  async getPaymentAnalytics(days: number = 30): Promise<any> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Revenue by day
    const revenueByDay = await Payment.findAll({
      where: {
        createdAt: { [Op.gte]: startDate },
        status: "completed",
      },
      attributes: [
        [fn('DATE', col('createdAt')), 'date'],
        [fn('SUM', col('platformFee')), 'revenue'],
        [fn('SUM', col('amount')), 'volume'],
        [fn('COUNT', col('id')), 'count'],
      ],
      group: [fn('DATE', col('createdAt'))],
      order: [[fn('DATE', col('createdAt')), 'ASC']],
      raw: true,
    });

    // Total volume
    const totalVolume = await Payment.sum('amount', {
      where: {
        createdAt: { [Op.gte]: startDate },
        status: "completed",
      },
    });

    // Average transaction
    const avgTransaction = await Payment.findOne({
      where: {
        createdAt: { [Op.gte]: startDate },
        status: "completed",
      },
      attributes: [[fn('AVG', col('amount')), 'avg']],
      raw: true,
    });

    const result = {
      revenueByDay: revenueByDay.map((r: any) => ({
        _id: r.date,
        revenue: parseFloat(r.revenue) || 0,
        volume: parseFloat(r.volume) || 0,
        count: parseInt(r.count, 10),
      })),
      totalVolume: totalVolume || 0,
      averageTransaction: parseFloat((avgTransaction as any)?.avg) || 0,
    };

    return result;
  }

  /**
   * Get user trust score distribution
   */
  async getTrustScoreDistribution(): Promise<any> {
    // Get all users with their trust scores and ratings
    const users = await User.findAll({
      attributes: ['trustScore', 'rating'],
      raw: true,
    });

    // Bucket users by trust score ranges
    const buckets = [
      { min: 0, max: 20, count: 0, totalRating: 0 },
      { min: 20, max: 40, count: 0, totalRating: 0 },
      { min: 40, max: 60, count: 0, totalRating: 0 },
      { min: 60, max: 80, count: 0, totalRating: 0 },
      { min: 80, max: 100, count: 0, totalRating: 0 },
    ];

    users.forEach((user: any) => {
      const score = parseFloat(user.trustScore) || 0;
      const rating = parseFloat(user.rating) || 0;

      for (const bucket of buckets) {
        if (score >= bucket.min && score < bucket.max) {
          bucket.count++;
          bucket.totalRating += rating;
          break;
        }
      }
    });

    return buckets.map(b => ({
      _id: b.min,
      count: b.count,
      avgRating: b.count > 0 ? b.totalRating / b.count : 0,
    }));
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<any> {
    // Status breakdown
    const statusBreakdown = await Ticket.findAll({
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    // Category breakdown
    const categoryBreakdown = await Ticket.findAll({
      attributes: [
        'category',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['category'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      raw: true,
    });

    // Average resolution time for resolved tickets
    const resolvedTickets = await Ticket.findAll({
      where: {
        status: "resolved",
        resolvedAt: { [Op.ne]: null },
      },
      attributes: ['createdAt', 'resolvedAt'],
      raw: true,
    });

    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const times = resolvedTickets.map((t: any) => {
        const created = new Date(t.createdAt).getTime();
        const resolved = new Date(t.resolvedAt).getTime();
        return (resolved - created) / (1000 * 60 * 60); // Convert to hours
      });
      avgResolutionTime = times.reduce((a, b) => a + b, 0) / times.length;
    }

    const result = {
      byStatus: statusBreakdown.map((s: any) => ({
        _id: s.status,
        count: parseInt(s.count, 10),
      })),
      byCategory: categoryBreakdown.map((c: any) => ({
        _id: c.category,
        count: parseInt(c.count, 10),
      })),
      avgResolutionTime,
    };

    return result;
  }

  /**
   * Track event (for custom analytics)
   */
  async trackEvent(event: {
    userId?: string;
    eventType: string;
    eventData?: any;
    metadata?: any;
  }): Promise<void> {
    // Log analytics event
    console.log("Analytics event:", event);
  }
}

export default new AnalyticsService();
