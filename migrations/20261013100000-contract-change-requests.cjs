'use strict';

/**
 * Solicitudes de cambio o cancelación de un contrato (la otra parte las acepta o rechaza).
 *
 * El modelo existía (ContractChangeRequest) pero la tabla no tenía migración: en producción, que no sincroniza, no
 * existía, y todo el flujo fallaba. Idempotente: IF NOT EXISTS en todo, y la espeja `ensureSchema`.
 *
 * Una sola solicitud pendiente por contrato: lo garantiza el índice único parcial, no solo la ruta.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS contract_change_requests (
        id UUID PRIMARY KEY,
        contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
        requested_by UUID NOT NULL REFERENCES users(id),
        responded_by UUID REFERENCES users(id),
        support_ticket_id UUID,
        type VARCHAR(20) NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        new_terms JSONB,
        responded_at TIMESTAMPTZ,
        escalated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS contract_change_requests_contract_id_status ON contract_change_requests (contract_id, status);
      CREATE INDEX IF NOT EXISTS contract_change_requests_status ON contract_change_requests (status);
      CREATE INDEX IF NOT EXISTS contract_change_requests_requested_by ON contract_change_requests (requested_by);
      CREATE INDEX IF NOT EXISTS contract_change_requests_created_at ON contract_change_requests (created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS contract_change_requests_one_pending ON contract_change_requests (contract_id) WHERE status = 'pending';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS contract_change_requests;');
  },
};
