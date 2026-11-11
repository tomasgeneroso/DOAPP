'use strict';

/**
 * Pedidos de reembolso de pagos por transferencia (2026-11-09). Idempotente; espejo en server/config/ensureSchema.ts.
 * Solo hay UN pedido pendiente por pago (índice único parcial).
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`CREATE TABLE IF NOT EXISTS refund_requests (
      id UUID PRIMARY KEY,
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      requested_by UUID NOT NULL REFERENCES users(id),
      amount NUMERIC(12,2),
      reason TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      destination VARCHAR(10),
      resolved_amount NUMERIC(12,2),
      resolved_by UUID REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      resolution_note TEXT,
      proof_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await q('CREATE INDEX IF NOT EXISTS refund_requests_payment_id ON refund_requests (payment_id)');
    await q('CREATE INDEX IF NOT EXISTS refund_requests_requested_by ON refund_requests (requested_by)');
    await q('CREATE INDEX IF NOT EXISTS refund_requests_status ON refund_requests (status)');
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_one_pending ON refund_requests (payment_id) WHERE status = 'pending'`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS refund_requests');
  },
};
