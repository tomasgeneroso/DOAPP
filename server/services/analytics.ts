import { User } from "../models/sql/User.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { Ticket } from "../models/sql/Ticket.model.js";
import cache from "./cache.js";
import { Op } from 'sequelize';

/**
 * Analytics Service
 * Provides platform analytics and metrics
 */
class AnalyticsService {
  /**
   * Get platform overview metrics
   */
  async getPlatformOverview(): Promise<any> {
    const cacheKey = "analytics:platform:overview";

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

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
      User.countDocuments(),
      Job.countDocuments(),
      Contract.countDocuments(),
      Payment.countDocuments(),
      User.countDocuments({ lastLogin: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      Job.count({ where: { status: "open" } }),
      Contract.countDocuments({ status: { [Op.in]: ["pending", "accepted", "in_progress"] } }),
      Contract.count({ where: { status: "completed" } }),
      Payment.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$platformFee" } } },
      ]),
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
        revenue: totalRevenue[0]?.total || 0,
      },
    };

    // Cache for 10 minutes
    await cache.set(cacheKey, result, 600);
    return result;
  }

  /**
   * Get user growth metrics
   */
  async getUserGrowth(days: number = 30): Promise<any> {
    const cacheKey = `analytics:user:growth:${days}`;

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const growth = await User.aggregate([
      {
        $match: {
          createdAt: { [Op.gte]: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Cache for 1 hour
    await cache.set(cacheKey, growth, 3600);
    return growth;
  }

  /**
   * Get job statistics
   */
  async getJobStats(): Promise<any> {
    const cacheKey = "analytics:jobs:stats";

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const [categoryStats, avgPrice, priceRange] = await Promise.all([
      Job.aggregate([
        { $match: { status: "open" } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Job.aggregate([
        { $match: { status: "open" } },
        { $group: { _id: null, avgPrice: { $avg: "$price" } } },
      ]),
      Job.aggregate([
        { $match: { status: "open" } },
        {
          $group: {
            _id: null,
            minPrice: { $min: "$price" },
            maxPrice: { $max: "$price" },
          },
        },
      ]),
    ]);

    const result = {
      byCategory: categoryStats,
      averagePrice: avgPrice[0]?.avgPrice || 0,
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 },
    };

    // Cache for 30 minutes
    await cache.set(cacheKey, result, 1800);
    return result;
  }

  /**
   * Get contract analytics
   */
  async getContractAnalytics(days: number = 30): Promise<any> {
    const cacheKey = `analytics:contracts:${days}`;

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [statusBreakdown, avgDuration, successRate] = await Promise.all([
      Contract.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Contract.aggregate([
        {
          $match: {
            status: "completed",
            startDate: { $exists: true },
            endDate: { $exists: true },
          },
        },
        {
          $project: {
            duration: {
              $divide: [
                { $subtract: ["$endDate", "$startDate"] },
                1000 * 60 * 60 * 24, // Convert to days
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: "$duration" },
          },
        },
      ]),
      Contract.aggregate([
        {
          $match: {
            createdAt: { [Op.gte]: startDate },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const result = {
      statusBreakdown,
      averageDuration: avgDuration[0]?.avgDuration || 0,
      successRate: successRate[0]
        ? (successRate[0].completed / successRate[0].total) * 100
        : 0,
    };

    // Cache for 1 hour
    await cache.set(cacheKey, result, 3600);
    return result;
  }

  /**
   * Get payment analytics
   */
  async getPaymentAnalytics(days: number = 30): Promise<any> {
    const cacheKey = `analytics:payments:${days}`;

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [revenueByDay, totalVolume, avgTransaction] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            createdAt: { [Op.gte]: startDate },
            status: "completed",
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            revenue: { $sum: "$platformFee" },
            volume: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]),
      Payment.aggregate([
        {
          $match: {
            createdAt: { [Op.gte]: startDate },
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
      Payment.aggregate([
        {
          $match: {
            createdAt: { [Op.gte]: startDate },
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            avg: { $avg: "$amount" },
          },
        },
      ]),
    ]);

    const result = {
      revenueByDay,
      totalVolume: totalVolume[0]?.total || 0,
      averageTransaction: avgTransaction[0]?.avg || 0,
    };

    // Cache for 1 hour
    await cache.set(cacheKey, result, 3600);
    return result;
  }

  /**
   * Get user trust score distribution
   */
  async getTrustScoreDistribution(): Promise<any> {
    const cacheKey = "analytics:trust:distribution";

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const distribution = await User.aggregate([
      {
        $bucket: {
          groupBy: "$trustScore",
          boundaries: [0, 20, 40, 60, 80, 100],
          default: "other",
          output: {
            count: { $sum: 1 },
            avgRating: { $avg: "$rating" },
          },
        },
      },
    ]);

    // Cache for 1 hour
    await cache.set(cacheKey, distribution, 3600);
    return distribution;
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<any> {
    const cacheKey = "analytics:tickets:stats";

    // Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const [statusBreakdown, categoryBreakdown, avgResolutionTime] = await Promise.all([
      Ticket.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Ticket.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Ticket.aggregate([
        {
          $match: {
            status: "resolved",
            resolvedAt: { $exists: true },
          },
        },
        {
          $project: {
            resolutionTime: {
              $divide: [
                { $subtract: ["$resolvedAt", "$createdAt"] },
                1000 * 60 * 60, // Convert to hours
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$resolutionTime" },
          },
        },
      ]),
    ]);

    const result = {
      byStatus: statusBreakdown,
      byCategory: categoryBreakdown,
      avgResolutionTime: avgResolutionTime[0]?.avgTime || 0,
    };

    // Cache for 30 minutes
    await cache.set(cacheKey, result, 1800);
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
    // You can store events in a separate collection or send to external analytics
    console.log("Analytics event:", event);

    // Increment event counter in cache
    const key = `analytics:event:${event.eventType}`;
    await cache.increment(key, 24 * 60 * 60); // 24 hour TTL
  }

  /**
   * Clear analytics cache
   */
  async clearCache(): Promise<boolean> {
    return await cache.delPattern("analytics:*");
  }
}

export default new AnalyticsService();
