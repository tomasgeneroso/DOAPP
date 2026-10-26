import { describe, it, expect } from '@jest/globals';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
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
import { expresionDeLaRegla, reglaDeCabeceras } from '../shared/seguridad/cloudflare.js';

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

  it('el despliegue es PM2 sin Docker: no hay Dockerfile ni compose ni microservicios que se desfasen en silencio', () => {
    for (const f of ['Dockerfile', 'docker-compose.yml', 'docker-compose.dev.yml', 'docker-compose.microservices.yml', 'nginx/nginx.conf']) {
      expect([f, existsSync(join(raiz, f))]).toEqual([f, false]);
    }
    expect(existsSync(join(raiz, 'services'))).toBe(false);
    expect(leer('.github/workflows/ci-cd.yml')).toMatch(/pm2 start ecosystem.config.cjs/);
    expect(leer('.github/workflows/ci-cd.yml')).not.toMatch(/docker/i);
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

describe('cabeceras de seguridad en Cloudflare (regla generada)', () => {
  const regla = reglaDeCabeceras(html, { hosts: ['doapparg.com'], soloAvisa: CSP_SOLO_AVISA });

  it('lleva exactamente las mismas cabeceras y valores que nginx/seguridad.conf', () => {
    const delConf = [...leer('nginx/seguridad.conf').matchAll(/^add_header (\S+) "(.*)" always;$/gm)].map((m) => [m[1], m[2]]);
    const deLaRegla = Object.entries(regla.action_parameters.headers).map(([n, h]) => [n, h.value]);
    expect(deLaRegla).toEqual(delConf);
    for (const h of Object.values(regla.action_parameters.headers)) expect(h.operation).toBe('set');
  });

  it('no toca la API ni el socket (ya traen sus cabeceras desde Express) y solo vale para los dominios pedidos', () => {
    expect(regla.expression).toBe('(http.host in {"doapparg.com"} and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/socket.io/"))');
    expect(reglaDeCabeceras(html, { hosts: ['a.com', 'staging.a.com'], soloAvisa: true }).expression).toContain('{"a.com" "staging.a.com"}');
  });

  it('si Cloudflare ya manda HSTS, la regla no lo repite', () => {
    const sin = reglaDeCabeceras(html, { hosts: ['doapparg.com'], soloAvisa: true, sinHsts: true });
    expect(Object.keys(sin.action_parameters.headers)).not.toContain('Strict-Transport-Security');
    expect(Object.keys(regla.action_parameters.headers)).toContain('Strict-Transport-Security');
  });

  it('rechaza un dominio mal escrito o vacío en vez de armar una expresión que se rompe o inyecta', () => {
    expect(() => expresionDeLaRegla([])).toThrow(/al menos un dominio/);
    expect(() => expresionDeLaRegla(['https://doapparg.com/'])).toThrow(/inválido/);
    expect(() => expresionDeLaRegla(['a.com" or true or "b.com'])).toThrow(/inválido/);
  });

  it('la CSP, que es el valor más largo, queda por debajo de los 4096 caracteres (Cloudflare no documenta un tope para el valor: si algún día lo rechaza, acá se ve cuánto falta)', () => {
    for (const h of Object.values(regla.action_parameters.headers)) expect(h.value.length).toBeLessThan(4096);
  });
});
