import type { Sequelize } from 'sequelize-typescript';

/**
 * Idempotent "ensure schema" safety net.
 *
 * Production does NOT run `sequelize.sync()` (see database.ts) — it relies on
 * migrations. When a migration fails to run (drifted queue, deploy without
 * `db:migrate`, etc.) a table/column can be missing and queries crash with
 * `relation "..." does not exist` / `column "..." does not exist`.
 *
 * This runs a curated list of IDEMPOTENT DDL statements on startup so those
 * drift-prone tables/columns are guaranteed to exist, independent of the
 * migration queue. Every statement is `IF NOT EXISTS` (or a no-op when already
 * applied) and wrapped in try/catch, so it is safe to run on every boot and a
 * single failure never blocks the rest.
 *
 * When you add a migration for a NEW table/column that prod must have, mirror it
 * here as an idempotent statement.
 */
const STATEMENTS: Array<{ label: string; sql: string }> = [
  // --- user_analytics table (relation "user_analytics" does not exist) ---
  {
    label: 'user_analytics table',
    sql: `CREATE TABLE IF NOT EXISTS user_analytics (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      profile_views_total INTEGER NOT NULL DEFAULT 0,
      profile_views_unique INTEGER NOT NULL DEFAULT 0,
      profile_views_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      conversations_total INTEGER NOT NULL DEFAULT 0,
      conversations_with_completed_contract INTEGER NOT NULL DEFAULT 0,
      conversation_partners JSONB NOT NULL DEFAULT '[]'::jsonb,
      contracts_total_completed INTEGER NOT NULL DEFAULT 0,
      contracts_total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
      contracts_average_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
      contracts_repeat_clients INTEGER NOT NULL DEFAULT 0,
      contracts_success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      contracts_average_completion_time NUMERIC(10,2) NOT NULL DEFAULT 0,
      contracts_by_category JSONB NOT NULL DEFAULT '[]'::jsonb,
      contracts_monthly_stats JSONB NOT NULL DEFAULT '[]'::jsonb,
      search_appearances_total INTEGER NOT NULL DEFAULT 0,
      search_clicked_from_search INTEGER NOT NULL DEFAULT 0,
      search_click_through_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      engagement_proposals_sent INTEGER NOT NULL DEFAULT 0,
      engagement_proposals_accepted INTEGER NOT NULL DEFAULT 0,
      engagement_acceptance_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      engagement_average_response_time NUMERIC(10,2) NOT NULL DEFAULT 0,
      engagement_jobs_posted INTEGER NOT NULL DEFAULT 0,
      engagement_jobs_completed INTEGER NOT NULL DEFAULT 0,
      peak_activity_most_active_day VARCHAR(20),
      peak_activity_most_active_hour INTEGER,
      peak_activity_most_active_month VARCHAR(20),
      last_calculated TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  },
  { label: 'user_analytics user_id unique index', sql: `CREATE UNIQUE INDEX IF NOT EXISTS user_analytics_user_id_unique ON user_analytics (user_id)` },
  { label: 'user_analytics last_calculated index', sql: `CREATE INDEX IF NOT EXISTS user_analytics_last_calculated ON user_analytics (last_calculated)` },

  // --- jobs.allow_counter_offers ---
  { label: 'jobs.allow_counter_offers', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS allow_counter_offers BOOLEAN NOT NULL DEFAULT true` },

  // --- payment_proofs classification / provenance (notas de comprobante) ---
  { label: 'payment_proofs.kind', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'client_receipt'` },
  { label: 'payment_proofs.sequence', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sequence INTEGER` },
  { label: 'payment_proofs.uploaded_by_role', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(16)` },
  { label: 'payment_proofs.bank_reference', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(120)` },
  { label: 'payment_proofs bank_reference index', sql: `CREATE INDEX IF NOT EXISTS payment_proofs_bank_reference ON payment_proofs (bank_reference)` },

  // --- payment_proofs: file columns nullable for text-only notes ---
  { label: 'payment_proofs.file_url nullable', sql: `ALTER TABLE payment_proofs ALTER COLUMN file_url DROP NOT NULL` },
  { label: 'payment_proofs.file_type nullable', sql: `ALTER TABLE payment_proofs ALTER COLUMN file_type DROP NOT NULL` },
  { label: 'payment_proofs.file_name nullable', sql: `ALTER TABLE payment_proofs ALTER COLUMN file_name DROP NOT NULL` },

  // --- banned_identities: permanent email+dni history of banned users ---
  {
    label: 'banned_identities table',
    sql: `CREATE TABLE IF NOT EXISTS banned_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      dni VARCHAR(255),
      user_id UUID,
      name VARCHAR(255),
      reason TEXT NOT NULL,
      banned_by UUID,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  },
  { label: 'banned_identities email index', sql: `CREATE INDEX IF NOT EXISTS banned_identities_email ON banned_identities (email)` },
  { label: 'banned_identities dni index', sql: `CREATE INDEX IF NOT EXISTS banned_identities_dni ON banned_identities (dni)` },
];

export async function ensureCriticalSchema(sequelize: Sequelize): Promise<void> {
  let ok = 0;
  let failed = 0;
  for (const { label, sql } of STATEMENTS) {
    try {
      await sequelize.query(sql);
      ok++;
    } catch (err: any) {
      failed++;
      // Non-fatal: a single statement failing must not block startup or the rest.
      console.warn(`⚠️  [ensureSchema] "${label}" skipped: ${err?.message}`);
    }
  }
  console.log(`✅ ensureCriticalSchema: ${ok} ok${failed ? `, ${failed} skipped` : ''}`);
}
