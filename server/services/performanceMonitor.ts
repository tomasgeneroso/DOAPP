/**
 * Performance Monitor Service
 * Tracks and analyzes application performance metrics
 */

interface RequestMetric {
  route: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  userId?: string;
  userAgent?: string;
  ip?: string;
}

interface RouteStats {
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  errorCount: number;
  errorRate: number;
  responseTimes: number[];
}

interface PerformanceThresholds {
  warningMs: number;
  criticalMs: number;
  targetP95Ms: number;
  targetP99Ms: number;
}

// Default thresholds based on industry standards
const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  warningMs: 500,    // Warning if response > 500ms
  criticalMs: 2000,  // Critical if response > 2s
  targetP95Ms: 1000, // P95 should be under 1s
  targetP99Ms: 2000, // P99 should be under 2s
};

// Route-specific thresholds (some routes are expected to be slower)
const ROUTE_THRESHOLDS: Record<string, Partial<PerformanceThresholds>> = {
  '/api/jobs/search': { warningMs: 800, criticalMs: 3000, targetP95Ms: 1500 },
  '/api/admin/analytics': { warningMs: 1000, criticalMs: 5000, targetP95Ms: 2000 },
  '/api/chat/conversations': { warningMs: 600, criticalMs: 2500, targetP95Ms: 1200 },
  '/api/contracts': { warningMs: 600, criticalMs: 2500, targetP95Ms: 1200 },
  '/api/proposals': { warningMs: 500, criticalMs: 2000, targetP95Ms: 1000 },
};

class PerformanceMonitor {
  private metrics: RequestMetric[] = [];
  private routeStats: Map<string, RouteStats> = new Map();
  private maxMetricsHistory = 10000; // Keep last 10k requests
  private thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS;
  private startTime: Date = new Date();
  private slowRequests: RequestMetric[] = [];
  private maxSlowRequests = 100;

  /**
   * Record a request metric
   */
  recordRequest(metric: RequestMetric): void {
    // Add to metrics history
    this.metrics.push(metric);

    // Trim old metrics if needed
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Update route stats
    this.updateRouteStats(metric);

    // Track slow requests
    const routeThreshold = this.getThresholdForRoute(metric.route);
    if (metric.responseTime > routeThreshold.warningMs) {
      this.slowRequests.push(metric);
      if (this.slowRequests.length > this.maxSlowRequests) {
        this.slowRequests = this.slowRequests.slice(-this.maxSlowRequests);
      }
    }

    // Log critical requests
    if (metric.responseTime > routeThreshold.criticalMs) {
      console.warn(`🐌 CRITICAL SLOW REQUEST: ${metric.method} ${metric.route} - ${metric.responseTime}ms`);
    }
  }

  /**
   * Get threshold for a specific route
   */
  private getThresholdForRoute(route: string): PerformanceThresholds {
    // Normalize route (remove IDs)
    const normalizedRoute = this.normalizeRoute(route);

    // Check for route-specific thresholds
    for (const [pattern, thresholds] of Object.entries(ROUTE_THRESHOLDS)) {
      if (normalizedRoute.startsWith(pattern)) {
        return { ...this.thresholds, ...thresholds };
      }
    }

    return this.thresholds;
  }

  /**
   * Normalize route by replacing IDs with :id
   */
  private normalizeRoute(route: string): string {
    return route
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id') // UUID
      .replace(/\/[0-9a-f]{24}/gi, '/:id') // MongoDB ObjectId
      .replace(/\/\d+/g, '/:id'); // Numeric IDs
  }

  /**
   * Update route statistics
   */
  private updateRouteStats(metric: RequestMetric): void {
    const routeKey = `${metric.method}:${this.normalizeRoute(metric.route)}`;

    let stats = this.routeStats.get(routeKey);

    if (!stats) {
      stats = {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errorCount: 0,
        errorRate: 0,
        responseTimes: [],
      };
    }

    stats.count++;
    stats.totalTime += metric.responseTime;
    stats.avgTime = stats.totalTime / stats.count;
    stats.minTime = Math.min(stats.minTime, metric.responseTime);
    stats.maxTime = Math.max(stats.maxTime, metric.responseTime);

    if (metric.statusCode >= 400) {
      stats.errorCount++;
    }
    stats.errorRate = (stats.errorCount / stats.count) * 100;

    // Keep last 1000 response times for percentile calculations
    stats.responseTimes.push(metric.responseTime);
    if (stats.responseTimes.length > 1000) {
      stats.responseTimes = stats.responseTimes.slice(-1000);
    }

    // Calculate percentiles
    const sorted = [...stats.responseTimes].sort((a, b) => a - b);
    stats.p50 = this.percentile(sorted, 50);
    stats.p95 = this.percentile(sorted, 95);
    stats.p99 = this.percentile(sorted, 99);

    this.routeStats.set(routeKey, stats);
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get overall performance summary
   */
  getSummary(): {
    uptime: number;
    totalRequests: number;
    requestsPerMinute: number;
    avgResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    slowRequestCount: number;
    healthScore: number;
  } {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    const totalRequests = this.metrics.length;
    const requestsPerMinute = totalRequests / (uptime / 60);

    if (totalRequests === 0) {
      return {
        uptime,
        totalRequests: 0,
        requestsPerMinute: 0,
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        errorRate: 0,
        slowRequestCount: 0,
        healthScore: 100,
      };
    }

    const responseTimes = this.metrics.map(m => m.responseTime);
    const sorted = [...responseTimes].sort((a, b) => a - b);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const errorCount = this.metrics.filter(m => m.statusCode >= 400).length;

    const p50 = this.percentile(sorted, 50);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    // Calculate health score (0-100)
    let healthScore = 100;

    // Deduct points for high response times
    if (p95 > this.thresholds.targetP95Ms) {
      healthScore -= Math.min(30, ((p95 - this.thresholds.targetP95Ms) / this.thresholds.targetP95Ms) * 30);
    }
    if (p99 > this.thresholds.targetP99Ms) {
      healthScore -= Math.min(20, ((p99 - this.thresholds.targetP99Ms) / this.thresholds.targetP99Ms) * 20);
    }

    // Deduct points for error rate
    const errorRate = (errorCount / totalRequests) * 100;
    if (errorRate > 1) {
      healthScore -= Math.min(30, errorRate * 3);
    }

    // Deduct points for slow requests
    const slowRequestRate = (this.slowRequests.length / totalRequests) * 100;
    if (slowRequestRate > 5) {
      healthScore -= Math.min(20, slowRequestRate * 2);
    }

    return {
      uptime: Math.round(uptime),
      totalRequests,
      requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      p50ResponseTime: Math.round(p50),
      p95ResponseTime: Math.round(p95),
      p99ResponseTime: Math.round(p99),
      errorRate: Math.round(errorRate * 100) / 100,
      slowRequestCount: this.slowRequests.length,
      healthScore: Math.max(0, Math.round(healthScore)),
    };
  }

  /**
   * Get route-by-route performance breakdown
   */
  getRouteBreakdown(): Array<{
    route: string;
    method: string;
    count: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    p50: number;
    p95: number;
    p99: number;
    errorRate: number;
    status: 'good' | 'warning' | 'critical';
    recommendation?: string;
  }> {
    const breakdown: Array<any> = [];

    for (const [key, stats] of this.routeStats.entries()) {
      const [method, route] = key.split(':');
      const thresholds = this.getThresholdForRoute(route);

      let status: 'good' | 'warning' | 'critical' = 'good';
      let recommendation: string | undefined;

      if (stats.p95 > thresholds.criticalMs) {
        status = 'critical';
        recommendation = `P95 (${stats.p95}ms) exceeds critical threshold (${thresholds.criticalMs}ms). Consider adding caching, optimizing queries, or adding indexes.`;
      } else if (stats.p95 > thresholds.warningMs) {
        status = 'warning';
        recommendation = `P95 (${stats.p95}ms) exceeds warning threshold (${thresholds.warningMs}ms). Monitor closely and consider optimization.`;
      }

      if (stats.errorRate > 5) {
        status = 'critical';
        recommendation = `High error rate (${stats.errorRate.toFixed(1)}%). Investigate error logs.`;
      } else if (stats.errorRate > 1) {
        if (status !== 'critical') status = 'warning';
        recommendation = recommendation || `Elevated error rate (${stats.errorRate.toFixed(1)}%). Review error handling.`;
      }

      breakdown.push({
        route,
        method,
        count: stats.count,
        avgTime: Math.round(stats.avgTime),
        minTime: Math.round(stats.minTime),
        maxTime: Math.round(stats.maxTime),
        p50: Math.round(stats.p50),
        p95: Math.round(stats.p95),
        p99: Math.round(stats.p99),
        errorRate: Math.round(stats.errorRate * 100) / 100,
        status,
        recommendation,
      });
    }

    // Sort by p95 descending (slowest first)
    return breakdown.sort((a, b) => b.p95 - a.p95);
  }

  /**
   * Get slow requests list
   */
  getSlowRequests(): RequestMetric[] {
    return [...this.slowRequests].sort((a, b) => b.responseTime - a.responseTime);
  }

  /**
   * Get recent metrics for real-time monitoring
   */
  getRecentMetrics(minutes: number = 5): RequestMetric[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Get requests per minute over time (for charts)
   */
  getRequestsOverTime(intervalMinutes: number = 1, periods: number = 60): Array<{
    timestamp: Date;
    requests: number;
    avgResponseTime: number;
    errorRate: number;
  }> {
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    const results: Array<any> = [];

    for (let i = periods - 1; i >= 0; i--) {
      const periodStart = now - (i + 1) * intervalMs;
      const periodEnd = now - i * intervalMs;

      const periodMetrics = this.metrics.filter(
        m => m.timestamp.getTime() >= periodStart && m.timestamp.getTime() < periodEnd
      );

      const requests = periodMetrics.length;
      const avgResponseTime = requests > 0
        ? periodMetrics.reduce((sum, m) => sum + m.responseTime, 0) / requests
        : 0;
      const errors = periodMetrics.filter(m => m.statusCode >= 400).length;
      const errorRate = requests > 0 ? (errors / requests) * 100 : 0;

      results.push({
        timestamp: new Date(periodStart),
        requests,
        avgResponseTime: Math.round(avgResponseTime),
        errorRate: Math.round(errorRate * 100) / 100,
      });
    }

    return results;
  }

  /**
   * Generate performance report with recommendations
   */
  generateReport(): {
    summary: ReturnType<PerformanceMonitor['getSummary']>;
    topSlowRoutes: ReturnType<PerformanceMonitor['getRouteBreakdown']>;
    recentSlowRequests: RequestMetric[];
    recommendations: string[];
    thresholds: PerformanceThresholds;
  } {
    const summary = this.getSummary();
    const routeBreakdown = this.getRouteBreakdown();
    const topSlowRoutes = routeBreakdown.slice(0, 10);
    const recentSlowRequests = this.getSlowRequests().slice(0, 20);

    const recommendations: string[] = [];

    // General recommendations based on summary
    if (summary.healthScore < 70) {
      recommendations.push('⚠️ Overall health score is low. Immediate attention required.');
    }

    if (summary.p95ResponseTime > this.thresholds.targetP95Ms) {
      recommendations.push(
        `📊 P95 response time (${summary.p95ResponseTime}ms) exceeds target (${this.thresholds.targetP95Ms}ms). Consider implementing caching or query optimization.`
      );
    }

    if (summary.errorRate > 1) {
      recommendations.push(
        `❌ Error rate (${summary.errorRate}%) is above 1%. Review error logs and implement better error handling.`
      );
    }

    // Route-specific recommendations
    const criticalRoutes = routeBreakdown.filter(r => r.status === 'critical');
    if (criticalRoutes.length > 0) {
      recommendations.push(
        `🔴 ${criticalRoutes.length} route(s) in critical state. Priority attention needed for: ${criticalRoutes.slice(0, 3).map(r => r.route).join(', ')}`
      );
    }

    // Database query recommendations
    const slowDbRoutes = routeBreakdown.filter(r =>
      r.route.includes('/api/') && r.p95 > 500 && !r.route.includes('search')
    );
    if (slowDbRoutes.length > 3) {
      recommendations.push(
        '🗄️ Multiple API routes are slow. Consider adding database indexes, implementing query caching, or using connection pooling.'
      );
    }

    // Caching recommendations
    if (summary.avgResponseTime > 300) {
      recommendations.push(
        '💾 Average response time is high. Consider implementing Redis caching for frequently accessed data.'
      );
    }

    return {
      summary,
      topSlowRoutes,
      recentSlowRequests,
      recommendations,
      thresholds: this.thresholds,
    };
  }

  /**
   * Reset all metrics (for testing or maintenance)
   */
  reset(): void {
    this.metrics = [];
    this.routeStats.clear();
    this.slowRequests = [];
    this.startTime = new Date();
  }

  /**
   * Set custom thresholds
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export middleware for Express
export function performanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = process.hrtime.bigint();

    // Capture original end function
    const originalEnd = res.end;

    res.end = function(...args: any[]) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1_000_000; // Convert to ms

      performanceMonitor.recordRequest({
        route: req.originalUrl || req.url,
        method: req.method,
        statusCode: res.statusCode,
        responseTime,
        timestamp: new Date(),
        userId: req.user?.id,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection?.remoteAddress,
      });

      // Call original end
      return originalEnd.apply(this, args);
    };

    next();
  };
}

export default performanceMonitor;
