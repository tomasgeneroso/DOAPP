/**
 * Corrige las publicaciones que devolvieron su plata al saldo MÁS DE UNA VEZ por el mismo pago.
 *
 * Qué pasaba: una publicación cancelada sin trabajador devuelve su precio como saldo a favor. Reprogramarla la volvía a publicar con el mismo
 * pago, y si volvía a vencer sin postulantes se devolvía otra vez: un solo pago, dos (o más) devoluciones. Eso ya no ocurre (la devolución se
 * reconoce por pago y reprogramar pasa por pago), pero las devoluciones duplicadas que ya se acreditaron siguen en el saldo.
 *
 * Qué hace: por cada (publicación, pago) con más de una devolución por cancelación, deja la PRIMERA y descuenta el excedente con un asiento de
 * ajuste (queda en el libro, con `origen: correccion_doble_devolucion`). Es idempotente: no vuelve a corregir una publicación ya corregida.
 * Si el usuario ya no tiene saldo suficiente para el descuento, no toca nada y lo informa (hay que resolverlo a mano).
 *
 * Uso (en el servidor, desde la carpeta de la app):
 *   npx tsx server/scripts/corregirDobleDevolucion.ts            # solo muestra qué haría
 *   npx tsx server/scripts/corregirDobleDevolucion.ts --aplicar  # lo hace
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../config/database.js';
import { corregirDobleDevolucion, revisarRetirosSinSaldo } from '../services/correccionDeDevoluciones.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(carpeta, '../../.env') });

initDatabase()
  .then(async () => {
    const aplicar = process.argv.includes('--aplicar');
    console.log('== Devoluciones duplicadas ==');
    await corregirDobleDevolucion(aplicar);
    console.log('\n== Retiros pedidos sin saldo ==');
    await revisarRetirosSinSaldo(aplicar);
  })
  .catch((e) => {
    console.error('Error:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 500));
