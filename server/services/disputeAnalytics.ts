import { Dispute } from "../models/sql/Dispute.model.js";
import cache from './cache.js';
import { addBreadcrumb, captureException } from '../config/sentry.js';
import { Op } from 'sequelize';

interface DisputeMetrics {
  totalDisputes: number;
  openDisputes: number;
  resolvedDisputes: number;
  averageResolutionTime: number; // in hours
  resolutionRate: number; // percentage
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byResolutionType: Record<string, number>;
  trendData: {
    date: string;
    created: number;
    resolved: number;
  }[];
}

interface DisputePerformance {
  fastestResolution: number; // hours
  slowestResolution: number; // hours
  averageMessagesPerDispute: number;
  averageEvidencePerDispute: number;
  topCategories: {
    category: string;
    count: number;
    percentage: number;
  }[];
}

/**
 * Get comprehensive dispute analytics
 */
export async function getDisputeMetrics(
  startDate?: Date,
  endDate?: Date
): Promise<DisputeMetrics> {
  try {
    const cacheKey = `dispute_metrics:${startDate?.toISOString() || 'all'}:${endDate?.toISOString() || 'all'}`;
    const cached = await cache.get<DisputeMetrics>(cacheKey);
    if (cached) return cached;

    const query: any = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    // Get all disputes
    const disputes = await Dispute.find(query);

    // Calculate metrics
    const totalDisputes = disputes.length;
    const openDisputes = disputes.filter((d) => d.status === 'open').length;
    const resolvedDisputes = disputes.filter((d) =>
      ['resolved_released', 'resolved_refunded', 'resolved_partial'].includes(d.status)
    ).length;

    // Calculate average resolution time
    const resolvedWithTime = disputes.filter((d) => d.resolvedAt && d.createdAt);
    const totalResolutionTime = resolvedWithTime.reduce((sum, d) => {
      const diff = d.resolvedAt!.getTime() - d.createdAt!.getTime();
      return sum + diff;
    }, 0);
    const averageResolutionTime = resolvedWithTime.length
      ? totalResolutionTime / resolvedWithTime.length / (1000 * 60 * 60) // Convert to hours
      : 0;

    // Resolution rate
    const resolutionRate = totalDisputes > 0 ? (resolvedDisputes / totalDisputes) * 100 : 0;

    // Group by category
    const byCategory = disputes.reduce(
      (acc, d) => {
        acc[d.category] = (acc[d.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Group by priority
    const byPriority = disputes.reduce(
      (acc, d) => {
        acc[d.priority] = (acc[d.priority] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Group by resolution type
    const byResolutionType = disputes
      .filter((d) => d.resolutionType)
      .reduce(
        (acc, d) => {
          acc[d.resolutionType!] = (acc[d.resolutionType!] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

    // Trend data (last 30 days)
    const trendData = generateTrendData(disputes, 30);

    const metrics: DisputeMetrics = {
      totalDisputes,
      openDisputes,
      resolvedDisputes,
      averageResolutionTime: Math.round(averageResolutionTime * 100) / 100,
      resolutionRate: Math.round(resolutionRate * 100) / 100,
      byCategory,
      byPriority,
      byResolutionType,
      trendData,
    };

    // Cache for 30 minutes
    await cache.set(cacheKey, metrics, 1800);

    addBreadcrumb('Dispute metrics calculated', 'analytics', 'info', {
      totalDisputes,
      resolvedDisputes,
    });

    return metrics;
  } catch (error) {
    captureException(error as Error, { function: 'getDisputeMetrics' });
    throw error;
  }
}

/**
 * Get dispute performance analytics
 */
export async function getDisputePerformance(): Promise<DisputePerformance> {
  try {
    const cacheKey = 'dispute_performance';
    const cached = await cache.get<DisputePerformance>(cacheKey);
    if (cached) return cached;

    const disputes = await Dispute.find({
      status: { [Op.in]: ['resolved_released', 'resolved_refunded', 'resolved_partial'] },
      resolvedAt: { $exists: true },
    });

    // Calculate resolution times
    const resolutionTimes = disputes.map((d) => {
      const diff = d.resolvedAt!.getTime() - d.createdAt!.getTime();
      return diff / (1000 * 60 * 60); // hours
    });

    const fastestResolution = Math.min(...resolutionTimes);
    const slowestResolution = Math.max(...resolutionTimes);

    // Average messages per dispute
    const totalMessages = disputes.reduce((sum, d) => sum + d.messages.length, 0);
    const averageMessagesPerDispute = disputes.length
      ? Math.round((totalMessages / disputes.length) * 100) / 100
      : 0;

    // Average evidence per dispute
    const totalEvidence = disputes.reduce((sum, d) => sum + d.evidence.length, 0);
    const averageEvidencePerDispute = disputes.length
      ? Math.round((totalEvidence / disputes.length) * 100) / 100
      : 0;

    // Top categories
    const allDisputes = await Dispute.findAll({ where: {} });
    const categoryCounts = allDisputes.reduce(
      (acc, d) => {
        acc[d.category] = (acc[d.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const topCategories = Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / allDisputes.length) * 10000) / 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const performance: DisputePerformance = {
      fastestResolution: Math.round(fastestResolution * 100) / 100,
      slowestResolution: Math.round(slowestResolution * 100) / 100,
      averageMessagesPerDispute,
      averageEvidencePerDispute,
      topCategories,
    };

    // Cache for 1 hour
    await cache.set(cacheKey, performance, 3600);

    return performance;
  } catch (error) {
    captureException(error as Error, { function: 'getDisputePerformance' });
    throw error;
  }
}

/**
 * Track dispute event for analytics
 */
export async function trackDisputeEvent(
  event: 'created' | 'assigned' | 'resolved' | 'message_added' | 'evidence_added',
  disputeId: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    addBreadcrumb(`Dispute ${event}`, 'dispute', 'info', {
      disputeId,
      ...metadata,
    });

    // Increment counter in cache
    const dateKey = new Date().toISOString().split('T')[0];
    const counterKey = `dispute_events:${event}:${dateKey}`;
    await cache.increment(counterKey);

    // Set expiration for 90 days
    const TTL_90_DAYS = 90 * 24 * 60 * 60;
    // Note: Would need to implement TTL in cache.increment or set separately
  } catch (error) {
    console.error('Error tracking dispute event:', error);
    // Don't throw - tracking errors shouldn't break the flow
  }
}

/**
 * Generate trend data for disputes
 */
function generateTrendData(
  disputes: any[],
  days: number
): { date: string; created: number; resolved: number }[] {
  const trendMap = new Map<string, { created: number; resolved: number }>();

  // Initialize last N days
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    trendMap.set(dateKey, { created: 0, resolved: 0 });
  }

  // Count created disputes
  disputes.forEach((dispute) => {
    const createdDate = new Date(dispute.createdAt).toISOString().split('T')[0];
    if (trendMap.has(createdDate)) {
      const data = trendMap.get(createdDate)!;
      data.created++;
    }

    // Count resolved disputes
    if (dispute.resolvedAt) {
      const resolvedDate = new Date(dispute.resolvedAt).toISOString().split('T')[0];
      if (trendMap.has(resolvedDate)) {
        const data = trendMap.get(resolvedDate)!;
        data.resolved++;
      }
    }
  });

  // Convert to array and sort by date
  return Array.from(trendMap.entries())
    .map(([date, data]) => ({
      date,
      ...data,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get dispute health score (0-100)
 * Based on resolution rate, average resolution time, and open disputes
 */
export async function getDisputeHealthScore(): Promise<number> {
  try {
    const metrics = await getDisputeMetrics();

    // Factors:
    // 1. Resolution rate (40% weight) - higher is better
    // 2. Average resolution time (30% weight) - lower is better (target: 48 hours)
    // 3. Open disputes ratio (30% weight) - lower is better

    const resolutionScore = metrics.resolutionRate * 0.4;

    // Target: 48 hours, penalize if higher
    const TARGET_HOURS = 48;
    const timeScore =
      metrics.averageResolutionTime > 0
        ? Math.max(0, (1 - metrics.averageResolutionTime / (TARGET_HOURS * 2)) * 100) * 0.3
        : 30;

    const openRatio = metrics.totalDisputes > 0 ? metrics.openDisputes / metrics.totalDisputes : 0;
    const openScore = (1 - openRatio) * 100 * 0.3;

    const healthScore = Math.round(resolutionScore + timeScore + openScore);

    return Math.min(100, Math.max(0, healthScore));
  } catch (error) {
    captureException(error as Error, { function: 'getDisputeHealthScore' });
    return 0;
  }
}

export default {
  getDisputeMetrics,
  getDisputePerformance,
  trackDisputeEvent,
  getDisputeHealthScore,
};
