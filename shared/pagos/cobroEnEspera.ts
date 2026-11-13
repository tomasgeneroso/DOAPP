/**
 * Los textos de un cobro EN ESPERA DE LIBERACIÓN, una sola vez para la web y la app (pedido del dueño, 2026-11-13): se muestra cuánto hay en espera, cuántos días
 * faltan, se recuerda cuánto tarda en liberarse y se dice si ya se puede retirar o no. Los números salen de `POLITICAS`: no se repiten a mano.
 *
 * Pura (sin base de datos ni pantalla) para poder probarla.
 */
import { POLITICAS } from '../constants/policies.js';

const DIA_MS = 86_400_000;

/** Días enteros que faltan hasta una fecha (redondeado hacia arriba: «faltan 3 días» hasta que llegue). 0 si ya pasó o no hay fecha. */
export function diasQueFaltan(desdeIso: string | null | undefined, ahora: Date = new Date()): number {
  if (!desdeIso) return 0;
  const t = new Date(desdeIso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - ahora.getTime()) / DIA_MS));
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR');
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El recordatorio de cuánto tarda en liberarse, siempre el mismo. */
export const RECORDATORIO_DE_LIBERACION =
  `Cada pago se libera a los ${POLITICAS.DIAS_LIBERACION_PAGO} días de acreditado (Mercado Pago) y el cliente puede reclamar hasta ${POLITICAS.DIAS_PARA_DISPUTAR} días después de terminado el trabajo: ` +
  'el cobro se puede retirar cuando pasaron los dos plazos.';

export interface CobroParaDecir {
  /** ¿Ya se puede retirar / pedir? */
  liberado: boolean;
  /** Cuándo se libera (ISO). */
  disponibleDesde: string | null;
  /** Si el trabajador ya pidió el cobro de este contrato (ISO). */
  pedidoEl?: string | null;
}

export interface TextoDelCobro {
  /** El estado en pocas palabras. */
  estado: string;
  /** Lo que falta o lo que sigue, con la fecha y los días. */
  detalle: string;
  /** ¿Se puede pedir el cobro ahora? */
  puedePedir: boolean;
}

/**
 * Qué decirle al trabajador de un cobro de un contrato terminado: en espera (con los días que faltan), liberado (se puede pedir) o ya pedido (lo paga el equipo).
 * Lo que llega por SALDO (trabajos de varios lugares) usa el mismo texto con «retirar» en vez de «pedir el cobro» (`conSaldo`).
 */
export function textoDelCobro(c: CobroParaDecir, ahora: Date = new Date(), conSaldo = false): TextoDelCobro {
  const verbo = conSaldo ? 'retirar' : 'pedir el cobro';
  if (c.pedidoEl) {
    return {
      estado: 'Cobro pedido',
      detalle: `Pediste el cobro el ${fecha(c.pedidoEl)}. El equipo de DOAPP te transfiere a tu cuenta y te avisamos cuando se acredite.`,
      puedePedir: false,
    };
  }
  const dias = diasQueFaltan(c.disponibleDesde, ahora);
  if (c.liberado || dias === 0) {
    return {
      estado: 'Liberado',
      detalle: conSaldo ? 'Ya está liberado: lo podés retirar.' : 'Ya está liberado: pedí el cobro y el equipo de DOAPP te transfiere a tu cuenta.',
      puedePedir: !conSaldo,
    };
  }
  return {
    estado: 'En espera de liberación',
    detalle: `Faltan ${plural(dias, 'día', 'días')}: desde el ${fecha(c.disponibleDesde as string)} lo podés ${verbo}. ${RECORDATORIO_DE_LIBERACION}`,
    puedePedir: false,
  };
}
