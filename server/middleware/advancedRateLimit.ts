import { Request, Response, NextFunction } from "express";
import { RateLimiterPostgres, RateLimiterMemory } from "rate-limiter-flexible";
import { Pool } from "pg";

// Dedicated small pool for rate limiting only (doesn't interfere with Sequelize pool)
const pgPool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "doapp",
  user: process.env.DB_USER || "postgres",
  password: String(process.env.DB_PASSWORD || ""),
  max: 3,
  idleTimeoutMillis: 30000,
});

const TABLE = "rate_limits";

// Each limiter gets a memory insurance fallback — if PG is temporarily unavailable
// the server keeps working and limits are enforced in-memory until PG comes back.

const authLimiter = new RateLimiterPostgres(
  {
    storeClient: pgPool,
    tableName: TABLE,
    keyPrefix: "rl:auth",
    points: 20,
    duration: 15 * 60,
    blockDuration: 5 * 60,
    insuranceLimiter: new RateLimiterMemory({ keyPrefix: "rl:auth:mem", points: 20, duration: 15 * 60, blockDuration: 5 * 60 }),
  },
  (err) => {
    if (err) console.warn("⚠️  RateLimiter: PG store error, using memory fallback:", err.message);
    else console.log(`✅ RateLimiter: PostgreSQL store ready (table: ${TABLE})`);
  }
);

const apiLimiter = new RateLimiterPostgres(
  {
    storeClient: pgPool,
    tableName: TABLE,
    keyPrefix: "rl:api",
    points: 500,
    duration: 15 * 60,
    insuranceLimiter: new RateLimiterMemory({ keyPrefix: "rl:api:mem", points: 500, duration: 15 * 60 }),
  },
  (err) => { if (err) console.warn("⚠️  RateLimiter API PG error:", err.message); }
);

const strictLimiter = new RateLimiterPostgres(
  {
    storeClient: pgPool,
    tableName: TABLE,
    keyPrefix: "rl:strict",
    points: 10,
    duration: 60 * 60,
    blockDuration: 30 * 60,
    insuranceLimiter: new RateLimiterMemory({ keyPrefix: "rl:strict:mem", points: 10, duration: 60 * 60, blockDuration: 30 * 60 }),
  },
  (err) => { if (err) console.warn("⚠️  RateLimiter strict PG error:", err.message); }
);

const perUserLimiter = new RateLimiterPostgres(
  {
    storeClient: pgPool,
    tableName: TABLE,
    keyPrefix: "rl:user",
    points: 500,
    duration: 60 * 60,
    insuranceLimiter: new RateLimiterMemory({ keyPrefix: "rl:user:mem", points: 500, duration: 60 * 60 }),
  },
  (err) => { if (err) console.warn("⚠️  RateLimiter perUser PG error:", err.message); }
);

function createRateLimitMiddleware(
  limiter: RateLimiterPostgres,
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
        retryAfter,
      });
    }
  };
}

export const authRateLimit = createRateLimitMiddleware(authLimiter);
export const apiRateLimit = createRateLimitMiddleware(apiLimiter);
export const strictRateLimit = createRateLimitMiddleware(strictLimiter);
export const perUserRateLimit = createRateLimitMiddleware(
  perUserLimiter,
  (req: any) => req.user?._id?.toString() || req.ip || "unknown"
);

export function customRateLimit(options: {
  points: number;
  duration: number;
  blockDuration?: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const limiter = new RateLimiterPostgres(
    {
      storeClient: pgPool,
      tableName: TABLE,
      keyPrefix: options.keyPrefix || "rl:custom",
      points: options.points,
      duration: options.duration,
      blockDuration: options.blockDuration,
      insuranceLimiter: new RateLimiterMemory({
        keyPrefix: `${options.keyPrefix || "rl:custom"}:mem`,
        points: options.points,
        duration: options.duration,
        blockDuration: options.blockDuration,
      }),
    },
    (err) => { if (err) console.warn("⚠️  RateLimiter custom PG error:", err.message); }
  );
  return createRateLimitMiddleware(limiter, options.keyGenerator);
}

export function endpointRateLimit(endpoint: string, points = 20, duration = 60) {
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

export default { authRateLimit, apiRateLimit, strictRateLimit, perUserRateLimit, customRateLimit, endpointRateLimit };
