import { get, getImageUrl } from './api';

/**
 * Blog público: artículos oficiales de DOAPP y artículos de la comunidad (`/api/blogs`). La lista y el artículo se leen sin
 * sesión. El contenido llega como HTML ya depurado por el servidor; acá no se dibuja HTML (ni se abre una WebView): se lo
 * convierte a bloques simples (título, párrafo, lista, cita, imagen) que la pantalla sabe mostrar.
 */

export interface ArticuloDeLista {
  id: string;
  title: string;
  subtitle?: string;
  slug: string;
  excerpt?: string;
  coverImage?: string;
  tags: string[];
  category: string;
  views: number;
  readingTime: number;
  postType: 'official' | 'user' | string;
  createdAt?: string;
  publishedAt?: string;
  autor?: string;
}

export interface Articulo extends ArticuloDeLista {
  content: string;
  autorId?: string;
  autorBio?: string;
}

export interface PaginaDeArticulos {
  articulos: ArticuloDeLista[];
  pagina: number;
  paginas: number;
  total: number;
}

export const ARTICULOS_POR_PAGINA = 10;

const aTexto = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x : undefined);

export function normalizarArticulo(p: any): ArticuloDeLista | null {
  if (!p || typeof p !== 'object' || !p.title || !(p.slug || p.id)) return null;
  const creador = p.creator && typeof p.creator === 'object' ? p.creator : null;
  return {
    id: String(p.id ?? p.slug),
    title: String(p.title),
    subtitle: aTexto(p.subtitle),
    slug: String(p.slug ?? p.id),
    excerpt: aTexto(p.excerpt),
    coverImage: getImageUrl(aTexto(p.coverImage)),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    category: String(p.category ?? ''),
    views: Number(p.views) || 0,
    readingTime: Math.max(1, Number(p.readingTime) || 1),
    postType: String(p.postType ?? 'official'),
    createdAt: aTexto(p.createdAt),
    publishedAt: aTexto(p.publishedAt),
    autor: aTexto(creador?.name) ?? aTexto(p.author),
  };
}

export function leerPagina(res: any): PaginaDeArticulos | null {
  if (res?.success !== true || !Array.isArray(res?.posts)) return null;
  const pag = res?.pagination || {};
  return {
    articulos: res.posts.map(normalizarArticulo).filter((a: ArticuloDeLista | null): a is ArticuloDeLista => !!a),
    pagina: Number(pag.page) || 1,
    paginas: Number(pag.pages) || 1,
    total: Number(pag.total) || 0,
  };
}

export function leerArticulo(res: any): Articulo | null {
  if (res?.success !== true) return null;
  const base = normalizarArticulo(res?.post);
  if (!base) return null;
  const creador = res.post.creator && typeof res.post.creator === 'object' ? res.post.creator : null;
  return {
    ...base,
    content: typeof res.post.content === 'string' ? res.post.content : '',
    autorId: creador?.id ? String(creador.id) : undefined,
    autorBio: aTexto(creador?.bio),
  };
}

export function leerCategorias(res: any): { nombre: string; cantidad: number }[] | null {
  if (res?.success !== true || !Array.isArray(res?.categories)) return null;
  return res.categories
    .filter((c: any) => c && typeof c.name === 'string' && c.name)
    .map((c: any) => ({ nombre: c.name as string, cantidad: Number(c.count) || 0 }));
}

export const etiquetaDeCategoria = (c: string): string => (c ? c.charAt(0).toUpperCase() + c.slice(1) : '');

export function armarConsulta({ categoria, busqueda, pagina = 1 }: { categoria?: string; busqueda?: string; pagina?: number }): string {
  const q: string[] = [`page=${Math.max(1, Math.floor(pagina) || 1)}`, `limit=${ARTICULOS_POR_PAGINA}`];
  if (categoria) q.push(`category=${encodeURIComponent(categoria)}`);
  if (busqueda?.trim()) q.push(`search=${encodeURIComponent(busqueda.trim())}`);
  return q.join('&');
}

// ---------------------------------------------------------------- contenido (HTML → bloques)

export type BloqueDeArticulo =
  | { tipo: 'titulo' | 'parrafo' | 'item' | 'cita'; texto: string }
  | { tipo: 'imagen'; url: string; descripcion?: string };

const ENTIDADES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»' };

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Solo direcciones http(s) o de la propia carpeta de archivos: nada de `javascript:` ni `data:`. */
function direccionDeImagen(src: string | undefined): string | null {
  if (!src) return null;
  const s = decodificarEntidades(src.trim());
  return /^https?:\/\//i.test(s) || s.startsWith('/uploads') ? getImageUrl(s) ?? null : null;
}

const atributo = (atributos: string, nombre: string): string | undefined =>
  new RegExp(`${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(atributos)?.slice(1).find((x) => x !== undefined);

export function htmlABloques(html: unknown): BloqueDeArticulo[] {
  const fuente = typeof html === 'string' ? html : '';
  // Texto plano (sin una sola etiqueta): los párrafos se separan por líneas en blanco.
  if (!/<[a-z!/][^>]*>/i.test(fuente)) {
    return fuente.split(/\n{2,}/).map((t) => decodificarEntidades(t).replace(/\s+/g, ' ').trim()).filter(Boolean).map((texto) => ({ tipo: 'parrafo' as const, texto }));
  }

  const bloques: BloqueDeArticulo[] = [];
  let tipo: 'titulo' | 'parrafo' | 'item' | 'cita' = 'parrafo';
  let texto = '';
  let salteando = 0; // dentro de <script> o <style>

  const cerrar = () => {
    const limpio = texto.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    if (limpio) bloques.push({ tipo, texto: limpio });
    texto = '';
    tipo = 'parrafo';
  };

  const sinComentarios = fuente.replace(/<!--[\s\S]*?-->/g, '');
  const pieza = /<(\/?)([a-z][a-z0-9]*)([^>]*)>|([^<]+|<)/gi;
  let m: RegExpExecArray | null;
  while ((m = pieza.exec(sinComentarios))) {
    if (m[4] !== undefined) {
      if (!salteando) texto += decodificarEntidades(m[4]).replace(/\s+/g, ' ');
      continue;
    }
    const cierra = m[1] === '/';
    const nombre = m[2].toLowerCase();
    if (nombre === 'script' || nombre === 'style') { salteando = Math.max(0, salteando + (cierra ? -1 : 1)); continue; }
    if (salteando) continue;
    if (/^h[1-6]$/.test(nombre)) { cerrar(); if (!cierra) tipo = 'titulo'; }
    else if (nombre === 'li') { cerrar(); if (!cierra) tipo = 'item'; }
    else if (nombre === 'blockquote') { cerrar(); if (!cierra) tipo = 'cita'; }
    else if (['p', 'div', 'ul', 'ol', 'section', 'article', 'figure', 'figcaption', 'table', 'tr'].includes(nombre)) cerrar();
    else if (nombre === 'br') texto += '\n';
    else if (nombre === 'img' && !cierra) {
      const url = direccionDeImagen(atributo(m[3], 'src'));
      cerrar();
      if (url) bloques.push({ tipo: 'imagen', url, descripcion: decodificarEntidades(atributo(m[3], 'alt') || '').trim() || undefined });
    }
  }
  cerrar();
  return bloques;
}

export const listarArticulos = async (consulta: { categoria?: string; busqueda?: string; pagina?: number }) =>
  leerPagina(await get<any>(`/blogs?${armarConsulta(consulta)}`, false));
export const traerArticulo = async (slug: string) => leerArticulo(await get<any>(`/blogs/${encodeURIComponent(slug)}`, false));
export const traerCategorias = async () => leerCategorias(await get<any>('/blogs/categories', false));
