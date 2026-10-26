/**
 * Regla de Cloudflare («Transform Rules → Modify Response Header») con las mismas cabeceras de seguridad que `nginx/seguridad.conf`.
 * Sale de `cabecerasDelSitio` (`shared/seguridad/csp.ts`): una sola fuente para nginx y para Cloudflare.
 *
 * Solo toca las respuestas del SITIO (HTML y JS). La API y el socket ya mandan sus cabeceras desde Express (`server/middleware/cabecerasDeSeguridad.ts`)
 * y su CSP es más estricta: si Cloudflare las pisara con la del sitio, la API quedaría con una política más floja.
 */
import { cabecerasDelSitio, hashesDeScriptsEnLinea } from './csp.js';

/** Con esta descripción se reconoce la regla propia entre las que ya existan en la zona: se actualiza, nunca se duplica. */
export const DESCRIPCION_DE_LA_REGLA = 'DOAPP: cabeceras de seguridad del sitio (generada, no editar a mano)';

/** Rutas que NO son el sitio: las atiende Express y ya trae sus propias cabeceras. */
export const RUTAS_DE_LA_API = ['/api/', '/socket.io/'] as const;

export interface ReglaDeCabeceras {
  description: string;
  enabled: boolean;
  expression: string;
  action: 'rewrite';
  action_parameters: { headers: Record<string, { operation: 'set'; value: string }> };
}

export interface OpcionesDeLaRegla {
  /** Dominios a los que se aplica, por ejemplo `['doapparg.com']`. Para probar primero: `['staging.doapparg.com']`. */
  hosts: string[];
  /** Cloudflare ya manda HSTS desde SSL/TLS → Edge Certificates: dos cabeceras iguales se pisan, que quede una sola. */
  sinHsts?: boolean;
  /** `true` = la CSP solo avisa en la consola (Report-Only). */
  soloAvisa: boolean;
}

const HOST_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function expresionDeLaRegla(hosts: string[]): string {
  if (hosts.length === 0) throw new Error('Falta al menos un dominio (por ejemplo --host=doapparg.com).');
  for (const h of hosts) if (!HOST_VALIDO.test(h)) throw new Error(`Dominio inválido: «${h}». Va solo el nombre, sin https:// ni barras.`);
  const dominios = hosts.map((h) => `"${h}"`).join(' ');
  const noEsApi = RUTAS_DE_LA_API.map((r) => `not starts_with(http.request.uri.path, "${r}")`).join(' and ');
  return `(http.host in {${dominios}} and ${noEsApi})`;
}

export function reglaDeCabeceras(html: string, op: OpcionesDeLaRegla): ReglaDeCabeceras {
  const headers: ReglaDeCabeceras['action_parameters']['headers'] = {};
  for (const [nombre, valor] of cabecerasDelSitio(hashesDeScriptsEnLinea(html), op.soloAvisa)) {
    if (op.sinHsts && nombre === 'Strict-Transport-Security') continue;
    headers[nombre] = { operation: 'set', value: valor };
  }
  return {
    description: DESCRIPCION_DE_LA_REGLA,
    enabled: true,
    expression: expresionDeLaRegla(op.hosts),
    action: 'rewrite',
    action_parameters: { headers },
  };
}
