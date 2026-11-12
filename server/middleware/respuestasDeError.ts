import type { Request, Response, NextFunction } from 'express';
import { mensajeDeError, MENSAJE_TIEMPO_AGOTADO } from '../../shared/errores/mensajesPorEstado.js';
import { avisosAlDuenoActivos } from '../services/avisosAlDuenoActivos.js';
import { CATALOGO_DE_PROBLEMAS } from '../../shared/errores/catalogoDeProblemas.js';

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

/**
 * Qué se anota en el registro (pedido del dueño, 2026-11-12: «es más importante ver errores de la app y la performance que errores de tipeo del usuario»).
 * Un 4xx es la respuesta correcta a un pedido incorrecto (contraseña mal escrita, usuario con un carácter inválido, correo sin confirmar): no es un problema de
 * la app y llenaba el registro de ruido. Solo se anotan los 5xx (errores del servidor y pedidos que no responden). Para investigar un «no pasó nada» se puede volver a
 * ver todo con `REGISTRAR_ERRORES_DE_CLIENTE=true` (y reiniciar). Los pedidos LENTOS también se anotan (ver `UMBRAL_DE_RESPUESTA_LENTA_MS`).
 */
/**
 * Un 4xx que NO es un error de tipeo: lleva el código de un problema del catálogo (`shared/errores/catalogoDeProblemas.ts`: el libro de un saldo que no cierra, un pago aprobado sin dinero,
 * una devolución que falló...). Son incongruencias de datos o fallas de un paso de dinero: esas SÍ se anotan, aunque el estado sea 4xx.
 */
const esProblemaDelSistema = (cuerpo: Record<string, unknown> | undefined): boolean => !!cuerpo?.code && Object.prototype.hasOwnProperty.call(CATALOGO_DE_PROBLEMAS, String(cuerpo.code));

const registrarErroresDeCliente = (): boolean => String(process.env.REGISTRAR_ERRORES_DE_CLIENTE || '').toLowerCase() === 'true';

/** Desde cuántos milisegundos un pedido se anota como lento. */
export const UMBRAL_DE_RESPUESTA_LENTA_MS = 3000;

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

  // Performance: un pedido que tarda más del umbral deja una línea (método, ruta sin la consulta, estado y tiempo). Sin la consulta: puede traer tokens.
  const umbral = Number(process.env.UMBRAL_DE_RESPUESTA_LENTA_MS) || UMBRAL_DE_RESPUESTA_LENTA_MS;
  if (!SIN_LIMITE_DE_TIEMPO.some((p) => ruta.startsWith(p))) {
    const inicio = Date.now();
    res.once('finish', () => {
      const ms = Date.now() - inicio;
      if (ms >= umbral) console.warn(`[LENTO] ${req.method} ${ruta} → ${res.statusCode} en ${ms} ms`);
    });
  }

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
  // Sin la consulta (puede traer tokens) y con el motivo: es lo que hace falta para entender un «no pasó nada».
  const ruta = (req.originalUrl || req.url || '').split('?')[0];
  // Un 5xx le llega por correo al dueño (una vez por problema; `services/avisoAlDueno.ts`). El `errorHandler` ya avisó los suyos, con el texto técnico del error.
  if (status >= 500 && avisosAlDuenoActivos() && !res.locals?.avisoAlDuenoEnviado) {
    void import('../services/avisoAlDueno.js')
      .then((m) => m.avisarDeUnErrorDelServidor({ metodo: req.method, ruta, estado: status, codigo: cuerpo?.code ? String(cuerpo.code) : undefined, mensaje: String(cuerpo?.message ?? '').slice(0, 300) }))
      .catch(() => undefined);
  }
  // Los 4xx (errores de tipeo o de uso del usuario) no se anotan salvo que se pida (REGISTRAR_ERRORES_DE_CLIENTE=true).
  const delSistema = esProblemaDelSistema(cuerpo);
  if ((status < 500 && !delSistema && !registrarErroresDeCliente()) || res.locals?.errorYaRegistrado) return;
  const quien = (req as Request & { user?: { id?: string } }).user?.id;
  const linea = `[HTTP ${status}] ${req.method} ${ruta}${quien ? ` usuario=${quien}` : ''}${cuerpo?.code ? ` código=${String(cuerpo.code)}` : ''} — ${String(cuerpo?.message ?? '').slice(0, 300)}`;
  if (status >= 500 || delSistema) console.error(delSistema && status < 500 ? `[PROBLEMA DEL SISTEMA] ${linea}` : linea);
  else console.warn(linea);
}
