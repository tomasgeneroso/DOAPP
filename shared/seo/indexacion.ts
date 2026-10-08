/**
 * Qué páginas de DOAPP le pedimos a Google que indexe y cuál es la dirección "oficial" de cada una.
 *
 * Por qué existe: la app es una sola página (SPA) y nginx le entrega a TODAS las rutas el mismo
 * `index.html`. Ese archivo traía fijo `<link rel="canonical" href="https://doapparg.com/">`, así que
 * /blog, /help, /contact y las páginas legales le decían a Google "mi versión oficial es la home" y
 * Google las descartaba como duplicadas ("Página alternativa con etiqueta canónica adecuada").
 *
 * Regla: una página se indexa SÓLO si está en RUTAS_INDEXABLES. Todo lo demás (login, registro, panel,
 * contratos, checkout, resultados de pago…) sale con `noindex`. Es "lo que no está permitido, está
 * prohibido": una ruta nueva no se indexa por descuido.
 *
 * Fuente única: el sitemap (`public/sitemap.xml`) debe listar exactamente estas rutas. Lo verifica
 * `tests/seoIndexacion.test.ts`.
 */

export const ORIGEN_PUBLICO = 'https://doapparg.com';

/** Páginas públicas, con contenido propio, que sí queremos en Google. */
export const RUTAS_INDEXABLES = [
  '/',
  '/blog',
  '/help',
  '/contact',
  '/legal/terminos-y-condiciones',
  '/legal/privacidad',
  '/legal/cookies',
  '/legal/disputas',
] as const;

/**
 * Páginas que ponen su propia dirección oficial (por ejemplo cada artículo del blog usa su slug o la
 * `canonicalUrl` que cargó el autor). Acá no se agrega nada para no duplicar la etiqueta: dos
 * `canonical` distintas en la misma página hacen que Google ignore las dos.
 */
const PREFIJOS_CON_SEO_PROPIO = ['/blog/'] as const;

export type DecisionSeo =
  | { tipo: 'indexar'; robots: 'index, follow'; canonical: string }
  | { tipo: 'no-indexar'; robots: 'noindex, follow' }
  | { tipo: 'la-pagina-decide' };

/** `/blog/` → `/blog`, `/Help` → `/help`. La raíz queda como `/`. */
export function normalizarRuta(pathname: string): string {
  const sinQuery = (pathname || '/').split(/[?#]/)[0];
  const minuscula = sinQuery.toLowerCase();
  const sinBarraFinal = minuscula.length > 1 ? minuscula.replace(/\/+$/, '') : minuscula;
  return sinBarraFinal || '/';
}

/** La dirección oficial de una ruta indexable: siempre https, sin parámetros, sin barra final (salvo la home). */
export function canonicalDe(ruta: string): string {
  return ruta === '/' ? `${ORIGEN_PUBLICO}/` : `${ORIGEN_PUBLICO}${ruta}`;
}

export function decisionSeo(pathname: string): DecisionSeo {
  const ruta = normalizarRuta(pathname);

  if ((RUTAS_INDEXABLES as readonly string[]).includes(ruta)) {
    return { tipo: 'indexar', robots: 'index, follow', canonical: canonicalDe(ruta) };
  }
  if (PREFIJOS_CON_SEO_PROPIO.some((p) => ruta.startsWith(p) && ruta !== '/blog/create')) {
    return { tipo: 'la-pagina-decide' };
  }
  // `follow`: no queremos la página en el índice, pero sí que Google siga los links que tenga.
  return { tipo: 'no-indexar', robots: 'noindex, follow' };
}
