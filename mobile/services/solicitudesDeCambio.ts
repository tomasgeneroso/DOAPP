import { get, post, put } from './api';

/**
 * Solicitudes de cambio o cancelación de un contrato (la otra parte las responde).
 *
 * Quien recibe la solicitud (por correo o desde el chat) la acepta o la rechaza. El servidor decide: solo la otra parte del
 * contrato puede responder una solicitud pendiente. Acá se muestra lo pedido y se ofrecen los botones que corresponden.
 */

export type EstadoDeLaSolicitud = 'pending' | 'accepted' | 'rejected' | 'escalated_to_support' | string;

export interface SolicitudDeCambio {
  id: string;
  type: 'cancel' | 'modify' | string;
  reason: string;
  status: EstadoDeLaSolicitud;
  requestedById?: string;
  requestedBy?: { id: string; name: string };
  respondedBy?: { id: string; name: string } | null;
  respondedAt?: string | null;
  createdAt?: string;
  newTerms?: { price?: number; startDate?: string; endDate?: string; description?: string } | null;
  contract?: {
    id: string;
    price?: number | string;
    startDate?: string;
    endDate?: string;
    clientId?: string;
    doerId?: string;
    job?: { id: string; title: string };
    client?: { id: string; name: string };
    doer?: { id: string; name: string };
  };
}

const ESTADOS: Record<string, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  escalated_to_support: 'Derivada a soporte',
};
export const etiquetaDelEstadoDeLaSolicitud = (e: unknown): string => ESTADOS[String(e)] || String(e ?? '');

export const etiquetaDelTipo = (t: unknown): string => (t === 'cancel' ? 'Cancelación del contrato' : t === 'modify' ? 'Modificación del contrato' : String(t ?? ''));

/** ¿Esta persona puede responder? Solo la otra parte del contrato (no quien la pidió) y mientras está pendiente. */
export function puedeResponder(s: SolicitudDeCambio | null | undefined, userId: unknown): boolean {
  if (!s || !userId || s.status !== 'pending') return false;
  const yo = String(userId);
  const pidio = String(s.requestedBy?.id ?? s.requestedById ?? '');
  if (pidio && pidio === yo) return false;
  // Si la solicitud trae el contrato, hay que ser una de sus partes. La lista por contrato no lo trae, pero el servidor solo la
  // entrega a las partes: ahí alcanza con que no la haya pedido uno mismo.
  const partes = [s.contract?.client?.id ?? s.contract?.clientId, s.contract?.doer?.id ?? s.contract?.doerId].map((x) => String(x ?? '')).filter(Boolean);
  return partes.length === 0 || partes.includes(yo);
}

export function leerSolicitud(res: any): SolicitudDeCambio | null {
  const s = res?.success === true ? res?.changeRequest : null;
  return s && typeof s === 'object' && s.id ? (s as SolicitudDeCambio) : null;
}

/** Lo que se le avisa a quien va a aceptar (lo que pasa de verdad al aceptar). */
export function advertenciaDeAceptar(s: Pick<SolicitudDeCambio, 'type'>): string {
  return s.type === 'cancel'
    ? 'Se abre una cancelación de mutuo acuerdo que revisa un administrador, que resuelve el dinero según los términos. El contrato sigue como está hasta entonces.'
    : 'Las fechas y la nota que se pidieron se aplican al contrato.';
}

export interface ResultadoDeResponder {
  ok: boolean;
  mensaje: string;
}

export function interpretarRespuesta(res: any): ResultadoDeResponder {
  if (res?.success === true) return { ok: true, mensaje: String(res?.message || 'Listo.') };
  return { ok: false, mensaje: String(res?.message || 'No se pudo responder. Probá de nuevo.') };
}

export function leerSolicitudes(res: any): SolicitudDeCambio[] | null {
  return res?.success === true && Array.isArray(res?.changeRequests) ? (res.changeRequests as SolicitudDeCambio[]) : null;
}

/** Las que esta persona tiene que responder (pendientes, pedidas por la otra parte). */
export const pendientesParaResponder = (lista: SolicitudDeCambio[] | null | undefined, userId: unknown): SolicitudDeCambio[] =>
  (lista || []).filter((s) => puedeResponder(s, userId));

// ------------------------------------------------------------------ pedir un cambio

/** Estados del contrato en los que se puede pedir un cambio o la cancelación (los mismos que acepta el servidor). */
export const ESTADOS_CON_CAMBIOS = ['pending', 'ready', 'accepted', 'in_progress'];
export const admiteCambios = (estado: unknown): boolean => ESTADOS_CON_CAMBIOS.includes(String(estado));
/** La fecha de inicio solo se mueve antes de empezar. */
export const sinEmpezar = (estado: unknown): boolean => ['pending', 'ready', 'accepted'].includes(String(estado));

export const LIMITE_MOTIVO = 1000;
export const MINIMO_MOTIVO = 5;
export const LIMITE_NOTA = 500;

export interface BorradorDeSolicitud {
  tipo: 'modify' | 'cancel';
  motivo: string;
  /** AAAA-MM-DD */
  inicio: string;
  /** AAAA-MM-DD */
  fin: string;
  nota: string;
}

/** «AAAA-MM-DD» → mediodía de ese día en la hora del teléfono (null si no es una fecha de verdad: 2026-02-31 no existe). */
export function fechaDelDia(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(anio, mes - 1, dia, 12, 0, 0);
  return f.getFullYear() === anio && f.getMonth() === mes - 1 && f.getDate() === dia ? f : null;
}

export type CuerpoDeSolicitud = { contractId: string; type: 'modify' | 'cancel'; reason: string; newTerms?: { startDate?: string; endDate?: string; description?: string } };
export type ResultadoDeArmar = { ok: true; cuerpo: CuerpoDeSolicitud } | { ok: false; error: string };

/**
 * Valida lo que escribió la persona y arma el pedido. Son las mismas reglas del servidor, que es el que decide: acá
 * solo se avisa antes de mandar. El precio no se cambia con una solicitud.
 */
export function armarSolicitud(contractId: string, estado: unknown, b: BorradorDeSolicitud, ahora: Date = new Date()): ResultadoDeArmar {
  if (!admiteCambios(estado)) return { ok: false, error: 'Este contrato ya no admite cambios: está terminado, cancelado, en revisión o en disputa.' };
  const motivo = b.motivo.trim();
  if (motivo.length < MINIMO_MOTIVO) return { ok: false, error: `Contá brevemente el motivo (al menos ${MINIMO_MOTIVO} caracteres).` };
  if (motivo.length > LIMITE_MOTIVO) return { ok: false, error: `El motivo no puede pasar de ${LIMITE_MOTIVO} caracteres.` };
  if (b.tipo === 'cancel') return { ok: true, cuerpo: { contractId, type: 'cancel', reason: motivo } };

  const inicio = b.inicio.trim() ? fechaDelDia(b.inicio) : null;
  const fin = b.fin.trim() ? fechaDelDia(b.fin) : null;
  if (b.inicio.trim() && !inicio) return { ok: false, error: 'La fecha de inicio no es válida (AAAA-MM-DD).' };
  if (b.fin.trim() && !fin) return { ok: false, error: 'La fecha de fin no es válida (AAAA-MM-DD).' };
  const nota = b.nota.trim();
  if (nota.length > LIMITE_NOTA) return { ok: false, error: `La nota no puede pasar de ${LIMITE_NOTA} caracteres.` };
  if (!inicio && !fin && !nota) return { ok: false, error: 'Indicá qué querés cambiar: la fecha de inicio, la de fin o una nota.' };
  if (inicio && !sinEmpezar(estado)) return { ok: false, error: 'El trabajo ya empezó: ya no se puede cambiar la fecha de inicio.' };
  if (inicio && inicio.getTime() <= ahora.getTime()) return { ok: false, error: 'La fecha de inicio tiene que ser futura.' };
  if (fin && fin.getTime() <= ahora.getTime()) return { ok: false, error: 'La fecha de fin tiene que ser futura.' };
  if (inicio && fin && inicio.getTime() >= fin.getTime()) return { ok: false, error: 'La fecha de inicio tiene que ser anterior a la de fin.' };

  return {
    ok: true,
    cuerpo: {
      contractId,
      type: 'modify',
      reason: motivo,
      newTerms: { ...(inicio ? { startDate: inicio.toISOString() } : {}), ...(fin ? { endDate: fin.toISOString() } : {}), ...(nota ? { description: nota } : {}) },
    },
  };
}

export interface ResultadoDePedir {
  ok: boolean;
  mensaje: string;
  id?: string;
}

export function interpretarPedido(res: any): ResultadoDePedir {
  const id = res?.success === true ? res?.changeRequest?.id : null;
  if (id) return { ok: true, mensaje: String(res?.message || 'Solicitud enviada.'), id: String(id) };
  return { ok: false, mensaje: String(res?.message || 'No se pudo enviar la solicitud. Probá de nuevo.') };
}

export const pedirCambio = async (cuerpo: CuerpoDeSolicitud) => interpretarPedido(await post<any>('/contract-change-requests', cuerpo));

/** ¿Hay alguna pendiente (la haya pedido quien sea)? Mientras la haya, no se puede abrir otra. */
export const hayPendiente = (lista: SolicitudDeCambio[] | null | undefined): boolean => (lista || []).some((s) => s.status === 'pending');

export const traerSolicitud = (id: string) => get<any>(`/contract-change-requests/${id}`);
export const traerSolicitudesDelContrato = (contractId: string) => get<any>(`/contract-change-requests/contract/${contractId}`);
export const responderSolicitud = async (id: string, aceptar: boolean) =>
  interpretarRespuesta(await put<any>(`/contract-change-requests/${id}/respond`, { accept: aceptar === true }));
