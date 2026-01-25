import Redis from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log(`✅ [${config.serviceName}] Redis connected`);
});

redis.on('error', (err: Error) => {
  console.error(`❌ [${config.serviceName}] Redis error:`, err);
});

// Create subscriber for real-time events
export const subscriber = redis.duplicate();

export const pubsub = {
  async publish(channel: string, message: unknown): Promise<void> {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    await redis.publish(channel, data);
  },

  subscribe(channel: string, callback: (message: unknown) => void): void {
    subscriber.subscribe(channel);
    subscriber.on('message', (ch: string, message: string) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      }
    });
  },
};

// Online users tracking
export const onlineUsers = {
  async setOnline(userId: string, socketId: string): Promise<void> {
    await redis.hset('online_users', userId, socketId);
    await redis.expire('online_users', 86400); // 24h
  },

  async setOffline(userId: string): Promise<void> {
    await redis.hdel('online_users', userId);
  },

  async isOnline(userId: string): Promise<boolean> {
    const socketId = await redis.hget('online_users', userId);
    return !!socketId;
  },

  async getSocketId(userId: string): Promise<string | null> {
    return redis.hget('online_users', userId);
  },

  async getAllOnline(): Promise<string[]> {
    const users = await redis.hkeys('online_users');
    return users;
  },
};
