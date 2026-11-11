/**
 * Compara producción y staging y dice qué los separa. SOLO LEE. Se corre en el servidor:
 *
 *   npx tsx server/scripts/paridadDeEntornos.ts
 *   npx tsx server/scripts/paridadDeEntornos.ts --prod=/var/www/doapp --staging=/var/www/doapp-staging
 *
 * Compara nombres de variables de los dos `.env` (nunca valores), el commit de cada carpeta y las migraciones aplicadas en cada base. Los secretos y los datos no salen: ni se
 * imprimen ni se copian de un entorno al otro. Sale con código 1 si hay algo que corregir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  compararMigraciones,
  compararVariables,
  nombresDeVariables,
  pendientesDeParidad,
  VARIABLES_QUE_DIFIEREN_POR_DISENO,
} from '../services/paridadDeEntornos.js';

const arg = (nombre: string, porDefecto: string) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1] || porDefecto;
const PROD = arg('prod', '/var/www/doapp');
const STAGING = arg('staging', '/var/www/doapp-staging');

function leerEnv(dir: string): { texto: string; ok: boolean } {
  const ruta = path.join(dir, '.env');
  return existsSync(ruta) ? { texto: readFileSync(ruta, 'utf8'), ok: true } : { texto: '', ok: false };
}

function commitDe(dir: string): string | null {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Valor de una variable de un texto .env, solo para armar la conexión a la base. Nunca se imprime. */
function valorDe(texto: string, nombre: string): string | undefined {
  const m = texto.match(new RegExp(`^\\s*(?:export\\s+)?${nombre}\\s*=\\s*(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
}

async function migracionesAplicadas(envTexto: string): Promise<string[] | null> {
  const url = valorDe(envTexto, 'DATABASE_URL');
  const conexion = url
    ? { connectionString: url }
    : { host: valorDe(envTexto, 'DB_HOST') || 'localhost', port: Number(valorDe(envTexto, 'DB_PORT') || 5432), database: valorDe(envTexto, 'DB_NAME'), user: valorDe(envTexto, 'DB_USER'), password: valorDe(envTexto, 'DB_PASSWORD') };
  try {
    const { default: pg } = await import('pg');
    const cliente = new pg.Client(conexion as any);
    await cliente.connect();
    try {
      const r = await cliente.query('SELECT name FROM "SequelizeMeta" ORDER BY name');
      return r.rows.map((f: { name: string }) => f.name);
    } finally {
      await cliente.end();
    }
  } catch {
    // El mensaje de un error de conexión puede traer el usuario o el host: no se imprime.
    return null;
  }
}

const prod = leerEnv(PROD);
const staging = leerEnv(STAGING);
console.log(`Producción: ${PROD}  ${prod.ok ? '(.env leído)' : '(NO tiene .env)'}`);
console.log(`Staging:    ${STAGING}  ${staging.ok ? '(.env leído)' : '(NO tiene .env o la carpeta no existe)'}`);
if (!prod.ok || !staging.ok) {
  console.log('\nNo se puede comparar sin los dos .env. Si staging no está preparado, seguí .github/STAGING.md.');
  process.exit(1);
}

const variables = compararVariables(nombresDeVariables(prod.texto), nombresDeVariables(staging.texto));
console.log(`\nVariables: ${variables.enComun} en común.`);
console.log(`  Faltan en staging (${variables.faltanEnStaging.length}): ${variables.faltanEnStaging.join(', ') || '—'}`);
console.log(`  Solo en staging  (${variables.soloEnStaging.length}): ${variables.soloEnStaging.join(', ') || '—'}`);
console.log(`  (Se espera que estas tengan OTRO valor en staging, no se comparan: ${VARIABLES_QUE_DIFIEREN_POR_DISENO.join(', ')})`);

const commits = { produccion: commitDe(PROD), staging: commitDe(STAGING) };
console.log(`\nCommits: producción ${commits.produccion?.slice(0, 7) ?? '¿?'} · staging ${commits.staging?.slice(0, 7) ?? '¿?'}`);

const [mp, ms] = await Promise.all([migracionesAplicadas(prod.texto), migracionesAplicadas(staging.texto)]);
const migraciones = mp && ms ? compararMigraciones(mp, ms) : null;
if (migraciones) {
  console.log(`\nMigraciones: producción ${mp!.length} · staging ${ms!.length}`);
  console.log(`  Solo en producción: ${migraciones.soloEnProduccion.join(', ') || '—'}`);
  console.log(`  Solo en staging (vienen en la próxima promoción): ${migraciones.soloEnStaging.join(', ') || '—'}`);
} else {
  console.log('\nMigraciones: no se pudieron leer las dos bases desde acá (¿usuario sin permiso?). Compará con `npx sequelize-cli db:migrate:status` en cada carpeta.');
}

const pendientes = pendientesDeParidad(variables, migraciones, commits);
if (pendientes.length === 0) {
  console.log('\n✅ Hay paridad: no falta ninguna variable, las migraciones coinciden y el commit es el mismo.');
  process.exit(0);
}
console.log('\n⚠️  Para corregir:');
pendientes.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
process.exit(1);
