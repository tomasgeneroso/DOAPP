import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  CSP_SOLO_AVISA,
  HSTS,
  ORIGENES,
  generarNginx,
  hashDeScript,
  hashesDeScriptsEnLinea,
  politicaDeContenidoDelSitio,
  PERMISSIONS_POLICY_DEL_SITIO,
} from '../shared/seguridad/csp.js';
import { PERMISSIONS_POLICY } from '../server/middleware/cabecerasDeSeguridad.js';

/**
 * Las cabeceras del SITIO (HTML y JS, que sirve nginx/Cloudflare) salen de shared/seguridad/csp.ts. Este test evita los tres desfasajes
 * que rompen la web sin avisar: un script en línea de index.html cambia y su hash de la CSP ya no coincide; nginx.conf deja de incluir las
 * cabeceras en un location (nginx no las hereda); alguien suma un servicio externo y nadie lo agrega a la CSP.
 */
const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const html = leer('index.html');

function archivos(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, salida);
    else if (/\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe('cabeceras de seguridad del sitio', () => {
  it('nginx/seguridad.conf es exactamente lo que genera la fuente (si falla: npx tsx server/scripts/generarSeguridadNginx.ts)', () => {
    expect(leer('nginx/seguridad.conf')).toBe(generarNginx(html, CSP_SOLO_AVISA));
  });

  it('cada script en línea de index.html tiene su hash en la CSP, y son los 4 que hay', () => {
    const hashes = hashesDeScriptsEnLinea(html);
    expect(hashes).toHaveLength(4);
    const csp = politicaDeContenidoDelSitio(hashes);
    for (const h of hashes) expect(csp).toContain(h);
    // El hash cambia con un solo carácter: si se edita el script, el viejo ya no sirve.
    expect(hashDeScript('a')).not.toBe(hashDeScript('a '));
  });

  it('el JSON-LD no se cuenta como script ejecutable', () => {
    expect(hashesDeScriptsEnLinea('<script type="application/ld+json">{"a":1}</script>')).toEqual([]);
  });

  it('la CSP no abre lo que la plantilla cierra: sin unsafe-inline/unsafe-eval en scripts, sin comodín, object-src none, sin http:', () => {
    const csp = politicaDeContenidoDelSitio(hashesDeScriptsEnLinea(html));
    const scripts = csp.split('; ').find((d) => d.startsWith('script-src '))!;
    expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(scripts.split(' ')).not.toContain('*');
    expect(scripts.split(' ')).not.toContain('https:');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/\shttp:/);
  });

  it('HSTS de un año con subdominios y los demás valores pedidos, en la configuración generada', () => {
    const conf = leer('nginx/seguridad.conf');
    expect(HSTS).toBe('max-age=31536000; includeSubDomains');
    expect(conf).toContain('add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
    expect(conf).toContain('add_header X-Frame-Options "SAMEORIGIN" always;');
    expect(conf).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(conf).toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
    expect(conf).toMatch(/add_header Permissions-Policy "geolocation=\(self\), camera=\(self\), microphone=\(\)" always;/);
  });

  it('el Permissions-Policy del sitio y el de la API son el mismo', () => {
    expect(PERMISSIONS_POLICY_DEL_SITIO).toBe(PERMISSIONS_POLICY);
  });

  it('nginx.conf incluye las cabeceras en el servidor y en CADA location que pone un add_header propio (nginx no las hereda)', () => {
    const conf = leer('nginx/nginx.conf');
    // sin copias a mano que se desfasen
    expect(conf).not.toMatch(/add_header\s+(X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security|Referrer-Policy|Content-Security-Policy)/i);
    expect(conf).not.toMatch(/X-XSS-Protection/i); // obsoleto: en navegadores viejos abre agujeros
    // el main server (el que sirve doapparg.com) incluye el archivo
    const principal = conf.slice(conf.indexOf('# HTTPS - Main server'));
    expect(principal).toContain('include /etc/nginx/seguridad.conf;');
    // cada location con add_header propio (salvo /health, que responde texto) lo incluye también
    const bloques = principal.split(/\n\s{8}location /).slice(1);
    const conCabeceras = bloques.filter((b) => /add_header/.test(b) && !b.startsWith('/health'));
    expect(conCabeceras.length).toBeGreaterThanOrEqual(4);
    for (const b of conCabeceras) expect([b.split('\n')[0], b.includes('include /etc/nginx/seguridad.conf;')]).toEqual([b.split('\n')[0], true]);
  });

  it('docker-compose monta el archivo generado en el contenedor de nginx', () => {
    expect(leer('docker-compose.yml')).toContain('./nginx/seguridad.conf:/etc/nginx/seguridad.conf:ro');
  });

  it('todo script y hoja de estilo externos que la web carga por código está en la CSP (si suman un servicio, hay que listarlo)', () => {
    const scripts = new Set<string>();
    const estilos = new Set<string>();
    for (const f of archivos(join(raiz, 'client'))) {
      const src = readFileSync(f, 'utf8');
      // Solo variables de script (`script.src`, `clusterScript.src`) y de link (`link.href`): `img.src` no es un script.
      for (const m of src.matchAll(/\b\w*[sS]cript\w*\.src\s*=\s*[`'"](https:\/\/[^/`'"$]+)/g)) scripts.add(m[1]);
      for (const m of src.matchAll(/\b\w*[lL]ink\w*\.href\s*=\s*[`'"](https:\/\/[^/`'"$]+)/g)) estilos.add(m[1]);
    }
    expect(scripts.size).toBeGreaterThan(0);
    for (const s of scripts) expect([s, (ORIGENES.scripts as readonly string[]).includes(s)]).toEqual([s, true]);
    for (const s of estilos) expect([s, (ORIGENES.estilos as readonly string[]).includes(s)]).toEqual([s, true]);
  });
});
