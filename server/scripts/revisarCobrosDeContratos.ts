/**
 * Revisa los cobros de trabajadores anotados antes de que hubiera un solo movimiento por contrato. Vista previa por defecto; con --aplicar anula las líneas
 * repetidas (no mueven saldo) y acredita los cobros de varios lugares que quedaron pendientes para siempre. Un crédito doble NO se corrige solo.
 *
 *   npx tsx server/scripts/revisarCobrosDeContratos.ts [--aplicar]
 */
import { initDatabase, sequelize } from '../config/database.js';
import { revisarCobrosDeContratos } from '../services/cobrosDelTrabajador.js';

const NOMBRE = {
  repetido: 'Línea repetida (no mueve saldo)',
  sin_acreditar: 'Cobro de varios lugares SIN acreditar',
  acreditado_dos_veces: 'ACREDITADO MÁS DE UNA VEZ (sobra plata en el saldo)',
} as const;

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  await initDatabase();
  const hallazgos = await revisarCobrosDeContratos(aplicar);
  if (hallazgos.length === 0) console.log('No hay cobros repetidos, sin acreditar ni acreditados de más.');
  for (const h of hallazgos) {
    console.log(`${NOMBRE[h.tipo]} · $${h.monto.toLocaleString('es-AR')} · contrato ${h.contractId} · usuario ${h.userId} · movimientos ${h.movimientos.join(', ')}${h.corregido ? ' · CORREGIDO' : ''}`);
    if (h.tipo === 'acreditado_dos_veces') console.log('   Revisalo con investigarMovimiento.ts y, si corresponde, descontá lo que sobra con ajustarSaldo.ts (los dos tienen vista previa).');
  }
  if (!aplicar && hallazgos.some((h) => h.tipo !== 'acreditado_dos_veces')) console.log('\nVista previa: no se cambió nada. Con --aplicar se corrige lo que no es un crédito doble.');
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('No se pudo:', e?.message);
  process.exit(1);
});
