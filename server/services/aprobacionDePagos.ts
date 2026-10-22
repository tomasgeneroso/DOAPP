import { ErrorDeDinero, respuestaDeErrorDeDinero } from './controlesDeDinero.js';

/**
 * Nadie aprueba un pago propio.
 *
 * Aprobar un pago por transferencia es dar por buena una afirmación («el dinero entró al banco») que nada más comprueba: no hay pasarela. Si
 * quien lo aprueba es quien lo hizo —o quien lo va a cobrar— no hay una segunda persona que lo compruebe. Así llegó a devolverse al saldo una
 * transferencia de $431.956,80 que nunca tuvo dinero detrás (caso «try»).
 *
 * Regla: un administrador no aprueba un pago del que es parte (lo pagó o lo cobra); tiene que hacerlo otra persona del equipo. El DUEÑO sí puede
 * (es quien responde por la plata), y queda anotado como aprobación propia.
 */

export interface PagoDeUnaPersona {
  payerId?: string | number | null;
  recipientId?: string | number | null;
}

export interface QuienAprueba {
  id: string | number;
  adminRole?: string | null;
}

/** ¿La persona es parte de este pago (lo pagó o lo cobra)? */
export const esPagoPropio = (pago: PagoDeUnaPersona, quien: QuienAprueba): boolean =>
  [pago.payerId, pago.recipientId].some((parte) => parte !== null && parte !== undefined && String(parte) === String(quien.id));

export const esElDueno = (quien: QuienAprueba): boolean => quien.adminRole === 'owner';

/** El dueño aprueba un pago propio: se permite, pero tiene que quedar anotado. */
export const esAprobacionPropiaDelDueno = (pago: PagoDeUnaPersona, quien: QuienAprueba): boolean => esPagoPropio(pago, quien) && esElDueno(quien);

/**
 * null = puede aprobar. Si no, la respuesta HTTP que hay que devolver: 403, con el código del catálogo, el motivo y el enlace a la guía de errores.
 */
export function bloqueoPorAprobacionPropia(pago: PagoDeUnaPersona, quien: QuienAprueba): { status: number; body: Record<string, unknown> } | null {
  if (!esPagoPropio(pago, quien) || esElDueno(quien)) return null;
  const comoParte = String(pago.payerId) === String(quien.id) ? 'lo pagó' : 'lo va a cobrar';
  const r = respuestaDeErrorDeDinero(
    new ErrorDeDinero('APROBACION-DE-PAGO-PROPIO', `esta cuenta ${comoParte}: lo tiene que aprobar otra persona del equipo o el dueño`),
    true,
  )!;
  return { status: 403, body: r.body };
}
