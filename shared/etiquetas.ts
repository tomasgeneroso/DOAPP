/**
 * Etiquetas de trabajos, publicaciones y artículos (pedido del dueño, 2026-11-27: «sirven para poder buscarlas también y encontrar intereses relacionados»).
 * Una sola forma de compararlas para el servidor y las pantallas: sin «#», sin tildes y sin mayúsculas.
 */
export const LARGO_DE_ETIQUETA = 40;

/** La forma con la que se comparan dos etiquetas: «#Plomería » y «plomeria» son la misma. */
export function claveDeEtiqueta(etiqueta: unknown): string {
  return String(etiqueta ?? '').replace(/^[#\s]+/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, LARGO_DE_ETIQUETA);
}

export const rutaDeEtiqueta = (etiqueta: unknown): string => `/etiquetas/${encodeURIComponent(claveDeEtiqueta(etiqueta))}`;

/** Cómo se muestra: con un solo «#». */
export const textoDeEtiqueta = (etiqueta: unknown): string => `#${String(etiqueta ?? '').replace(/^[#\s]+/, '').trim()}`;

/** Lo escrito en una barra de búsqueda, ¿es una etiqueta («#plomería»)? Devuelve su clave, o null. */
export function etiquetaBuscada(consulta: unknown): string | null {
  const t = String(consulta ?? '').trim();
  if (!t.startsWith('#')) return null;
  const clave = claveDeEtiqueta(t);
  return clave.length >= 2 ? clave : null;
}

/** Para guardar: sin «#», sin vacías ni repetidas. */
export function limpiarEtiquetas(lista: unknown, maximo = 10): string[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Map<string, string>();
  for (const x of lista) {
    const texto = String(x ?? '').replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, LARGO_DE_ETIQUETA);
    const clave = claveDeEtiqueta(texto);
    if (clave && !vistas.has(clave)) vistas.set(clave, texto);
  }
  return [...vistas.values()].slice(0, maximo);
}
