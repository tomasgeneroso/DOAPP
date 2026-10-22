/**
 * Ajuste manual del saldo de un usuario, con asiento en el libro (nunca se toca `balance_ars` a secas).
 *
 * Para corregir un movimiento que se acreditó mal. El ajuste queda en el historial como `adjustment` con `origen: ajuste_manual`, el motivo y
 * quién lo hizo. Por defecto solo muestra qué haría.
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/ajustarSaldo.ts --email=alguien@correo.com --monto=-431956.80 --motivo="Devolución cargada por error" --publicacion=<id> [--aplicar]
 *   (monto negativo = descontar; positivo = acreditar)
 *
 * Con `--publicacion` el ajuste queda atado a esa publicación: la auditoría y su expediente en el panel la dan por corregida (sin eso, la
 * devolución original seguiría marcada como alerta aunque ya se haya descontado), y el saldo vinculado a ella baja con lo descontado.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { ajustarSaldoDeUsuario } from '../services/ajusteDeSaldo.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

const arg = (nombre: string) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);

initDatabase()
  .then(() =>
    ajustarSaldoDeUsuario({
      email: arg('email') ?? '',
      monto: Number(arg('monto')),
      motivo: arg('motivo') ?? '',
      publicacion: arg('publicacion'),
      aplicar: process.argv.includes('--aplicar'),
    }),
  )
  .catch((e) => {
    console.error('Error:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
