import { del, get, getImageUrl, post } from './api';

/**
 * Detalle de una publicación (`/api/posts/:id`): autor, galería, me gusta y comentarios.
 *
 * Ojo con lo que devuelve el servidor: `author` viene sin `id` (la transformación solo copia nombre, foto y datos públicos),
 * pero `authorUser` —el objeto original— sí lo trae. Lo mismo en los comentarios. Por eso el id del autor se lee de ahí.
 */

export const LIMITE_COMENTARIO = 2000;

export interface AutorDePublicacion {
  id?: string;
  name: string;
  avatar?: string;
  bio?: string;
  rating?: number;
}

export function autorDe(p: any): AutorDePublicacion {
  const a = p?.author && typeof p.author === 'object' ? p.author : {};
  const id = a.id ?? p?.authorUser?.id;
  return {
    id: id ? String(id) : undefined,
    name: String(a.name ?? p?.authorUser?.name ?? 'Usuario'),
    avatar: getImageUrl(a.avatar ?? p?.authorUser?.avatar),
    bio: a.bio ?? undefined,
    rating: a.rating !== undefined && a.rating !== null && Number(a.rating) > 0 ? Number(a.rating) : undefined,
  };
}

/** Las imágenes de la galería llegan como texto o como `{ url }`, y con ruta relativa: se arma la dirección completa. */
export function imagenesDeGaleria(p: any): string[] {
  const galeria = Array.isArray(p?.gallery) ? p.gallery : [];
  return galeria
    .filter((g: any) => (typeof g === 'string' || g?.type !== 'video') && (typeof g === 'string' ? g : g?.url))
    .map((g: any) => getImageUrl(typeof g === 'string' ? g : g.url))
    .filter((u: string | undefined): u is string => !!u);
}

export interface Comentario {
  id: string;
  content: string;
  createdAt?: string;
  autorId?: string;
  autor: string;
  avatar?: string;
}

export function normalizarComentario(c: any): Comentario | null {
  if (!c || !c.id || typeof c.content !== 'string') return null;
  const a = c.author && typeof c.author === 'object' ? c.author : {};
  const autorId = c.authorUser?.id ?? a.id ?? (typeof c.author === 'string' ? c.author : undefined);
  return {
    id: String(c.id),
    content: c.content,
    createdAt: c.createdAt,
    autorId: autorId ? String(autorId) : undefined,
    autor: String(a.name ?? c.authorUser?.name ?? 'Usuario'),
    avatar: getImageUrl(a.avatar ?? c.authorUser?.avatar),
  };
}

export function leerComentarios(res: any): Comentario[] | null {
  if (res?.success !== true || !Array.isArray(res?.comments)) return null;
  return res.comments.map(normalizarComentario).filter((c: Comentario | null): c is Comentario => !!c);
}

/** Texto para mandar, o el motivo por el que no se puede. */
export function validarComentario(texto: string): { ok: true; texto: string } | { ok: false; mensaje: string } {
  const t = texto.trim();
  if (!t) return { ok: false, mensaje: 'Escribí tu comentario.' };
  if (t.length > LIMITE_COMENTARIO) return { ok: false, mensaje: `El comentario no puede pasar de ${LIMITE_COMENTARIO} caracteres.` };
  return { ok: true, texto: t };
}

/** Solo quien lo escribió puede borrarlo (el servidor también lo exige). */
export const puedeBorrarComentario = (c: Comentario, userId: unknown): boolean => !!userId && !!c.autorId && c.autorId === String(userId);

/** Lo que cuenta el servidor al dar o quitar «me gusta»: se muestra eso, no una cuenta hecha a mano. */
export function leerMeGusta(res: any): { liked: boolean; likesCount: number } | null {
  if (res?.success !== true || typeof res?.liked !== 'boolean') return null;
  const n = Number(res?.likesCount);
  return { liked: res.liked, likesCount: Number.isFinite(n) && n >= 0 ? n : 0 };
}

export const traerPublicacion = (id: string) => get<any>(`/posts/${id}`, false);
export const alternarMeGusta = async (id: string) => leerMeGusta(await post<any>(`/posts/${id}/like`, {}));
export const traerComentarios = async (id: string) => leerComentarios(await get<any>(`/posts/${id}/comments?limit=50`, false));

export async function comentar(id: string, texto: string): Promise<{ ok: true; comentario: Comentario } | { ok: false; mensaje: string }> {
  const v = validarComentario(texto);
  if (v.ok === false) return v;
  const res: any = await post<any>(`/posts/${id}/comments`, { content: v.texto });
  const comentario = res?.success === true ? normalizarComentario(res?.comment) : null;
  return comentario ? { ok: true, comentario } : { ok: false, mensaje: String(res?.message || 'No se pudo publicar el comentario.') };
}

export async function borrarComentario(postId: string, comentarioId: string): Promise<{ ok: boolean; mensaje: string }> {
  const res: any = await del<any>(`/posts/${postId}/comments/${comentarioId}`);
  return res?.success === true ? { ok: true, mensaje: 'Comentario eliminado.' } : { ok: false, mensaje: String(res?.message || 'No se pudo eliminar el comentario.') };
}
