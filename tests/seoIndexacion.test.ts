import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RUTAS_INDEXABLES,
  ORIGEN_PUBLICO,
  decisionSeo,
  canonicalDe,
  normalizarRuta,
} from '../shared/seo/indexacion.js';

/**
 * Google dejó de indexar /blog, /help, /contact y las páginas legales porque `index.html` (que nginx le
 * entrega a TODAS las rutas) traía fijo `<link rel="canonical" href="https://doapparg.com/">`: cada
 * página decía "mi versión oficial es la home". Además el sitemap listaba páginas que no se pueden
 * indexar (login, registro y un checkout detrás de login) y el JSON-LD prometía una búsqueda
 * `/?search=` que la home no tiene.
 *
 * La tabla de qué se indexa vive en shared/seo/indexacion.ts. Este test la mantiene alineada con el
 * sitemap, con robots.txt, con las rutas reales de App.tsx y con el HTML base.
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

const urlsDelSitemap = () =>
  [...leer('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe('decisión de indexación por ruta', () => {
  it.each(RUTAS_INDEXABLES)('%s se indexa y su canónica es ella misma', (ruta) => {
    const d = decisionSeo(ruta);
    expect(d.tipo).toBe('indexar');
    if (d.tipo !== 'indexar') return;
    expect(d.canonical).toBe(canonicalDe(ruta));
    expect(d.canonical.startsWith('https://')).toBe(true);
    expect(d.robots).toBe('index, follow');
  });

  it('ninguna página indexable apunta su canónica a la home, salvo la home', () => {
    for (const ruta of RUTAS_INDEXABLES) {
      const d = decisionSeo(ruta);
      if (d.tipo !== 'indexar') continue;
      if (ruta === '/') expect(d.canonical).toBe(`${ORIGEN_PUBLICO}/`);
      else expect(d.canonical).not.toBe(`${ORIGEN_PUBLICO}/`);
    }
  });

  it.each([
    '/login',
    '/register',
    '/membership/pricing',
    '/membership/checkout',
    '/dashboard',
    '/admin/business-plan',
    '/contracts/123',
    '/balance',
    '/forgot-password',
    '/payment/success',
    '/ruta-que-no-existe',
    '/blog/create',
  ])('%s NO se indexa', (ruta) => {
    const d = decisionSeo(ruta);
    expect(d.tipo).toBe('no-indexar');
    if (d.tipo === 'no-indexar') expect(d.robots).toBe('noindex, follow');
  });

  it('un artículo del blog pone su propia canónica: acá no se agrega otra', () => {
    expect(decisionSeo('/blog/como-elegir-un-plomero').tipo).toBe('la-pagina-decide');
  });

  it('barra final, mayúsculas y parámetros no cambian la decisión ni la canónica', () => {
    expect(normalizarRuta('/Blog/')).toBe('/blog');
    expect(normalizarRuta('/help?x=1#a')).toBe('/help');
    expect(normalizarRuta('')).toBe('/');
    const d = decisionSeo('/?search=plomero');
    expect(d.tipo).toBe('indexar');
    if (d.tipo === 'indexar') expect(d.canonical).toBe(`${ORIGEN_PUBLICO}/`);
  });
});

describe('el sitemap y robots.txt dicen lo mismo que la tabla', () => {
  it('el sitemap lista exactamente las rutas indexables, sin sobrantes ni faltantes', () => {
    const esperadas = RUTAS_INDEXABLES.map(canonicalDe).sort();
    expect(urlsDelSitemap().sort()).toEqual(esperadas);
  });

  it('ninguna URL del sitemap está bloqueada en robots.txt (Google no puede indexar lo que no puede leer)', () => {
    const robots = leer('public/robots.txt');
    // Sólo el bloque "User-agent: *" (el primero) alcanza a Googlebot.
    const bloque = robots.split(/^User-agent:/im)[1] ?? '';
    const bloqueadas = [...bloque.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
    for (const url of urlsDelSitemap()) {
      const ruta = url.replace(ORIGEN_PUBLICO, '') || '/';
      for (const b of bloqueadas) {
        expect(ruta.startsWith(b)).toBe(false);
      }
    }
  });

  it('el sitemap no repite URLs ni usa http', () => {
    const urls = urlsDelSitemap();
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u.startsWith('https://')).toBe(true);
  });
});

describe('las rutas indexables existen y son públicas en App.tsx', () => {
  const app = leer('client/App.tsx');
  const lineas = app.split(/\r?\n/);

  it.each(RUTAS_INDEXABLES.filter((r) => r !== '/'))('%s está definida y no pide iniciar sesión', (ruta) => {
    const i = lineas.findIndex((l) => l.includes(`path="${ruta}"`));
    expect(i).toBeGreaterThanOrEqual(0);
    // La ruta y su `element` ocupan 1 a 4 líneas: si ahí aparece ProtectedRoute, Google ve un login.
    const trozo = lineas.slice(i, i + 4).join('\n');
    expect(trozo).not.toMatch(/ProtectedRoute/);
  });

  it('la home está definida (index o path="/")', () => {
    expect(app).toMatch(/<Route\s+(index|path="\/")/);
  });

  it('el componente que escribe canonical y robots está montado dentro del router', () => {
    expect(app).toMatch(/<SeoDeRuta\s*\/>/);
    expect(app.indexOf('<SeoDeRuta')).toBeGreaterThan(app.indexOf('<BrowserRouter>'));
  });
});

describe('index.html (compartido por todas las rutas) no fija nada que pertenezca a una sola', () => {
  const html = leer('index.html');

  it('no trae canonical fija', () => {
    expect(html).not.toMatch(/rel=["']canonical["']/i);
  });

  it('no trae meta robots fija (la pone cada ruta)', () => {
    expect(html).not.toMatch(/<meta\s+name=["']robots["']/i);
  });

  it('no promete una búsqueda /?search= que la app no tiene', () => {
    expect(html).not.toMatch(/SearchAction|search_term_string/);
  });

  it('el JSON-LD sigue siendo JSON válido', () => {
    const bloques = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(bloques.length).toBeGreaterThan(0);
    for (const b of bloques) expect(() => JSON.parse(b[1])).not.toThrow();
  });
});
