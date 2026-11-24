import type { NextFunction, Request, Response } from 'express';

/**
 * Las imágenes se piden por `/api/archivo?ruta=avatars/foto.png` y no por `/api/uploads/avatars/foto.png`.
 *
 * Por qué: el nginx del servidor (staging y producción) atiende por su cuenta CUALQUIER dirección que termine en .png/.jpg bajo /api: responde su propio 404
 * (y Cloudflare lo guarda 4 horas) sin llegar a esta aplicación. Una foto recién subida estaba guardada y no se veía (reporte del dueño, 2026-11-17: «la foto se
 * subió, pero el servidor no pudo mostrarla»). Con la extensión en la consulta y no en la dirección, el pedido llega siempre acá.
 *
 * Se monta en `/api/archivo`, delante de las mismas carpetas privadas y de los mismos archivos que `/uploads`: reescribe la dirección a `/<ruta>`.
 */
export function archivoPorConsulta(req: Request, res: Response, next: NextFunction): void {
  const ruta = typeof req.query.ruta === 'string' ? req.query.ruta : '';
  if (!ruta) {
    res.status(400).json({ success: false, message: 'Falta la ruta del archivo' });
    return;
  }
  // La firma de un enlace de archivo privado viaja en la consulta, que se pierde al reescribir la dirección: se guarda antes.
  if (typeof req.query.firma === 'string') res.locals.firmaDeArchivo = { firma: req.query.firma, vence: req.query.vence };
  req.url = '/' + ruta.replace(/^\/+/, '');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  next();
}
