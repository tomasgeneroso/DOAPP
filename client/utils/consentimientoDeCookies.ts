import { useSyncExternalStore } from "react";

/**
 * Lo que la persona eligió sobre la analítica (Google Analytics).
 *
 * Lo necesario para que DOAPP funcione (la sesión, el idioma, el tema) NO necesita permiso y no pasa por acá. La analítica sí: le cuenta a Google qué
 * pantallas ve la persona y desde qué dirección de internet, así que se carga SOLO si aceptó (Ley 25.326: consentimiento informado). Sin elección
 * (`null`), o si rechazó, no se descarga ni una línea del script de Google.
 *
 * La elección se guarda en el almacenamiento del navegador; si no se puede escribir (ventana privada, bloqueado), se recuerda mientras dure la pestaña
 * y el cartel vuelve a preguntar la próxima vez. Se puede cambiar cuando se quiera desde «Preferencias de cookies» (pie de página).
 */
export type EleccionDeCookies = "aceptado" | "rechazado";

const CLAVE = "doapp:cookies-analitica";
const EVENTO = "doapp:cookies-eleccion";

/** Respaldo si el almacenamiento del navegador no deja escribir. */
let enMemoria: EleccionDeCookies | null = null;

const esEleccion = (v: unknown): v is EleccionDeCookies => v === "aceptado" || v === "rechazado";

export function leerEleccionDeCookies(): EleccionDeCookies | null {
  try {
    const guardado = window.localStorage.getItem(CLAVE);
    if (esEleccion(guardado)) return guardado;
  } catch {
    /* sin almacenamiento: se usa lo que haya en memoria */
  }
  return enMemoria;
}

/** `null` borra la elección: el cartel vuelve a preguntar. */
export function guardarEleccionDeCookies(eleccion: EleccionDeCookies | null): void {
  enMemoria = eleccion;
  try {
    if (eleccion) window.localStorage.setItem(CLAVE, eleccion);
    else window.localStorage.removeItem(CLAVE);
  } catch {
    /* queda en memoria */
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribirse(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  // Otra pestaña cambió la elección.
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** La elección de ahora, que se actualiza sola cuando cambia (aquí o en otra pestaña). `null` hasta que la persona elija. */
export function useEleccionDeCookies(): EleccionDeCookies | null {
  return useSyncExternalStore(suscribirse, leerEleccionDeCookies, () => null);
}
