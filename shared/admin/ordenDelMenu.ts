/**
 * El orden de los GRUPOS del menú lateral de administración (Hubs, General, Operaciones, Padrones, Finanzas…).
 *
 * Regla del dueño (2026-11-09): cada administrador puede ordenar los grupos grandes arrastrándolos (por ejemplo, mandar «Padrones» al final). Solo los grupos,
 * no los elementos de adentro. El orden es una preferencia de quien lo hace: se guarda en el navegador, por persona (dos administradores en el mismo equipo
 * no se pisan el orden), y si no hay nada guardado —o lo guardado está roto— el menú queda como siempre.
 *
 * Todo lo que decide qué grupo va dónde está acá, sin React ni navegador, para poder probarlo: la pantalla (`AdminLayout.tsx`) solo lo muestra.
 */

/** La clave del almacenamiento del navegador, una por persona. */
export const claveDelOrdenDelMenu = (usuarioId: string | number | null | undefined): string => `doapp:admin-menu-orden:${usuarioId ?? 'anonimo'}`;

/**
 * El orden final de los grupos que HAY (los que este rol ve): primero los que la persona ordenó, en su orden, y detrás los que no conoce todavía (un grupo
 * nuevo que se agregó después) en el orden de siempre. Lo guardado que ya no existe se ignora; los repetidos y lo que no es texto, también.
 */
export function aplicarOrden(clavesPorDefecto: readonly string[], guardado: unknown): string[] {
  const existentes = new Set(clavesPorDefecto);
  const salida: string[] = [];
  if (Array.isArray(guardado)) {
    for (const k of guardado) {
      if (typeof k === 'string' && existentes.has(k) && !salida.includes(k)) salida.push(k);
    }
  }
  for (const k of clavesPorDefecto) if (!salida.includes(k)) salida.push(k);
  return salida;
}

/**
 * Mueve el grupo `desde` a la posición que hoy ocupa `hacia`: si venía de más arriba queda DESPUÉS de `hacia`, si venía de más abajo queda ANTES (como se espera
 * al soltarlo sobre otro grupo). Si alguna clave no existe o son la misma, el orden no cambia.
 */
export function moverGrupo(orden: readonly string[], desde: string, hacia: string): string[] {
  const i = orden.indexOf(desde);
  const j = orden.indexOf(hacia);
  if (i < 0 || j < 0 || i === j) return [...orden];
  const copia = [...orden];
  copia.splice(i, 1);
  copia.splice(j, 0, desde);
  return copia;
}

/** Sube (-1) o baja (+1) un grupo un lugar. En los extremos no hace nada. Es lo que usan los botones (teclado y celular, donde arrastrar no sirve). */
export function moverUnLugar(orden: readonly string[], clave: string, direccion: -1 | 1): string[] {
  const i = orden.indexOf(clave);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= orden.length) return [...orden];
  return moverGrupo(orden, clave, orden[j]);
}

/** Lo que hay guardado para esta persona, o null si no hay nada o está roto. Nunca lanza: el almacenamiento puede estar bloqueado (ventana privada, permisos). */
export function leerOrdenGuardado(almacen: Pick<Storage, 'getItem'> | null | undefined, usuarioId: string | number | null | undefined): string[] | null {
  try {
    const crudo = almacen?.getItem(claveDelOrdenDelMenu(usuarioId));
    if (!crudo) return null;
    const valor: unknown = JSON.parse(crudo);
    return Array.isArray(valor) && valor.every((k) => typeof k === 'string') ? (valor as string[]) : null;
  } catch {
    return null;
  }
}

/** Guarda el orden (o lo borra si es null, que es «restablecer»). Devuelve si pudo; si no pudo, el menú igual cambia en esta sesión. */
export function guardarOrden(almacen: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, usuarioId: string | number | null | undefined, orden: readonly string[] | null): boolean {
  try {
    if (!almacen) return false;
    if (orden === null) almacen.removeItem(claveDelOrdenDelMenu(usuarioId));
    else almacen.setItem(claveDelOrdenDelMenu(usuarioId), JSON.stringify(orden));
    return true;
  } catch {
    return false;
  }
}
