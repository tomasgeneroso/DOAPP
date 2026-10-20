import type { Request, Response, NextFunction } from 'express';
import { mensajeDeError, MENSAJE_TIEMPO_AGOTADO } from '../../shared/errores/mensajesPorEstado.js';

/**
 * Toda respuesta de error del servidor lleva un `message` legible, y deja una línea en el log.
 *
 * Había rutas que respondían `{success:false, errors:[…]}` o `{error:'…'}` sin `message`: la pantalla mostraba un texto genérico sin decir
 * qué estaba mal. Y como una validación fallida no es una excepción, el servidor tampoco dejaba nada en el log: «no hay nada en pm2 logs».
 * Este middleware es la red de seguridad para TODAS las rutas (también las que se agreguen mañana): si el cuerpo de un error no trae
 * motivo, se completa con el que trae la lista `errors`, el campo `error` o el texto que corresponde al código de estado.
 *
 * No toca el resto del cuerpo (códigos, listas, datos) ni las respuestas que ya traen `message`.
 */

/** Respuestas que son parte del funcionamiento normal y llenarían el log de ruido. */
const SIN_REGISTRO = new Set([401, 404, 429]);

/**
 * Un pedido que no responde nunca es lo peor que le puede pasar a una pantalla: queda en «enviando…» sin error ni nada en el log. Pasado este
 * tiempo se contesta 503 con un mensaje claro y se deja la ruta en el registro. El pedido sigue corriendo por detrás (no se puede cancelar una
 * consulta a medias), pero quien lo hizo ya sabe qué pasó y a nosotros nos queda la línea `[HTTP 503] POST /api/…`.
 */
export const TIEMPO_MAXIMO_DE_RESPUESTA_MS = 45_000;
const SIN_LIMITE_DE_TIEMPO = ['/socket.io', '/api/uploads', '/uploads'];

export function respuestasDeError(req: Request, res: Response, next: NextFunction): void {
  const jsonOriginal = res.json.bind(res);

  const limite = Number(process.env.TIEMPO_MAXIMO_DE_RESPUESTA_MS) || TIEMPO_MAXIMO_DE_RESPUESTA_MS;
  const ruta = (req.originalUrl || req.url || '').split('?')[0];
  if (!SIN_LIMITE_DE_TIEMPO.some((p) => ruta.startsWith(p))) {
    const reloj = setTimeout(() => {
      if (res.headersSent) return;
      res.status(503).json({ success: false, code: 'TIEMPO_AGOTADO', message: MENSAJE_TIEMPO_AGOTADO });
    }, limite);
    (reloj as unknown as { unref?: () => void }).unref?.();
    const apagar = () => clearTimeout(reloj);
    res.once('finish', apagar);
    res.once('close', apagar);
  }

  res.json = ((cuerpo?: unknown) => {
    const status = res.statusCode;
    if (status >= 400) {
      let salida = cuerpo;
      if (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)) {
        const c = cuerpo as Record<string, unknown>;
        const mensaje = mensajeDeError(c, status);
        if (typeof c.message !== 'string' || !c.message.trim()) salida = { ...c, message: mensaje };
        if (c.success === undefined) salida = { ...(salida as object), success: false };
      } else if (cuerpo === undefined || cuerpo === null) {
        salida = { success: false, message: mensajeDeError(null, status) };
      }
      registrar(req, res, status, salida as Record<string, unknown> | undefined);
      return jsonOriginal(salida);
    }
    return jsonOriginal(cuerpo);
  }) as Response['json'];

  next();
}

function registrar(req: Request, res: Response, status: number, cuerpo: Record<string, unknown> | undefined): void {
  if (SIN_REGISTRO.has(status) || res.locals?.errorYaRegistrado) return;
  // Sin la consulta (puede traer tokens) y con el motivo: es lo que hace falta para entender un «no pasó nada».
  const ruta = (req.originalUrl || req.url || '').split('?')[0];
  const quien = (req as Request & { user?: { id?: string } }).user?.id;
  const linea = `[HTTP ${status}] ${req.method} ${ruta}${quien ? ` usuario=${quien}` : ''}${cuerpo?.code ? ` código=${String(cuerpo.code)}` : ''} — ${String(cuerpo?.message ?? '').slice(0, 300)}`;
  if (status >= 500) console.error(linea);
  else console.warn(linea);
}
