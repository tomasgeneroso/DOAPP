'use strict';

/**
 * Reclamo directo antes de la disputa: la otra parte tiene 72 h para
 * responder y arreglarlo entre ellas; si no, interviene un admin.
 * Idempotente; espejada en ensureCriticalSchema.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE disputes ADD COLUMN IF NOT EXISTS negotiation_deadline TIMESTAMPTZ;
      ALTER TABLE disputes ADD COLUMN IF NOT EXISTS agreement_proposal JSONB;
      ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escalation_reason VARCHAR(40);
      ALTER TABLE disputes ADD COLUMN IF NOT EXISTS contract_status_before VARCHAR(40);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE disputes DROP COLUMN IF EXISTS negotiation_deadline;
      ALTER TABLE disputes DROP COLUMN IF EXISTS agreement_proposal;
      ALTER TABLE disputes DROP COLUMN IF EXISTS escalation_reason;
      ALTER TABLE disputes DROP COLUMN IF EXISTS contract_status_before;
    `);
  },
};
