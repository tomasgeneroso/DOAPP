/**
 * Anula un pago que figura como recibido pero cuyo dinero NUNCA entró (una transferencia aprobada a mano sin comprobar el banco, un pago de
 * prueba). Deja de contar como ingreso y como dinero recibido; sus facturas pasan a «void». Por defecto solo muestra qué haría.
 *
 * Es la contracara de `ajustarSaldo`: si ese pago ya había generado saldo a favor (una devolución al cancelar la publicación), primero se
 * descuenta con `ajustarSaldo --publicacion=...`; este script lo avisa y no lo toca. No sirve para un pago confirmado por una pasarela
 * (Mercado Pago, AstroPay, PayPal): ahí el dinero entró de verdad y corresponde un reembolso (se rechaza, salvo `--forzar`).
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/anularPago.ts --pago=<id del pago> --motivo="Transferencia de prueba aprobada sin dinero real" [--aplicar] [--forzar]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { esPermisoDenegado, explicarPermisoDenegado } from '../services/permisosDeLaBase.js';
import { anularPagoSinDinero } from '../services/anulacionDePagos.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

initDatabase()
  .then(() => {
    const pago = arg('pago');
    if (!pago) throw new Error('Falta --pago=<id del pago>');
    return anularPagoSinDinero(pago, arg('motivo') ?? '', { aplicar: process.argv.includes('--aplicar'), forzar: process.argv.includes('--forzar') });
  })
  .catch(async (e) => {
    console.error('Error:', esPermisoDenegado(e) ? await explicarPermisoDenegado(e) : e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
