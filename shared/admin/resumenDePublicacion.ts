/**
 * Qué decir de una publicación en UNA fila del panel de administración: su estado final, el de su contrato y el de su pago.
 *
 * Regla del dueño (2026-11-09): en vez de una lista por cada cosa (publicaciones, contratos, pagos…), una sola fila por publicación con tres columnas —ESTADO
 * FINAL («esperando pago», «contrato en proceso»), CONTRATO («en proceso») y PAGO («pago verificado»)— y desde ahí se llega al resto.
 *
 * Todo lo que decide qué rótulo va acá está en funciones puras (sin base de datos ni React) para poder probarlo; el servidor arma los datos y la pantalla solo
 * los muestra.
 */

export interface TrabajoParaResumir {
  status: string;
  publicationPaid?: boolean | null;
  publicationPaymentId?: string | null;
  cancellationRequestedAt?: Date | string | null;
}

export interface ContratoParaResumir {
  id: string;
  status: string;
  paymentStatus?: string | null;
}

export interface PagoParaResumir {
  id: string;
  status: string;
  paymentType: string;
  contractId?: string | null;
  amount?: number | string | null;
}

export interface Rotulo {
  clave: string;
  rotulo: string;
}

/** Estados de un pago que significan «la plata ya está en DOAPP». */
const PLATA_ADENTRO = ['completed', 'approved', 'verified', 'held_escrow', 'confirmed_for_payout'];
const EN_REVISION = ['pending', 'processing', 'pending_verification', 'awaiting_confirmation'];
const RECHAZADO = ['rejected', 'failed', 'cancelled'];

const CONTRATO_NO_CUENTA = ['cancelled', 'rejected'];
const CONTRATO_POR_EMPEZAR = ['pending', 'ready', 'accepted'];

/** El pago con que se publicó el trabajo: el que el trabajo señala, y si no, el último de tipo publicación. */
export function pagoDeLaPublicacion(trabajo: TrabajoParaResumir, pagos: PagoParaResumir[]): PagoParaResumir | null {
  if (trabajo.publicationPaymentId) {
    const señalado = pagos.find((p) => p.id === trabajo.publicationPaymentId);
    if (señalado) return señalado;
  }
  const deTipo = pagos.filter((p) => p.paymentType === 'job_publication');
  return deTipo.length ? deTipo[deTipo.length - 1] : null;
}

/** Estado de la plata de la PUBLICACIÓN: sin pagar, en revisión, verificado, rechazado o devuelto. */
export function estadoDelPagoDePublicacion(trabajo: TrabajoParaResumir, pagos: PagoParaResumir[]): Rotulo & { pagoId: string | null } {
  const p = pagoDeLaPublicacion(trabajo, pagos);
  if (p && p.status === 'refunded') return { clave: 'devuelto', rotulo: 'Pago devuelto', pagoId: p.id };
  if (p && RECHAZADO.includes(p.status)) return { clave: 'rechazado', rotulo: 'Pago rechazado', pagoId: p.id };
  if (trabajo.publicationPaid || (p && PLATA_ADENTRO.includes(p.status))) return { clave: 'verificado', rotulo: 'Pago verificado', pagoId: p?.id ?? null };
  if (p && EN_REVISION.includes(p.status)) return { clave: 'en_revision', rotulo: 'Pago en revisión', pagoId: p.id };
  return { clave: 'sin_pagar', rotulo: 'Sin pagar', pagoId: p?.id ?? null };
}

const vigentes = (contratos: ContratoParaResumir[]) => contratos.filter((c) => !CONTRATO_NO_CUENTA.includes(c.status));

/** Estado del/los contrato(s) de la publicación. Con varios, manda el que más atención pide. */
export function estadoDelContrato(contratos: ContratoParaResumir[]): Rotulo & { cantidad: number; terminados: number; contratoId: string | null } {
  const v = vigentes(contratos);
  const terminados = v.filter((c) => c.status === 'completed').length;
  if (v.length === 0) {
    return contratos.length
      ? { clave: 'cancelado', rotulo: 'Cancelado', cantidad: 0, terminados: 0, contratoId: contratos[0].id }
      : { clave: 'sin_contrato', rotulo: 'Sin contrato', cantidad: 0, terminados: 0, contratoId: null };
  }
  const primero = (estados: string[]) => v.find((c) => estados.includes(c.status));
  const pesa =
    primero(['disputed', 'in_review']) ? ({ clave: 'en_disputa', rotulo: 'En disputa' } as Rotulo)
    : primero(['awaiting_confirmation']) ? { clave: 'esperando_confirmacion', rotulo: 'Esperando confirmación' }
    : primero(['in_progress']) ? { clave: 'en_proceso', rotulo: 'En proceso' }
    : primero(CONTRATO_POR_EMPEZAR) ? { clave: 'por_empezar', rotulo: 'Por empezar' }
    : { clave: 'terminado', rotulo: 'Terminado' };
  const contratoId = (primero(['disputed', 'in_review']) ?? primero(['awaiting_confirmation']) ?? primero(['in_progress']) ?? primero(CONTRATO_POR_EMPEZAR) ?? v[0]).id;
  return { ...pesa, cantidad: v.length, terminados, contratoId };
}

/**
 * Estado de la plata, de punta a punta: si hay contratos terminados manda lo que falta con el TRABAJADOR («falta pagarle»); si no, el estado del pago de la
 * publicación. El detalle repite el de la publicación cuando el principal habla del trabajador.
 */
export function estadoDelPago(
  trabajo: TrabajoParaResumir,
  contratos: ContratoParaResumir[],
  pagos: PagoParaResumir[],
): Rotulo & { detalle: string | null; pagoId: string | null } {
  const publicacion = estadoDelPagoDePublicacion(trabajo, pagos);
  const v = vigentes(contratos);
  const terminadosSinPagar = v.filter((c) => c.status === 'completed' && c.paymentStatus !== 'completed');
  const terminadosPagados = v.filter((c) => c.status === 'completed' && c.paymentStatus === 'completed');
  if (terminadosSinPagar.length > 0) {
    return { clave: 'falta_pagar_trabajador', rotulo: 'Falta pagar al trabajador', detalle: publicacion.rotulo, pagoId: publicacion.pagoId };
  }
  if (terminadosPagados.length > 0 && terminadosPagados.length === v.length) {
    return { clave: 'pagado_trabajador', rotulo: 'Pagado al trabajador', detalle: publicacion.rotulo, pagoId: publicacion.pagoId };
  }
  return { ...publicacion, detalle: null };
}

/** El estado final: una sola frase que dice en qué está la publicación de punta a punta. */
export function estadoFinal(trabajo: TrabajoParaResumir, contratos: ContratoParaResumir[], pagos: PagoParaResumir[]): Rotulo {
  if (trabajo.status === 'cancelled') return { clave: 'cancelada', rotulo: 'Cancelada' };
  if (trabajo.cancellationRequestedAt) return { clave: 'cancelacion_pedida', rotulo: 'Pidió cancelar' };

  const v = vigentes(contratos);
  if (v.some((c) => c.status === 'disputed' || c.status === 'in_review')) return { clave: 'en_disputa', rotulo: 'En disputa' };
  if (v.length > 0 && v.every((c) => c.status === 'completed')) {
    return v.every((c) => c.paymentStatus === 'completed')
      ? { clave: 'terminada_pagada', rotulo: 'Terminada y pagada' }
      : { clave: 'terminada_falta_pagar', rotulo: 'Terminada: falta pagar al trabajador' };
  }
  if (v.some((c) => c.status === 'awaiting_confirmation')) return { clave: 'esperando_confirmacion', rotulo: 'Esperando confirmación' };
  if (v.some((c) => c.status === 'in_progress')) return { clave: 'contrato_en_proceso', rotulo: 'Contrato en proceso' };
  if (v.some((c) => CONTRATO_POR_EMPEZAR.includes(c.status))) return { clave: 'contrato_por_empezar', rotulo: 'Contrato por empezar' };

  // Sin contrato vigente: manda el estado de la publicación misma.
  const pago = estadoDelPagoDePublicacion(trabajo, pagos);
  if (['draft', 'pending_payment'].includes(trabajo.status) || (!['open', 'paused', 'pending_approval', 'in_progress', 'completed'].includes(trabajo.status)) || pago.clave === 'sin_pagar') {
    return { clave: 'esperando_pago', rotulo: 'Esperando pago' };
  }
  if (pago.clave === 'en_revision') return { clave: 'esperando_pago', rotulo: 'Esperando pago' };
  if (trabajo.status === 'pending_approval') return { clave: 'esperando_aprobacion', rotulo: 'Esperando aprobación' };
  if (trabajo.status === 'paused') return { clave: 'pausada', rotulo: 'Pausada' };
  if (trabajo.status === 'in_progress') return { clave: 'en_curso_sin_contrato', rotulo: 'En curso, sin contrato' };
  if (trabajo.status === 'completed') return { clave: 'terminada_sin_contrato', rotulo: 'Terminada, sin contrato' };
  return { clave: 'abierta', rotulo: 'Abierta: esperando trabajador' };
}

/** Una alerta cuando algo de la fila no cierra entre sí (el trabajo, el contrato y el pago se contradicen). null si todo cuadra. */
export function alertaDeLaFila(trabajo: TrabajoParaResumir, contratos: ContratoParaResumir[], pagos: PagoParaResumir[]): string | null {
  const v = vigentes(contratos);
  const pago = estadoDelPagoDePublicacion(trabajo, pagos);
  if (trabajo.status === 'in_progress' && v.length > 0 && v.every((c) => c.status === 'completed')) {
    return 'Todos sus contratos terminaron pero la publicación sigue «en curso»: se cierra sola en unos minutos.';
  }
  if (v.some((c) => ['in_progress', 'awaiting_confirmation', 'completed'].includes(c.status)) && pago.clave !== 'verificado') {
    return 'Hay un contrato en marcha pero el pago de la publicación no figura como verificado.';
  }
  if (trabajo.status === 'cancelled' && v.some((c) => !['completed', 'cancelled', 'rejected'].includes(c.status))) {
    return 'La publicación está cancelada pero tiene un contrato que no se cerró.';
  }
  return null;
}

export interface ResumenDeFila {
  estadoFinal: Rotulo;
  contrato: ReturnType<typeof estadoDelContrato>;
  pago: ReturnType<typeof estadoDelPago>;
  alerta: string | null;
}

export function resumenDePublicacion(trabajo: TrabajoParaResumir, contratos: ContratoParaResumir[], pagos: PagoParaResumir[]): ResumenDeFila {
  return {
    estadoFinal: estadoFinal(trabajo, contratos, pagos),
    contrato: estadoDelContrato(contratos),
    pago: estadoDelPago(trabajo, contratos, pagos),
    alerta: alertaDeLaFila(trabajo, contratos, pagos),
  };
}

/**
 * Los estados finales que puede mostrar la fila, en el orden en que conviene mirarlos (lo que pide atención primero), con el tono con que se pintan.
 * La pantalla arma de acá los filtros; un estado nuevo en `estadoFinal` se agrega acá o la prueba falla.
 */
export type TonoDeEstado = 'atender' | 'espera' | 'marcha' | 'fin' | 'cancelada';

export const ESTADOS_FINALES: ReadonlyArray<{ clave: string; rotulo: string; tono: TonoDeEstado }> = [
  { clave: 'en_disputa', rotulo: 'En disputa', tono: 'atender' },
  { clave: 'cancelacion_pedida', rotulo: 'Pidió cancelar', tono: 'atender' },
  { clave: 'terminada_falta_pagar', rotulo: 'Terminada: falta pagar al trabajador', tono: 'atender' },
  { clave: 'en_curso_sin_contrato', rotulo: 'En curso, sin contrato', tono: 'atender' },
  { clave: 'esperando_pago', rotulo: 'Esperando pago', tono: 'espera' },
  { clave: 'esperando_aprobacion', rotulo: 'Esperando aprobación', tono: 'espera' },
  { clave: 'abierta', rotulo: 'Abierta: esperando trabajador', tono: 'espera' },
  { clave: 'pausada', rotulo: 'Pausada', tono: 'espera' },
  { clave: 'contrato_por_empezar', rotulo: 'Contrato por empezar', tono: 'marcha' },
  { clave: 'contrato_en_proceso', rotulo: 'Contrato en proceso', tono: 'marcha' },
  { clave: 'esperando_confirmacion', rotulo: 'Esperando confirmación', tono: 'marcha' },
  { clave: 'terminada_pagada', rotulo: 'Terminada y pagada', tono: 'fin' },
  { clave: 'terminada_sin_contrato', rotulo: 'Terminada, sin contrato', tono: 'fin' },
  { clave: 'cancelada', rotulo: 'Cancelada', tono: 'cancelada' },
];
