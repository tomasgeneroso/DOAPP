/**
 * Trabajos publicados con un «contrato gratuito» ANTES de la corrección (los contratos son libres de COMISIÓN, no gratis).
 *
 * Con un cupo libre de comisión el servidor publicaba el trabajo sin cobrar nada y lo marcaba `publication_paid = true`: el costo del trabajo
 * y el del medio de pago nunca se cobraron, y al contratar `settleQuote` los dio por pagados. Este informe lista los trabajos con esa marca
 * (pagados, de precio fijo, con `publication_amount = 0` y SIN ningún pago de publicación asociado). Es SOLO LECTURA: no cambia nada.
 *
 * Los trabajos «a cotizar» que se pagaron al aceptar una cotización pueden aparecer también (su pago es de otro tipo): se distinguen porque
 * tienen un pago `completed` del cliente ligado al contrato. Revisar a mano antes de actuar.
 *
 * Uso:  npx tsx server/scripts/trabajosPublicadosSinPago.ts
 * Salida: 0 = ninguno, 1 = hay trabajos para revisar, 2 = error.
 */
import { sequelize, initDatabase } from '../config/database.js';

(async () => {
  await initDatabase();
  const [filas]: any = await sequelize.query(`
    SELECT j.id, j.title, j.status, j.price, j.client_id, j.created_at,
           (SELECT COUNT(*) FROM contracts c WHERE c.job_id = j.id) AS contratos
    FROM jobs j
    WHERE j.publication_paid = true
      AND COALESCE(j.publication_amount, 0) = 0
      AND j.publication_payment_id IS NULL
      AND j.pricing_mode = 'fixed'
      AND j.status IN ('open', 'in_progress', 'completed', 'paused')
    ORDER BY j.created_at DESC
  `);

  if (filas.length === 0) {
    console.log('✅ Ningún trabajo publicado sin pago.');
    process.exit(0);
  }
  console.log(`⚠️  ${filas.length} trabajo(s) marcados como pagados sin ningún pago de publicación:`);
  for (const f of filas) {
    console.log(`- ${f.id} · ${f.status} · $${Number(f.price).toLocaleString('es-AR')} · cliente ${f.client_id} · ${new Date(f.created_at).toISOString().slice(0, 10)} · contratos: ${f.contratos}`);
  }
  console.log('\nPara los que todavía no tienen contrato, el cliente tiene que pagar al contratar: poner publication_paid = false en esos trabajos.');
  process.exit(1);
})().catch((e) => {
  console.error('Error:', e?.message);
  process.exit(2);
});
