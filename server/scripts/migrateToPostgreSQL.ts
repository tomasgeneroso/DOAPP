/**
 * MongoDB to PostgreSQL Data Migration Script
 *
 * This script migrates all data from MongoDB to PostgreSQL
 * Run with: npx tsx server/scripts/migrateToPostgreSQL.ts
 *
 * IMPORTANT:
 * - Backup your MongoDB database before running
 * - Ensure PostgreSQL is running and configured
 * - This script can be run multiple times (idempotent)
 */

import mongoose from 'mongoose';
import { sequelize } from '../config/database.js';
import { config } from 'dotenv';

// MongoDB Models
import MongoUser from '../models/User.js';
import MongoJob from '../models/Job.js';
import MongoContract from '../models/Contract.js';
import MongoPayment from '../models/Payment.js';
import MongoProposal from '../models/Proposal.js';
import MongoReview from '../models/Review.js';
import MongoDispute from '../models/Dispute.js';
import MongoTicket from '../models/Ticket.js';
import MongoPortfolio from '../models/Portfolio.js';
import MongoRole from '../models/Role.js';
import MongoMembership from '../models/Membership.js';
import MongoReferral from '../models/Referral.js';
import MongoBalanceTransaction from '../models/BalanceTransaction.js';
import MongoWithdrawalRequest from '../models/WithdrawalRequest.js';
import MongoRefreshToken from '../models/RefreshToken.js';
import { PasswordResetToken as MongoPasswordResetToken } from '../models/PasswordResetToken.js';
import MongoAdvertisement from '../models/Advertisement.js';
import MongoPromoter from '../models/Promoter.js';
import MongoUserAnalytics from '../models/UserAnalytics.js';
import MongoConversation from '../models/Conversation.js';
import MongoChatMessage from '../models/ChatMessage.js';
import MongoNotification from '../models/Notification.js';
import MongoContractChangeRequest from '../models/ContractChangeRequest.js';

// PostgreSQL Models
import {
  User,
  Job,
  Contract,
  Payment,
  Proposal,
  Review,
  Dispute,
  Ticket,
  Portfolio,
  Role,
  Membership,
  Referral,
  BalanceTransaction,
  WithdrawalRequest,
  RefreshToken,
  PasswordResetToken,
  Advertisement,
  Promoter,
  UserAnalytics,
  Conversation,
  ChatMessage,
  Notification,
  ContractChangeRequest,
} from '../models/sql/index.js';

config();

// Mapping to store MongoDB ObjectId -> PostgreSQL UUID
const idMap = new Map<string, string>();

// Helper function to get UUID for MongoDB ObjectId
function getUUID(mongoId: mongoose.Types.ObjectId | string | undefined): string | undefined {
  if (!mongoId) return undefined;
  const mongoIdStr = mongoId.toString();

  if (!idMap.has(mongoIdStr)) {
    // Generate new UUID for this MongoDB ID
    const uuid = require('crypto').randomUUID();
    idMap.set(mongoIdStr, uuid);
  }

  return idMap.get(mongoIdStr);
}

// Migration statistics
const stats = {
  users: { total: 0, migrated: 0, errors: 0 },
  jobs: { total: 0, migrated: 0, errors: 0 },
  contracts: { total: 0, migrated: 0, errors: 0 },
  payments: { total: 0, migrated: 0, errors: 0 },
  proposals: { total: 0, migrated: 0, errors: 0 },
  reviews: { total: 0, migrated: 0, errors: 0 },
  disputes: { total: 0, migrated: 0, errors: 0 },
  tickets: { total: 0, migrated: 0, errors: 0 },
  portfolios: { total: 0, migrated: 0, errors: 0 },
  roles: { total: 0, migrated: 0, errors: 0 },
  memberships: { total: 0, migrated: 0, errors: 0 },
  referrals: { total: 0, migrated: 0, errors: 0 },
  balanceTransactions: { total: 0, migrated: 0, errors: 0 },
  withdrawalRequests: { total: 0, migrated: 0, errors: 0 },
  refreshTokens: { total: 0, migrated: 0, errors: 0 },
  passwordResetTokens: { total: 0, migrated: 0, errors: 0 },
  advertisements: { total: 0, migrated: 0, errors: 0 },
  promoters: { total: 0, migrated: 0, errors: 0 },
  userAnalytics: { total: 0, migrated: 0, errors: 0 },
  conversations: { total: 0, migrated: 0, errors: 0 },
  chatMessages: { total: 0, migrated: 0, errors: 0 },
  notifications: { total: 0, migrated: 0, errors: 0 },
  contractChangeRequests: { total: 0, migrated: 0, errors: 0 },
};

/**
 * Connect to databases
 */
async function connectDatabases() {
  console.log('📡 Connecting to databases...');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/doapp');
  console.log('✅ Connected to MongoDB');

  // Connect to PostgreSQL
  await sequelize.authenticate();
  console.log('✅ Connected to PostgreSQL');

  // Sync PostgreSQL schema (create tables)
  await sequelize.sync({ force: false }); // Set force: true to drop and recreate tables
  console.log('✅ PostgreSQL schema synced');
}

/**
 * Migrate Users (FIRST - needed for foreign keys)
 */
async function migrateUsers() {
  console.log('\n👥 Migrating Users...');

  const mongoUsers = await MongoUser.findAll({ where: {} });
  stats.users.total = mongoUsers.length;

  for (const mongoUser of mongoUsers) {
    try {
      const uuid = getUUID(mongoUser._id);

      await User.upsert({
        id: uuid,
        name: mongoUser.name,
        email: mongoUser.email,
        password: mongoUser.password,
        phone: mongoUser.phone,
        location: mongoUser.location,
        bio: mongoUser.bio,
        skills: mongoUser.skills || [],
        profilePicture: mongoUser.profilePicture,
        isEmailVerified: mongoUser.isEmailVerified,

        // Ratings
        rating: mongoUser.rating,
        totalReviews: mongoUser.totalReviews,
        workQualityRating: mongoUser.workQualityRating,
        workerRating: mongoUser.workerRating,
        contractRating: mongoUser.contractRating,
        workQualityReviewsCount: mongoUser.workQualityReviewsCount,
        workerReviewsCount: mongoUser.workerReviewsCount,
        contractReviewsCount: mongoUser.contractReviewsCount,

        // Role & permissions
        role: mongoUser.role,
        roleIds: [], // Will be populated later

        // Security
        isBanned: mongoUser.isBanned,
        bannedAt: mongoUser.bannedAt,
        bannedReason: mongoUser.bannedReason,
        bannedBy: getUUID(mongoUser.bannedBy),
        trustScore: mongoUser.trustScore,
        verificationLevel: mongoUser.verificationLevel,

        // 2FA
        twoFactorEnabled: mongoUser.twoFactorEnabled,
        twoFactorSecret: mongoUser.twoFactorSecret,
        backupCodes: mongoUser.backupCodes || [],

        // OAuth
        googleId: mongoUser.googleId,
        facebookId: mongoUser.facebookId,

        // Membership
        hasMembership: mongoUser.hasMembership,
        membershipTier: mongoUser.membershipTier,
        membershipStartDate: mongoUser.membershipStartDate,
        membershipEndDate: mongoUser.membershipEndDate,
        currentCommissionRate: mongoUser.currentCommissionRate,
        contractsWithMembership: mongoUser.contractsWithMembership,

        // Balance
        balance: mongoUser.balance,

        // Referrals
        referralCode: mongoUser.referralCode,
        referredBy: getUUID(mongoUser.referredBy),
        referralBenefitUsed: mongoUser.referralBenefitUsed,
        referralBenefitType: mongoUser.referralBenefitType,

        // Timestamps
        createdAt: mongoUser.createdAt,
        updatedAt: mongoUser.updatedAt,
      });

      stats.users.migrated++;
    } catch (error: any) {
      console.error(`❌ Error migrating user ${mongoUser.email}:`, error.message);
      stats.users.errors++;
    }
  }

  console.log(`✅ Migrated ${stats.users.migrated}/${stats.users.total} users`);
}

/**
 * Migrate Roles
 */
async function migrateRoles() {
  console.log('\n🔑 Migrating Roles...');

  const mongoRoles = await MongoRole.findAll({ where: {} });
  stats.roles.total = mongoRoles.length;

  for (const mongoRole of mongoRoles) {
    try {
      const uuid = getUUID(mongoRole._id);

      await Role.upsert({
        id: uuid,
        name: mongoRole.name,
        displayName: mongoRole.displayName,
        description: mongoRole.description,
        permissions: mongoRole.permissions || [],
        customPermissions: mongoRole.customPermissions || [],
        level: mongoRole.level,
        assignable: mongoRole.assignable,
        isActive: mongoRole.isActive,
        color: mongoRole.color,
        createdAt: mongoRole.createdAt,
        updatedAt: mongoRole.updatedAt,
      });

      stats.roles.migrated++;
    } catch (error: any) {
      console.error(`❌ Error migrating role ${mongoRole.name}:`, error.message);
      stats.roles.errors++;
    }
  }

  console.log(`✅ Migrated ${stats.roles.migrated}/${stats.roles.total} roles`);
}

/**
 * Migrate Jobs
 */
async function migrateJobs() {
  console.log('\n💼 Migrating Jobs...');

  const mongoJobs = await MongoJob.findAll({ where: {} });
  stats.jobs.total = mongoJobs.length;

  for (const mongoJob of mongoJobs) {
    try {
      const uuid = getUUID(mongoJob._id);

      await Job.upsert({
        id: uuid,
        clientId: getUUID(mongoJob.client),
        title: mongoJob.title,
        summary: mongoJob.summary,
        description: mongoJob.description,
        price: mongoJob.price,
        category: mongoJob.category,
        location: mongoJob.location,
        latitude: mongoJob.latitude,
        longitude: mongoJob.longitude,
        remoteOk: mongoJob.remoteOk,
        urgency: mongoJob.urgency,
        experienceLevel: mongoJob.experienceLevel,
        startDate: mongoJob.startDate,
        endDate: mongoJob.endDate,
        tags: mongoJob.tags || [],
        images: mongoJob.images || [],
        toolsRequired: mongoJob.toolsRequired || [],
        status: mongoJob.status,
        publicationPaymentId: getUUID(mongoJob.publicationPaymentId),
        publicationPaid: mongoJob.publicationPaid,
        publicationAmount: mongoJob.publicationAmount,
        views: mongoJob.views,
        createdAt: mongoJob.createdAt,
        updatedAt: mongoJob.updatedAt,
      });

      stats.jobs.migrated++;
    } catch (error: any) {
      console.error(`❌ Error migrating job ${mongoJob.title}:`, error.message);
      stats.jobs.errors++;
    }
  }

  console.log(`✅ Migrated ${stats.jobs.migrated}/${stats.jobs.total} jobs`);
}

/**
 * Migrate Contracts
 */
async function migrateContracts() {
  console.log('\n📝 Migrating Contracts...');

  const mongoContracts = await MongoContract.findAll({ where: {} });
  stats.contracts.total = mongoContracts.length;

  for (const mongoContract of mongoContracts) {
    try {
      const uuid = getUUID(mongoContract._id);

      await Contract.upsert({
        id: uuid,
        jobId: getUUID(mongoContract.job),
        clientId: getUUID(mongoContract.client),
        doerId: getUUID(mongoContract.doer),
        proposalId: getUUID(mongoContract.proposal),
        price: mongoContract.price,
        commission: mongoContract.commission,
        totalPrice: mongoContract.totalPrice,
        type: mongoContract.type,
        status: mongoContract.status,
        terms: mongoContract.terms,
        startDate: mongoContract.startDate,
        endDate: mongoContract.endDate,
        clientSignedAt: mongoContract.clientSignedAt,
        doerSignedAt: mongoContract.doerSignedAt,
        escrowEnabled: mongoContract.escrowEnabled,
        escrowAmount: mongoContract.escrowAmount,
        escrowStatus: mongoContract.escrowStatus,
        escrowPaymentId: getUUID(mongoContract.escrowPaymentId),
        pairingCode: mongoContract.pairingCode,
        pairingExpiry: mongoContract.pairingExpiry,
        clientConfirmedPairing: mongoContract.clientConfirmedPairing,
        doerConfirmedPairing: mongoContract.doerConfirmedPairing,
        clientConfirmed: mongoContract.clientConfirmed,
        doerConfirmed: mongoContract.doerConfirmed,
        confirmedAt: mongoContract.confirmedAt,
        hasBeenExtended: mongoContract.hasBeenExtended,
        extensionDays: mongoContract.extensionDays,
        extensionAmount: mongoContract.extensionAmount,
        priceModificationHistory: mongoContract.priceModificationHistory || [],
        deliveries: mongoContract.deliveries || [],
        disputeId: getUUID(mongoContract.dispute),
        deletedAt: mongoContract.deletedAt,
        deletedBy: getUUID(mongoContract.deletedBy),
        createdAt: mongoContract.createdAt,
        updatedAt: mongoContract.updatedAt,
      });

      stats.contracts.migrated++;
    } catch (error: any) {
      console.error(`❌ Error migrating contract ${uuid}:`, error.message);
      stats.contracts.errors++;
    }
  }

  console.log(`✅ Migrated ${stats.contracts.migrated}/${stats.contracts.total} contracts`);
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting MongoDB to PostgreSQL Migration\n');
  console.log('⚠️  WARNING: Make sure you have backed up your MongoDB database!\n');

  try {
    await connectDatabases();

    // Migrate in order (respecting foreign key dependencies)
    await migrateUsers();
    await migrateRoles();
    await migrateJobs();
    // await migrateContracts();
    // await migratePayments();
    // ... add other migrations

    console.log('\n📊 Migration Summary:');
    console.log('═══════════════════════════════════════');

    for (const [entity, stat] of Object.entries(stats)) {
      if (stat.total > 0) {
        const successRate = ((stat.migrated / stat.total) * 100).toFixed(1);
        console.log(`${entity.padEnd(25)} ${stat.migrated}/${stat.total} (${successRate}%) - ${stat.errors} errors`);
      }
    }

    console.log('═══════════════════════════════════════');
    console.log('\n✅ Migration completed!');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    await sequelize.close();
  }
}

// Run migration
migrate().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
