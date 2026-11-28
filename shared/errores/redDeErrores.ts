/**
 * Ninguna falla pasa en silencio (pedido del dueño, 2026-11-27: «que las acciones tengan captura de errores, si no pasa lo de los mensajes que no aparecen»).
 * Esta es la decisión, igual para la web y la app: ante una respuesta del servidor, ¿hay que avisarle a la persona (si la pantalla no lo hace) y con qué texto?
 */
export const SIN_CONEXION = 'No pudimos conectar con DOAPP. Revisá tu conexión y probá de nuevo.';
export const ACCION_SIN_HACERSE = 'No pudimos completar la acción. Probá de nuevo.';
export const CARGA_FALLIDA = 'No pudimos cargar una parte de la pantalla. Actualizala para volver a intentarlo.';
export const ALGO_FALLO = 'Algo falló en la pantalla. Si lo que hiciste no se ve, actualizá y probá de nuevo.';

/** Tareas de fondo que la persona no pidió: su falla no le dice nada (las que importan avisan a administración por otro lado). */
const DE_FONDO = [
  /\/actividad\/latido/,
  /\/salud\/falla/,
  /\/auth\/refresh/,
  /\/(advertisements|ads)\/[^/]+\/(impression|click)/,
  /\/typing/,
  /\/(fcm|push)(\/|$)/,
  /\/notifications\/(subscribe|unsubscribe|token)/,
  /\/analytics\/(event|track)/,
  /\/momentos\/[^/]+\/visto/,
];

/** Respuestas que no son una falla: abren su propio paso en la pantalla. */
const CON_SU_PROPIA_PANTALLA = new Set(['PENDING_POST_WORK_RATING', 'CONFIRMAR_EFECTOS', 'RETIRO_PENDIENTE_SE_CANCELA', 'CLAVE_DE_PANEL_REQUERIDA', 'TWO_FACTOR_REQUIRED', 'REGISTRATION_INCOMPLETE']);

export interface RespuestaDelServidor {
  metodo: string;
  /** Ruta de la API, con o sin dominio. */
  url: string;
  /** undefined: no hubo respuesta (sin conexión). */
  status?: number;
  cuerpo?: { message?: unknown; code?: unknown; requiresPayment?: unknown; requiereVerificacion?: unknown; requiresReason?: unknown; twoFactorRequired?: unknown } | null;
}

/** El texto a mostrar, o null si no hay nada que avisar. */
export function avisoPorLaRespuesta(r: RespuestaDelServidor): string | null {
  const metodo = (r.metodo || 'GET').toUpperCase();
  if (metodo === 'HEAD' || metodo === 'OPTIONS') return null;
  if (DE_FONDO.some((x) => x.test(r.url))) return null;
  const lee = metodo === 'GET';

  if (r.status === undefined) return lee ? CARGA_FALLIDA : SIN_CONEXION;
  if (r.status < 400) return null;
  // Una lectura que contesta «no está» o «no te toca» es normal; solo se avisa si el servidor falló.
  if (lee) return r.status >= 500 ? CARGA_FALLIDA : null;
  if (r.status === 401) return null; // sesión vencida: la maneja el ingreso
  const c = r.cuerpo ?? {};
  if (r.status === 402 && c.requiresPayment) return null;
  if (c.requiereVerificacion || c.requiresReason || c.twoFactorRequired) return null;
  if (typeof c.code === 'string' && CON_SU_PROPIA_PANTALLA.has(c.code)) return null;
  return typeof c.message === 'string' && c.message.trim() ? c.message.trim() : ACCION_SIN_HACERSE;
}
