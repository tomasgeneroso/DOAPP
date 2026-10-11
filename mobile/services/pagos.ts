import { Platform } from 'react-native';
import { get, post } from './api';

/**
 * Seguimiento de un pago hecho en Mercado Pago desde el celular.
 *
 * El celular abre el checkout en el navegador del teléfono. Mercado Pago devuelve a `/payment/app-return` (una página
 * pública que dice «volvé a la app»), no a una página que necesite sesión: los pedidos de pago de la app mandan
 * `origen: 'app'` justamente para eso. La confirmación se hace acá, con la sesión de la app:
 *  - publicación y aumento de precio: la app misma confirma el pago con `capture-order`;
 *  - cotización y contrato: los confirma el aviso automático de Mercado Pago en el servidor; la app consulta el estado
 *    hasta que se refleje.
 * Es la misma lógica que el cartel de la web (`AvisoDeRetornoDePago`), con los mismos textos.
 */

/** Qué se está pagando; de eso depende cómo se sabe que el pago ya llegó. */
export type TipoDePago = 'publicacion' | 'aumento' | 'cotizacion' | 'contrato';

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

const aumentoEnRevision = (horas?: number): SeguimientoDelPago =>
  confirmado(
    'Recibimos tu pago: el aumento está en revisión',
    `Un administrador lo revisa y, apenas lo apruebe, el precio nuevo se aplica y el trabajo se reactiva. ` +
      `Si pasan ${horas || 24} horas sin revisión, se aprueba solo porque tu pago ya está confirmado.`,
  );

const aumentoAplicado = (): SeguimientoDelPago =>
  confirmado('¡Recibimos tu pago!', 'El precio nuevo ya está aplicado y el trabajo vuelve a estar visible para los profesionales.');

/**
 * Traduce la respuesta de `POST /payments/capture-order` (pago de una publicación o de un aumento de precio).
 *
 * Reglas: lo que falte o venga raro NO es un éxito. «Pendiente» (409 PAYMENT_PENDING) o un error de conexión significan
 * «seguí esperando»; un pago en revisión o rechazado se le dice a la persona con el mensaje del servidor.
 */
export function interpretarCaptura(res: any): SeguimientoDelPago {
  if (res?.success === true) {
    const d = res.data || {};
    if (d.budgetPendingApproval) return aumentoEnRevision(d.approvalHours);
    if (d.budgetUpdated) return aumentoAplicado();
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

/**
 * Cuando la app no tiene el id de la preferencia (volvió desde la página de retorno, o se reabrió): se mira el estado
 * del trabajo. Para una publicación: «en revisión» o «abierto». Para un aumento: si está «pagado en revisión» o si ya
 * no queda un aumento pendiente.
 */
export function interpretarTrabajo(tipo: 'publicacion' | 'aumento', job: any): SeguimientoDelPago {
  if (!job) return { fase: 'esperando' };
  if (tipo === 'publicacion') {
    if (job.status === 'pending_approval') {
      return confirmado(
        'Recibimos tu pago: tu publicación está en revisión',
        'Un administrador la revisa y, apenas la apruebe, queda visible para los profesionales.',
      );
    }
    if (job.status === 'open') {
      return confirmado('¡Recibimos tu pago!', 'Tu trabajo ya está publicado y los profesionales pueden enviar propuestas.');
    }
    return { fase: 'esperando' };
  }
  if (job.aumentoPendiente?.estado === 'pagado_en_revision') return aumentoEnRevision(job.aumentoPendiente.horasDeEspera);
  // Ya no hay aumento pendiente y el trabajo no está pausado: el precio nuevo se aplicó.
  if (!job.pendingNewPrice && job.status !== 'paused') return aumentoAplicado();
  return { fase: 'esperando' };
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
  jobId?: string;
  proposalId?: string;
  contractId?: string;
}

/** Una consulta: pregunta cómo va el pago y lo traduce a lo que se le muestra a la persona. */
export async function consultarPago(p: ParametrosDelSeguimiento): Promise<SeguimientoDelPago> {
  if (p.tipo === 'publicacion' || p.tipo === 'aumento') {
    // Con el id de la preferencia, la app confirma el pago ella misma.
    if (p.preferenceId) return interpretarCaptura(await post<any>('/payments/capture-order', { preference_id: p.preferenceId }));
    // Sin él, se mira cómo quedó el trabajo.
    if (!p.jobId) return problema('No pudimos seguir tu pago', 'Revisá tus trabajos: si ya pagaste, la publicación aparece en revisión.');
    const r: any = await get<any>(`/jobs/${p.jobId}`);
    return r?.success ? interpretarTrabajo(p.tipo, r.job) : { fase: 'esperando' };
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

// ---------------------------------------------------------------------------
// Empezar un pago desde la app
// ---------------------------------------------------------------------------

/**
 * De dónde viene el pedido de pago. Desde la app nativa es «app»: Mercado Pago vuelve a una página pública que lleva de
 * regreso a la app, en vez de la página web de éxito (que necesita una sesión en el navegador del teléfono). Desde la web
 * de Expo no se manda nada y todo sigue como siempre.
 */
export function origenDelPago(): 'app' | undefined {
  return Platform.OS === 'web' ? undefined : 'app';
}

export type InicioDePago =
  | { ok: true; url: string; preferenceId?: string }
  | { ok: false; mensaje: string; yaPagado?: boolean; yaIniciado?: boolean };

/**
 * Traduce la respuesta de un pedido de pago (contrato o aumento de precio). Sin dirección de pago no hay nada que abrir:
 * lo que falte o venga raro es un error, no un éxito.
 */
export function interpretarInicioDePago(res: any): InicioDePago {
  const url = res?.paymentUrl || res?.approvalUrl;
  if (res?.success === true && typeof url === 'string' && url.startsWith('http')) {
    return { ok: true, url, preferenceId: res?.preferenceId || undefined };
  }
  if (res?.code === 'AUMENTO_PAGADO_EN_REVISION') {
    return { ok: false, yaPagado: true, mensaje: res?.message || 'Ya pagaste este aumento y está en revisión: no hace falta que pagues de nuevo.' };
  }
  // El servidor rechaza un segundo pago de un contrato que ya tiene uno iniciado o cobrado.
  if (/already exists|already paid/i.test(String(res?.message || ''))) {
    return {
      ok: false,
      yaIniciado: true,
      mensaje: 'Ya hay un pago iniciado para este contrato. Si ya pagaste, tocá «Ver el estado de mi pago». Si no lo terminaste, escribinos desde el Centro de ayuda.',
    };
  }
  return { ok: false, mensaje: res?.message || 'No se pudo iniciar el pago. Probá de nuevo en un momento.' };
}

/** Pagar la garantía de un contrato. */
export async function iniciarPagoDelContrato(contractId: string): Promise<InicioDePago> {
  return interpretarInicioDePago(await post<any>(`/payments/contract/${contractId}`, { origen: origenDelPago() }));
}

/** Pagar la diferencia de un aumento de precio ya pedido. */
export async function iniciarPagoDelAumento(jobId: string): Promise<InicioDePago> {
  return interpretarInicioDePago(
    await post<any>('/payments/create-order', { jobId, paymentType: 'budget_increase', paymentMethod: 'mercadopago', origen: origenDelPago() }),
  );
}

/**
 * ¿Se le ofrece pagar la garantía de este contrato a quien lo mira?
 * Sólo el cliente, con el contrato ya aprobado por administración, sin pago hecho y que no sea de los que se pagan al terminar.
 */
export function puedePagarElContrato(contrato: any, soyElCliente: boolean): boolean {
  return Boolean(
    soyElCliente &&
      contrato &&
      contrato.paymentMode !== 'on_completion' &&
      ['ready', 'accepted'].includes(String(contrato.status)) &&
      String(contrato.paymentStatus) === 'pending',
  );
}
