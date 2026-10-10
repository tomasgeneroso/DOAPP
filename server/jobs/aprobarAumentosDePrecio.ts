import cron from 'node-cron';
import { aprobarAumentosVencidos } from '../services/aumentoDePrecio.js';

/**
 * Aprueba solos los aumentos de precio pagados que un administrador no revisó a tiempo.
 *
 * Solo toca pagos que Mercado Pago confirmó bien; el resto sigue esperando a una persona (ver
 * `aprobarAumentosVencidos`). El plazo se mide en horas, así que cada 15 minutos alcanza: como mucho se aprueba
 * 15 minutos después de cumplirse. Corre al minuto 3 de cada cuarto de hora para no coincidir con los que corren
 * en punto.
 */
export function startAprobarAumentosDePrecioJob() {
  cron.schedule('3,18,33,48 * * * *', async () => {
    try {
      await aprobarAumentosVencidos();
    } catch (e: any) {
      // Que falle no tumba el proceso; el aumento sigue esperando y la próxima corrida lo vuelve a intentar.
      console.error('❌ No se pudieron aprobar los aumentos de precio vencidos:', e?.message);
    }
  });

  console.log('⏰ Aprobación automática de aumentos de precio: cada 15 minutos');
}
