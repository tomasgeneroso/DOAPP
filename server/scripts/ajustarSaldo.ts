/**
 * Ajuste manual del saldo de un usuario, con asiento en el libro (nunca se toca `balance_ars` a secas).
 *
 * Para corregir un movimiento que se acreditó mal (por ejemplo, una devolución de una publicación cuyo pago estaba mal cargado). El ajuste
 * queda en el historial como `adjustment` con `origen: ajuste_manual`, el motivo y quién lo hizo. Por defecto solo muestra qué haría.
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/ajustarSaldo.ts --email=alguien@correo.com --monto=-431956.80 --motivo="Devolución cargada por error" [--aplicar]
 *   (monto negativo = descontar; positivo = acreditar)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { User } from '../models/sql/User.model.js';
import { acreditarSaldo, debitarSaldo } from '../services/quotePayment.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

const arg = (nombre: string) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const email = arg('email');
  const monto = Number(arg('monto'));
  const motivo = arg('motivo');
  const aplicar = process.argv.includes('--aplicar');
  if (!email || !Number.isFinite(monto) || monto === 0 || !motivo || motivo.trim().length < 8) {
    throw new Error('Faltan datos: --email=..., --monto=(distinto de 0), --motivo="al menos 8 caracteres"');
  }

  await initDatabase();
  const user: any = await User.findOne({ where: { email: email.toLowerCase() }, attributes: ['id', 'email', 'name', 'balanceArs'] });
  if (!user) throw new Error(`No existe el usuario ${email}`);
  const antes = Number(user.balanceArs) || 0;
  const despues = Math.round((antes + monto) * 100) / 100;

  console.log(`Usuario: ${user.name} <${user.email}>`);
  console.log(`Saldo actual: ${pesos(antes)}  →  ${monto > 0 ? 'se acredita' : 'se descuenta'} ${pesos(Math.abs(monto))}  →  quedaría ${pesos(despues)}`);
  console.log(`Motivo: ${motivo}`);
  if (despues < 0) throw new Error('El ajuste dejaría el saldo en negativo: no se hace.');
  if (!aplicar) {
    console.log('\n(solo vista previa: falta --aplicar)');
    return;
  }

  const metadata = { origen: 'ajuste_manual', motivo, autor: 'script ajustarSaldo' };
  if (monto < 0) await debitarSaldo(String(user.id), Math.abs(monto), `Ajuste manual: ${motivo}`, { tipo: 'adjustment', metadata });
  // sin-espera: ajuste manual decidido por el dueño; no es plata de un pago de Mercado Pago que haya que esperar
  else await acreditarSaldo(String(user.id), monto, `Ajuste manual: ${motivo}`, { tipo: 'bonus', metadata });
  const final: any = await User.findByPk(user.id, { attributes: ['balanceArs'] });
  console.log(`\nHecho. Saldo ahora: ${pesos(Number(final.balanceArs) || 0)}`);
}

main()
  .catch((e) => {
    console.error('Error:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
