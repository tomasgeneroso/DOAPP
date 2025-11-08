import 'reflect-metadata';
import { config } from 'dotenv';
import { Sequelize } from 'sequelize-typescript';

// CRITICAL: Load .env FIRST before anything else
// This ensures all environment variables are available when Sequelize initializes
config();

// Load test env if needed
if (process.env.NODE_ENV === 'test' && !process.env.DB_PASSWORD) {
  config({ path: '.env.test' });
}

/**
 * PostgreSQL Database Configuration
 *
 * Configuración de Sequelize para PostgreSQL con soporte para:
 * - Connection pooling
 * - SSL en producción
 * - Logging en desarrollo
 * - Retry logic
 * - Timezone UTC
 */

const isProduction = process.env.NODE_ENV === 'production';

// Ensure password is ALWAYS a string (critical for PostgreSQL SASL auth)
const dbPassword = String(process.env.DB_PASSWORD || '');

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'doapp',
  username: process.env.DB_USER || 'postgres',
  password: dbPassword,

  // Connection pool configuration
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    min: parseInt(process.env.DB_POOL_MIN || '5'),
    acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
    idle: parseInt(process.env.DB_POOL_IDLE || '10000'),
  },

  // Logging - solo mostrar en caso de error
  logging: false,

  // SSL Configuration for production
  dialectOptions: {
    ssl: process.env.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false,
    } : false,
  },

  // Timezone
  timezone: '+00:00', // UTC

  // Retry configuration
  retry: {
    max: 3,
    match: [
      /SequelizeConnectionError/,
      /SequelizeConnectionRefusedError/,
      /SequelizeHostNotFoundError/,
      /SequelizeHostNotReachableError/,
      /SequelizeInvalidConnectionError/,
      /SequelizeConnectionTimedOutError/,
    ],
  },

  // Define models directory
  // NOTE: Models are registered in models/sql/index.ts instead
  models: [],

  // Benchmarking
  benchmark: !isProduction,
});

/**
 * Initialize database connection
 */
export async function initDatabase() {
  try {
    // Register models
    await registerModels();

    await sequelize.authenticate();
    console.log('✅ PostgreSQL connection established successfully');

    // Sync models in development (use migrations in production)
    if (!isProduction) {
      await sequelize.sync({ force: false, alter: false });
      console.log('✅ Database models synchronized');
    }

    return sequelize;
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL database:', error);
    throw error;
  }
}

/**
 * Register all models with Sequelize
 */
async function registerModels() {
  // Import all models
  const { default: User } = await import('../models/sql/User.model.js');
  const { default: Job } = await import('../models/sql/Job.model.js');
  const { default: Contract } = await import('../models/sql/Contract.model.js');
  const { default: Payment } = await import('../models/sql/Payment.model.js');
  const { default: Proposal } = await import('../models/sql/Proposal.model.js');
  const { default: Review } = await import('../models/sql/Review.model.js');
  const { default: ChatMessage } = await import('../models/sql/ChatMessage.model.js');
  const { default: Conversation } = await import('../models/sql/Conversation.model.js');
  const { default: Notification } = await import('../models/sql/Notification.model.js');
  const { default: Dispute } = await import('../models/sql/Dispute.model.js');
  const { default: Ticket } = await import('../models/sql/Ticket.model.js');
  const { default: Portfolio } = await import('../models/sql/Portfolio.model.js');
  const { default: Role } = await import('../models/sql/Role.model.js');
  const { default: ContractChangeRequest } = await import('../models/sql/ContractChangeRequest.model.js');
  const { default: Membership } = await import('../models/sql/Membership.model.js');
  const { default: Referral } = await import('../models/sql/Referral.model.js');
  const { default: BalanceTransaction } = await import('../models/sql/BalanceTransaction.model.js');
  const { default: WithdrawalRequest } = await import('../models/sql/WithdrawalRequest.model.js');
  const { default: RefreshToken } = await import('../models/sql/RefreshToken.model.js');
  const { default: PasswordResetToken } = await import('../models/sql/PasswordResetToken.model.js');
  const { LoginDevice } = await import('../models/sql/LoginDevice.model.js');
  const { default: Advertisement } = await import('../models/sql/Advertisement.model.js');
  const { default: Promoter } = await import('../models/sql/Promoter.model.js');
  const { default: UserAnalytics } = await import('../models/sql/UserAnalytics.model.js');
  const { ConsentLog } = await import('../models/sql/ConsentLog.model.js');
  const { DataAccessLog } = await import('../models/sql/DataAccessLog.model.js');
  const { AuditLog } = await import('../models/sql/AuditLog.model.js');
  const { MatchingCode } = await import('../models/sql/MatchingCode.model.js');
  const { ContractNegotiation } = await import('../models/sql/ContractNegotiation.model.js');
  const { Post } = await import('../models/sql/Post.model.js');
  const { PostComment } = await import('../models/sql/PostComment.model.js');
  const { BlogPost } = await import('../models/sql/BlogPost.model.js');
  const { ContactMessage } = await import('../models/sql/ContactMessage.model.js');

  // Add models to sequelize
  sequelize.addModels([
    User,
    Job,
    Contract,
    Payment,
    Proposal,
    Review,
    ChatMessage,
    Conversation,
    Notification,
    Dispute,
    Ticket,
    Portfolio,
    Role,
    ContractChangeRequest,
    Membership,
    Referral,
    BalanceTransaction,
    WithdrawalRequest,
    RefreshToken,
    PasswordResetToken,
    LoginDevice,
    Advertisement,
    Promoter,
    UserAnalytics,
    ConsentLog,
    DataAccessLog,
    AuditLog,
    MatchingCode,
    ContractNegotiation,
    Post,
    PostComment,
    BlogPost,
    ContactMessage,
  ]);
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  try {
    await sequelize.close();
    console.log('✅ PostgreSQL connection closed successfully');
  } catch (error) {
    console.error('❌ Error closing PostgreSQL connection:', error);
    throw error;
  }
}

// Default export for backward compatibility
export default initDatabase;
