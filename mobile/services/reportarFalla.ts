import { post } from './api';

/** Lo que falla en el teléfono se le cuenta al servidor para que avise. Viaja solo el nombre de la parte, y como mucho una vez cada 10 minutos. */
const ENTRE_REPORTES_MS = 10 * 60_000;
const ultimos = new Map<string, number>();

export function reportarFalla(componente: 'direcciones' | 'tiempo_real', ahora: number = Date.now()): void {
  if (ahora - (ultimos.get(componente) ?? -Infinity) < ENTRE_REPORTES_MS) return;
  ultimos.set(componente, ahora);
  void post('/salud/falla', { componente }).catch(() => undefined);
}
