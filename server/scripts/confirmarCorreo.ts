/**
 * Confirma a mano el correo de una cuenta de STAGING (pedido del dueño, 2026-11-12: «staging no envía el correo de verificación»).
 * Se corre en el servidor, desde la carpeta de la app, y NO pide la clave de la base: la lee del `.env` como la propia app.
 *
 *   npx tsx server/scripts/confirmarCorreo.ts --email=<correo o usuario>           → VISTA PREVIA: muestra si la cuenta existe y en qué estado está
 *   npx tsx server/scripts/confirmarCorreo.ts --email=<correo o usuario> --aplicar  → deja el correo como confirmado (igual que el enlace del correo)
 *
 * SOLO funciona contra una base que no sea la de producción (`doapp`): en producción una persona confirma su correo con el enlace que recibe, y un
 * administrador no puede darlo por confirmado sin esa prueba. Hace lo mismo que `GET /auth/verify-email`: marca `is_verified`, borra el token y, si
 * corresponde, entrega el beneficio de lanzamiento.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const arg = (nombre: string): string | undefined => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
const tiene = (nombre: string): boolean => process.argv.includes(`--${nombre}`);

async function main(): Promise<void> {
  const quien = (arg('email') || '').trim().toLowerCase();
  if (!quien) {
    console.error('Uso: npx tsx server/scripts/confirmarCorreo.ts --email=<correo o usuario> [--aplicar]');
    process.exit(1);
  }
  const { BASE_DE_PRODUCCION } = await import('../config/guardaDeStaging.js');
  const base = (process.env.DB_NAME || BASE_DE_PRODUCCION).trim();
  if (base === BASE_DE_PRODUCCION) {
    console.error(`Esta base ("${base}") es la de PRODUCCIÓN: ahí el correo se confirma con el enlace que recibe la persona. Este script es solo para staging.`);
    process.exit(1);
  }

  const { initDatabase } = await import('../config/database.js');
  const { User } = await import('../models/sql/User.model.js');
  await initDatabase();

  const user: any = await User.findOne({ where: quien.includes('@') ? { email: quien } : { username: quien } });
  if (!user) {
    console.error(`No hay ninguna cuenta ${quien.includes('@') ? 'con el correo' : 'con el usuario'} "${quien}" en la base "${base}".`);
    console.error('Eso explica el «email o contraseña incorrectos»: staging tiene su propia base. Registrate de nuevo en staging y volvé a correr esto.');
    process.exit(1);
  }
  console.log(`Base: ${base}`);
  console.log(`Cuenta: ${user.name} <${user.email}>  usuario=${user.username ?? '(sin usuario)'}  id=${user.id}`);
  console.log(`Correo confirmado: ${user.isVerified ? 'SÍ' : 'NO'}   Registro pendiente: ${user.registrationPending ? 'SÍ' : 'no'}   Último ingreso: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString('es-AR') : 'nunca'}`);

  if (user.isVerified) {
    console.log('\nEl correo ya figura como confirmado: si no podés entrar, el problema es la contraseña (usá «Olvidé mi contraseña» o registrate de nuevo).');
    process.exit(0);
  }
  if (!tiene('aplicar')) {
    console.log('\n(solo vista previa: no se cambió nada. Para confirmar el correo: agregá --aplicar)');
    process.exit(0);
  }

  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();
  // Igual que el enlace del correo: quien terminó el registro y recién ahora confirma recibe el beneficio de lanzamiento (no hace nada si no corresponde).
  const { otorgarContratosLibres } = await import('../services/exencionDeComision.js');
  await otorgarContratosLibres(String(user.id));
  console.log('\n✅ Correo confirmado. Ya podés iniciar sesión en staging con esa cuenta.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e?.message ?? e);
  process.exit(1);
});
