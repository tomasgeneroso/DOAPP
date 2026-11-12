/**
 * Borra una cuenta SIN dejar rastro (pedido del dueño, 2026-11-12). Se corre en el servidor, desde la carpeta de la app.
 *
 *   npx tsx server/scripts/borrarUsuarioSinRastro.ts --email=<correo>                    → VISTA PREVIA: no borra nada, muestra qué encontró
 *   npx tsx server/scripts/borrarUsuarioSinRastro.ts --email=<correo> --aplicar           → borra (pide escribir el correo para confirmar)
 *   npx tsx server/scripts/borrarUsuarioSinRastro.ts --email=<correo> --aplicar --forzar  → borra aunque haya dinero o contratos con otras personas
 *
 * Es IRREVERSIBLE y NO deja ningún asiento (ni siquiera en el registro de auditoría): es lo que se pidió. Por eso hace una copia antes: hacé un respaldo de la
 * base (pg_dump) y corré siempre la vista previa primero. Todo o nada: si algo no se puede borrar, no se borra nada. Nunca borra a un owner.
 * Si la base dice «permission denied» en audit_logs o data_access_logs (el rastro es de solo agregar para la app), corrélo con el usuario dueño de la base.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const arg = (nombre: string): string | undefined => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
const tiene = (nombre: string): boolean => process.argv.includes(`--${nombre}`);

const preguntar = (texto: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r); }));
};

async function main(): Promise<void> {
  const email = (arg('email') || '').trim().toLowerCase();
  if (!email) {
    console.error('Uso: npx tsx server/scripts/borrarUsuarioSinRastro.ts --email=<correo> [--aplicar] [--forzar]');
    process.exit(1);
  }
  const { initDatabase } = await import('../config/database.js');
  const { User } = await import('../models/sql/User.model.js');
  const { buscarRastros, borrarSinRastro, riesgos } = await import('../services/borrarUsuarioSinRastro.js');
  await initDatabase();

  const user: any = await User.findOne({ where: { email } });
  if (!user) {
    console.error(`No hay ninguna cuenta con el correo ${email}.`);
    process.exit(1);
  }
  console.log(`Cuenta: ${user.name} <${user.email}>  id=${user.id}  rol=${user.adminRole || user.role || 'user'}  creada=${new Date(user.createdAt).toLocaleString('es-AR')}`);
  if (user.adminRole === 'owner') {
    console.error('NO se borra una cuenta owner. Si de verdad querés, primero: npx tsx server/scripts/assignAdminRoleSQL.ts <correo> none');
    process.exit(1);
  }

  const hallazgos = await buscarRastros(String(user.id), user.email);
  console.log('\nLo que la nombra en la base:');
  if (hallazgos.length === 0) console.log('  (nada fuera de la cuenta misma)');
  for (const h of hallazgos) console.log(`  ${h.tabla}.${h.columna}: ${h.filas} fila(s)  [${h.tipo === 'referencia' ? 'referencia' : 'texto/JSON'}]`);

  const motivos = await riesgos(String(user.id));
  if (motivos.length > 0) {
    console.log('\nCuidado:');
    for (const m of motivos) console.log(`  - ${m}`);
  }

  if (!tiene('aplicar')) {
    console.log('\n(solo vista previa: no se borró nada. Para borrar: agregá --aplicar)');
    process.exit(0);
  }
  if (motivos.length > 0 && !tiene('forzar')) {
    console.error('\nHay dinero o contratos con otras personas. Si estás seguro: agregá --forzar.');
    process.exit(1);
  }
  const respuesta = await preguntar(`\nIRREVERSIBLE y sin rastro. Escribí el correo (${user.email}) para confirmar: `);
  if (respuesta.trim().toLowerCase() !== user.email.toLowerCase()) {
    console.log('Cancelado: no coincide.');
    process.exit(0);
  }

  const r = await borrarSinRastro(String(user.id), user.email);
  console.log('\nBorrado.');
  for (const b of r.borradas) console.log(`  borradas ${b.filas} fila(s) de ${b.tabla}.${b.columna}`);
  for (const d of r.desvinculadas) console.log(`  desvinculadas ${d.filas} cuenta(s) en ${d.tabla}.${d.columna} (la otra persona NO se borró)`);
  if (r.aRevisarAMano.length > 0) {
    console.log('\nRevisá a mano (nombran a la cuenta en un texto, pero son datos de otras personas):');
    for (const h of r.aRevisarAMano) console.log(`  ${h.tabla}.${h.columna}: ${h.filas} fila(s)`);
  }
  console.log('\nListo. Si tenías sesión abierta con esa cuenta, ya no sirve.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e?.message || e);
  process.exit(1);
});
