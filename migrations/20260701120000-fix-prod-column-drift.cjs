'use strict';

/**
 * Fixes production schema drift found by `npm run check:columns`.
 *
 * These tables were created by `sequelize.sync()` before several model columns
 * existed; production runs with `alter: false`, so those columns were never added
 * on the live DB — every query touching them crashes (e.g. proposals.cover_letter,
 * disputes.category, Ticket.created_by class). Column names + types were derived
 * from the known-good dev schema. Idempotent: ADD COLUMN IF NOT EXISTS is a no-op
 * when the column already exists. Added nullable so existing rows are unaffected;
 * the models supply defaults on new inserts.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`ALTER TABLE proposals
      ADD COLUMN IF NOT EXISTS "cover_letter" TEXT,
      ADD COLUMN IF NOT EXISTS "is_counter_offer" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "original_job_price" NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT`);

    await q(`ALTER TABLE disputes
      ADD COLUMN IF NOT EXISTS "initiated_by" UUID,
      ADD COLUMN IF NOT EXISTS "against" UUID,
      ADD COLUMN IF NOT EXISTS "detailed_description" TEXT,
      ADD COLUMN IF NOT EXISTS "category" VARCHAR(30),
      ADD COLUMN IF NOT EXISTS "refund_amount" NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS "email_sent_at" TIMESTAMPTZ`);

    await q(`ALTER TABLE balance_transactions
      ADD COLUMN IF NOT EXISTS "related_contract_id" UUID,
      ADD COLUMN IF NOT EXISTS "related_payment_id" UUID,
      ADD COLUMN IF NOT EXISTS "status" VARCHAR(20)`);

    await q(`ALTER TABLE withdrawal_requests
      ADD COLUMN IF NOT EXISTS "banking_info" JSONB,
      ADD COLUMN IF NOT EXISTS "requested_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "proof_of_transfer" TEXT,
      ADD COLUMN IF NOT EXISTS "balance_before_withdrawal" NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS "balance_after_withdrawal" NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS "metadata" JSONB`);

    await q(`ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS "created_by_ip" VARCHAR(45),
      ADD COLUMN IF NOT EXISTS "user_agent" TEXT,
      ADD COLUMN IF NOT EXISTS "is_revoked" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "revoked_by_ip" VARCHAR(45),
      ADD COLUMN IF NOT EXISTS "revoked_reason" TEXT,
      ADD COLUMN IF NOT EXISTS "replaced_by_token" TEXT`);

    await q(`ALTER TABLE password_reset_tokens
      ADD COLUMN IF NOT EXISTS "used_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "ip_address" VARCHAR(45),
      ADD COLUMN IF NOT EXISTS "user_agent" TEXT`);

    await q(`ALTER TABLE consent_logs
      ADD COLUMN IF NOT EXISTS "userId" UUID,
      ADD COLUMN IF NOT EXISTS "consentType" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "action" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "version" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(45),
      ADD COLUMN IF NOT EXISTS "userAgent" VARCHAR(512),
      ADD COLUMN IF NOT EXISTS "consentData" JSONB,
      ADD COLUMN IF NOT EXISTS "previousValue" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "newValue" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`);

    await q(`ALTER TABLE data_access_logs
      ADD COLUMN IF NOT EXISTS "userId" UUID,
      ADD COLUMN IF NOT EXISTS "accessedBy" UUID,
      ADD COLUMN IF NOT EXISTS "accessType" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "dataType" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(45),
      ADD COLUMN IF NOT EXISTS "userAgent" VARCHAR(512),
      ADD COLUMN IF NOT EXISTS "requestedFields" VARCHAR(255)[],
      ADD COLUMN IF NOT EXISTS "success" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
      ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "metadata" JSONB`);

    await q(`ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS "performedBy" UUID,
      ADD COLUMN IF NOT EXISTS "adminRole" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "category" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "targetModel" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "targetId" UUID,
      ADD COLUMN IF NOT EXISTS "targetIdentifier" VARCHAR(200),
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "changes" JSONB,
      ADD COLUMN IF NOT EXISTS "metadata" JSONB,
      ADD COLUMN IF NOT EXISTS "ip" VARCHAR(45),
      ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
      ADD COLUMN IF NOT EXISTS "passwordVerified" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "twoFactorVerified" BOOLEAN,
      ADD COLUMN IF NOT EXISTS "signature" VARCHAR(64),
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ`);
  },

  async down() {
    // No-op: additive/idempotent. Dropping columns could destroy data.
  },
};
