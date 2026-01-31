/**
 * In-Memory Cache Service with Analytics
 * Features:
 * - Hit/Miss tracking
 * - Per-key analytics
 * - Cache efficiency metrics
 * - Memory usage monitoring
 *
 * For production, replace with Redis
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Approximate size in bytes
}

interface CacheAnalytics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitsByPrefix: Map<string, number>;
  missesByPrefix: Map<string, number>;
  startTime: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private analytics: CacheAnalytics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    hitsByPrefix: new Map(),
    missesByPrefix: new Map(),
    startTime: Date.now(),
  };

  constructor() {
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Extract prefix from cache key
   */
  private getPrefix(key: string): string {
    const colonIndex = key.indexOf(':');
    return colonIndex > 0 ? key.substring(0, colonIndex) : 'default';
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Approximate UTF-16 size
    } catch {
      return 0;
    }
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    const prefix = this.getPrefix(key);

    if (!entry) {
      this.analytics.misses++;
      this.analytics.missesByPrefix.set(
        prefix,
        (this.analytics.missesByPrefix.get(prefix) || 0) + 1
      );
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.analytics.evictions++;
      this.analytics.misses++;
      this.analytics.missesByPrefix.set(
        prefix,
        (this.analytics.missesByPrefix.get(prefix) || 0) + 1
      );
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    this.analytics.hits++;
    this.analytics.hitsByPrefix.set(
      prefix,
      (this.analytics.hitsByPrefix.get(prefix) || 0) + 1
    );

    return entry.data as T;
  }

  /**
   * Set value in cache with TTL (in seconds)
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const now = Date.now();
    const expiry = now + ttlSeconds * 1000;

    this.cache.set(key, {
      data,
      expiry,
      createdAt: now,
      accessCount: 0,
      lastAccessed: now,
      size: this.estimateSize(data),
    });

    this.analytics.sets++;
  }

  /**
   * Delete a specific key
   */
  del(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.analytics.deletes++;
    }
    return deleted;
  }

  /**
   * Delete keys matching a pattern
   */
  delPattern(pattern: string): number {
    let deleted = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    this.analytics.deletes += deleted;
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.analytics.deletes += this.cache.size;
    this.cache.clear();
  }

  /**
   * Get basic cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
    memoryUsage: string;
  } {
    const keys = Array.from(this.cache.keys());
    return {
      size: this.cache.size,
      keys,
      memoryUsage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    };
  }

  /**
   * Get detailed cache analytics
   */
  getAnalytics(): {
    summary: {
      totalRequests: number;
      hits: number;
      misses: number;
      hitRate: string;
      missRate: string;
      sets: number;
      deletes: number;
      evictions: number;
      uptime: string;
    };
    memory: {
      entriesCount: number;
      estimatedSize: string;
      heapUsed: string;
      heapTotal: string;
    };
    byPrefix: Array<{
      prefix: string;
      hits: number;
      misses: number;
      hitRate: string;
      entriesCount: number;
    }>;
    topKeys: Array<{
      key: string;
      accessCount: number;
      age: string;
      size: string;
    }>;
    efficiency: {
      cacheEfficiency: string;
      avgAccessesPerKey: string;
      expirationRate: string;
    };
  } {
    const totalRequests = this.analytics.hits + this.analytics.misses;
    const hitRate = totalRequests > 0
      ? ((this.analytics.hits / totalRequests) * 100).toFixed(2) + '%'
      : '0%';
    const missRate = totalRequests > 0
      ? ((this.analytics.misses / totalRequests) * 100).toFixed(2) + '%'
      : '0%';

    // Calculate uptime
    const uptimeMs = Date.now() - this.analytics.startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const uptime = `${uptimeHours}h ${uptimeMinutes}m`;

    // Memory stats
    const memoryUsage = process.memoryUsage();
    let totalCacheSize = 0;
    for (const entry of this.cache.values()) {
      totalCacheSize += entry.size;
    }

    // By prefix stats
    const prefixes = new Set<string>();
    const prefixEntries = new Map<string, number>();

    for (const key of this.cache.keys()) {
      const prefix = this.getPrefix(key);
      prefixes.add(prefix);
      prefixEntries.set(prefix, (prefixEntries.get(prefix) || 0) + 1);
    }

    // Merge with analytics prefixes
    this.analytics.hitsByPrefix.forEach((_, prefix) => prefixes.add(prefix));
    this.analytics.missesByPrefix.forEach((_, prefix) => prefixes.add(prefix));

    const byPrefix = Array.from(prefixes).map(prefix => {
      const hits = this.analytics.hitsByPrefix.get(prefix) || 0;
      const misses = this.analytics.missesByPrefix.get(prefix) || 0;
      const total = hits + misses;
      return {
        prefix,
        hits,
        misses,
        hitRate: total > 0 ? ((hits / total) * 100).toFixed(1) + '%' : '0%',
        entriesCount: prefixEntries.get(prefix) || 0,
      };
    }).sort((a, b) => (b.hits + b.misses) - (a.hits + a.misses));

    // Top accessed keys
    const sortedEntries = Array.from(this.cache.entries())
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 10);

    const topKeys = sortedEntries.map(([key, entry]) => ({
      key: key.length > 50 ? key.substring(0, 50) + '...' : key,
      accessCount: entry.accessCount,
      age: this.formatDuration(Date.now() - entry.createdAt),
      size: this.formatBytes(entry.size),
    }));

    // Efficiency metrics
    let totalAccesses = 0;
    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
    }
    const avgAccessesPerKey = this.cache.size > 0
      ? (totalAccesses / this.cache.size).toFixed(2)
      : '0';
    const expirationRate = this.analytics.sets > 0
      ? ((this.analytics.evictions / this.analytics.sets) * 100).toFixed(2) + '%'
      : '0%';
    const cacheEfficiency = this.analytics.sets > 0
      ? ((this.analytics.hits / this.analytics.sets) * 100).toFixed(2) + '%'
      : '0%';

    return {
      summary: {
        totalRequests,
        hits: this.analytics.hits,
        misses: this.analytics.misses,
        hitRate,
        missRate,
        sets: this.analytics.sets,
        deletes: this.analytics.deletes,
        evictions: this.analytics.evictions,
        uptime,
      },
      memory: {
        entriesCount: this.cache.size,
        estimatedSize: this.formatBytes(totalCacheSize),
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
      },
      byPrefix,
      topKeys,
      efficiency: {
        cacheEfficiency,
        avgAccessesPerKey,
        expirationRate,
      },
    };
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration to human readable
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return (ms / 60000).toFixed(1) + 'm';
    return (ms / 3600000).toFixed(1) + 'h';
  }

  /**
   * Reset analytics (for testing)
   */
  resetAnalytics(): void {
    this.analytics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitsByPrefix: new Map(),
      missesByPrefix: new Map(),
      startTime: Date.now(),
    };
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetchFn();
    this.set(key, data, ttlSeconds);
    return data;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;
    // Cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Generate cache key from object
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${key}=${params[key]}`)
    .join('&');

  return `${prefix}:${sortedParams || 'default'}`;
}

export default cacheService;
