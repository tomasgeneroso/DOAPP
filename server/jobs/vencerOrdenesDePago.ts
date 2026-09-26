import cron from 'node-cron';
import { vencerOrdenesViejas } from '../services/pagoAlTerminar.js';

/**
 * Vence las órdenes de pago al terminar que nadie pagó.
 *
 * No cancela el contrato ni castiga a nadie. Lo único que hace es dejar de
 * decir que hay una orden esperando: la deuda entre las partes sigue
 * existiendo, lo que ya no existe es la vía por la que DOAPP podía mediar. Y
 * eso tiene que ser visible, porque mientras la orden figura abierta el
 * trabajador cree que todavía puede cobrar por ahí.
 *
 * Una vez por hora alcanza de sobra para un plazo que se mide en días. Corre
 * al minuto 7 y no en punto: a las horas en punto ya corren otros tres.
 */
export function startVencerOrdenesDePagoJob() {
  cron.schedule('7 * * * *', async () => {
    try {
      await vencerOrdenesViejas();
    } catch (e: any) {
      // Que falle no puede tumbar el proceso: es limpieza, no una operación de
      // dinero. Queda el aviso para que se note si falla siempre.
      console.error('❌ No se pudieron vencer las órdenes de pago:', e?.message);
    }
  });

  console.log('⏰ Vencimiento de órdenes de pago al terminar: cada hora (minuto 7)');
}
