'use strict';

/**
 * Cada pago sabe de qué TRABAJO es (2026-11-09). Idempotente; espejo en server/config/ensureSchema.ts.
 *
 * Hasta hoy un pago llegaba al trabajo por un solo puntero débil: `jobs.publication_payment_id`, que además se PISA (un aumento de presupuesto reusa el campo
 * y el pago original de la publicación quedaba inalcanzable), o por `payments.contract_id` (solo los pagos de contrato). Una cotización pagada antes de que
 * exista el contrato solo recordaba su propuesta en la metadata. Con eso no se podía buscar «todo lo de esta publicación» por cualquier id.
 *
 *  - `payments.job_id`: el trabajo del pago. Lo completa el modelo al guardar (desde el contrato, la propuesta o la metadata) y el trabajo al fijar su pago
 *    de publicación (ver Payment.model.ts y Job.model.ts); acá se completan los que ya existían. No es obligatorio: un pago de membresía no tiene trabajo.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('ALTER TABLE payments ADD COLUMN IF NOT EXISTS job_id UUID');
    await q('CREATE INDEX IF NOT EXISTS payments_job_id ON payments (job_id) WHERE job_id IS NOT NULL');

    // Los que ya existían, de más a menos seguro. Cada UPDATE solo toca los que siguen sin trabajo (correrlo de nuevo no cambia nada).
    // 1) el pago con el que se publicó el trabajo
    await q('UPDATE payments p SET job_id = j.id FROM jobs j WHERE p.job_id IS NULL AND j.publication_payment_id = p.id');
    // 2) el pago de un contrato
    await q('UPDATE payments p SET job_id = c.job_id FROM contracts c WHERE p.job_id IS NULL AND p.contract_id = c.id');
    // 3) lo que dice la metadata: el trabajo, o la propuesta (una cotización pagada antes de que exista el contrato)
    await q(`UPDATE payments p SET job_id = j.id FROM jobs j
              WHERE p.job_id IS NULL AND (p.metadata->>'jobId') ~ '^[0-9a-fA-F-]{36}$' AND j.id = (p.metadata->>'jobId')::uuid`);
    await q(`UPDATE payments p SET job_id = pr.job_id FROM proposals pr
              WHERE p.job_id IS NULL AND (p.metadata->>'proposalId') ~ '^[0-9a-fA-F-]{36}$' AND pr.id = (p.metadata->>'proposalId')::uuid AND pr.job_id IS NOT NULL`);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q('DROP INDEX IF EXISTS payments_job_id');
    await q('ALTER TABLE payments DROP COLUMN IF EXISTS job_id');
  },
};
