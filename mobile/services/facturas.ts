import { post, API_URL } from './api';

/**
 * Facturas en la app.
 *
 * Dos problemas que había: (1) la lista leía `res.data.invoices`, pero el servidor responde `{ success, invoices }` sin
 * `data`, así que la pestaña «Facturas» siempre salía vacía; (2) la descarga abría la dirección protegida en el navegador del
 * teléfono, que no manda la sesión: daba un error. Ahora la app pide al servidor una dirección firmada de 5 minutos y la abre.
 */

/** El servidor manda las facturas en `invoices`; se acepta también `data.invoices` por si la forma cambia. */
export function extraerFacturas(res: any): any[] {
  if (res?.success !== true) return [];
  const lista = Array.isArray(res?.invoices) ? res.invoices : Array.isArray(res?.data?.invoices) ? res.data.invoices : [];
  return lista;
}

const RUTA_FIRMADA = /^\/payments\/invoices\/[A-Za-z0-9-]+\/download-signed\?t=[^\s#]+$/;

/**
 * Arma la dirección completa a partir de la respuesta del servidor. Lo que falte o venga raro es un error: sólo se abre una
 * dirección que tenga exactamente la forma esperada y que cuelgue de la API de DOAPP.
 */
export function armarDireccionDeDescarga(res: any, apiUrl: string): string | null {
  const ruta = res?.ruta;
  if (res?.success !== true || typeof ruta !== 'string' || !RUTA_FIRMADA.test(ruta)) return null;
  const base = String(apiUrl || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return null;
  return `${base}${ruta}`;
}

export type ResultadoDeDescarga = { ok: true; url: string } | { ok: false; mensaje: string };

export async function pedirDireccionDeDescarga(facturaId: string): Promise<ResultadoDeDescarga> {
  const res: any = await post<any>(`/payments/invoices/${encodeURIComponent(facturaId)}/download-link`, {});
  const url = armarDireccionDeDescarga(res, API_URL);
  if (url) return { ok: true, url };
  return { ok: false, mensaje: String(res?.message || 'No se pudo preparar la descarga. Probá de nuevo en un momento.') };
}
