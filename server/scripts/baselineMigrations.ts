/**
 * Sella las migraciones que el esquema YA refleja.
 *
 * El problema: cuando una base se crea con `sequelize.sync()` en vez de con
 * migraciones, las tablas quedan bien pero `SequelizeMeta` queda vacia. A
 * partir de ahi `db:migrate` intenta aplicar las 97 migraciones desde cero y
 * choca contra la primera columna que ya existe. La cola queda trabada y
 * ninguna migracion nueva puede correr.
 *
 * La solucion NO es tocar el esquema: es anotar en `SequelizeMeta` los nombres
 * de las migraciones que ya estan reflejadas, para que `db:migrate` las saltee
 * y corra solo las nuevas.
 *
 * ESTE SCRIPT NO MODIFICA NINGUNA TABLA DE DATOS.
 * Lo unico que escribe son filas en `SequelizeMeta`, que es la lista de
 * migraciones aplicadas. No crea, no borra ni altera columnas, y no toca un
 * solo registro de usuarios, contratos ni pagos.
 *
 * Uso:
 *   npx tsx server/scripts/baselineMigrations.ts             (solo diagnostico)
 *   npx tsx server/scripts/baselineMigrations.ts --aplicar   (escribe)
 *
 * Sin --aplicar no escribe nada. Corriendo el diagnostico primero se ve contra
 * que base se esta trabajando y cuantas filas se van a insertar, que es
 * exactamente lo que hay que mirar antes de tocar algo en produccion.
 */

import { sequelize } from '../config/database.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizProyecto = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const carpetaMigraciones = join(raizProyecto, 'migrations');

/**
 * Migraciones que NO se sellan: las de esta tanda, que introducen columnas
 * nuevas y todavia tienen que correr de verdad.
 *
 * Se listan por nombre y no por fecha de corte porque una fecha de corte es
 * una decision que envejece: dentro de un mes nadie va a recordar por que
 * estaba puesta ni si sigue siendo la correcta.
 */
const NO_SELLAR = new Set([
  '20260907120000-audit-system-actor.cjs',
  '20260907130000-payment-safeguards.cjs',
  '20260907140000-audit-metadata-compression.cjs',
]);

async function main() {
  const aplicar = process.argv.includes('--aplicar');

  const nombreBase = (sequelize.config as any).database;
  const host = (sequelize.config as any).host;

  console.log('');
  console.log('  Base de datos : ' + nombreBase + ' @ ' + host);
  console.log('  Modo          : ' + (aplicar ? 'ESCRITURA' : 'solo diagnostico'));
  console.log('');

  await sequelize.authenticate();

  // La tabla puede no existir todavia si nunca corrio una migracion.
  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) NOT NULL PRIMARY KEY)',
  );

  const [filas]: any = await sequelize.query('SELECT name FROM "SequelizeMeta"');
  const yaSelladas = new Set(filas.map((f: any) => f.name));

  const enDisco = readdirSync(carpetaMigraciones)
    .filter((f) => f.endsWith('.cjs') || f.endsWith('.js'))
    .sort();

  const aSellar = enDisco.filter((m) => !yaSelladas.has(m) && !NO_SELLAR.has(m));
  const quedanPendientes = enDisco.filter((m) => !yaSelladas.has(m) && NO_SELLAR.has(m));

  console.log('  Migraciones en disco     : ' + enDisco.length);
  console.log('  Ya registradas           : ' + yaSelladas.size);
  console.log('  Se sellarian             : ' + aSellar.length);
  console.log('  Quedarian para correr    : ' + quedanPendientes.length);
  console.log('');

  if (quedanPendientes.length) {
    console.log('  Despues de sellar, db:migrate va a correr solo estas:');
    for (const m of quedanPendientes) console.log('    - ' + m);
    console.log('');
  }

  if (!aSellar.length) {
    console.log('  Nada que sellar. La cola ya esta ordenada.');
    console.log('');
    await sequelize.close();
    return;
  }

  if (!aplicar) {
    console.log('  Diagnostico solamente: no se escribio nada.');
    console.log('  Para sellar, volve a correrlo con --aplicar');
    console.log('');
    await sequelize.close();
    return;
  }

  // Una sola transaccion: o se sella toda la cola o no se sella nada. Sellarla
  // a medias dejaria el problema exactamente igual pero mas dificil de ver.
  await sequelize.transaction(async (t) => {
    for (const nombre of aSellar) {
      await sequelize.query(
        'INSERT INTO "SequelizeMeta" ("name") VALUES (:nombre) ON CONFLICT DO NOTHING',
        { replacements: { nombre }, transaction: t },
      );
    }
  });

  console.log('  Selladas ' + aSellar.length + ' migraciones en ' + nombreBase + '.');
  console.log('  No se modifico ninguna tabla de datos.');
  console.log('  Ahora "npx sequelize-cli db:migrate" corre solo las nuevas.');
  console.log('');

  await sequelize.close();
}

main().catch((e) => {
  console.error('Fallo el sellado:', e.message);
  process.exit(1);
});
