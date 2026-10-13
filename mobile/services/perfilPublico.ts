import { get } from './api';

/**
 * Perfil por nombre de usuario: el enlace público de cada persona es `/u/<usuario>` (web) o `doapp://u/<usuario>` (app).
 * La pantalla de la app busca a quién corresponde y abre su perfil (`/user/<id>`).
 */

/** Mismo formato que acepta el servidor al crear el usuario. */
const USUARIO = /^[a-z0-9._]{3,30}$/;

export const normalizarUsuario = (u: unknown): string => String(Array.isArray(u) ? u[0] : u ?? '').trim().replace(/^@/, '').toLowerCase();
export const usuarioValido = (u: string): boolean => USUARIO.test(u);

export type ResultadoDelPerfil = { ok: true; id: string } | { ok: false; mensaje: string };

export function interpretarPerfilPorUsuario(res: any, status?: number): ResultadoDelPerfil {
  const id = res?.success === true ? res?.user?.id : null;
  if (id) return { ok: true, id: String(id) };
  if (res?.status === 404 || status === 404) return { ok: false, mensaje: 'No existe ese usuario.' };
  return { ok: false, mensaje: String(res?.message || 'No se pudo abrir el perfil. Probá de nuevo.') };
}

export async function buscarPerfilPorUsuario(crudo: unknown): Promise<ResultadoDelPerfil> {
  const usuario = normalizarUsuario(crudo);
  if (!usuarioValido(usuario)) return { ok: false, mensaje: 'Ese nombre de usuario no es válido.' };
  const res: any = await get<any>(`/users/u/${encodeURIComponent(usuario)}`, false);
  return interpretarPerfilPorUsuario(res);
}
