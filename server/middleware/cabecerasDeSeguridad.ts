import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { EXTENSIONES_QUE_SE_MUESTRAN } from '../utils/archivoSeguro.js';
import type { HelmetOptions } from 'helmet';

/**
 * Cabeceras de seguridad de la API.
 *
 * El sitio (HTML, JS) lo sirve nginx/Cloudflare, no Express: sus cabeceras van en `nginx/seguridad.conf` (ver
 * `shared/seguridad/csp.ts`). Esto cubre lo que sale de Express: la API, los archivos subidos, el socket.
 *
 *  - Strict-Transport-Security: un año e includeSubDomains (staging y demás subdominios también son https).
 *  - X-Frame-Options: SAMEORIGIN.            - X-Content-Type-Options: nosniff.
 *  - Referrer-Policy: strict-origin-when-cross-origin.
 *  - Permissions-Policy: la app USA la cámara (captura del documento) y la ubicación (botón de emergencia de un contrato), así que se
 *    permiten SOLO para el propio sitio; el micrófono no se usa y se apaga.
 *  - Content-Security-Policy: una API JSON no necesita cargar nada: `default-src 'none'`. Los archivos subidos (imágenes y PDF que se
 *    ven dentro del sitio) llevan una más suave: un PDF con `default-src 'none'` no se muestra en el visor del navegador.
 */
export const HSTS_UN_ANIO = 31536000;

export function opcionesDeHelmet(): HelmetOptions {
  return {
    // La CSP la pone `politicaDeContenidoDeLaApi` (distinta para la API y para los archivos subidos).
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: { maxAge: HSTS_UN_ANIO, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'sameorigin' },
    // nosniff, COOP y CORP quedan con los valores por defecto de helmet.
  };
}

export const PERMISSIONS_POLICY = 'geolocation=(self), camera=(self), microphone=()';

const ES_ARCHIVO_SUBIDO = /^\/(api\/)?uploads(\/|$)/;

export const CSP_DE_LA_API = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
/**
 * Los archivos subidos no ejecutan nada: sin scripts aunque el archivo fuera una página (la política anterior no decía nada de scripts). Auditoría 2026-11-24.
 * `object-src 'self'` deja que el visor de PDF de la propia página los muestre.
 */
export const CSP_DE_LOS_ARCHIVOS = "script-src 'none'; object-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

/**
 * Para `express.static` de las carpetas subidas: lo que el navegador no tiene por qué MOSTRAR (cualquier cosa que no sea imagen, video o PDF) se descarga en lugar de
 * abrirse en la página. Los archivos que ya estaban en el disco con extensión .html, .svg, etc. quedan así sin efecto.
 */
export function cabecerasDeArchivoSubido(res: Response, rutaDelArchivo: string): void {
  const extension = path.extname(rutaDelArchivo).toLowerCase();
  if (!EXTENSIONES_QUE_SE_MUESTRAN.has(extension)) res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function cabecerasDeSeguridad(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('Content-Security-Policy', ES_ARCHIVO_SUBIDO.test(req.path) ? CSP_DE_LOS_ARCHIVOS : CSP_DE_LA_API);
  next();
}

/**
 * CORS: solo el sitio exacto, solo estos métodos y solo estas cabeceras.
 *
 * Antes la lista de cabeceras no estaba fijada y el paquete `cors` devolvía, tal cual, las que pedía el navegador (cualquiera); y los
 * métodos incluían HEAD. Ahora son los que usa la web. El origen sigue saliendo de la lista de `corsOrigen.ts` (nunca `*`, nunca copiado
 * sin comprobar contra la lista, y fuera de desarrollo solo https).
 */
export const METODOS_PERMITIDOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
export const CABECERAS_PERMITIDAS = ['Content-Type', 'Authorization', 'Accept', 'Accept-Language'];

export const OPCIONES_DE_CORS = {
  credentials: true,
  methods: METODOS_PERMITIDOS,
  allowedHeaders: CABECERAS_PERMITIDAS,
  maxAge: 600,
  optionsSuccessStatus: 204,
};
