import type { NextFunction, Request, Response } from 'express';

/**
 * Tope general de la paginación de las consultas GET (auditoría de seguridad, 2026-11-24).
 *
 * Decenas de rutas leen `?limit=` y `?page=` sin ponerles tope: `?limit=1000000` bajaba tablas enteras (y se podía repetir sin cuenta en los listados públicos) y
 * `?page=0` o `?offset=-5` daban un error de la base con su texto. En vez de tocar cada ruta, acá se acotan una vez, antes de que lleguen:
 * `limit` entre 1 y 500 (el máximo que pide una pantalla hoy: el mapa del sitio), `page` desde 1 y `offset` desde 0. Lo que no es un número entero se deja como está
 * (la ruta ya sabe qué hace con eso).
 */
export const LIMITE_MAXIMO_DE_LISTADO = 500;

const entero = (v: unknown): number | null => (typeof v === 'string' && /^-?\d{1,12}$/.test(v) ? Number(v) : null);

export function acotarPaginacion(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== 'GET') {
    next();
    return;
  }
  const q = req.query as Record<string, unknown>;
  const cambios: Record<string, string> = {};
  const limite = entero(q.limit);
  if (limite !== null && (limite < 1 || limite > LIMITE_MAXIMO_DE_LISTADO)) cambios.limit = String(Math.min(LIMITE_MAXIMO_DE_LISTADO, Math.max(1, limite)));
  const pagina = entero(q.page);
  if (pagina !== null && pagina < 1) cambios.page = '1';
  const desde = entero(q.offset);
  if (desde !== null && desde < 0) cambios.offset = '0';
  if (Object.keys(cambios).length > 0) {
    // En Express 5 `req.query` es un getter: se lo reemplaza en el propio pedido.
    Object.defineProperty(req, 'query', { value: { ...q, ...cambios }, writable: true, configurable: true, enumerable: true });
  }
  next();
}
