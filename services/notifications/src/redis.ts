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

// Create subscriber for events
export const subscriber = redis.duplicate();

export const pubsub = {
  async publish(channel: string, message: unknown): Promise<void> {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    await redis.publish(channel, data);
  },

  subscribe(channel: string, callback: (message: unknown) => void): void {
    subscriber.subscribe(channel);
    subscriber.on('message', (ch, message) => {
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
