import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * «Volver a donde estaba».
 *
 * Al borrar o cancelar un trabajo la pantalla siempre iba al tablero, sin importar de dónde venía la persona (por ejemplo, de «Mis
 * trabajos»). Este rastreador anota la pantalla anterior de cada cambio de ruta (en esta pestaña) y `rutaAnterior` la devuelve,
 * salvo que sea una pantalla que ya no sirve (la del trabajo que se acaba de borrar), en cuyo caso se usa la de respaldo.
 */
const CLAVE = "doapp:rutas";

interface Rastro {
  actual: string;
  anterior: string | null;
}

const leer = (): Rastro | null => {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as Rastro) : null;
  } catch {
    return null;
  }
};

/** Se llama en cada cambio de ruta. Solo guarda rutas internas; recargar la misma pantalla no pisa la anterior. */
export function registrarRuta(ruta: string): void {
  try {
    const previo = leer();
    if (previo?.actual === ruta) return;
    sessionStorage.setItem(CLAVE, JSON.stringify({ actual: ruta, anterior: previo?.actual ?? null } satisfies Rastro));
  } catch {
    /* sin almacenamiento: se usa la ruta de respaldo */
  }
}

/** La pantalla anterior, o `respaldo` si no hay, es la misma pantalla o `descartar` dice que ya no sirve. */
export function rutaAnterior(respaldo: string, descartar: (ruta: string) => boolean = () => false): string {
  const r = leer();
  const ruta = r?.anterior;
  if (!ruta || ruta === r?.actual || !ruta.startsWith("/") || ruta.startsWith("//") || descartar(ruta)) return respaldo;
  return ruta;
}

/** Va dentro del Router: anota la ruta de cada pantalla. No dibuja nada. */
export function RastreadorDeRuta() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    registrarRuta(pathname + search);
  }, [pathname, search]);
  return null;
}
