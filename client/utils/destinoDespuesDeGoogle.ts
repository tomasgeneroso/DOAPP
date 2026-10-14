import { rutaInternaSegura } from "../../shared/auth/rutaInterna";

/**
 * A dónde volver después de entrar con Google o X.
 *
 * El ingreso con correo vuelve a la pantalla de donde venía la persona (`?redirect=` o `location.state.from`). El ingreso
 * social sale a otro sitio y vuelve a `/auth/callback`, donde ese dato ya no existe: siempre terminaba en la portada. Se guarda
 * antes de salir y se lee al volver. Siempre pasa por `rutaInternaSegura` (solo rutas de esta aplicación) y vence a los 15
 * minutos; sin almacenamiento (modo privado) simplemente no se recuerda y se va a la portada, como antes.
 */
const CLAVE = "doapp:destino-tras-ingresar";
const VIGENCIA_MS = 15 * 60 * 1000;

export function guardarDestino(ruta: string): void {
  try {
    const destino = rutaInternaSegura(ruta);
    if (destino === "/") {
      localStorage.removeItem(CLAVE);
      return;
    }
    localStorage.setItem(CLAVE, JSON.stringify({ destino, en: Date.now() }));
  } catch {
    /* sin almacenamiento: se va a la portada */
  }
}

/** La ruta guardada (una sola vez) o null si no hay, venció o no es una ruta de la aplicación. */
export function tomarDestino(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    localStorage.removeItem(CLAVE);
    if (!crudo) return null;
    const { destino, en } = JSON.parse(crudo) as { destino?: unknown; en?: unknown };
    if (typeof destino !== "string" || typeof en !== "number" || Date.now() - en > VIGENCIA_MS) return null;
    const segura = rutaInternaSegura(destino);
    return segura === "/" ? null : segura;
  } catch {
    return null;
  }
}
