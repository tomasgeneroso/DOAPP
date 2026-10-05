/**
 * Quién puede entrar a /analisis, y qué hace la pantalla en cada caso.
 *
 * Vive en `shared/` por dos razones:
 *
 *  1. La lista de roles estaba escrita a mano en dos lugares —la página y la
 *     API de `businessPlan`— y si divergen pasa algo feo en cualquiera de los
 *     dos sentidos: la página deja entrar a alguien y la API le responde 403
 *     (pantalla rota), o la API le abre datos a un rol que la página no muestra.
 *     Ahora es una sola lista y las dos la leen.
 *
 *  2. La decisión tiene que poder probarse. El cliente no tiene entorno de
 *     componentes (ni jsdom ni testing-library), y esta lógica ya se rompió una
 *     vez: ver `decidirAccesoAnalisis`.
 */
export const ROLES_DE_ANALISIS = ['owner', 'analista'] as const;

export type DecisionDeAcceso = 'cargando' | 'login' | 'inicio' | 'permitido';

/**
 * Qué mostrar según el estado de la sesión.
 *
 * Cuatro estados, y la diferencia entre los dos primeros es todo el punto:
 *
 *  - `cargando`: todavía no se sabe si hay sesión. Se espera.
 *  - `login`: ya se sabe, y no hay. Se manda a iniciar sesión.
 *
 * La pantalla chequeaba `!isAuthenticated && !user` para "esperar". Pero
 * `isAuthenticated` se define como `!!user`, así que eso es lo mismo que
 * `!user`: verdadero mientras carga Y cuando no hay sesión. Quien abría
 * /analisis sin estar logueado veía un spinner para siempre, porque la
 * condición que debía distinguir "resolviendo" de "sin sesión" no podía.
 *
 * El dato que las separa es `isLoading`, que `useAuth` ya exponía.
 */
export function decidirAccesoAnalisis(estado: {
  isLoading: boolean;
  user?: { adminRole?: string | null } | null;
}): DecisionDeAcceso {
  if (estado.isLoading) return 'cargando';
  if (!estado.user) return 'login';
  const rol = estado.user.adminRole || '';
  return (ROLES_DE_ANALISIS as readonly string[]).includes(rol) ? 'permitido' : 'inicio';
}
