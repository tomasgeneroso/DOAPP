/**
 * Genera nginx/seguridad.conf (cabeceras de seguridad del sitio) desde shared/seguridad/csp.ts y el index.html.
 *
 * Uso: npx tsx server/scripts/generarSeguridadNginx.ts
 * Hay que correrlo cada vez que se toca un script en línea de index.html o la lista de orígenes; el test lo recuerda.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CSP_SOLO_AVISA, generarNginx } from '../../shared/seguridad/csp.js';

const raiz = process.cwd();
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
writeFileSync(join(raiz, 'nginx', 'seguridad.conf'), generarNginx(html, CSP_SOLO_AVISA));
console.log(`nginx/seguridad.conf generado (CSP ${CSP_SOLO_AVISA ? 'en modo aviso (Report-Only)' : 'aplicada'})`);
