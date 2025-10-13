import { Request, Response, NextFunction } from "express";
import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import cache from "../services/cache.js";

/**
 * Advanced Rate Limiting with Redis
 * Provides per-user, per-endpoint rate limiting
 */

// Rate limiter instances - Initialize with memory fallback immediately
let authLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({
  keyPrefix: "rl:auth",
  points: 30,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

let apiLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({
  keyPrefix: "rl:api",
  points: 100,
  duration: 15 * 60,
});

let strictLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({
  keyPrefix: "rl:strict",
  points: 3,
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

let perUserLimiter: RateLimiterRedis | RateLimiterMemory = new RateLimiterMemory({
  keyPrefix: "rl:user",
  points: 200,
  duration: 60 * 60,
});

// Initialize rate limiters
function initializeRateLimiters() {
  const redisClient = cache.getClient();

  if (redisClient && cache.isReady()) {
    // Redis-based rate limiters
    authLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:auth",
      points: 30, // Number of requests
      duration: 15 * 60, // Per 15 minutes
      blockDuration: 15 * 60, // Block for 15 minutes
    });

    apiLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:api",
      points: 100,
      duration: 15 * 60,
    });

    strictLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:strict",
      points: 3,
      duration: 60 * 60, // 1 hour
      blockDuration: 60 * 60,
    });

    perUserLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: "rl:user",
      points: 200,
      duration: 60 * 60, // Per hour per user
    });

    console.log("✅ Redis-based rate limiters initialized");
  } else {
    // Fallback to memory-based rate limiters
    authLimiter = new RateLimiterMemory({
      keyPrefix: "rl:auth",
      points: 30,
      duration: 15 * 60,
      blockDuration: 15 * 60,
    });

    apiLimiter = new RateLimiterMemory({
      keyPrefix: "rl:api",
      points: 100,
      duration: 15 * 60,
    });

    strictLimiter = new RateLimiterMemory({
      keyPrefix: "rl:strict",
      points: 3,
      duration: 60 * 60,
      blockDuration: 60 * 60,
    });

    perUserLimiter = new RateLimiterMemory({
      keyPrefix: "rl:user",
      points: 200,
      duration: 60 * 60,
    });

    console.log("⚠️  Using memory-based rate limiters (Redis not available)");
  }
}

// Initialize on module load
initializeRateLimiters();

/**
 * Create rate limit middleware
 */
function createRateLimitMiddleware(
  limiter: RateLimiterRedis | RateLimiterMemory,
  keyGenerator?: (req: Request) => string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator
        ? keyGenerator(req)
        : req.ip || req.socket.remoteAddress || "unknown";

      await limiter.consume(key);
      next();
    } catch (rejRes: any) {
      const retryAfter = Math.ceil(rejRes.msBeforeNext / 1000) || 1;

      res.set("Retry-After", String(retryAfter));
      res.set("X-RateLimit-Limit", String(limiter.points));
      res.set("X-RateLimit-Remaining", String(rejRes.remainingPoints || 0));
      res.set("X-RateLimit-Reset", String(Date.now() + rejRes.msBeforeNext));

      res.status(429).json({
        success: false,
        message: "Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.",
        retryAfter: retryAfter,
      });
    }
  };
}

/**
 * Auth endpoints rate limiter (5 requests per 15 minutes)
 */
export const authRateLimit = createRateLimitMiddleware(authLimiter);

/**
 * API endpoints rate limiter (100 requests per 15 minutes)
 */
export const apiRateLimit = createRateLimitMiddleware(apiLimiter);

/**
 * Strict rate limiter (3 requests per hour)
 */
export const strictRateLimit = createRateLimitMiddleware(strictLimiter);

/**
 * Per-user rate limiter (200 requests per hour)
 */
export const perUserRateLimit = createRateLimitMiddleware(
  perUserLimiter,
  (req: any) => {
    // Use user ID if authenticated, otherwise fall back to IP
    return req.user?._id?.toString() || req.ip || "unknown";
  }
);

/**
 * Custom rate limiter with configurable options
 */
export function customRateLimit(options: {
  points: number;
  duration: number;
  blockDuration?: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const redisClient = cache.getClient();

  const limiter =
    redisClient && cache.isReady()
      ? new RateLimiterRedis({
          storeClient: redisClient,
          keyPrefix: options.keyPrefix || "rl:custom",
          points: options.points,
          duration: options.duration,
          blockDuration: options.blockDuration,
        })
      : new RateLimiterMemory({
          keyPrefix: options.keyPrefix || "rl:custom",
          points: options.points,
          duration: options.duration,
          blockDuration: options.blockDuration,
        });

  return createRateLimitMiddleware(limiter, options.keyGenerator);
}

/**
 * Endpoint-specific rate limiter
 */
export function endpointRateLimit(
  endpoint: string,
  points: number = 20,
  duration: number = 60
) {
  return customRateLimit({
    points,
    duration,
    keyPrefix: `rl:endpoint:${endpoint}`,
    keyGenerator: (req: any) => {
      const userId = req.user?._id?.toString() || req.ip || "unknown";
      return `${userId}:${endpoint}`;
    },
  });
}

export default {
  authRateLimit,
  apiRateLimit,
  strictRateLimit,
  perUserRateLimit,
  customRateLimit,
  endpointRateLimit,
};
