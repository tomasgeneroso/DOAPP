import { avisosAlDuenoActivos } from '../services/avisosAlDuenoActivos.js';
import { CHEQUEOS, type Chequeo } from '../services/chequeosDeSalud.js';
import { anotarChequeo, olvidarLasCalmadas } from '../services/saludDeComponentes.js';
import { fallaDeTarea } from '../services/avisarFalla.js';

/**
 * Corre los chequeos propios de cada parte de DOAPP (solo en el servidor). Cuando uno falla por primera vez se vuelve a probar al minuto: así un corte de
 * verdad se avisa enseguida y un tropiezo suelto no avisa.
 */
const ultimaVez = new Map<string, number>();
const enCurso = new Set<string>();

async function correr(c: Chequeo, esConfirmacion = false): Promise<void> {
  if (enCurso.has(c.id)) return;
  enCurso.add(c.id);
  try {
    const motivo = await c.probar();
    await anotarChequeo(c.id, motivo);
    if (motivo && !esConfirmacion) setTimeout(() => { void correr(c, true); }, 60_000).unref?.();
  } catch (e) {
    fallaDeTarea('chequeos de salud', `Chequeo de ${c.id}:`, e);
  } finally {
    enCurso.delete(c.id);
  }
}

export function startChequeosDeSalud(): void {
  if (!avisosAlDuenoActivos()) return;
  const conChequeo = new Set(CHEQUEOS.map((c) => c.id));
  const barrer = () => {
    const ahora = Date.now();
    for (const c of CHEQUEOS) {
      if (ahora - (ultimaVez.get(c.id) ?? 0) < c.cadaMinutos * 60_000 - 5_000) continue;
      ultimaVez.set(c.id, ahora);
      void correr(c);
    }
    olvidarLasCalmadas(conChequeo, ahora);
  };
  // El primero, un minuto después de arrancar: recién levantado, todavía se está conectando todo.
  setTimeout(barrer, 60_000).unref?.();
  setInterval(barrer, 60_000).unref?.();
  console.log('✅ [CRON] Chequeos de salud de los componentes iniciados');
}
