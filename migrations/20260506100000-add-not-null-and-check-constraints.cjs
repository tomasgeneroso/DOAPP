'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // ================================================
      // CONTRACTS — ensure columns exist, fix NULLs, enforce NOT NULL
      // ================================================
      await q(`
        ALTER TABLE contracts
          ADD COLUMN IF NOT EXISTS commission                 DECIMAL(10,2)  DEFAULT 0,
          ADD COLUMN IF NOT EXISTS terms_accepted             BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS terms_accepted_by_client   BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS terms_accepted_by_doer     BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS deliveries                 JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS payment_status             VARCHAR(30)    DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS escrow_enabled             BOOLEAN        DEFAULT true,
          ADD COLUMN IF NOT EXISTS escrow_amount              DECIMAL(15,2)  DEFAULT 0,
          ADD COLUMN IF NOT EXISTS escrow_status              VARCHAR(30)    DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS client_confirmed_pairing   BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS doer_confirmed_pairing     BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS client_confirmed           BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS doer_confirmed             BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS confirmation_reminder_sent BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS confirmation_history       JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS has_been_extended          BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS price_modification_history JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS extension_history          JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS extension_count            INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS has_pending_task_claim     BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS claimed_task_ids           JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS task_claim_history         JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS is_deleted                 BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS infractions               INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS is_hidden                  BOOLEAN        DEFAULT false
      `);
      await q(`
        UPDATE contracts SET
          commission                 = COALESCE(commission, 0),
          status                     = COALESCE(status, 'pending'),
          terms_accepted             = COALESCE(terms_accepted, false),
          terms_accepted_by_client   = COALESCE(terms_accepted_by_client, false),
          terms_accepted_by_doer     = COALESCE(terms_accepted_by_doer, false),
          deliveries                 = COALESCE(deliveries, '[]'::jsonb),
          payment_status             = COALESCE(payment_status, 'pending'),
          escrow_enabled             = COALESCE(escrow_enabled, true),
          escrow_amount              = COALESCE(escrow_amount, 0),
          escrow_status              = COALESCE(escrow_status, 'pending'),
          client_confirmed_pairing   = COALESCE(client_confirmed_pairing, false),
          doer_confirmed_pairing     = COALESCE(doer_confirmed_pairing, false),
          client_confirmed           = COALESCE(client_confirmed, false),
          doer_confirmed             = COALESCE(doer_confirmed, false),
          confirmation_reminder_sent = COALESCE(confirmation_reminder_sent, false),
          confirmation_history       = COALESCE(confirmation_history, '[]'::jsonb),
          has_been_extended          = COALESCE(has_been_extended, false),
          price_modification_history = COALESCE(price_modification_history, '[]'::jsonb),
          extension_history          = COALESCE(extension_history, '[]'::jsonb),
          extension_count            = COALESCE(extension_count, 0),
          has_pending_task_claim     = COALESCE(has_pending_task_claim, false),
          claimed_task_ids           = COALESCE(claimed_task_ids, '[]'::jsonb),
          task_claim_history         = COALESCE(task_claim_history, '[]'::jsonb),
          is_deleted                 = COALESCE(is_deleted, false),
          infractions                = COALESCE(infractions, 0),
          is_hidden                  = COALESCE(is_hidden, false)
      `);
      for (const col of [
        'commission', 'status', 'terms_accepted', 'terms_accepted_by_client',
        'terms_accepted_by_doer', 'deliveries', 'payment_status', 'escrow_enabled',
        'escrow_amount', 'escrow_status', 'client_confirmed_pairing', 'doer_confirmed_pairing',
        'client_confirmed', 'doer_confirmed', 'confirmation_reminder_sent', 'confirmation_history',
        'has_been_extended', 'price_modification_history', 'extension_history', 'extension_count',
        'has_pending_task_claim', 'claimed_task_ids', 'task_claim_history',
        'is_deleted', 'infractions', 'is_hidden',
      ]) {
        await q(`ALTER TABLE contracts ALTER COLUMN ${col} SET NOT NULL`);
      }

      // ================================================
      // USERS — ensure columns exist, fix NULLs, enforce NOT NULL
      // ================================================
      await q(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS dni_verified                  BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS reviews_count                 INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS completed_jobs                INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS work_quality_rating           DECIMAL(3,2)   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS worker_rating                 DECIMAL(3,2)   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS contract_rating               DECIMAL(3,2)   DEFAULT 0,
          ADD COLUMN IF NOT EXISTS work_quality_reviews_count    INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS worker_reviews_count          INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS contract_reviews_count        INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS two_factor_enabled            BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS is_banned                     BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS infractions                   INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS trust_score                   INTEGER        DEFAULT 100,
          ADD COLUMN IF NOT EXISTS verification_level            VARCHAR(20)    DEFAULT 'none',
          ADD COLUMN IF NOT EXISTS fcm_tokens                    TEXT[]         DEFAULT ARRAY[]::text[],
          ADD COLUMN IF NOT EXISTS interests                     TEXT[]         DEFAULT ARRAY[]::text[],
          ADD COLUMN IF NOT EXISTS onboarding_completed          BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS dont_ask_banking_info         BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS is_availability_public        BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS has_membership                BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS is_premium_verified           BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS current_commission_rate       DECIMAL(5,2)   DEFAULT 8.0,
          ADD COLUMN IF NOT EXISTS free_contracts_remaining      INTEGER        DEFAULT 3,
          ADD COLUMN IF NOT EXISTS pro_contracts_used_this_month INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS balance_ars                   DECIMAL(15,2)  DEFAULT 0,
          ADD COLUMN IF NOT EXISTS referral_bonus_awarded        BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS referral_tier                 INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS total_referrals               INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS completed_referrals           INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS is_early_user                 BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS invitation_codes_remaining    INTEGER        DEFAULT 3,
          ADD COLUMN IF NOT EXISTS invitation_codes_used         INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS has_referral_discount         BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS referral_benefits_used        INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS has_family_plan               BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS profile_shares_count          INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS profile_shares_via_link       INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS profile_shares_via_message    INTEGER        DEFAULT 0
      `);
      await q(`
        UPDATE users SET
          dni_verified                  = COALESCE(dni_verified, false),
          rating                        = COALESCE(rating, 0),
          reviews_count                 = COALESCE(reviews_count, 0),
          completed_jobs                = COALESCE(completed_jobs, 0),
          work_quality_rating           = COALESCE(work_quality_rating, 0),
          worker_rating                 = COALESCE(worker_rating, 0),
          contract_rating               = COALESCE(contract_rating, 0),
          work_quality_reviews_count    = COALESCE(work_quality_reviews_count, 0),
          worker_reviews_count          = COALESCE(worker_reviews_count, 0),
          contract_reviews_count        = COALESCE(contract_reviews_count, 0),
          terms_accepted                = COALESCE(terms_accepted, false),
          role                          = COALESCE(role, 'user'),
          permissions                   = COALESCE(permissions, ARRAY[]::text[]),
          is_verified                   = COALESCE(is_verified, false),
          two_factor_enabled            = COALESCE(two_factor_enabled, false),
          is_banned                     = COALESCE(is_banned, false),
          infractions                   = COALESCE(infractions, 0),
          trust_score                   = COALESCE(trust_score, 100),
          verification_level            = COALESCE(verification_level, 'none'),
          fcm_tokens                    = COALESCE(fcm_tokens, ARRAY[]::text[]),
          interests                     = COALESCE(interests, ARRAY[]::text[]),
          onboarding_completed          = COALESCE(onboarding_completed, false),
          dont_ask_banking_info         = COALESCE(dont_ask_banking_info, false),
          is_availability_public        = COALESCE(is_availability_public, false),
          has_membership                = COALESCE(has_membership, false),
          is_premium_verified           = COALESCE(is_premium_verified, false),
          current_commission_rate       = COALESCE(current_commission_rate, 8.0),
          free_contracts_remaining      = COALESCE(free_contracts_remaining, 3),
          pro_contracts_used_this_month = COALESCE(pro_contracts_used_this_month, 0),
          balance_ars                   = COALESCE(balance_ars, 0),
          referral_bonus_awarded        = COALESCE(referral_bonus_awarded, false),
          referral_tier                 = COALESCE(referral_tier, 0),
          total_referrals               = COALESCE(total_referrals, 0),
          completed_referrals           = COALESCE(completed_referrals, 0),
          is_early_user                 = COALESCE(is_early_user, false),
          invitation_codes_remaining    = COALESCE(invitation_codes_remaining, 3),
          invitation_codes_used         = COALESCE(invitation_codes_used, 0),
          has_referral_discount         = COALESCE(has_referral_discount, false),
          referral_benefits_used        = COALESCE(referral_benefits_used, 0),
          has_family_plan               = COALESCE(has_family_plan, false),
          profile_shares_count          = COALESCE(profile_shares_count, 0),
          profile_shares_via_link       = COALESCE(profile_shares_via_link, 0),
          profile_shares_via_message    = COALESCE(profile_shares_via_message, 0)
      `);
      for (const col of [
        'dni_verified', 'rating', 'reviews_count', 'completed_jobs', 'work_quality_rating',
        'worker_rating', 'contract_rating', 'work_quality_reviews_count',
        'worker_reviews_count', 'contract_reviews_count', 'terms_accepted',
        'role', 'permissions', 'is_verified', 'two_factor_enabled', 'is_banned',
        'infractions', 'trust_score', 'verification_level', 'fcm_tokens', 'interests',
        'onboarding_completed', 'dont_ask_banking_info', 'is_availability_public',
        'has_membership', 'is_premium_verified', 'current_commission_rate',
        'free_contracts_remaining', 'pro_contracts_used_this_month', 'balance_ars',
        'referral_bonus_awarded', 'referral_tier', 'total_referrals', 'completed_referrals',
        'is_early_user', 'invitation_codes_remaining', 'invitation_codes_used',
        'has_referral_discount', 'referral_benefits_used', 'has_family_plan',
        'profile_shares_count', 'profile_shares_via_link', 'profile_shares_via_message',
      ]) {
        await q(`ALTER TABLE users ALTER COLUMN ${col} SET NOT NULL`);
      }

      // ================================================
      // PAYMENTS — ensure columns exist, fix NULLs, enforce NOT NULL
      // ================================================
      await q(`
        ALTER TABLE payments
          ADD COLUMN IF NOT EXISTS currency              VARCHAR(10)  DEFAULT 'ARS',
          ADD COLUMN IF NOT EXISTS payment_method        VARCHAR(30)  DEFAULT 'mercadopago',
          ADD COLUMN IF NOT EXISTS platform_fee          DECIMAL(15,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS platform_fee_percentage DECIMAL(5,2) DEFAULT 0,
          ADD COLUMN IF NOT EXISTS is_escrow             BOOLEAN      DEFAULT true,
          ADD COLUMN IF NOT EXISTS payer_confirmed       BOOLEAN      DEFAULT false,
          ADD COLUMN IF NOT EXISTS recipient_confirmed   BOOLEAN      DEFAULT false,
          ADD COLUMN IF NOT EXISTS pending_verification  BOOLEAN      DEFAULT false
      `);
      await q(`
        UPDATE payments SET
          currency                = COALESCE(currency, 'ARS'),
          status                  = COALESCE(status, 'pending'),
          payment_type            = COALESCE(payment_type, 'contract_payment'),
          payment_method          = COALESCE(payment_method, 'mercadopago'),
          platform_fee            = COALESCE(platform_fee, 0),
          platform_fee_percentage = COALESCE(platform_fee_percentage, 0),
          is_escrow               = COALESCE(is_escrow, true),
          payer_confirmed         = COALESCE(payer_confirmed, false),
          recipient_confirmed     = COALESCE(recipient_confirmed, false),
          pending_verification    = COALESCE(pending_verification, false)
      `);
      for (const col of [
        'payer_id', 'currency', 'status', 'payment_type', 'payment_method',
        'platform_fee', 'platform_fee_percentage', 'is_escrow',
        'payer_confirmed', 'recipient_confirmed', 'pending_verification',
      ]) {
        await q(`ALTER TABLE payments ALTER COLUMN ${col} SET NOT NULL`);
      }

      // ================================================
      // JOBS — ensure columns exist, fix NULLs, enforce NOT NULL
      // ================================================
      await q(`
        ALTER TABLE jobs
          ADD COLUMN IF NOT EXISTS tags                       TEXT[]         DEFAULT ARRAY[]::text[],
          ADD COLUMN IF NOT EXISTS remote_ok                  BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS end_date_flexible          BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS single_delivery            BOOLEAN        DEFAULT true,
          ADD COLUMN IF NOT EXISTS urgency                    VARCHAR(20)    DEFAULT 'medium',
          ADD COLUMN IF NOT EXISTS experience_level           VARCHAR(20)    DEFAULT 'intermediate',
          ADD COLUMN IF NOT EXISTS permanently_cancelled      BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS images                     TEXT[]         DEFAULT ARRAY[]::text[],
          ADD COLUMN IF NOT EXISTS completion_requirements    TEXT[]         DEFAULT ARRAY[]::text[],
          ADD COLUMN IF NOT EXISTS tools_required             TEXT[]         DEFAULT ARRAY[]::text[],
          ADD COLUMN IF NOT EXISTS materials_provided         BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS views                      INTEGER        DEFAULT 0,
          ADD COLUMN IF NOT EXISTS max_workers                INTEGER        DEFAULT 1,
          ADD COLUMN IF NOT EXISTS selected_workers           UUID[]         DEFAULT ARRAY[]::uuid[],
          ADD COLUMN IF NOT EXISTS worker_allocations         JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS vacancy_task_assignments   JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS allocated_total            DECIMAL(15,2)  DEFAULT 0,
          ADD COLUMN IF NOT EXISTS reminder12h_sent           BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS reminder6h_sent            BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS reminder2h_sent            BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS price_history              JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS publication_paid           BOOLEAN        DEFAULT false,
          ADD COLUMN IF NOT EXISTS publication_amount         DECIMAL(15,2)  DEFAULT 0,
          ADD COLUMN IF NOT EXISTS pending_payment_amount     DECIMAL(15,2)  DEFAULT 0,
          ADD COLUMN IF NOT EXISTS price_decrease_acceptances JSONB          DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS price_decrease_rejections  JSONB          DEFAULT '[]'
      `);
      await q(`
        UPDATE jobs SET
          tags                       = COALESCE(tags, ARRAY[]::text[]),
          remote_ok                  = COALESCE(remote_ok, false),
          end_date_flexible          = COALESCE(end_date_flexible, false),
          single_delivery            = COALESCE(single_delivery, true),
          status                     = COALESCE(status, 'draft'),
          urgency                    = COALESCE(urgency, 'medium'),
          experience_level           = COALESCE(experience_level, 'intermediate'),
          permanently_cancelled      = COALESCE(permanently_cancelled, false),
          images                     = COALESCE(images, ARRAY[]::text[]),
          completion_requirements    = COALESCE(completion_requirements, ARRAY[]::text[]),
          tools_required             = COALESCE(tools_required, ARRAY[]::text[]),
          materials_provided         = COALESCE(materials_provided, false),
          views                      = COALESCE(views, 0),
          max_workers                = COALESCE(max_workers, 1),
          selected_workers           = COALESCE(selected_workers, ARRAY[]::uuid[]),
          worker_allocations         = COALESCE(worker_allocations, '[]'::jsonb),
          vacancy_task_assignments   = COALESCE(vacancy_task_assignments, '[]'::jsonb),
          allocated_total            = COALESCE(allocated_total, 0),
          reminder12h_sent           = COALESCE(reminder12h_sent, false),
          reminder6h_sent            = COALESCE(reminder6h_sent, false),
          reminder2h_sent            = COALESCE(reminder2h_sent, false),
          price_history              = COALESCE(price_history, '[]'::jsonb),
          publication_paid           = COALESCE(publication_paid, false),
          publication_amount         = COALESCE(publication_amount, 0),
          pending_payment_amount     = COALESCE(pending_payment_amount, 0),
          price_decrease_acceptances = COALESCE(price_decrease_acceptances, '[]'::jsonb),
          price_decrease_rejections  = COALESCE(price_decrease_rejections, '[]'::jsonb)
      `);
      for (const col of [
        'tags', 'remote_ok', 'end_date_flexible', 'single_delivery', 'status',
        'urgency', 'experience_level', 'permanently_cancelled', 'images',
        'completion_requirements', 'tools_required', 'materials_provided', 'views',
        'max_workers', 'selected_workers', 'worker_allocations', 'vacancy_task_assignments',
        'allocated_total', 'reminder12h_sent', 'reminder6h_sent', 'reminder2h_sent',
        'price_history', 'publication_paid', 'publication_amount', 'pending_payment_amount',
        'price_decrease_acceptances', 'price_decrease_rejections',
      ]) {
        await q(`ALTER TABLE jobs ALTER COLUMN ${col} SET NOT NULL`);
      }

      // ================================================
      // DISPUTES — ensure columns exist, fix NULLs, enforce NOT NULL
      // ================================================
      await q(`
        ALTER TABLE disputes
          ADD COLUMN IF NOT EXISTS evidence              JSONB        DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS priority              VARCHAR(20)  DEFAULT 'medium',
          ADD COLUMN IF NOT EXISTS platform_fee_refunded BOOLEAN      DEFAULT false,
          ADD COLUMN IF NOT EXISTS messages              JSONB        DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS email_sent_to_support BOOLEAN      DEFAULT false,
          ADD COLUMN IF NOT EXISTS email_sent_to_parties BOOLEAN      DEFAULT false,
          ADD COLUMN IF NOT EXISTS importance_level      VARCHAR(20)  DEFAULT 'medium',
          ADD COLUMN IF NOT EXISTS logs                  JSONB        DEFAULT '[]'
      `);
      await q(`
        UPDATE disputes SET
          evidence              = COALESCE(evidence, '[]'::jsonb),
          status                = COALESCE(status, 'open'),
          priority              = COALESCE(priority, 'medium'),
          platform_fee_refunded = COALESCE(platform_fee_refunded, false),
          messages              = COALESCE(messages, '[]'::jsonb),
          email_sent_to_support = COALESCE(email_sent_to_support, false),
          email_sent_to_parties = COALESCE(email_sent_to_parties, false),
          importance_level      = COALESCE(importance_level, 'medium'),
          logs                  = COALESCE(logs, '[]'::jsonb)
      `);
      for (const col of [
        'evidence', 'status', 'priority', 'platform_fee_refunded', 'messages',
        'email_sent_to_support', 'email_sent_to_parties', 'importance_level', 'logs',
      ]) {
        await q(`ALTER TABLE disputes ALTER COLUMN ${col} SET NOT NULL`);
      }

      // ================================================
      // TICKETS — ensure columns exist, fix NULLs, enforce NOT NULL
      // ================================================
      await q(`
        ALTER TABLE tickets
          ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium',
          ADD COLUMN IF NOT EXISTS messages JSONB       DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS tags     TEXT[]      DEFAULT ARRAY[]::text[]
      `);
      await q(`
        UPDATE tickets SET
          priority = COALESCE(priority, 'medium'),
          status   = COALESCE(status, 'open'),
          messages = COALESCE(messages, '[]'::jsonb),
          tags     = COALESCE(tags, ARRAY[]::text[])
      `);
      for (const col of ['priority', 'status', 'messages', 'tags']) {
        await q(`ALTER TABLE tickets ALTER COLUMN ${col} SET NOT NULL`);
      }

      // ================================================
      // ENSURE COLUMNS REFERENCED IN CHECK CONSTRAINTS EXIST
      // ================================================
      await q(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS membership_tier       VARCHAR(30),
          ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS two_factor_secret     VARCHAR(255),
          ADD COLUMN IF NOT EXISTS ban_reason            TEXT,
          ADD COLUMN IF NOT EXISTS banned_at             TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS banned_by             UUID
      `);
      await q(`
        ALTER TABLE contracts
          ADD COLUMN IF NOT EXISTS dispute_id               UUID,
          ADD COLUMN IF NOT EXISTS disputed_at              TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS extension_requested_by   UUID,
          ADD COLUMN IF NOT EXISTS extension_requested_at   TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS original_end_date        TIMESTAMPTZ
      `);
      await q(`
        ALTER TABLE tickets
          ADD COLUMN IF NOT EXISTS resolution TEXT,
          ADD COLUMN IF NOT EXISTS closed_at  TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS closed_by  UUID
      `);
      await q(`
        ALTER TABLE jobs
          ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ
      `);
      await q(`
        ALTER TABLE disputes
          ADD COLUMN IF NOT EXISTS resolution      TEXT,
          ADD COLUMN IF NOT EXISTS resolved_at     TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS resolved_by     UUID,
          ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(30)
      `);
      await q(`
        ALTER TABLE payments
          ADD COLUMN IF NOT EXISTS refund_reason TEXT,
          ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS refunded_by   UUID,
          ADD COLUMN IF NOT EXISTS dispute_id    UUID,
          ADD COLUMN IF NOT EXISTS disputed_at   TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS disputed_by   UUID
      `);

      // ================================================
      // CHECK CONSTRAINTS (IF NOT EXISTS — safe to re-run)
      // ================================================
      const checks = [
        ['users', 'chk_membership_consistency',
          `has_membership = false OR (membership_tier IS NOT NULL AND membership_expires_at IS NOT NULL)`],
        ['users', 'chk_2fa_consistency',
          `two_factor_enabled = false OR two_factor_secret IS NOT NULL`],
        ['users', 'chk_ban_consistency',
          `is_banned = false OR (ban_reason IS NOT NULL AND banned_at IS NOT NULL AND banned_by IS NOT NULL)`],
        ['contracts', 'chk_dispute_consistency',
          `status != 'disputed' OR (dispute_id IS NOT NULL AND disputed_at IS NOT NULL)`],
        ['contracts', 'chk_extension_consistency',
          `has_been_extended = false OR (extension_requested_by IS NOT NULL AND extension_requested_at IS NOT NULL AND original_end_date IS NOT NULL)`],
        ['tickets', 'chk_resolution_consistency',
          `status NOT IN ('resolved', 'closed') OR resolution IS NOT NULL`],
        ['tickets', 'chk_closure_consistency',
          `status != 'closed' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)`],
        ['jobs', 'chk_enddate_flexibility',
          `end_date_flexible = true OR end_date IS NOT NULL`],
        ['jobs', 'chk_cancellation_consistency',
          `status != 'cancelled' OR cancelled_at IS NOT NULL`],
        ['disputes', 'chk_resolution_fields',
          `status NOT IN ('resolved_released','resolved_refunded','resolved_partial','cancelled') OR (resolution IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_type IS NOT NULL)`],
        ['payments', 'chk_refund_consistency',
          `status != 'refunded' OR (refund_reason IS NOT NULL AND refunded_at IS NOT NULL AND refunded_by IS NOT NULL)`],
        ['payments', 'chk_dispute_fields',
          `status != 'disputed' OR (dispute_id IS NOT NULL AND disputed_at IS NOT NULL AND disputed_by IS NOT NULL)`],
      ];
      for (const [table, name, condition] of checks) {
        // Drop first in case it exists from a partial previous run, then re-add
        await q(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
        await q(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${condition}) NOT VALID`);
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      const checkConstraints = [
        ['users',     'chk_membership_consistency'],
        ['users',     'chk_2fa_consistency'],
        ['users',     'chk_ban_consistency'],
        ['contracts', 'chk_dispute_consistency'],
        ['contracts', 'chk_extension_consistency'],
        ['tickets',   'chk_resolution_consistency'],
        ['tickets',   'chk_closure_consistency'],
        ['jobs',      'chk_enddate_flexibility'],
        ['jobs',      'chk_cancellation_consistency'],
        ['disputes',  'chk_resolution_fields'],
        ['payments',  'chk_refund_consistency'],
        ['payments',  'chk_dispute_fields'],
      ];
      for (const [table, name] of checkConstraints) {
        await q(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
      }

      const colsToNullify = {
        contracts: [
          'commission', 'status', 'terms_accepted', 'terms_accepted_by_client',
          'terms_accepted_by_doer', 'deliveries', 'payment_status', 'escrow_enabled',
          'escrow_amount', 'escrow_status', 'client_confirmed_pairing', 'doer_confirmed_pairing',
          'client_confirmed', 'doer_confirmed', 'confirmation_reminder_sent', 'confirmation_history',
          'has_been_extended', 'price_modification_history', 'extension_history', 'extension_count',
          'has_pending_task_claim', 'claimed_task_ids', 'task_claim_history',
          'is_deleted', 'infractions', 'is_hidden',
        ],
        users: [
          'dni_verified', 'rating', 'reviews_count', 'completed_jobs', 'work_quality_rating',
          'worker_rating', 'contract_rating', 'work_quality_reviews_count',
          'worker_reviews_count', 'contract_reviews_count', 'terms_accepted',
          'role', 'permissions', 'is_verified', 'two_factor_enabled', 'is_banned',
          'infractions', 'trust_score', 'verification_level', 'fcm_tokens', 'interests',
          'onboarding_completed', 'dont_ask_banking_info', 'is_availability_public',
          'has_membership', 'is_premium_verified', 'current_commission_rate',
          'free_contracts_remaining', 'pro_contracts_used_this_month', 'balance_ars',
          'referral_bonus_awarded', 'referral_tier', 'total_referrals', 'completed_referrals',
          'is_early_user', 'invitation_codes_remaining', 'invitation_codes_used',
          'has_referral_discount', 'referral_benefits_used', 'has_family_plan',
          'profile_shares_count', 'profile_shares_via_link', 'profile_shares_via_message',
        ],
        payments: [
          'payer_id', 'currency', 'status', 'payment_type', 'payment_method',
          'platform_fee', 'platform_fee_percentage', 'is_escrow',
          'payer_confirmed', 'recipient_confirmed', 'pending_verification',
        ],
        jobs: [
          'tags', 'remote_ok', 'end_date_flexible', 'single_delivery', 'status',
          'urgency', 'experience_level', 'permanently_cancelled', 'images',
          'completion_requirements', 'tools_required', 'materials_provided', 'views',
          'max_workers', 'selected_workers', 'worker_allocations', 'vacancy_task_assignments',
          'allocated_total', 'reminder12h_sent', 'reminder6h_sent', 'reminder2h_sent',
          'price_history', 'publication_paid', 'publication_amount', 'pending_payment_amount',
          'price_decrease_acceptances', 'price_decrease_rejections',
        ],
        disputes: [
          'evidence', 'status', 'priority', 'platform_fee_refunded', 'messages',
          'email_sent_to_support', 'email_sent_to_parties', 'importance_level', 'logs',
        ],
        tickets: ['priority', 'status', 'messages', 'tags'],
      };
      for (const [table, cols] of Object.entries(colsToNullify)) {
        for (const col of cols) {
          await q(`ALTER TABLE ${table} ALTER COLUMN ${col} DROP NOT NULL`);
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
