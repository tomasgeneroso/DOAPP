/**
 * Una sola cuenta para todo (decisión del dueño, 2026-11-15: «unificar cliente, trabajador y ambos»).
 *
 * Antes la cuenta tenía un tipo (`users.role`: cliente, trabajador o ambos) y las pantallas escondían cosas según el tipo: una cuenta «trabajador» podía publicar un
 * trabajo pero no veía su pestaña «Mis publicaciones», y una «cliente» no veía «Mis postulaciones». Ahora TODA cuenta puede publicar y postularse; lo que cada una
 * puede hacer lo deciden los REQUISITOS de cada acción (correo confirmado y DNI para publicar y para postularse —`bloqueoParaOperar`—, y la matrícula para los
 * rubros regulados, en la fase real), no el tipo de cuenta.
 *
 * `users.role` queda con un solo significado, el de una preferencia: si la persona OFRECE SUS SERVICIOS (`doer` o `both`). Eso decide únicamente si aparece en el
 * buscador de profesionales, si ve los trabajos recomendados «para mí» y si configura sus rubros y su zona. No da ni quita permisos.
 */

/** ¿La persona ofrece sus servicios como profesional? (`doer` es el tipo viejo «solo trabajador»; se trata igual que `both`.) */
export function ofreceServicios(role: string | null | undefined): boolean {
  return role === 'doer' || role === 'both';
}

/** Cualquier cuenta con la sesión iniciada puede publicar un trabajo (sujeto a los requisitos de la acción). */
export const CUALQUIER_CUENTA_PUEDE_PUBLICAR = true as const;

/** Cualquier cuenta con la sesión iniciada puede postularse a un trabajo (sujeto a los requisitos de la acción). */
export const CUALQUIER_CUENTA_PUEDE_POSTULARSE = true as const;

/** El valor de `users.role` al activar o desactivar «ofrezco mis servicios». Se publica siempre, así que desactivarlo vuelve a `client`. */
export function rolSegunOfrece(ofrece: boolean): 'both' | 'client' {
  return ofrece ? 'both' : 'client';
}
