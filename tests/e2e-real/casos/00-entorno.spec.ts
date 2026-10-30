import { test, expect } from '@playwright/test';
import { URL_CORREO, URL_DEL_SERVIDOR, URL_DIDIT, URL_MP } from '../entorno/variables';

/** Antes de probar nada: el sistema levantó entero y habla con los gemelos. Si esto falla, ninguna otra prueba tiene sentido. */
test.describe('el entorno de las pruebas reales', () => {
  test('la web abre sin errores de JavaScript (build de producción)', async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
    expect(errores).toEqual([]);
  });

  test('el servidor y los gemelos responden', async ({ request }) => {
    expect((await request.get(`${URL_DEL_SERVIDOR}/api/health`)).ok()).toBe(true);
    expect((await request.get(`${URL_MP}/__control/estado`)).ok()).toBe(true);
    expect((await request.get(`${URL_CORREO}/correos`)).ok()).toBe(true);
    expect((await request.get(`${URL_DIDIT}/v3/workflows/`)).ok()).toBe(true);
  });

  test('el servidor no habla con ningún tercero de verdad (ni tiene sus claves)', async ({ request }) => {
    // Mercado Pago está configurado con una clave de mentira y el aviso firmado con la del gemelo: si el servidor leyera el .env real, esto no sería así.
    const estado = await (await request.get(`${URL_MP}/__control/estado`)).json();
    expect(Array.isArray(estado.pagos)).toBe(true);
  });
});
