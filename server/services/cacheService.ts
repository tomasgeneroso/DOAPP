/**
 * Simple In-Memory Cache Service
 * For production, replace with Redis
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache with TTL (in seconds)
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { data, expiry });
  }

  /**
   * Delete a specific key
   */
  del(key: string): boolean {
    return this.cache.delete(key);
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

    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
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
