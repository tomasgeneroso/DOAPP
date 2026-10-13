import cron from 'node-cron';
import { escalarSolicitudesVencidas, HORAS_PARA_RESPONDER } from '../services/solicitudesDeCambio.js';

/**
 * Cron job para escalar a soporte las solicitudes de cambio de contrato sin respuesta.
 * Se ejecuta cada 6 horas. Toda la lógica (ticket, avisos, una sola vez por solicitud) está en
 * `services/solicitudesDeCambio.ts`, la misma que usa la ruta manual para administración.
 */
export function startEscalateExpiredChangeRequestsJob() {
  // Cada 6 horas: 0 */6 * * *
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('🔍 [CRON] Verificando solicitudes de cambio de contrato sin respuesta...');
      const { escaladas, fallidas } = await escalarSolicitudesVencidas();
      if (escaladas === 0 && fallidas === 0) {
        console.log('✅ [CRON] No hay solicitudes para escalar');
        return;
      }
      console.log(`🎯 [CRON] Solicitudes escaladas: ${escaladas}${fallidas ? ` · con error: ${fallidas}` : ''}`);
    } catch (error) {
      console.error('❌ [CRON] Error en job de escalación:', error);
    }
  });

  console.log(`✅ [CRON] Job de escalación de solicitudes iniciado (cada 6 horas, a las ${HORAS_PARA_RESPONDER} h sin respuesta)`);
}
