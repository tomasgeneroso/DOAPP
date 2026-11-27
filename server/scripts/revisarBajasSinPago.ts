/**
 * Solo LEE. Lista el saldo acreditado por bajar un presupuesto sin un pago real detrás.
 *   npx tsx server/scripts/revisarBajasSinPago.ts
 */
import 'dotenv/config';
import { sequelize } from '../config/database.js';
import { bajasSinPago } from '../services/bajasSinPago.js';

async function main() {
  const casos = await bajasSinPago();
  if (casos.length === 0) {
    console.log('✅ No hay saldo acreditado por bajas de presupuesto sin un pago detrás.');
    return;
  }
  console.log(`⚠️  ${casos.length} movimiento(s) para revisar (solo identificadores, sin datos personales):\n`);
  for (const c of casos) {
    console.log(`• movimiento ${c.movimiento} · $${c.monto.toLocaleString('es-AR')} · ${new Date(c.fecha).toLocaleDateString('es-AR')}`);
    console.log(`  persona ${c.persona} · trabajo ${c.trabajo} (${c.estadoDelTrabajo ?? 'no está'}) · retiros pedidos después: $${c.retirosPedidosDespues.toLocaleString('es-AR')}`);
  }
  console.log(`\nTotal: $${casos.reduce((s, c) => s + c.monto, 0).toLocaleString('es-AR')}. Antes de aprobar retiros de esas personas, revisá cada caso (investigarMovimiento.ts); lo que sobre se corrige con ajustarSaldo.ts.`);
}

main()
  .catch((e) => { console.error('No se pudo revisar:', e?.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
