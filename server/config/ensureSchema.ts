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
/**
 * Se exporta para que un test pueda comprobar que cada sentencia nombra
 * columnas que los modelos realmente esperan.
 *
 * Hace falta porque estas sentencias corren envueltas en try/catch: una que
 * nombra mal una columna no rompe el arranque, sólo imprime un aviso que nadie
 * mira. Así estuvo roto el registro de movimientos de dinero durante días.
 */
export const STATEMENTS: Array<{ label: string; sql: string }> = [
  // --- memberships: precio de lista en euros ---
  { label: 'memberships.price_eur', sql: `ALTER TABLE memberships ADD COLUMN IF NOT EXISTS price_eur NUMERIC(10,2)` },
  // --- auditoría: eventos de dinero que no dispara una persona ---
  // Sin esto, logMoneyEvent falla contra la restricción NOT NULL y los
  // movimientos automáticos (contracargos, pagos bloqueados) no se registran.
  // Es justo lo que hay que poder reconstruir cuando se discute plata.
  // OJO: audit_logs es de las pocas tablas SIN `underscored: true`, así que sus
  // columnas son camelCase y en Postgres necesitan comillas dobles. Sin ellas,
  // "performedBy" se lee como performedby y el ALTER no encuentra nada — falla
  // en silencio, que es cómo esto estuvo roto en producción sin que se notara.
  { label: 'audit_logs.performedBy nullable', sql: `ALTER TABLE audit_logs ALTER COLUMN "performedBy" DROP NOT NULL` },
  { label: 'audit_logs.adminRole nullable', sql: `ALTER TABLE audit_logs ALTER COLUMN "adminRole" DROP NOT NULL` },
  { label: 'audit_logs.actor', sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor VARCHAR(60)` },
  { label: 'audit_logs.metadataGz', sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "metadataGz" BYTEA` },
  // --- controles sobre el dinero ---
  // Sin fraud_hold_*, una alerta de fraude no puede retener el pago y el escrow
  // se libera solo a las dos horas. Sin banking_info_updated_at no hay
  // enfriamiento y una cuenta tomada se vacía en segundos.
  { label: 'contracts.fraud_hold_at', sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS fraud_hold_at TIMESTAMPTZ` },
  { label: 'contracts.fraud_hold_reason', sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS fraud_hold_reason TEXT` },
  { label: 'contracts.fraud_hold_cleared_at', sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS fraud_hold_cleared_at TIMESTAMPTZ` },
  { label: 'contracts.fraud_hold_cleared_by', sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS fraud_hold_cleared_by UUID` },
  // --- invitaciones de creadores de contenido (ver migración 20261012110000) ---
  { label: 'influencer_invites', sql: `CREATE TABLE IF NOT EXISTS influencer_invites (id UUID PRIMARY KEY, code VARCHAR(24) NOT NULL, batch_id UUID NOT NULL, influencer_name VARCHAR(120) NOT NULL, influencer_handle VARCHAR(160), free_days INTEGER NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, expires_at TIMESTAMPTZ, redeemed_by_id UUID REFERENCES users(id) ON DELETE SET NULL, redeemed_at TIMESTAMPTZ, benefit_ends_at TIMESTAMPTZ, created_by_id UUID NOT NULL REFERENCES users(id), notes TEXT, deactivated_reason TEXT, deactivated_at TIMESTAMPTZ, deactivated_by_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
  { label: 'influencer_invites.code unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS influencer_invites_code_unique ON influencer_invites (code)` },
  { label: 'contract_change_requests', sql: `CREATE TABLE IF NOT EXISTS contract_change_requests (id UUID PRIMARY KEY, contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE, requested_by UUID NOT NULL REFERENCES users(id), responded_by UUID REFERENCES users(id), support_ticket_id UUID, type VARCHAR(20) NOT NULL, reason TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', new_terms JSONB, responded_at TIMESTAMPTZ, escalated_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
  { label: 'contract_change_requests.contract_id,status', sql: `CREATE INDEX IF NOT EXISTS contract_change_requests_contract_id_status ON contract_change_requests (contract_id, status)` },
  { label: 'contract_change_requests.status', sql: `CREATE INDEX IF NOT EXISTS contract_change_requests_status ON contract_change_requests (status)` },
  { label: 'contract_change_requests.requested_by', sql: `CREATE INDEX IF NOT EXISTS contract_change_requests_requested_by ON contract_change_requests (requested_by)` },
  { label: 'contract_change_requests.created_at', sql: `CREATE INDEX IF NOT EXISTS contract_change_requests_created_at ON contract_change_requests (created_at)` },
  { label: 'contract_change_requests one pending', sql: `CREATE UNIQUE INDEX IF NOT EXISTS contract_change_requests_one_pending ON contract_change_requests (contract_id) WHERE status = 'pending'` },
  // El DNI no se repite (si hoy hubiera repetidos, el índice no se crea y la corrida lo anota en el log; nada se borra)
  { label: 'users.dni unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS users_dni_unique ON users (dni) WHERE dni IS NOT NULL AND dni <> ''` },
  { label: 'influencer_invites.batch_id', sql: `CREATE INDEX IF NOT EXISTS influencer_invites_batch_id ON influencer_invites (batch_id)` },
  { label: 'users.commission_free_until', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_free_until TIMESTAMPTZ` },
  { label: 'users.influencer_invite_id', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS influencer_invite_id UUID` },
  // --- matrícula profesional encriptada (ver migración 20261012100000) ---
  { label: 'users.license_number text', sql: `ALTER TABLE users ALTER COLUMN license_number TYPE TEXT` },
  { label: 'users.license_document_back_url', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS license_document_back_url TEXT` },
  { label: 'users.banking_info_updated_at', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS banking_info_updated_at TIMESTAMPTZ` },
  // Sin esta columna no hay techo contra el que verificar una devolución, y la
  // protección contra devoluciones dobles deja de existir. Se me había pasado
  // espejarla acá cuando escribí su migración.
  { label: 'payments.refunded_amount', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0` },
  { label: 'payments.processing_fee', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processing_fee NUMERIC(12,2)` },
  { label: 'payments.net_received_amount', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS net_received_amount NUMERIC(12,2)` },
  { label: 'payments.money_release_date', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS money_release_date TIMESTAMPTZ` },
  // Lo que se le cobro al cliente por procesamiento (sin IVA). Sin esta columna
  // el precio del trabajo no se puede reconstruir desde el pago.
  { label: 'payments.processing_charge', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS processing_charge NUMERIC(12,2)` },
  // Parte de un aumento de precio reservada del saldo a favor hasta que se
  // acredita el pago del resto. Se escribia sin columna: se perdia.
  { label: 'jobs.pending_balance_deduction', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pending_balance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0` },
  // Saldo a favor que volvio de ESTA publicacion cancelada (sirve para reprogramarla pagando con el). Si se retira, baja.
  { label: 'jobs.publication_credit', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS publication_credit NUMERIC(12,2) NOT NULL DEFAULT 0` },
  // La pauso un administrador (estado `paused`): el cron de fechas flexibles no la toca y el dueño la edita y la vuelve a publicar.
  { label: 'jobs.paused_by_admin', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS paused_by_admin BOOLEAN NOT NULL DEFAULT false` },
  // Las fechas de antes de la ultima reprogramacion (el panel de admin muestra de donde viene la fecha nueva).
  { label: 'jobs.rescheduled_from', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rescheduled_from JSONB` },
  // Por donde eligio el cliente que vuelva su plata si se cancela.
  { label: 'jobs.cancellation_refund_preference', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_refund_preference VARCHAR(20)` },
  // El cliente pidio cancelar mientras esperaba aprobacion: sale de una cola y entra a otra.
  { label: 'jobs.cancellation_requested_at', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ` },
  /**
   * Modo de pago: 'escrow' (con proteccion, el normal) u 'on_completion' (sin
   * retencion, se paga al terminar). Va en las dos tablas a proposito: el
   * contrato copia el modo del trabajo al crearse y no lo mira mas, para que
   * cambiar el modo de una publicacion no le cambie las reglas a mitad de
   * camino a un contrato vivo.
   */
  { label: 'jobs.payment_mode', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'escrow'` },
  { label: 'contracts.payment_mode', sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) NOT NULL DEFAULT 'escrow'` },
  // Vencimiento de la orden de pago al terminar. Una orden abierta para siempre
  // es plata que nadie reclama y un contrato que nunca cierra.
  { label: 'payments.expires_at', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ` },
  /**
   * 'on_completion' como tipo de pago: la orden que se crea cuando el trabajo
   * termina, en el modo sin retencion.
   *
   * Se busca el nombre del tipo en vez de escribirlo: segun como haya quedado
   * la tabla en cada entorno, payment_type puede ser un ENUM de Postgres o un
   * VARCHAR, y un ALTER TYPE sobre un VARCHAR revienta. Si no es un enum, no
   * hay nada que agregar y el bloque no hace nada.
   */
  {
    label: "payments.payment_type += 'on_completion'",
    sql: `
      DO $$
      DECLARE nombre_tipo text;
      BEGIN
        SELECT t.typname INTO nombre_tipo
        FROM pg_type t
        JOIN pg_attribute a ON a.atttypid = t.oid
        JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'payments' AND a.attname = 'payment_type' AND t.typtype = 'e';

        IF nombre_tipo IS NOT NULL THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', nombre_tipo, 'on_completion');
        END IF;
      END $$;
    `,
  },
  // Registro en pasos: la cuenta existe pero falta verificar la identidad y completar los datos.
  { label: 'users.registration_pending', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_pending BOOLEAN NOT NULL DEFAULT false` },
  // Contratos libres de comisión: se gasta un cupo una sola vez por trabajo.
  { label: 'jobs.commission_free_applied', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS commission_free_applied BOOLEAN NOT NULL DEFAULT false` },
  // Una sesión de verificación de Didit pertenece a UNA sola cuenta.
  { label: 'users.didit_session_id único', sql: `CREATE UNIQUE INDEX IF NOT EXISTS users_didit_session_id_unico ON users (didit_session_id) WHERE didit_session_id IS NOT NULL` },
  /**
   * Postularse a un trabajo fallaba en producción con «null value in column "doer_id" of relation "proposals" violates not-null
   * constraint»: la tabla conservaba una columna de un esquema viejo (doer_id, NOT NULL) que el modelo actual (freelancer_id) no
   * escribe. Se vuelven opcionales las columnas heredadas y se rellena doer_id con freelancer_id.
   */
  { label: 'proposals: columnas heredadas sin NOT NULL', sql: `
      DO $$
      DECLARE col record;
      BEGIN
        -- Columnas heredadas de un esquema viejo (por ejemplo doer_id) que el modelo ya no escribe: si siguen NOT NULL sin valor por
        -- defecto, cada propuesta nueva revienta con «null value in column "doer_id" … violates not-null constraint».
        FOR col IN
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'proposals'
            AND is_nullable = 'NO' AND column_default IS NULL
            AND column_name NOT IN ('id', 'freelancer_id', 'client_id', 'cover_letter', 'proposed_price', 'estimated_duration', 'status', 'created_at', 'updated_at')
        LOOP
          EXECUTE format('ALTER TABLE proposals ALTER COLUMN %I DROP NOT NULL', col.column_name);
        END LOOP;

        -- Lo que el esquema viejo llamaba doer_id es hoy freelancer_id: las filas que quedaron sin valor lo toman de ahí.
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'proposals' AND column_name = 'doer_id') THEN
          EXECUTE 'UPDATE proposals SET doer_id = freelancer_id WHERE doer_id IS NULL';
        END IF;
      END $$;
    ` },
  // Reclamo directo antes de la disputa: plazo, propuesta de acuerdo, por que escalo, y a que estado vuelve el contrato.
  { label: 'disputes.negotiation_deadline', sql: `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS negotiation_deadline TIMESTAMPTZ` },
  { label: 'disputes.agreement_proposal', sql: `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS agreement_proposal JSONB` },
  { label: 'disputes.escalation_reason', sql: `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(40)` },
  { label: 'disputes.contract_status_before', sql: `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS contract_status_before VARCHAR(40)` },
  // Un acuerdo aceptado espera a que un admin ejecute la transaccion.
  { label: 'disputes.agreement_accepted_at', sql: `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ` },
  { label: 'disputes.agreement_accepted_by', sql: `ALTER TABLE disputes ADD COLUMN IF NOT EXISTS agreement_accepted_by UUID` },
  // Reseña: nota privada que solo lee el reseñado y administracion.
  { label: 'reviews.private_comment', sql: `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS private_comment TEXT` },
  // Escalera de cancelaciones del trabajador.
  { label: 'users.cancellation_mark_until', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS cancellation_mark_until TIMESTAMPTZ` },
  { label: 'users.suspended_from_applying_until', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_from_applying_until TIMESTAMPTZ` },
  // --- blog: agent authorship, review gate and answer-engine blocks ---
  { label: 'blog_posts.generated_by', sql: `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS generated_by VARCHAR(16) NOT NULL DEFAULT 'human'` },
  { label: 'blog_posts.reviewed_by', sql: `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS reviewed_by UUID` },
  { label: 'blog_posts.reviewed_at', sql: `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ` },
  { label: 'blog_posts.rejection_reason', sql: `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS rejection_reason TEXT` },
  { label: 'blog_posts.faq', sql: `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS faq JSONB NOT NULL DEFAULT '[]'::jsonb` },
  { label: 'blog_posts.key_takeaways', sql: `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb` },
  // --- owner-controlled runtime settings + per-action passwords ---
  {
    label: 'app_settings table',
    sql: `CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  },
  {
    label: 'action_passwords table',
    sql: `CREATE TABLE IF NOT EXISTS action_passwords (
      action VARCHAR(64) PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      created_by UUID,
      reset_token_hash VARCHAR(255),
      reset_token_expires TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  },
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

  // --- publicacion a cotizar y pausa por inactividad ---
  { label: 'jobs.pricing_mode', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(10) NOT NULL DEFAULT 'fixed'` },
  { label: 'jobs.paused_for_inactivity_at', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS paused_for_inactivity_at TIMESTAMPTZ` },
  { label: 'jobs.resumed_at', sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ` },

  // --- payment_proofs classification / provenance (notas de comprobante) ---
  { label: 'payment_proofs.kind', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'client_receipt'` },
  { label: 'payment_proofs.sequence', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sequence INTEGER` },
  { label: 'payment_proofs.uploaded_by_role', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS uploaded_by_role VARCHAR(16)` },
  { label: 'payment_proofs.bank_reference', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(120)` },
  { label: 'payment_proofs.sender_name', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sender_name VARCHAR(160)` },
  { label: 'payment_proofs.sender_document', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS sender_document VARCHAR(20)` },
  { label: 'payment_proofs.transfer_date', sql: `ALTER TABLE payment_proofs ADD COLUMN IF NOT EXISTS transfer_date DATE` },
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

  // --- profile credibility ladder: phone verification, selfie, insurance ---
  { label: 'users.phone_verified', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false` },
  { label: 'users.phone_verified_at', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ` },
  { label: 'users.phone_verification_code', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_code VARCHAR(10)` },
  { label: 'users.phone_verification_expires', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_expires TIMESTAMPTZ` },
  { label: 'users.selfie_url', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_url TEXT` },
  { label: 'users.insurance_document_url', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_document_url TEXT` },
  { label: 'users.insurance_verified', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_verified BOOLEAN NOT NULL DEFAULT false` },
  { label: 'users.insurance_verification_status', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_verification_status VARCHAR(20) DEFAULT 'pending'` },
  { label: 'users.insurance_rejected_reason', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_rejected_reason TEXT` },
  { label: 'users.insurance_verified_by', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_verified_by UUID` },
  { label: 'users.insurance_verified_at', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_verified_at TIMESTAMPTZ` },
  { label: 'users.insurance_expires_at', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_expires_at TIMESTAMPTZ` },

  // --- Didit KYC ---
  { label: 'users.didit_session_id', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_session_id VARCHAR(255)` },
  { label: 'users.kyc_status', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20)` },
  { label: 'users.kyc_verified_at', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ` },
  { label: 'users.kyc_data', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_data JSONB` },
  { label: 'users.kyc_attempts', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_attempts INTEGER NOT NULL DEFAULT 0` },
  // Reputacion separada por rol (migracion 20260821120000). Las columnas son
  // NOT NULL, asi que si la migracion no corrio la app arranca y revienta en
  // el primer SELECT de users.
  { label: 'users.doer_rating', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS doer_rating NUMERIC(3,2) NOT NULL DEFAULT 0` },
  { label: 'users.client_rating', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS client_rating NUMERIC(3,2) NOT NULL DEFAULT 0` },
  { label: 'users.doer_reviews_count', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS doer_reviews_count INTEGER NOT NULL DEFAULT 0` },
  { label: 'users.client_reviews_count', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS client_reviews_count INTEGER NOT NULL DEFAULT 0` },
  { label: 'users.rating_breakdown', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb` },

  // Puntuacion post-trabajo (migracion 20260820120000).
  { label: 'reviews.reviewed_role', sql: `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewed_role VARCHAR(10)` },
  { label: 'reviews.recommends_app', sql: `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS recommends_app BOOLEAN` },
  { label: 'reviews.source', sql: `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'full'` },

  // Plan de negocio del owner (migracion 20260826120000).
  {
    label: 'business_plans',
    sql: `CREATE TABLE IF NOT EXISTS business_plans (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(60) NOT NULL UNIQUE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by_id UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },
  // Libro de acciones financieras. El indice parcial es la regla de negocio:
  // un solo resultado terminal por contrato (o se paga, o se devuelve).
  {
    label: 'payment_actions',
    sql: `CREATE TABLE IF NOT EXISTS payment_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contract_id UUID NOT NULL REFERENCES contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      payment_id UUID,
      provider VARCHAR(24) NOT NULL,
      action_type VARCHAR(24) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'CREATED',
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(8) NOT NULL DEFAULT 'ARS',
      external_reference VARCHAR(120),
      idempotency_key VARCHAR(160) NOT NULL UNIQUE,
      request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      provider_resource_id VARCHAR(120),
      error_detail TEXT,
      executed_by_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  },
  {
    label: 'payment_actions.one_terminal_per_contract',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS payment_actions_one_terminal_per_contract
      ON payment_actions (contract_id)
      WHERE action_type IN ('PAYOUT', 'REFUND_TOTAL', 'REFUND_PARTIAL')
        AND status <> 'FAILED'`,
  },
  // Un aviso de perfil no trae imagen ni link propios: la tarjeta se arma con
  // los datos del usuario. Sin esto, promocionarse falla con un NOT NULL.
  {
    label: 'advertisements.image_url nullable',
    sql: `ALTER TABLE advertisements ALTER COLUMN image_url DROP NOT NULL`,
  },
  {
    label: 'advertisements.target_url nullable',
    sql: `ALTER TABLE advertisements ALTER COLUMN target_url DROP NOT NULL`,
  },
  // La ampliacion de contrato ahora se cobra antes de aplicarse.
  {
    label: 'contracts.extension_payment_id',
    sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS extension_payment_id UUID`,
  },
  // Control diario del contrato.
  {
    label: 'contracts.daily_log',
    sql: `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS daily_log JSONB NOT NULL DEFAULT '[]'::jsonb`,
  },
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
  /**
   * Cero exitos con fallos no es "algunos saltados": es la red de seguridad
   * entera sin correr.
   *
   * Hasta acá esto imprimía ✅ igual. Si algún día se llama con la conexión
   * equivocada —o sin conexión, que es como lo descubrí— el arranque diría que
   * todo bien mientras ninguna de las columnas propensas a desfasarse existe,
   * y el error saldría después, en una request, como "column does not exist".
   * Este archivo existe justamente para que eso no pase.
   */
  if (ok === 0 && failed > 0) {
    console.error(
      `❌ ensureCriticalSchema NO aplicó nada: los ${failed} enunciados fallaron. ` +
        'Revisá la conexión a la base antes de seguir: el esquema no está garantizado.',
    );
    return;
  }

  console.log(`✅ ensureCriticalSchema: ${ok} ok${failed ? `, ${failed} skipped` : ''}`);
}
