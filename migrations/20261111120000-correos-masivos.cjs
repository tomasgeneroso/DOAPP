'use strict';

/**
 * Módulo de correos a usuarios (regla del dueño, 2026-11-11): plantillas, grupos de destinatarios, campañas con envío escalonado y baja de correos.
 *
 *  - email_templates: lo que el equipo escribe (asunto, texto, botón) y la categoría (`servicio` = recordatorios de la propia cuenta; `promocional` = solo a quien aceptó recibirlos).
 *  - email_audiences: grupos de destinatarios = filtros guardados con un nombre (se evalúan al armar la campaña).
 *  - email_campaigns: una tanda de envío. Guarda COPIA del texto y de los filtros al crearla: editar la plantilla después no cambia lo que ya salió.
 *  - email_campaign_recipients: una fila por persona y campaña (solo el id de la persona, no su correo): sirve para no mandar dos veces, retomar un envío cortado y contar.
 *  - users.marketing_emails_unsubscribed_at: la persona se dio de baja desde el enlace del pie de un correo.
 * Idempotente (IF NOT EXISTS); espejo en server/config/ensureSchema.ts.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_emails_unsubscribed_at TIMESTAMPTZ');

    await q(`CREATE TABLE IF NOT EXISTS email_templates (
      id UUID PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      category VARCHAR(20) NOT NULL DEFAULT 'servicio',
      subject VARCHAR(150) NOT NULL,
      body TEXT NOT NULL,
      button_label VARCHAR(40),
      button_url VARCHAR(300),
      created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await q(`CREATE TABLE IF NOT EXISTS email_audiences (
      id UUID PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(300),
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await q(`CREATE TABLE IF NOT EXISTS email_campaigns (
      id UUID PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      category VARCHAR(20) NOT NULL DEFAULT 'servicio',
      template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
      audience_id UUID REFERENCES email_audiences(id) ON DELETE SET NULL,
      template_name VARCHAR(80),
      audience_name VARCHAR(80),
      subject VARCHAR(150) NOT NULL,
      body TEXT NOT NULL,
      button_label VARCHAR(40),
      button_url VARCHAR(300),
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      pace VARCHAR(10) NOT NULL DEFAULT 'normal',
      total_recipients INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await q('CREATE INDEX IF NOT EXISTS email_campaigns_status ON email_campaigns (status)');

    await q(`CREATE TABLE IF NOT EXISTS email_campaign_recipients (
      id UUID PRIMARY KEY,
      campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      error VARCHAR(300),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await q('CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_campaign_user ON email_campaign_recipients (campaign_id, user_id)');
    await q('CREATE INDEX IF NOT EXISTS email_campaign_recipients_campaign_status ON email_campaign_recipients (campaign_id, status)');
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP TABLE IF EXISTS email_campaign_recipients');
    await q('DROP TABLE IF EXISTS email_campaigns');
    await q('DROP TABLE IF EXISTS email_audiences');
    await q('DROP TABLE IF EXISTS email_templates');
    await q('ALTER TABLE users DROP COLUMN IF EXISTS marketing_emails_unsubscribed_at');
  },
};
