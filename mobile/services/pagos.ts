import { get, post } from './api';

/**
 * Seguimiento de un pago hecho en Mercado Pago desde el celular.
 *
 * El celular abre el checkout en el navegador del teléfono y Mercado Pago devuelve a una página web de DOAPP, no a la
 * app: ahí la app no se entera de nada, y la página web necesita una sesión iniciada en ESE navegador (que casi nadie
 * tiene). Por eso la app tiene que confirmar y mostrar el pago por su cuenta cuando la persona vuelve:
 *  - publicación: la app misma confirma el pago con `capture-order` (con la sesión de la app, sin necesidad del
 *    navegador);
 *  - cotización y contrato: los confirma el aviso automático de Mercado Pago en el servidor; la app consulta el estado
 *    hasta que se refleje.
 * Es la misma lógica que el cartel de la web (`AvisoDeRetornoDePago`), con los mismos textos.
 */

/** Qué se está pagando; de eso depende cómo se sabe que el pago ya llegó. */
export type TipoDePago = 'publicacion' | 'cotizacion' | 'contrato';

export type SeguimientoDelPago =
  | { fase: 'esperando' }
  | { fase: 'confirmado'; titulo: string; texto: string }
  | { fase: 'problema'; titulo: string; texto: string };

/** Cada cuánto se consulta, y cuántas veces antes de decir que se está demorando (15 × 4 s = un minuto). */
export const INTERVALO_MS = 4000;
export const MAX_CONSULTAS = 15;

const AVISO_FINAL = 'También te avisamos por notificación y por email.';

/** Estados del pago de un contrato que ya significan «Mercado Pago lo cobró y quedó registrado». */
const ESTADOS_DE_PAGO_REGISTRADO = ['pending_verification', 'held_escrow', 'held', 'escrow', 'pending_payout', 'released', 'completed'];

const confirmado = (titulo: string, texto: string): SeguimientoDelPago => ({ fase: 'confirmado', titulo, texto: `${texto} ${AVISO_FINAL}` });
const problema = (titulo: string, texto: string): SeguimientoDelPago => ({ fase: 'problema', titulo, texto });

/** Lo que se le dice cuando pasó el minuto y el pago todavía no se ve reflejado. */
export const TEXTO_DEMORADO = {
  titulo: 'Todavía no vemos tu pago reflejado',
  texto:
    'No lo pagues de nuevo. Apenas se registre te avisamos con una notificación y un email. ' +
    'Si pasan más de unas horas, escribinos desde el Centro de ayuda.',
};

/**
 * Traduce la respuesta de `POST /payments/capture-order` (pago de una publicación).
 *
 * Reglas: lo que falte o venga raro NO es un éxito. «Pendiente» (409 PAYMENT_PENDING) o un error de conexión significan
 * «seguí esperando»; un pago en revisión o rechazado se le dice a la persona con el mensaje del servidor.
 */
export function interpretarCaptura(res: any): SeguimientoDelPago {
  if (res?.success === true) {
    const d = res.data || {};
    if (d.jobPendingApproval) {
      return confirmado(
        'Recibimos tu pago: tu publicación está en revisión',
        'Un administrador la revisa y, apenas la apruebe, queda visible para los profesionales.',
      );
    }
    if (d.jobPublished) {
      return confirmado('¡Recibimos tu pago!', 'Tu trabajo ya está publicado y los profesionales pueden enviar propuestas.');
    }
    return confirmado('¡Recibimos tu pago!', 'Tu pago quedó registrado.');
  }

  switch (res?.code) {
    case 'PAYMENT_PENDING':
      return { fase: 'esperando' };
    case 'PAYMENT_UNDER_REVIEW':
      return problema('Tu pago quedó en revisión', res?.message || 'Un administrador lo va a verificar; no hace falta que pagues de nuevo.');
    case 'PAYMENT_REJECTED':
      return problema('Mercado Pago no aprobó el pago', res?.message || 'No se cobró nada: podés intentar de nuevo.');
    case 'PAYMENT_ALREADY_USED':
      return problema('Ese pago ya se usó', res?.message || 'Ese pago de Mercado Pago ya respalda otra orden.');
  }

  // Sin respuesta del servidor (se cortó la conexión, tardó demasiado) o sin sesión momentánea: se reintenta.
  if (res?.error === 'NETWORK_ERROR' || res?.error === 'TIMEOUT' || res?.status === 401 || res?.status >= 500) {
    return { fase: 'esperando' };
  }
  return problema('No pudimos confirmar tu pago', res?.message || 'Si ya pagaste, no pagues de nuevo: escribinos desde el Centro de ayuda.');
}

/** Cotización: el aviso de Mercado Pago aprueba la propuesta y crea el contrato; recién ahí el estado es «approved». */
export function interpretarPropuesta(propuesta: any): SeguimientoDelPago {
  if (propuesta?.status === 'approved') {
    return confirmado(
      '¡Recibimos tu pago!',
      'Tu pago de la cotización quedó registrado y el contrato ya está creado. Un administrador lo revisa y te avisamos apenas esté aprobado.',
    );
  }
  return { fase: 'esperando' };
}

/** Contrato: el aviso de Mercado Pago deja el estado de pago en «pendiente de verificación» (o más adelante). */
export function interpretarContrato(contrato: any): SeguimientoDelPago {
  const estado = String(contrato?.paymentStatus ?? '');
  if (!ESTADOS_DE_PAGO_REGISTRADO.includes(estado)) return { fase: 'esperando' };
  return confirmado(
    '¡Recibimos tu pago!',
    contrato?.paymentMode === 'on_completion'
      ? 'El pago de la orden quedó confirmado.'
      : 'Tu pago quedó registrado y está pendiente de que un administrador lo verifique; te avisamos apenas pase a garantía.',
  );
}

export interface ParametrosDelSeguimiento {
  tipo: TipoDePago;
  preferenceId?: string;
  proposalId?: string;
  contractId?: string;
}

/** Una consulta: pregunta cómo va el pago y lo traduce a lo que se le muestra a la persona. */
export async function consultarPago(p: ParametrosDelSeguimiento): Promise<SeguimientoDelPago> {
  if (p.tipo === 'publicacion') {
    if (!p.preferenceId) return problema('No pudimos seguir tu pago', 'Revisá tus trabajos: si ya pagaste, la publicación aparece en revisión.');
    return interpretarCaptura(await post<any>('/payments/capture-order', { preference_id: p.preferenceId }));
  }
  if (p.tipo === 'cotizacion') {
    if (!p.proposalId) return problema('No pudimos seguir tu pago', 'Abrí la propuesta para ver cómo quedó.');
    const r: any = await get<any>(`/proposals/${p.proposalId}`);
    return r?.success ? interpretarPropuesta(r.proposal) : { fase: 'esperando' };
  }
  if (!p.contractId) return problema('No pudimos seguir tu pago', 'Abrí el contrato para ver cómo quedó.');
  const r: any = await get<any>(`/contracts/${p.contractId}`);
  return r?.success ? interpretarContrato(r.contract || r.data) : { fase: 'esperando' };
}
