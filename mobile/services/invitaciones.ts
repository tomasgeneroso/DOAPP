import { get, post } from './api';

/**
 * Invitaciones de creadores de contenido (Términos 7.11).
 *
 * Cada enlace es de un solo uso: quien lo canjea —al crear la cuenta o desde su sesión— no paga la comisión de DOAPP por sus
 * contratos como Cliente durante el plazo de la invitación. El servidor valida y canjea; acá se interpreta lo que responde y
 * se reconoce el código aunque la persona pegue el enlace entero.
 */

const FORMATO_DEL_CODIGO = /^INF-[A-HJ-NP-Z2-9]{12}$/;

/** El código canónico, o null si no tiene la forma de un código. */
export function normalizarCodigo(entrada: unknown): string | null {
  const c = String(entrada ?? '').trim().toUpperCase();
  return FORMATO_DEL_CODIGO.test(c) ? c : null;
}

/**
 * Saca el código de lo que pegó la persona: el código solo, el enlace (`https://doapparg.com/invitacion/INF-…`, con o sin
 * parámetros) o el enlace de la app (`doapp://invitacion/INF-…`). Lo que no se reconoce da null.
 */
export function extraerCodigo(texto: unknown): string | null {
  const t = String(texto ?? '').trim();
  const directo = normalizarCodigo(t);
  if (directo) return directo;
  const m = t.match(/(?:^|[/\s=])(INF-[A-Za-z0-9]{12})(?:[/?#\s]|$)/i);
  return m ? normalizarCodigo(m[1]) : null;
}

export interface ConsultaDeLaInvitacion {
  valida: boolean;
  mensaje: string;
  dias?: number;
  influencer?: string;
}

/** Lo que se cuenta de un enlace. Lo que falte o venga raro es «no sirve», nunca «sirve». */
export function interpretarConsulta(res: any): ConsultaDeLaInvitacion {
  if (res?.success === true && res?.valida === true && Number.isFinite(Number(res?.dias)) && Number(res.dias) > 0) {
    return {
      valida: true,
      mensaje: String(res?.mensaje || 'Invitación válida'),
      dias: Number(res.dias),
      influencer: typeof res?.influencer === 'string' && res.influencer ? res.influencer : undefined,
    };
  }
  return { valida: false, mensaje: String(res?.mensaje || res?.message || 'Esta invitación no se puede usar. Revisá el enlace.') };
}

export type ResultadoDelCanje = { ok: true; mensaje: string; hasta: string | null } | { ok: false; mensaje: string; motivo?: string };

export function interpretarCanje(res: any): ResultadoDelCanje {
  if (res?.success === true) {
    return { ok: true, mensaje: String(res?.message || 'Invitación activada.'), hasta: typeof res?.hasta === 'string' ? res.hasta : null };
  }
  return { ok: false, mensaje: String(res?.message || 'No se pudo activar la invitación. Probá de nuevo.'), motivo: typeof res?.motivo === 'string' ? res.motivo : undefined };
}

export async function consultarInvitacion(codigo: string): Promise<ConsultaDeLaInvitacion> {
  const c = normalizarCodigo(codigo);
  if (!c) return { valida: false, mensaje: 'Esta invitación no existe. Revisá el enlace.' };
  // Pública: la abre quien todavía no tiene cuenta.
  return interpretarConsulta(await get<any>(`/invitaciones/${c}`, false));
}

export async function canjearInvitacion(codigo: string): Promise<ResultadoDelCanje> {
  const c = normalizarCodigo(codigo);
  if (!c) return { ok: false, mensaje: 'Esta invitación no existe. Revisá el enlace.', motivo: 'inexistente' };
  return interpretarCanje(await post<any>('/invitaciones/canjear', { codigo: c }));
}

/** Lo que se le cuenta a quien se registró con una invitación (el servidor responde `invitacion: { aplicada, mensaje }`). */
export function mensajeDelRegistro(res: any): { aplicada: boolean; mensaje: string } | null {
  const i = res?.invitacion;
  if (!i || typeof i.mensaje !== 'string') return null;
  return { aplicada: i.aplicada === true, mensaje: i.mensaje };
}

// ------------------------------------------------------------------ panel del owner

export interface InvitacionDelLote {
  id: string;
  code: string;
  enlace: string;
  estado: 'valida' | 'canjeada' | 'dada_de_baja' | 'vencida' | 'inexistente';
  canjeadaPor: { id: string; name: string; email: string } | null;
  canjeadaEl: string | null;
  beneficioHasta: string | null;
}

export interface LoteDeInvitaciones {
  batchId: string;
  influencer: string;
  handle: string | null;
  creadoEl: string;
  total: number;
  canjeadas: number;
  invitaciones: InvitacionDelLote[];
}

export const ETIQUETAS_DE_ESTADO: Record<InvitacionDelLote['estado'], string> = {
  valida: 'Disponible',
  canjeada: 'Canjeada',
  dada_de_baja: 'Dada de baja',
  vencida: 'Vencida',
  inexistente: '—',
};

export function interpretarLotes(res: any): { lotes: LoteDeInvitaciones[]; porCreador: number; dias: number } | null {
  if (res?.success !== true || !Array.isArray(res?.data)) return null;
  return {
    lotes: res.data as LoteDeInvitaciones[],
    porCreador: Number(res?.politica?.invitacionesPorCreador) || 5,
    dias: Number(res?.politica?.diasSinComision) || 365,
  };
}

/** Los enlaces que todavía se pueden usar, uno por línea (para copiar y mandar). */
export const enlacesDisponibles = (l: LoteDeInvitaciones): string =>
  l.invitaciones.filter((i) => i.estado === 'valida').map((i) => i.enlace).join('\n');

export const MOTIVO_MINIMO = 5;

export const listarLotes = () => get<any>('/admin/influencer-invites');
export const emitirLote = (nombre: string, usuario?: string, notas?: string) =>
  post<any>('/admin/influencer-invites', { nombre: nombre.trim(), usuario: usuario?.trim() || undefined, notas: notas?.trim() || undefined });
export const darDeBaja = (id: string, motivo: string) => post<any>(`/admin/influencer-invites/${id}/deactivate`, { motivo: motivo.trim() });
