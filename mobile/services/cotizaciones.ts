import { get, post, put } from './api';

/**
 * Cotizaciones (presupuestos con ítems) desde el celular: lista, detalle, aceptar, rechazar, y armar o corregir una.
 *
 * Las reglas son las del servidor (la edición solo en borrador o rechazada, con tope de dos revisiones; solo el destinatario
 * acepta o rechaza una pendiente). Acá se decide qué botones se le ofrecen a cada persona, se calculan los totales para
 * mostrarlos y se valida lo evidente; el servidor vuelve a calcular y decide.
 */

export type EstadoDeLaCotizacion = 'draft' | 'sent' | 'accepted' | 'rejected' | string;

export interface ItemDeCotizacion {
  qty: number;
  description: string;
  unitPrice: number;
  amount: number;
}

export interface Cotizacion {
  id: string;
  title: string;
  status: EstadoDeLaCotizacion;
  items: ItemDeCotizacion[];
  subtotal: number | string;
  taxRate: number | string;
  taxAmount: number | string;
  otherTaxes?: Array<{ name?: string; rate: number }>;
  total: number | string;
  notes?: string | null;
  paymentTerms?: string | null;
  validUntil?: string | null;
  rejectionReason?: string | null;
  revisionCount?: number;
  senderId: string;
  recipientId: string;
  sender?: { id: string; name: string };
  recipient?: { id: string; name: string };
  job?: { id: string; title: string } | null;
  conversationId?: string | null;
  createdAt?: string;
}

export const MAXIMO_DE_REVISIONES = 2;

const ETIQUETAS: Record<string, string> = { draft: 'Borrador', sent: 'Pendiente', accepted: 'Aceptada', rejected: 'Rechazada' };
export const etiquetaDelEstado = (estado: unknown): string => ETIQUETAS[String(estado)] || String(estado ?? '');

export const IVA_POSIBLES = [0, 10.5, 21, 27];

/** Número tal como lo escribe una persona en Argentina (1.234,50 · 1234.5 · 1234,5). Lo que no se entiende es null. */
export function parsearNumero(texto: unknown): number | null {
  const t = String(texto ?? '').trim().replace(/\s/g, '').replace(/^\$/, '');
  if (t === '') return null;
  let limpio = t;
  if (limpio.includes(',')) limpio = limpio.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) limpio = limpio.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
}

export interface ItemEnEdicion {
  cantidad: string;
  descripcion: string;
  precio: string;
}

export const itemVacio = (): ItemEnEdicion => ({ cantidad: '1', descripcion: '', precio: '' });

export interface Totales {
  subtotal: number;
  iva: number;
  total: number;
}

/** Subtotal, IVA y total (como los calcula el servidor: cantidad × precio, IVA sobre el subtotal). */
export function calcularTotales(items: ItemEnEdicion[], tasaDeIva: number): Totales {
  const subtotal = items.reduce((s, i) => {
    const q = parsearNumero(i.cantidad) ?? 0;
    const p = parsearNumero(i.precio) ?? 0;
    return s + q * p;
  }, 0);
  const iva = subtotal * (Number(tasaDeIva) / 100);
  return { subtotal, iva, total: subtotal + iva };
}

export interface BorradorDeCotizacion {
  titulo: string;
  items: ItemEnEdicion[];
  tasaDeIva: number;
  notas: string;
  condicionesDePago: string;
  validaHasta: string;
}

export type ResultadoDeValidar = { ok: true; items: ItemDeCotizacion[] } | { ok: false; error: string };

export function validarBorrador(b: BorradorDeCotizacion): ResultadoDeValidar {
  if (!b.titulo.trim()) return { ok: false, error: 'Escribí un título para la cotización.' };
  if (!b.items.length) return { ok: false, error: 'Agregá al menos un ítem.' };
  const items: ItemDeCotizacion[] = [];
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i];
    const n = i + 1;
    if (!it.descripcion.trim()) return { ok: false, error: `El ítem ${n} necesita una descripción.` };
    const cantidad = parsearNumero(it.cantidad);
    const precio = parsearNumero(it.precio);
    if (cantidad === null || cantidad <= 0) return { ok: false, error: `El ítem ${n} necesita una cantidad mayor que cero.` };
    if (precio === null || precio <= 0) return { ok: false, error: `El ítem ${n} necesita un precio mayor que cero.` };
    items.push({ qty: cantidad, description: it.descripcion.trim(), unitPrice: precio, amount: cantidad * precio });
  }
  if (!IVA_POSIBLES.includes(Number(b.tasaDeIva))) return { ok: false, error: 'Elegí una alícuota de IVA válida.' };
  if (b.validaHasta.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(b.validaHasta.trim())) return { ok: false, error: 'La fecha de validez va como AAAA-MM-DD (por ejemplo 2026-12-31).' };
  return { ok: true, items };
}

/** Lo que se manda al servidor. Siempre se envía (status «sent»), igual que la web. */
export function cuerpoDeLaCotizacion(
  b: BorradorDeCotizacion,
  items: ItemDeCotizacion[],
  destino: { recipientId?: string; jobId?: string; conversationId?: string; applyMode?: boolean },
): Record<string, unknown> {
  return {
    ...(destino.recipientId ? { recipientId: destino.recipientId } : {}),
    jobId: destino.jobId || undefined,
    conversationId: destino.conversationId || undefined,
    title: b.titulo.trim(),
    items,
    taxRate: Number(b.tasaDeIva),
    otherTaxes: [],
    notes: b.notas.trim() || undefined,
    paymentTerms: b.condicionesDePago.trim() || undefined,
    validUntil: b.validaHasta.trim() || undefined,
    status: 'sent',
    applyMode: destino.applyMode === true,
  };
}

/** Del borrador de una cotización existente (para corregirla). */
export function borradorDe(c: Cotizacion): BorradorDeCotizacion {
  return {
    titulo: c.title || '',
    items: (c.items || []).map((i) => ({ cantidad: String(i.qty), descripcion: i.description, precio: String(i.unitPrice) })),
    tasaDeIva: Number(c.taxRate) || 0,
    notas: c.notes || '',
    condicionesDePago: c.paymentTerms || '',
    validaHasta: c.validUntil ? String(c.validUntil).slice(0, 10) : '',
  };
}

export type AccionDeCotizacion = 'aceptar' | 'rechazar' | 'corregir';

/** Qué se le ofrece a cada persona. Lo que no corresponde, no se ofrece (el servidor igual lo rechaza). */
export function accionesDeLaCotizacion(c: Pick<Cotizacion, 'status' | 'senderId' | 'recipientId' | 'revisionCount'> | null | undefined, userId: unknown): AccionDeCotizacion[] {
  if (!c || !userId) return [];
  const yo = String(userId);
  if (String(c.recipientId) === yo && c.status === 'sent') return ['aceptar', 'rechazar'];
  if (String(c.senderId) === yo && c.status === 'rejected' && Number(c.revisionCount || 0) < MAXIMO_DE_REVISIONES) return ['corregir'];
  return [];
}

/** ¿La cotización venció? (la fecha de validez ya pasó y todavía está pendiente) */
export function estaVencida(c: Pick<Cotizacion, 'status' | 'validUntil'>, ahora: number = Date.now()): boolean {
  if (c.status !== 'sent' || !c.validUntil) return false;
  const t = new Date(c.validUntil).getTime();
  return Number.isFinite(t) && t < ahora;
}

export const pesos = (n: unknown): string => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

/** Texto para compartir (la app no genera el PDF: ese lo da la web). */
export function resumenParaCompartir(c: Cotizacion): string {
  const lineas = (c.items || []).map((i) => `• ${i.qty} × ${i.description} — ${pesos(i.amount)}`);
  return [
    `Cotización: ${c.title}`,
    c.sender?.name ? `De: ${c.sender.name}` : '',
    '',
    ...lineas,
    '',
    `Subtotal: ${pesos(c.subtotal)}`,
    `IVA (${Number(c.taxRate) || 0}%): ${pesos(c.taxAmount)}`,
    `Total: ${pesos(c.total)}`,
    c.paymentTerms ? `Condiciones de pago: ${c.paymentTerms}` : '',
    c.validUntil ? `Válida hasta: ${new Date(c.validUntil).toLocaleDateString('es-AR')}` : '',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

/** El otro participante de una conversación (para cotizarle). Los participantes pueden venir como objetos o como ids. */
export function otroParticipante(conversacion: any, userId: unknown): string | null {
  const lista: any[] = Array.isArray(conversacion?.participants) ? conversacion.participants : [];
  const yo = String(userId ?? '');
  for (const p of lista) {
    const id = String(typeof p === 'object' && p ? p.id ?? p._id ?? '' : p ?? '');
    if (id && id !== yo) return id;
  }
  return null;
}

// ------------------------------------------------------------------ respuestas del servidor

export function leerCotizaciones(res: any): Cotizacion[] | null {
  return res?.success === true && Array.isArray(res?.data) ? (res.data as Cotizacion[]) : null;
}

export function leerCotizacion(res: any): Cotizacion | null {
  const q = res?.success === true ? res?.data : null;
  return q && typeof q === 'object' && !Array.isArray(q) && q.id ? (q as Cotizacion) : null;
}

export interface ResultadoDeAccion {
  ok: boolean;
  mensaje: string;
  cotizacion?: Cotizacion;
  contractId?: string | null;
  conversationId?: string | null;
}

export function interpretarAccion(res: any, porDefecto: string): ResultadoDeAccion {
  if (res?.success === true) {
    return {
      ok: true,
      mensaje: String(res?.message || porDefecto),
      cotizacion: leerCotizacion(res) || undefined,
      contractId: res?.contractId || null,
      conversationId: res?.conversationId || null,
    };
  }
  return { ok: false, mensaje: String(res?.message || 'No se pudo completar. Probá de nuevo.') };
}

export const listarCotizaciones = (tipo: 'sent' | 'received') => get<any>(`/quotes?type=${tipo}&limit=50`);
export const traerCotizacion = (id: string) => get<any>(`/quotes/${id}`);
export const crearCotizacion = async (cuerpo: Record<string, unknown>) => interpretarAccion(await post<any>('/quotes', cuerpo), 'Cotización enviada.');
export const corregirCotizacion = async (id: string, cuerpo: Record<string, unknown>) => interpretarAccion(await put<any>(`/quotes/${id}`, cuerpo), 'Cotización actualizada.');
export const aceptarCotizacion = async (id: string) => interpretarAccion(await post<any>(`/quotes/${id}/accept`, {}), 'Cotización aceptada.');
export const rechazarCotizacion = async (id: string, motivo?: string) =>
  interpretarAccion(await post<any>(`/quotes/${id}/reject`, { reason: motivo?.trim() || undefined }), 'Cotización rechazada.');
