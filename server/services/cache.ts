import Redis from "ioredis";
import { config } from "../config/env.js";

/**
 * Redis Cache Service
 * Provides caching layer for frequently accessed data
 */
class CacheService {
  private client: Redis | null = null;
  private isEnabled: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  private initialize() {
    if (!config.redisUrl) {
      console.log("⚠️  Redis URL not configured. Caching will be disabled.");
      return;
    }

    try {
      this.client = new Redis(config.redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      this.client.on("connect", () => {
        console.log("✅ Redis connected successfully");
        this.isEnabled = true;
      });

      this.client.on("error", (err) => {
        console.error("❌ Redis connection error:", err.message);
        this.isEnabled = false;
      });

      this.client.on("close", () => {
        console.log("⚠️  Redis connection closed");
        this.isEnabled = false;
      });
    } catch (error: any) {
      console.error("❌ Failed to initialize Redis:", error.message);
      this.isEnabled = false;
    }
  }

  /**
   * Set a value in cache
   */
  async set(
    key: string,
    value: any,
    ttlSeconds: number = 300
  ): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;

    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttlSeconds, serialized);
      return true;
    } catch (error: any) {
      console.error("Cache set error:", error.message);
      return false;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isEnabled || !this.client) return null;

    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error: any) {
      console.error("Cache get error:", error.message);
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  async del(key: string): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error: any) {
      console.error("Cache delete error:", error.message);
      return false;
    }
  }

  /**
   * Delete keys matching a pattern
   */
  async delPattern(pattern: string): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error: any) {
      console.error("Cache delete pattern error:", error.message);
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error: any) {
      console.error("Cache exists error:", error.message);
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async increment(key: string, ttlSeconds: number = 3600): Promise<number> {
    if (!this.isEnabled || !this.client) return 0;

    try {
      const value = await this.client.incr(key);
      if (value === 1) {
        // First increment, set expiry
        await this.client.expire(key, ttlSeconds);
      }
      return value;
    } catch (error: any) {
      console.error("Cache increment error:", error.message);
      return 0;
    }
  }

  /**
   * Set expiry on a key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;

    try {
      await this.client.expire(key, ttlSeconds);
      return true;
    } catch (error: any) {
      console.error("Cache expire error:", error.message);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.isEnabled || !this.client) return -1;

    try {
      return await this.client.ttl(key);
    } catch (error: any) {
      console.error("Cache TTL error:", error.message);
      return -1;
    }
  }

  /**
   * Clear all cache
   */
  async flushAll(): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;

    try {
      await this.client.flushall();
      return true;
    } catch (error: any) {
      console.error("Cache flush error:", error.message);
      return false;
    }
  }

  /**
   * Get cache info
   */
  async info(): Promise<any> {
    if (!this.isEnabled || !this.client) {
      return { enabled: false };
    }

    try {
      const info = await this.client.info();
      return {
        enabled: true,
        info: info,
      };
    } catch (error: any) {
      console.error("Cache info error:", error.message);
      return { enabled: false, error: error.message };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isEnabled = false;
    }
  }

  /**
   * Check if cache is enabled
   */
  isReady(): boolean {
    return this.isEnabled;
  }

  /**
   * Get Redis client (for advanced operations)
   */
  getClient(): Redis | null {
    return this.client;
  }
}

export default new CacheService();
