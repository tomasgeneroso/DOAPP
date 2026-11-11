/**
 * Dice qué tablas de los modelos NO existen en la base. SOLO LEE: no crea nada. Se corre en el servidor, desde la carpeta de la app:
 *
 *   npx tsx server/scripts/verificarTablas.ts
 *
 * Producción no sincroniza los modelos: un modelo cuya tabla ninguna migración creó daba `relation "…" does not exist` (pasó con `portfolio_items` y `login_devices`).
 * Al arrancar, la app crea sola las que faltan (`crearTablasQueFaltan`); esto es para comprobarlo cuando se quiere saber ya, sin reiniciar. Sale con código 1 si falta alguna.
 */
import { QueryTypes } from 'sequelize';
import { initDatabase, sequelize } from '../config/database.js';
import { tablasQueFaltan } from '../config/ensureSchema.js';

await initDatabase();

const nombreDeTabla = (m: { getTableName: () => unknown }): string => {
  const t = m.getTableName() as string | { tableName: string };
  return typeof t === 'string' ? t : t.tableName;
};
const modelos = Object.values(sequelize.models) as Array<{ getTableName: () => unknown }>;
const filas = await sequelize.query<{ table_name: string }>(
  `SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
  { type: QueryTypes.SELECT },
);
const existentes = new Set(filas.map((f) => String(f.table_name)));
const faltan = tablasQueFaltan(modelos.map(nombreDeTabla), existentes);

console.log(`Modelos: ${modelos.length} · tablas en la base: ${existentes.size}`);
if (faltan.length === 0) {
  console.log('✅ Están todas las tablas de los modelos.');
  process.exit(0);
}
console.log(`❌ Faltan ${faltan.length} tabla(s): ${faltan.join(', ')}`);
console.log('Al reiniciar la app se crean solas (mirá el registro: «tablas que faltaban y se crearon»). Si siguen faltando, hay que escribir su migración.');
process.exit(1);
