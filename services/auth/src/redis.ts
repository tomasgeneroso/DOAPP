import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log(`✅ [${config.serviceName}] Redis connected`);
});

redis.on('error', (err) => {
  console.error(`❌ [${config.serviceName}] Redis error:`, err);
});

// Cache helpers
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, data);
    } else {
      await redis.set(key, data);
    }
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};

// Session management
export const sessions = {
  async set(userId: string, token: string, ttlSeconds: number = 86400 * 7): Promise<void> {
    await redis.setex(`session:${userId}:${token}`, ttlSeconds, 'active');
  },

  async isValid(userId: string, token: string): Promise<boolean> {
    const result = await redis.get(`session:${userId}:${token}`);
    return result === 'active';
  },

  async revoke(userId: string, token: string): Promise<void> {
    await redis.del(`session:${userId}:${token}`);
  },

  async revokeAll(userId: string): Promise<void> {
    const keys = await redis.keys(`session:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};
