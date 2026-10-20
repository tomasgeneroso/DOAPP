/**
 * Qué se le dice a la persona cuando algo falla y quien respondió no explicó el motivo.
 *
 * Incidente 2026-10-19: crear un trabajo con un dato inválido respondía `{success:false, errors:[…]}` sin `message`; la pantalla mostraba
 * «Error al crear el trabajo» sin decir qué campo estaba mal y el servidor no dejaba nada en el log. Lo mismo pasa cuando responde nginx o
 * Cloudflare (una página HTML de 413 o 502): el cliente intentaba leerla como JSON y mostraba «Unexpected token <».
 *
 * Una sola fuente para el servidor (middleware `respuestasDeError`) y el cliente (interceptor de `fetch`): ninguna respuesta de error
 * sale a la pantalla sin un motivo legible, y el código de estado va en el texto para que soporte sepa de qué se trata.
 */

const TEXTOS: Record<number, string> = {
  400: 'El servidor no aceptó los datos enviados. Revisá lo que cargaste e intentá de nuevo.',
  401: 'Tu sesión venció. Volvé a iniciar sesión.',
  403: 'No tenés permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  405: 'Esa acción no está disponible.',
  408: 'El servidor tardó demasiado en responder. Probá de nuevo.',
  409: 'Eso entra en conflicto con el estado actual. Actualizá la pantalla e intentá de nuevo.',
  413: 'Los archivos o los datos enviados son demasiado grandes.',
  415: 'El tipo de archivo enviado no es válido.',
  422: 'Hay datos que no se pueden procesar. Revisalos e intentá de nuevo.',
  429: 'Hiciste demasiados pedidos seguidos. Esperá un momento e intentá de nuevo.',
  500: 'Algo falló en el servidor. Probá de nuevo; si sigue pasando, avisanos.',
  502: 'El servidor no está disponible en este momento. Probá de nuevo en unos minutos.',
  503: 'El servicio no está disponible en este momento. Probá de nuevo en unos minutos.',
  504: 'El servidor tardó demasiado en responder. Probá de nuevo.',
};

export const MENSAJE_TIEMPO_AGOTADO = 'El servidor tardó demasiado en responder. Probá de nuevo en un momento; si sigue pasando, avisanos.';

export const MENSAJE_SIN_CONEXION = 'No pudimos conectar con el servidor. Revisá tu conexión a internet e intentá de nuevo.';

/** El texto por defecto para un código de estado, con el código al final (`(error 413)`) para que soporte sepa de qué se trata. */
export function mensajeSegunEstado(status: number): string {
  const base = TEXTOS[status] ?? (status >= 500 ? TEXTOS[500] : status >= 400 ? TEXTOS[400] : 'No se pudo completar la operación.');
  return `${base} (error ${status})`;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * El motivo que ya trae un cuerpo de error, sea cual sea la forma en que la ruta lo escribió: `message`, `error` (texto), o la lista
 * `errors` de las validaciones (`[{msg}]`, `[{message}]` o textos). Devuelve '' si no trae ninguno.
 */
export function motivoDelCuerpo(cuerpo: unknown): string {
  if (!cuerpo || typeof cuerpo !== 'object') return '';
  const c = cuerpo as Record<string, unknown>;
  if (texto(c.message)) return texto(c.message);
  if (texto(c.error)) return texto(c.error);
  if (c.error && typeof c.error === 'object' && texto((c.error as Record<string, unknown>).message)) return texto((c.error as Record<string, unknown>).message);
  if (Array.isArray(c.errors)) {
    const motivos = c.errors
      .map((e) => (typeof e === 'string' ? e.trim() : e && typeof e === 'object' ? texto((e as Record<string, unknown>).msg) || texto((e as Record<string, unknown>).message) : ''))
      .filter((m, i, todos) => m && todos.indexOf(m) === i);
    if (motivos.length) return motivos.join('. ');
  }
  return '';
}

/** El mensaje que corresponde mostrar para una respuesta de error: el del cuerpo si lo trae; si no, el que corresponde al estado. */
export function mensajeDeError(cuerpo: unknown, status: number): string {
  return motivoDelCuerpo(cuerpo) || mensajeSegunEstado(status);
}
