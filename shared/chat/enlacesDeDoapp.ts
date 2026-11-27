/**
 * Enlaces de DOAPP dentro del chat (pedido del dueño, 2026-11-27: enviar publicaciones y artículos por chat interno). Lo usan el filtro de contactos, la
 * ventana de «Enviar por chat» y el chat, que muestra cada enlace propio como una tarjeta que abre dentro de la app.
 */
const DOMINIOS = String.raw`(?:(?:www|staging)\.)?(?:doapparg\.com|localhost(?::\d+)?)`;
const ID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/**
 * El identificador de un enlace tiene muchas cifras y el filtro de contactos las tomaba por un teléfono (bloqueaba 1 de cada 8 enlaces). Se tapa SOLO ese
 * identificador, con su forma exacta (y con alguna letra), dentro de un enlace de DOAPP. Un teléfono escrito en cualquier otra parte se sigue detectando.
 */
export function sinIdsDeEnlacesDeDoapp(texto: string): string {
  const patron = new RegExp(`(https?://${DOMINIOS}/(?:posts|profile|jobs|blog|contracts|tickets|disputes)/)(${ID_V4})`, 'gi');
  return texto.replace(patron, (entero, base: string, id: string) => (/[a-f]/i.test(id.replace(/-/g, '')) ? base + 'x'.repeat(id.length) : entero));
}

export type QueSeComparte = 'publicacion' | 'articulo';

export function mensajeParaCompartir(que: QueSeComparte, titulo: string, enlace: string): string {
  const limpio = String(titulo || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return `Te comparto ${que === 'articulo' ? 'este artículo' : 'esta publicación'}: «${limpio}»\n${enlace}`;
}

const TIPOS: Array<{ ruta: RegExp; rotulo: string }> = [
  { ruta: /^\/posts\/[^/]+$/, rotulo: 'Ver publicación' },
  { ruta: /^\/blog\/[^/]+$/, rotulo: 'Ver artículo' },
  { ruta: /^\/jobs\/[^/]+$/, rotulo: 'Ver trabajo' },
  { ruta: /^\/(profile|u)\/[^/]+$/, rotulo: 'Ver perfil' },
];

/** Si el enlace es una página de DOAPP que se puede mostrar como tarjeta: la ruta dentro de la app y el texto del botón. \`origen\` es el del sitio abierto. */
export function enlaceInterno(enlace: string, origen: string): { ruta: string; rotulo: string } | null {
  let url: URL;
  try {
    url = new URL(enlace);
  } catch {
    return null;
  }
  const propio = url.origin === origen || new RegExp(`^https?://${DOMINIOS}$`, 'i').test(url.origin);
  if (!propio) return null;
  const tipo = TIPOS.find((t) => t.ruta.test(url.pathname));
  return tipo ? { ruta: url.pathname, rotulo: tipo.rotulo } : null;
}
