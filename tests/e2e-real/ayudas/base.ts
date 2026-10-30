import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { responderGeografia } from './geografia';
import { URL_DE_LA_WEB } from '../entorno/variables';

/**
 * El `test` de las pruebas reales: lo mismo que el de Playwright, con tres garantías.
 *
 *  1. Cada persona entra con una dirección IP propia (cabecera `X-Forwarded-For`): el servidor limita los pedidos por IP (500 cada 15 minutos),
 *     y una persona real no comparte ese límite con las otras. Así los límites quedan encendidos y una corrida larga no los agota.
 *  2. El navegador no sale a internet. Lo que no es de esta máquina (mapas, Google, fuentes, estadísticas…) se corta, igual que hace el servidor con
 *     sus terceros (ver `precarga-terceros.cjs`). Las direcciones son la excepción: tienen su gemelo (`geografia.ts`). Una prueba puede mirar qué se
 *     intentó con `externosBloqueados`.
 *  3. Una prueba con más de una persona (un cliente y un administrador) abre otra ventana con `otraPersona()`: otro navegador, otra sesión, otra IP.
 */
let contador = 0;
const ipUnica = () => {
  contador += 1;
  const n = (Date.now() % 60000) * 4 + contador;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255 || 1}`;
};

/**
 * La web, un rato después de entrar, ofrece «Mantente actualizado con todas las novedades» (avisos del navegador). Una persona lo cierra con «Más tarde» y sigue: las pruebas
 * hacen lo mismo cuando aparece, en vez de quedar trabadas detrás del cuadro.
 */
async function cerrarElOfrecimientoDeAvisos(page: Page): Promise<void> {
  await page.addLocatorHandler(page.getByRole('heading', { name: 'Mantente actualizado con todas las novedades' }), async () => {
    await page.getByRole('button', { name: 'Más tarde' }).click();
  });
}

const ES_LOCAL = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

async function aislar(context: BrowserContext, bloqueados: string[]): Promise<void> {
  await context.route(
    (url) => !ES_LOCAL(url),
    async (route) => {
      const url = new URL(route.request().url());
      if (await responderGeografia(route)) return;
      // Las hojas de estilo y las fuentes de afuera se contestan vacías (la web espera por ellas); el resto se corta.
      if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
        return route.fulfill({ status: 200, contentType: url.hostname.includes('googleapis') ? 'text/css' : 'font/woff2', body: '' });
      }
      bloqueados.push(`${route.request().method()} ${url.hostname}${url.pathname}`);
      return route.abort('blockedbyclient');
    },
  );
}

export const test = base.extend<{ externosBloqueados: string[]; otraPersona: () => Promise<Page> }>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'x-forwarded-for': ipUnica() });
  },
  page: async ({ page }, use) => {
    await cerrarElOfrecimientoDeAvisos(page);
    await use(page);
  },
  externosBloqueados: [
    async ({ context }, use) => {
      const bloqueados: string[] = [];
      await aislar(context, bloqueados);
      await use(bloqueados);
    },
    { auto: true },
  ],
  otraPersona: async ({ browser }, use) => {
    const abiertos: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        baseURL: URL_DE_LA_WEB,
        ignoreHTTPSErrors: true,
        locale: 'es-AR',
        timezoneId: 'America/Argentina/Buenos_Aires',
        viewport: { width: 1280, height: 720 },
        extraHTTPHeaders: { 'x-forwarded-for': ipUnica() },
      });
      abiertos.push(context);
      await aislar(context, []);
      const pagina = await context.newPage();
      await cerrarElOfrecimientoDeAvisos(pagina);
      return pagina;
    });
    for (const c of abiertos) await c.close();
  },
});

export { expect };
