import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  serviceName: process.env.SERVICE_NAME || 'payments',
  isProduction: process.env.NODE_ENV === 'production',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'doapp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Auth Service
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',

  // Client
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // MercadoPago
  mercadopago: {
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
    publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || '',
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
  },

  // Commissions
  commissions: {
    standard: 8, // 8%
    pro: 3, // 3%
    superPro: 2, // 2%
    minAmount: 1000, // ARS
  },

  // Publication fees
  publicationFee: {
    base: 500, // ARS
  },
};
