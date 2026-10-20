import { MENSAJE_SIN_CONEXION, MENSAJE_TIEMPO_AGOTADO, mensajeDeError, mensajeSegunEstado, motivoDelCuerpo } from "../../shared/errores/mensajesPorEstado";

/** Cuánto espera la pantalla una respuesta antes de rendirse (los pedidos con archivos esperan más: una foto por datos móviles tarda). */
export const ESPERA_MAXIMA_MS = 60_000;
export const ESPERA_MAXIMA_CON_ARCHIVOS_MS = 180_000;

/** Los `init` de un fetch con un tope de espera, salvo que quien llama ya traiga su propia señal (por ejemplo, para cancelar). */
export function conTopeDeEspera(init: RequestInit | undefined): { init: RequestInit | undefined; limpiar: () => void; vencio: () => boolean } {
  if (init?.signal) return { init, limpiar: () => {}, vencio: () => false };
  const control = new AbortController();
  const conArchivos = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let vencido = false;
  const reloj = setTimeout(() => {
    vencido = true;
    control.abort();
  }, conArchivos ? ESPERA_MAXIMA_CON_ARCHIVOS_MS : ESPERA_MAXIMA_MS);
  return { init: { ...init, signal: control.signal }, limpiar: () => clearTimeout(reloj), vencio: () => vencido };
}

/**
 * Que ninguna pantalla muestre un error sin motivo.
 *
 * Las pantallas leen `data.message` de la respuesta. Cuando contesta nginx o Cloudflare (una página HTML de 413 o 502), o la ruta no trajo
 * `message`, ese texto no existe: la pantalla mostraba un genérico («Error al crear el trabajo») o directamente «Unexpected token <».
 * Acá la respuesta de error se completa para que siempre traiga `message` en JSON, y un corte de red dice qué pasó en vez de «Failed to fetch».
 * Las respuestas que salieron bien no se tocan.
 */
export async function normalizarRespuestaDeError(respuesta: Response): Promise<Response> {
  if (respuesta.ok || respuesta.status < 400) return respuesta;

  let texto = "";
  try {
    texto = await respuesta.clone().text();
  } catch {
    /* sin cuerpo legible: se usa el texto del estado */
  }

  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }

  // Ya trae un motivo: se entrega tal cual llegó.
  if (cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) && typeof (cuerpo as { message?: unknown }).message === "string" && (cuerpo as { message: string }).message.trim()) {
    return respuesta;
  }

  const base = cuerpo && typeof cuerpo === "object" && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : {};
  const completo = { ...base, success: false, message: mensajeDeError(cuerpo, respuesta.status), ...(motivoDelCuerpo(cuerpo) ? {} : { code: base.code ?? "RESPUESTA_SIN_MOTIVO" }) };

  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set("Content-Type", "application/json");
  cabeceras.delete("Content-Length");
  cabeceras.delete("Content-Encoding");
  return new Response(JSON.stringify(completo), { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras });
}

/** Un corte de red (sin conexión, servidor caído, bloqueo del navegador) se dice con palabras; una cancelación voluntaria se deja pasar. */
export function errorDeRedLegible(error: unknown, vencio = false): unknown {
  if (vencio) return new Error(MENSAJE_TIEMPO_AGOTADO);
  if (error instanceof DOMException && error.name === "AbortError") return error;
  if (error instanceof TypeError) return new TypeError(MENSAJE_SIN_CONEXION);
  return error;
}

export { mensajeSegunEstado };
