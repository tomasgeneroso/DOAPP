/**
 * Prueba AHORA cada parte de DOAPP y dice cuáles andan. Solo lee. Con --probar-aviso manda además un correo de prueba a quienes tienen el rol owner, para
 * comprobar que los avisos de fallas te llegan. Se corre en el servidor, desde la carpeta de la app:
 *
 *   npx tsx server/scripts/estadoDeComponentes.ts [--probar-aviso]
 */
import { initDatabase, sequelize } from '../config/database.js';
import { CHEQUEOS } from '../services/chequeosDeSalud.js';
import { avisarAlDuenoPorCorreo, __activarAvisos } from '../services/avisoAlDueno.js';
import emailService from '../services/email.js';
import { conSistema } from '../db/contextoRls.js';
import { COMPONENTES } from '../../shared/salud/componentes.js';

async function main(): Promise<void> {
  await initDatabase();
  for (const c of CHEQUEOS) {
    const motivo = await c.probar();
    console.log(`${motivo ? '✗ FALLA ' : '✓ anda  '} ${COMPONENTES[c.id].nombre}${motivo ? `: ${motivo}` : ''}`);
  }
  if (process.argv.includes('--probar-aviso')) {
    __activarAvisos(true);
    const salio = await conSistema(() => avisarAlDuenoPorCorreo({
      clave: `prueba:${Date.now()}`,
      asunto: 'Prueba de los avisos de fallas',
      quePaso: 'Esto es una prueba pedida desde el servidor. Si lo estás leyendo, los avisos de fallas te llegan.',
    }));
    console.log(salio ? '✓ El correo de prueba salió: revisá tu casilla (y la carpeta de no deseados).' : `✗ El correo de prueba NO salió. ${emailService.motivoDelUltimoFallo() || 'Revisá que haya un usuario owner con correo.'}`);
  } else {
    console.log('Para probar que el aviso te llega: agregá --probar-aviso.');
  }
  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('No se pudo:', e?.message);
  process.exit(1);
});
