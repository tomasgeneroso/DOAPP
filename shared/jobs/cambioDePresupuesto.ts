/**
 * Cuándo y cómo se cambia el presupuesto de un trabajo. UNA sola regla para el servidor y para las pantallas (web y app), que la usan ANTES de ofrecer el cambio.
 *
 * Reglas del dueño (2026-11-27):
 *  - Sin pagar todavía: se cambia libremente y SIN mover plata.
 *  - Con un pago en revisión (transferencia sin aprobar) o la publicación esperando aprobación: se espera a que quede publicado.
 *  - Publicado y sin nadie elegido: se analizan los saldos, quien publicó acepta y se aplica; quienes estaban postulados se quitan y tienen que volver a postularse.
 *    Solo hasta `CAMBIO_DE_PRESUPUESTO_HASTA_HORAS_ANTES` antes del inicio.
 *  - Con alguien ya elegido (a mano o automáticamente): se pide el cambio y se aplica recién cuando TODOS los elegidos lo aceptan y la publicación está pagada.
 *  - La comisión de DOAPP ya cobrada no se devuelve ni se recalcula, y los gastos de transferencia (procesamiento del pago) tampoco (T&C 7.5 y 7.10).
 */
import { POLITICAS } from '../constants/policies.js';

export type CodigoDeBloqueoDelPresupuesto =
  | 'TRABAJO_TERMINADO'
  | 'TRABAJO_CANCELADO'
  | 'PAGO_EN_REVISION'
  | 'ESPERANDO_LA_PUBLICACION'
  | 'CAMBIO_ESPERANDO_RESPUESTA'
  | 'FALTA_PAGAR_LA_PUBLICACION'
  | 'EL_TRABAJO_SE_ESTA_CERRANDO'
  | 'FALTA_POCO_PARA_EL_INICIO';

/** `libre`: sin pagar, no hay plata en juego. `directo`: pagado y sin nadie elegido. `con_aceptacion`: lo tienen que aceptar los elegidos. */
export type ModoDelCambio = 'libre' | 'directo' | 'con_aceptacion';

export interface DatosDelPresupuesto {
  status: string;
  publicationPaid?: boolean | null;
  startDate?: Date | string | null;
  hayAlguienElegido: boolean;
  /** Algún contrato ya espera confirmación, terminó o está en reclamo, o hay una cancelación pedida. */
  elTrabajoSeEstaCerrando?: boolean;
  /** Un pago de la publicación (por ejemplo una transferencia) espera que un administrador lo apruebe. */
  pagoEnRevision?: boolean;
  /** Ya hay un cambio pedido a los elegidos que todavía no contestaron o no se pagó. */
  hayCambioPendiente?: boolean;
}

export interface BloqueoDelPresupuesto {
  codigo: CodigoDeBloqueoDelPresupuesto;
  mensaje: string;
}

const HORAS = POLITICAS.CAMBIO_DE_PRESUPUESTO_HASTA_HORAS_ANTES;

export const MENSAJES_DEL_PRESUPUESTO: Record<CodigoDeBloqueoDelPresupuesto, string> = {
  TRABAJO_TERMINADO: 'El trabajo ya terminó: su precio quedó cerrado.',
  TRABAJO_CANCELADO: 'El trabajo está cancelado. Para volver a publicarlo, editalo y cargá las fechas nuevas.',
  PAGO_EN_REVISION: 'Hay un pago de esta publicación en revisión. Cuando se apruebe y el trabajo quede publicado vas a poder cambiar el presupuesto.',
  ESPERANDO_LA_PUBLICACION: 'La publicación está esperando aprobación. Cuando quede publicada vas a poder cambiar el presupuesto.',
  CAMBIO_ESPERANDO_RESPUESTA: 'Ya hay un cambio de presupuesto en curso. Esperá la respuesta o cancelalo para pedir otro.',
  FALTA_PAGAR_LA_PUBLICACION: 'Ya hay alguien elegido: para cambiar el presupuesto, primero tiene que estar pagada la publicación.',
  EL_TRABAJO_SE_ESTA_CERRANDO: 'El trabajo se está cerrando (terminado, en confirmación, con reclamo o con una cancelación pedida): el precio ya no se cambia.',
  FALTA_POCO_PARA_EL_INICIO: `El presupuesto se puede cambiar hasta ${HORAS} horas antes del inicio.`,
};

const bloqueo = (codigo: CodigoDeBloqueoDelPresupuesto): BloqueoDelPresupuesto => ({ codigo, mensaje: MENSAJES_DEL_PRESUPUESTO[codigo] });

export function bloqueoDelPresupuesto(d: DatosDelPresupuesto, ahora: Date = new Date()): BloqueoDelPresupuesto | null {
  if (d.status === 'completed') return bloqueo('TRABAJO_TERMINADO');
  if (d.status === 'cancelled') return bloqueo('TRABAJO_CANCELADO');
  if (d.pagoEnRevision) return bloqueo('PAGO_EN_REVISION');
  if (d.status === 'pending_approval') return bloqueo('ESPERANDO_LA_PUBLICACION');
  if (d.hayCambioPendiente) return bloqueo('CAMBIO_ESPERANDO_RESPUESTA');
  if (d.hayAlguienElegido) {
    if (!d.publicationPaid) return bloqueo('FALTA_PAGAR_LA_PUBLICACION');
    if (d.elTrabajoSeEstaCerrando) return bloqueo('EL_TRABAJO_SE_ESTA_CERRANDO');
    return null; // con la aceptación de los elegidos (ver modoDelCambio)
  }
  if (d.publicationPaid && d.startDate && new Date(d.startDate).getTime() - ahora.getTime() < HORAS * 3_600_000) return bloqueo('FALTA_POCO_PARA_EL_INICIO');
  return null;
}

export function modoDelCambio(d: Pick<DatosDelPresupuesto, 'publicationPaid' | 'hayAlguienElegido'>): ModoDelCambio {
  if (d.hayAlguienElegido) return 'con_aceptacion';
  return d.publicationPaid ? 'directo' : 'libre';
}

/** Lo que queda escrito en una postulación que se quitó porque cambió el presupuesto: esa persona puede postularse de nuevo. */
export const POSTULACION_QUITADA_POR_PRESUPUESTO = 'Cambió el presupuesto del trabajo: postulate de nuevo.';

/** ¿Esta postulación deja a la persona postularse de nuevo? Rechazada, retirada o quitada porque cambió el presupuesto (hay una sola por persona y trabajo: se reabre). */
export function sePuedeVolverAPostular(p: { status?: unknown; cancellationReason?: unknown } | null | undefined): boolean {
  if (!p) return true;
  const estado = String(p.status);
  return estado === 'rejected' || estado === 'withdrawn' || (estado === 'cancelled' && p.cancellationReason === POSTULACION_QUITADA_POR_PRESUPUESTO);
}

/** Lo que le toca a cada persona elegida si el presupuesto cambia. */
export interface RepartoDelCambio {
  contratoId: string;
  trabajadorId: string;
  nombre: string;
  montoActual: number;
  montoNuevo: number;
}

/** El análisis de los saldos que ve quien publicó ANTES de aceptar el cambio. */
export interface AnalisisDelCambio {
  puede: boolean;
  bloqueo?: { codigo: string; mensaje: string };
  modo: ModoDelCambio;
  /** El presupuesto vigente (sin lo que ya volvió por no haberse usado). */
  precioActual: number;
  precioNuevo: number;
  /** precioNuevo − precioActual. Negativo si baja. */
  diferencia: number;
  /** Lo que queda a favor si baja y la publicación está pagada. */
  aFavor: number;
  /** Lo que hay que pagar si sube y la publicación está pagada. */
  aPagar: null | { diferencia: number; comision: number; iva: number; saldoAUsar: number; gastosDeTransferencia: number; porLaPasarela: number };
  /** Lo que ya se cobró y no vuelve ni se recalcula. */
  comisionYaCobrada: number;
  gastosDeTransferenciaYaCobrados: number;
  /** Cuántas postulaciones sin elegir se quitan. */
  postulantesQueSeQuitan: number;
  elegidos: RepartoDelCambio[];
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

/** Lo que va a pasar, en frases, para avisarle a quien publicó antes de que acepte. La web y la app usan estas mismas. */
export function efectosDelCambio(a: AnalisisDelCambio): string[] {
  if (a.diferencia === 0) return [];
  const sube = a.diferencia > 0;
  const frases: string[] = [`El presupuesto pasa de ${pesos(a.precioActual)} a ${pesos(a.precioNuevo)}.`];

  if (a.modo === 'con_aceptacion') {
    frases.push(
      a.elegidos.length === 1
        ? `${a.elegidos[0].nombre} tiene que aceptar: su pago pasa de ${pesos(a.elegidos[0].montoActual)} a ${pesos(a.elegidos[0].montoNuevo)}. Hasta que acepte, todo sigue como está.`
        : `Las ${a.elegidos.length} personas elegidas tienen que aceptar (${a.elegidos.map((e) => `${e.nombre}: de ${pesos(e.montoActual)} a ${pesos(e.montoNuevo)}`).join('; ')}). Si una no acepta, no cambia nada.`,
    );
  }
  if (a.postulantesQueSeQuitan > 0) {
    frases.push(
      a.postulantesQueSeQuitan === 1
        ? 'Se quita la postulación que está esperando respuesta. A esa persona le avisamos que cambió el presupuesto y que tiene que postularse de nuevo.'
        : `Se quitan las ${a.postulantesQueSeQuitan} postulaciones que están esperando respuesta. Les avisamos que cambió el presupuesto y que tienen que postularse de nuevo.`,
    );
  }
  if (a.modo === 'libre') {
    frases.push('La publicación todavía no está pagada: no se mueve plata. Vas a pagar el precio nuevo al publicar.');
    return frases;
  }
  if (!sube) {
    frases.push(`Te quedan ${pesos(a.aFavor)} a favor. Vas a poder retirarlos cuando el trabajo termine y la pasarela haya liberado el pago de la publicación.`);
  } else if (a.aPagar) {
    const partes = [`diferencia ${pesos(a.aPagar.diferencia)}`];
    if (a.aPagar.comision > 0) partes.push(`comisión sobre la diferencia ${pesos(a.aPagar.comision)}`);
    if (a.aPagar.iva > 0) partes.push(`IVA ${pesos(a.aPagar.iva)}`);
    if (a.aPagar.gastosDeTransferencia > 0) partes.push(`gastos de transferencia ${pesos(a.aPagar.gastosDeTransferencia)}`);
    frases.push(
      a.aPagar.porLaPasarela > 0
        ? `Hay que pagar ${pesos(a.aPagar.porLaPasarela)}${a.aPagar.saldoAUsar > 0 ? ` (además usamos ${pesos(a.aPagar.saldoAUsar)} de tu saldo)` : ''}: ${partes.join(', ')}. El precio cambia cuando ese pago quede aprobado.`
        : `Se descuentan ${pesos(a.aPagar.saldoAUsar)} de tu saldo: ${partes.join(', ')}.`,
    );
  }
  frases.push('La comisión de DOAPP que ya pagaste no se devuelve ni se recalcula, y los gastos de transferencia tampoco se devuelven.');
  return frases;
}
