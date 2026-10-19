import { createHash } from 'crypto';

/**
 * Cabeceras de seguridad del SITIO (el HTML y el JS que sirve nginx/Cloudflare). Las de la API salen de
 * `server/middleware/cabecerasDeSeguridad.ts`.
 *
 * Fuente única: `nginx/seguridad.conf` se GENERA de acá (`npx tsx server/scripts/generarSeguridadNginx.ts`) y
 * `tests/seguridadDelSitio.test.ts` falla si el archivo, el `index.html` o esta lista se desfasan. La regla de Cloudflare (Transform Rule)
 * se arma con los mismos valores.
 *
 * Por qué la CSP no es la de plantilla (`script-src 'self'`, sin más):
 *  - `index.html` tiene 4 scripts en línea (redirección de dominios alternativos, modo oscuro, `dataLayer` de Google Analytics y registro
 *    del service worker). Se permiten por HASH, no con 'unsafe-inline': si alguien cambia uno, el hash deja de coincidir y el test avisa.
 *  - La web carga a propósito Google Analytics, el SDK de Facebook y Leaflet (unpkg). Sin listarlos, el navegador los bloquea.
 *  - `style-src 'unsafe-inline'`: React y Leaflet escriben estilos en línea (también lo pide la plantilla).
 */

/** Orígenes externos que la web usa de verdad (inventario sobre `client/`). Si se agrega un servicio, va acá y en un solo lugar. */
export const ORIGENES = {
  scripts: [
    'https://www.googletagmanager.com', // Google Analytics (GoogleAnalytics.tsx, utils/analytics.ts)
    'https://connect.facebook.net', // SDK de Facebook (FacebookSDK.tsx)
    'https://unpkg.com', // Leaflet y markercluster (mapas)
  ],
  estilos: [
    'https://fonts.googleapis.com', // tipografías
    'https://unpkg.com', // CSS de Leaflet
  ],
  fuentes: ['https://fonts.gstatic.com'],
  conexiones: [
    'wss://doapparg.com', // Socket.io (Safari viejo no cuenta wss como 'self')
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://www.googletagmanager.com',
    'https://www.facebook.com',
    'https://graph.facebook.com',
    'https://connect.facebook.net',
    'https://api.mapbox.com', // geocodificación (useMapboxGeocoding)
    'https://nominatim.openstreetmap.org', // direcciones
    'https://apis.datos.gob.ar', // autocompletado de calles y alturas (georef, shared/geo/direcciones.ts)
    'https://firebaseinstallations.googleapis.com', // notificaciones push (FCM)
    'https://fcmregistrations.googleapis.com',
    'https://fcm.googleapis.com',
  ],
  marcos: [
    'https://www.facebook.com', // el SDK de Facebook crea un iframe
  ],
} as const;

/** Imágenes: propias, data:/blob: (vistas previas) y cualquier https (avatares de dicebear, teselas de OpenStreetMap, archivos subidos). */
const IMG_SRC = ["'self'", 'data:', 'blob:', 'https:'];

/** Hash CSP de un script en línea. Se normaliza CRLF→LF: el servidor de producción es Linux y sirve el archivo con LF. */
export function hashDeScript(contenido: string): string {
  const normalizado = contenido.replace(/\r\n/g, '\n');
  return `'sha256-${createHash('sha256').update(normalizado).digest('base64')}'`;
}

/** Los hashes de los scripts EJECUTABLES en línea del HTML (el JSON-LD no se ejecuta: la CSP no lo mira). */
export function hashesDeScriptsEnLinea(html: string): string[] {
  const hashes: string[] = [];
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (/application\/ld\+json/.test(m[1])) continue;
    hashes.push(hashDeScript(m[2]));
  }
  return hashes;
}

export function politicaDeContenidoDelSitio(hashes: string[]): string {
  const directivas: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...hashes, ...ORIGENES.scripts]],
    ['style-src', ["'self'", "'unsafe-inline'", ...ORIGENES.estilos]],
    ['img-src', IMG_SRC],
    ['font-src', ["'self'", 'data:', ...ORIGENES.fuentes]],
    ['connect-src', ["'self'", ...ORIGENES.conexiones]],
    ['frame-src', ["'self'", ...ORIGENES.marcos]],
    ['media-src', ["'self'", 'blob:', 'https:']],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
  ];
  return directivas.map(([nombre, valores]) => `${nombre} ${valores.join(' ')}`).join('; ');
}

/** true = la CSP del sitio solo AVISA en la consola (Report-Only). Pasar a false recién cuando la consola de producción no muestre bloqueos. */
export const CSP_SOLO_AVISA = true;

export const HSTS = 'max-age=31536000; includeSubDomains';
export const PERMISSIONS_POLICY_DEL_SITIO = 'geolocation=(self), camera=(self), microphone=()';

/**
 * `reportOnly` = el navegador avisa en la consola de lo que bloquearía, pero no bloquea nada. Es el modo con el que se estrena: una CSP
 * en modo "enforce" que se olvida de un servicio rompe la web (mapa en blanco, sin pagos) sin que nadie lo vea hasta que se queja un usuario.
 */
export function cabecerasDelSitio(hashes: string[], reportOnly: boolean): Array<[string, string]> {
  return [
    ['Strict-Transport-Security', HSTS],
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', PERMISSIONS_POLICY_DEL_SITIO],
    [reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', politicaDeContenidoDelSitio(hashes)],
  ];
}

/**
 * Contenido de `nginx/seguridad.conf`. `add_header` NO se hereda hacia un `location` que tenga el suyo (por ejemplo el de Cache-Control):
 * por eso el archivo se incluye con `include` en el servidor y también dentro de cada `location` que pone cabeceras propias.
 */
export function generarNginx(html: string, reportOnly: boolean): string {
  const lineas = cabecerasDelSitio(hashesDeScriptsEnLinea(html), reportOnly).map(([n, v]) => `add_header ${n} "${v}" always;`);
  return [
    '# GENERADO por server/scripts/generarSeguridadNginx.ts desde shared/seguridad/csp.ts. NO editar a mano: tests/seguridadDelSitio.test.ts compara.',
    '# Se incluye con `include /etc/nginx/seguridad.conf;` en el server y en cada location que ponga add_header propio',
    '# (nginx no hereda add_header hacia un location que define el suyo).',
    ...lineas,
    '',
  ].join('\n');
}
