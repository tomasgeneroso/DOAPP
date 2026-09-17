import { POLITICAS } from '../constants/policies.js';

/**
 * Cuanto lleva abierta una disputa, medido contra el objetivo interno del
 * equipo (POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS / _MAXIMO_).
 *
 * Es una vara para el panel de admin y soporte, no una promesa al usuario:
 * la regla de silencio (una parte que no responde tiene 7 dias) puede
 * estirar una disputa mas alla del maximo sin que el equipo haya demorado
 * nada. Por eso la funcion recibe `esperandoAParte`: en ese caso el nivel no
 * pasa de 'esperando', y el panel lo muestra como tal.
 *
 * Cuando la disputa ya se resolvio, mide cuanto tardo (abierta → resuelta),
 * para que la lista de resueltas muestre si se cumplio.
 */
export type NivelSla = 'en_plazo' | 'al_limite' | 'vencida' | 'esperando';

export interface EdadDeDisputa {
  /** Dias corridos con decimales, desde la apertura hasta `hasta`. */
  dias: number;
  /** Horas totales redondeadas, para mostrar cuando lleva menos de un dia. */
  horas: number;
  nivel: NivelSla;
  /** "3 h", "2 d 5 h", "6 d". */
  texto: string;
  /** Cuanto falta para el objetivo (negativo si ya paso). */
  diasParaObjetivo: number;
  objetivoDias: number;
  maximoDias: number;
  /** true si ya esta resuelta y se mide el tiempo total que llevo. */
  cerrada: boolean;
}

const MS_DIA = 24 * 60 * 60 * 1000;

export function edadDeDisputa(
  abiertaEl: Date | string,
  opts: { resueltaEl?: Date | string | null; esperandoAParte?: boolean; ahora?: Date } = {},
): EdadDeDisputa {
  const inicio = new Date(abiertaEl).getTime();
  const fin = opts.resueltaEl ? new Date(opts.resueltaEl).getTime() : (opts.ahora ?? new Date()).getTime();
  const ms = Math.max(0, fin - inicio);
  const dias = ms / MS_DIA;
  const horas = Math.round(ms / (60 * 60 * 1000));

  const objetivo = POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS;
  const maximo = POLITICAS.DISPUTA_MAXIMO_RESOLUCION_DIAS;

  let nivel: NivelSla;
  if (dias > maximo) nivel = 'vencida';
  else if (dias > objetivo) nivel = 'al_limite';
  else nivel = 'en_plazo';
  // Si estamos esperando a una parte, la demora no es del equipo. Se muestra
  // aparte, salvo que ya haya pasado el maximo: ahi igual hay que mirarla.
  if (opts.esperandoAParte && !opts.resueltaEl && nivel !== 'vencida') nivel = 'esperando';

  const d = Math.floor(dias);
  const h = Math.floor((dias - d) * 24);
  const texto = d === 0 ? `${h} h` : h === 0 ? `${d} d` : `${d} d ${h} h`;

  return {
    dias,
    horas,
    nivel,
    texto,
    diasParaObjetivo: objetivo - dias,
    objetivoDias: objetivo,
    maximoDias: maximo,
    cerrada: Boolean(opts.resueltaEl),
  };
}
