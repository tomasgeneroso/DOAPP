/** El texto de una persona que va a un correo en HTML se escapa: no se confía en él (un enlace o una etiqueta escrita en un formulario llegaba tal cual a la casilla de soporte). */
export const escaparHtml = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Lo contrario de `escaparHtml`, para un texto que NO es HTML (por ejemplo el asunto de un correo, que viaja en una cabecera). */
export const desescaparHtml = (s: unknown): string =>
  String(s ?? '').replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e] as string));

/** Nombres de parámetro que llevan texto escrito por una persona (el nombre, el título de un trabajo, un mensaje…). */
const PARAMETROS_DE_TEXTO = new Set([
  'userName', 'jobTitle', 'contractTitle', 'senderName', 'recipientName', 'messagePreview', 'preview', 'reason', 'resolution',
  'subject', 'message', 'name', 'title', 'updateType', 'nombre', 'titulo', 'motivo', 'comentario', 'note', 'notes',
]);

const nombresDeParametros = (fn: (...a: any[]) => unknown): string[] => {
  const m = /^[^(]*\(([^)]*)\)/.exec(Function.prototype.toString.call(fn));
  return m ? m[1].split(',').map((p) => p.trim().replace(/\s*=.*$/, '').replace(/[?:].*$/, '')) : [];
};

/**
 * Hace que todo método `send…` del servicio de correo escape el TEXTO de las personas antes de armar el HTML (auditoría de seguridad, 2026-11-24).
 * Los correos se armaban pegando el nombre, el título del trabajo o el mensaje tal cual dentro del HTML: un mensaje de chat como `<a href="https://sitio-malo">Verificá
 * tu cuenta</a>` llegaba a otra persona en un correo con la marca y la firma de DOAPP, con el enlace puesto. Se escapa por NOMBRE de parámetro (las direcciones, los
 * códigos y los ids no se tocan, así un correo con apóstrofe no se rompe) y vale también para los métodos que se agreguen.
 */
export function escaparTextoDeLosCorreos<T extends object>(servicio: T, excluir: string[] = []): T {
  const proto = Object.getPrototypeOf(servicio) as Record<string, unknown>;
  for (const nombre of Object.getOwnPropertyNames(proto)) {
    const original = proto[nombre];
    if (!/^send/.test(nombre) || typeof original !== 'function' || excluir.includes(nombre)) continue;
    const parametros = nombresDeParametros(original as (...a: any[]) => unknown);
    if (!parametros.some((p) => PARAMETROS_DE_TEXTO.has(p))) continue;
    (servicio as Record<string, unknown>)[nombre] = function (this: unknown, ...args: unknown[]) {
      const limpios = args.map((a, i) => (typeof a === 'string' && PARAMETROS_DE_TEXTO.has(parametros[i]) ? escaparHtml(a) : a));
      return (original as (...a: unknown[]) => unknown).apply(servicio, limpios);
    };
  }
  return servicio;
}
