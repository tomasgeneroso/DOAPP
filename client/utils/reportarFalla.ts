import type { ComponenteReportable } from '../../shared/salud/componentes';

/**
 * Lo que falla en el navegador (mapas, direcciones, fotos, avisos en vivo, una pantalla rota) se le cuenta al servidor para que avise al owner. Viaja SOLO
 * el nombre de la parte: ni la dirección buscada, ni la pantalla, ni nada de la persona.
 */
const ENTRE_REPORTES_MS = 10 * 60_000;
const ultimos = new Map<ComponenteReportable, number>();

export function reportarFalla(componente: ComponenteReportable, ahora: number = Date.now()): void {
  // Sin conexión no es una falla de DOAPP.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (ahora - (ultimos.get(componente) ?? -Infinity) < ENTRE_REPORTES_MS) return;
  ultimos.set(componente, ahora);
  try {
    void fetch('/api/salud/falla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ componente }), keepalive: true }).catch(() => undefined);
  } catch {
    /* avisar nunca rompe la pantalla */
  }
}

/** Cuántas imágenes del mapa tienen que fallar (sin que cargue ninguna) para darlo por caído. */
const FALLAS_DE_UN_MAPA = 6;

export function vigilarMapa<T extends { on?: (evento: string, fn: () => void) => unknown }>(capa: T): T {
  let cargadas = 0;
  let fallidas = 0;
  capa.on?.('tileload', () => { cargadas++; });
  capa.on?.('tileerror', () => { if (++fallidas >= FALLAS_DE_UN_MAPA && cargadas === 0) reportarFalla('mapas'); });
  return capa;
}

/** Cuántas fotos DISTINTAS de DOAPP tienen que fallar en la misma visita (una sola puede estar borrada). */
const FOTOS_ROTAS_PARA_REPORTAR = 3;
export const esFotoDeDoapp = (src: string): boolean => /\/uploads\/|\/api\/archivo\?/.test(src);

export function instalarVigiaDeFotos(): void {
  if (typeof window === 'undefined') return;
  const rotas = new Set<string>();
  window.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const src = img.currentSrc || img.src || '';
      if (!esFotoDeDoapp(src)) return;
      rotas.add(src);
      if (rotas.size >= FOTOS_ROTAS_PARA_REPORTAR) reportarFalla('fotos');
    },
    true,
  );
}
