'use strict';

/**
 * Vincula a su publicación el saldo que YA volvió de una publicación cancelada sin trabajador (antes de que existiera `jobs.publication_credit`).
 *
 * Sin esto, esas publicaciones figuran como «ya devueltas» (reprogramarlas pasa por pago) pero no tienen crédito vinculado, y el cliente no
 * puede usar ese saldo para volver a pagarlas. El crédito es lo de la PRIMERA devolución de cada publicación, sin pasar de lo que el
 * usuario tiene hoy en el saldo (si ya retiró, no queda crédito). Solo toca publicaciones cancelada/pendiente de pago con crédito 0.
 *
 * Una sola vez: queda registrada como corrida. Las devoluciones nuevas vinculan el crédito en el momento (services/jobCancellation.ts).
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE jobs j
         SET publication_credit = LEAST(r.amount, GREATEST(0, COALESCE(u.balance_ars, 0)))
        FROM (
          SELECT DISTINCT ON (metadata->>'jobId') metadata->>'jobId' AS job_id, amount
            FROM balance_transactions
           WHERE type = 'refund' AND status = 'completed'
             AND metadata->>'origen' = 'cancelacion' AND metadata->>'jobId' IS NOT NULL
           ORDER BY metadata->>'jobId', created_at ASC
        ) r, users u
       WHERE j.id::text = r.job_id
         AND u.id = j.client_id
         AND j.status IN ('cancelled', 'pending_payment')
         AND j.publication_credit = 0
         AND COALESCE(j.selected_workers::text, '') IN ('', '{}', '[]')
    `);
  },

  async down() {
    // Dato derivado del libro: no se deshace (la columna se quita en la migración que la creó).
  },
};
