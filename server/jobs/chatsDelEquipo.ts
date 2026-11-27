import cron from 'node-cron';
import { barrerChatsDelEquipo } from '../services/chatDelEquipo.js';
import { fallaDeTarea } from '../services/avisarFalla.js';

/**
 * Chats del equipo (trabajos con varios trabajadores): mantiene a los integrantes al día con los elegidos, cierra los de trabajos terminados o cancelados y borra los que
 * cumplieron el plazo para reclamar (siempre que no haya un reclamo abierto). Cada 15 minutos, en el minuto 10.
 */
export function startChatsDelEquipoJob() {
  cron.schedule('10,25,40,55 * * * *', async () => {
    try {
      const r = await barrerChatsDelEquipo();
      if (r.cerrados || r.borrados) console.log(`💬 [CRON] Chats del equipo: ${r.cerrados} cerrado(s), ${r.borrados} borrado(s)`);
    } catch (e: any) {
      fallaDeTarea('chatsDelEquipo', '❌ [CRON] No se pudo barrer los chats del equipo:', e?.message);
    }
  });
  console.log('⏰ Chats del equipo (integrantes, cierre y borrado): cada 15 minutos');
}
