import { mergeConfig, type UserConfig } from 'vite';
import fs from 'node:fs';
import base from '../../../vite.config';
import { PUERTOS } from './variables';

/**
 * La web de las pruebas «reales»: el BUILD DE PRODUCCIÓN servido con `vite preview` (no el servidor de desarrollo), con el mismo proxy a la API que
 * tiene la configuración normal pero apuntando al servidor de las pruebas. Es lo más parecido a lo que ve una persona en el sitio de verdad, y
 * es donde aparecen los errores que solo pasan en el build de producción.
 */
// La configuración normal es una función (según se construya o se sirva): hay que llamarla antes de combinarla.
const normal: UserConfig = typeof base === 'function' ? ((base as (e: { command: 'build'; mode: string }) => UserConfig)({ command: 'build', mode: 'production' })) : (base as UserConfig);
const proxyBase = (normal.server?.proxy || {}) as Record<string, any>;
const proxy: Record<string, any> = {};
for (const [ruta, cfg] of Object.entries(proxyBase)) {
  proxy[ruta] = { ...cfg, target: String(cfg.target).replace(':3001', `:${PUERTOS.servidor}`) };
  delete proxy[ruta].bypass; // con `preview` las rutas de la web (/legal/…) las resuelve el router; los archivos estáticos no existen
}

const https = fs.existsSync('./ssl/key.pem') && fs.existsSync('./ssl/cert.pem') ? { key: fs.readFileSync('./ssl/key.pem'), cert: fs.readFileSync('./ssl/cert.pem') } : undefined;

export default mergeConfig(normal, {
  preview: { port: PUERTOS.web, strictPort: true, host: 'localhost', https, proxy },
} satisfies UserConfig);
