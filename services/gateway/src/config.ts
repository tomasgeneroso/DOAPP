import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',

  // CORS
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Service URLs
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    jobs: process.env.JOBS_SERVICE_URL || 'http://localhost:3002',
    payments: process.env.PAYMENTS_SERVICE_URL || 'http://localhost:3003',
    chat: process.env.CHAT_SERVICE_URL || 'http://localhost:3004',
    notifications: process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3005',
    admin: process.env.ADMIN_SERVICE_URL || 'http://localhost:3006',
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
};
