import { get, put } from './api';

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
    ? 'El contrato se cancela. Si había dinero retenido, revisá antes con administración cómo se resuelve.'
    : 'Los nuevos términos que se pidieron se aplican al contrato.';
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

export const traerSolicitud = (id: string) => get<any>(`/contract-change-requests/${id}`);
export const traerSolicitudesDelContrato = (contractId: string) => get<any>(`/contract-change-requests/contract/${contractId}`);
export const responderSolicitud = async (id: string, aceptar: boolean) =>
  interpretarRespuesta(await put<any>(`/contract-change-requests/${id}/respond`, { accept: aceptar === true }));
