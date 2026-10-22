import cron from 'node-cron';
import { devolverPresupuestosSinUsar } from '../services/presupuestoDelTrabajo.js';

/**
 * Devuelve al saldo del cliente lo que sobró del presupuesto de los trabajos cuyo equipo ya se cerró (completo, o empezó con menos lugares).
 *
 * Lo normal es que la devolución ocurra en el momento (al completar el equipo, al empezar con los elegidos, o cuando el cron de inicio activa un trabajo
 * con menos trabajadores). Este barrido existe para lo que no llegó a hacerse: un fallo al acreditar, un trabajo que arrancó por otro camino. Es
 * idempotente: lo sobrante se calcula de los contratos y del libro, así que repetirlo no acredita dos veces. Corre a los minutos 5, 20, 35 y 50: después
 * de la activación de trabajos (que corre cada 15 minutos en punto).
 */
export function startDevolucionDePresupuestoJob() {
  cron.schedule('5,20,35,50 * * * *', async () => {
    try {
      const n = await devolverPresupuestosSinUsar();
      if (n > 0) console.log(`💸 [CRON] Presupuesto sin usar devuelto al saldo en ${n} trabajo${n > 1 ? 's' : ''}`);
    } catch (e: any) {
      // Que falle no puede tumbar el proceso: se reintenta en 15 minutos.
      console.error('❌ [CRON] No se pudo devolver el presupuesto sin usar:', e?.message);
    }
  });

  console.log('⏰ Devolución de presupuesto sin usar: cada 15 minutos');
}
