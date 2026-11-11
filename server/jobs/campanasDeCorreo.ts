import cron from 'node-cron';
import { procesarCampanas } from '../services/campanasDeCorreo.js';

/**
 * Manda la tanda de este minuto de las campañas de correo que están enviando (módulo de correos, 2026-11-11). Cada minuto: de a poco según el ritmo de cada campaña y con un
 * tope entre todas (`services/campanasDeCorreo.ts`). Si un barrido todavía no terminó cuando llega el siguiente, el siguiente se saltea (no se pisan).
 */
let corriendo = false;

export function startCampanasDeCorreoJob() {
  cron.schedule('* * * * *', async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      const n = await procesarCampanas();
      if (n > 0) console.log(`✉️ [CRON] campañas de correo: ${n} correo(s) enviados en este minuto.`);
    } catch (e) {
      console.error('❌ [CRON] campañas de correo:', (e as Error).message);
    } finally {
      corriendo = false;
    }
  });
}
