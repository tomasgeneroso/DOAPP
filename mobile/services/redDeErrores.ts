/**
 * La red de errores de la app: el cliente de la API nunca lanza (devuelve `success: false`), así que una pantalla que no lo mira dejaba la falla en silencio. Acá se
 * anota cada respuesta fallida y, si la pantalla no abrió un cartel, la muestra la app. También atrapa los errores que nadie agarró.
 */
import { Alert } from 'react-native';
import { ALGO_FALLO, avisoPorLaRespuesta, type RespuestaDelServidor } from '../../shared/errores/redDeErrores';

const ESPERA_A_LA_PANTALLA_MS = 1200;
type Oyente = (mensaje: string) => void;

const oyentes = new Set<Oyente>();
let ultimoCartel = 0;

export function alAvisarUnaFalla(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function avisarSiLaPantallaCalla(mensaje: string): void {
  // Sin nadie escuchando (todavía no se dibujó la app, o en una prueba) no se programa nada.
  if (oyentes.size === 0) return;
  const desde = Date.now();
  setTimeout(() => {
    if (ultimoCartel < desde) oyentes.forEach((o) => o(mensaje));
  }, ESPERA_A_LA_PANTALLA_MS);
}

export function anotarRespuestaFallida(respuesta: RespuestaDelServidor): void {
  const mensaje = avisoPorLaRespuesta(respuesta);
  if (mensaje) avisarSiLaPantallaCalla(mensaje);
}

let instalada = false;

export function instalarRedDeErrores(): void {
  if (instalada) return;
  instalada = true;
  if (typeof Alert?.alert === 'function') {
    const original = Alert.alert.bind(Alert);
    Alert.alert = (...a: Parameters<typeof Alert.alert>) => {
      ultimoCartel = Date.now();
      original(...a);
    };
  }
  const utilidades = (globalThis as any).ErrorUtils;
  if (utilidades?.getGlobalHandler && utilidades?.setGlobalHandler) {
    const anterior = utilidades.getGlobalHandler();
    utilidades.setGlobalHandler((error: unknown, esFatal?: boolean) => {
      avisarSiLaPantallaCalla(ALGO_FALLO);
      anterior?.(error, esFatal);
    });
  }
}
