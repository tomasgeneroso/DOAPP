import cron from 'node-cron';
import { devolverPresupuestosSinUsar, liquidarSaldosPendientes } from '../services/presupuestoDelTrabajo.js';

/**
 * Deja a favor del cliente lo que sobró del presupuesto de los trabajos cuyo equipo ya se cerró (completo, o empezó con menos lugares), y pasa a su
 * saldo lo que estaba a favor PENDIENTE y cuyo pago original ya liberó Mercado Pago (recién ahí la plata está en la cuenta de la plataforma y es del cliente).
 *
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
      if (n > 0) console.log(`💸 [CRON] Presupuesto sin usar dejado a favor del cliente en ${n} trabajo${n > 1 ? 's' : ''}`);
      const l = await liquidarSaldosPendientes();
      if (l > 0) console.log(`💸 [CRON] Saldo a favor pendiente pasado a saldo: ${l} asiento${l > 1 ? 's' : ''}`);
    } catch (e: any) {
      // Que falle no puede tumbar el proceso: se reintenta en 15 minutos.
      console.error('❌ [CRON] No se pudo devolver el presupuesto sin usar:', e?.message);
    }
  });

  console.log('⏰ Devolución de presupuesto sin usar y liquidación de saldos pendientes: cada 15 minutos');
}
