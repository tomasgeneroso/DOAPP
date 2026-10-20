import type { Request, Response, NextFunction } from 'express';
import { mensajeDeError } from '../../shared/errores/mensajesPorEstado.js';

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

export function respuestasDeError(req: Request, res: Response, next: NextFunction): void {
  const jsonOriginal = res.json.bind(res);

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
