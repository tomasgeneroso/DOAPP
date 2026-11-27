import { test, expect } from '../ayudas/base';
import { consulta } from '../ayudas/base-de-datos';
import { clienteQueLlegaAlPago } from '../ayudas/flujos';
import { llenarYPublicar, trabajoDePrueba } from '../ayudas/trabajos';

/**
 * Pedidos del dueño (2026-11-27): se publica solo con el botón (no con Enter); al ir al pago y volver no se pierde nada; la publicación queda guardada con «pagar después» y
 * «cancelar»; las fotos tienen pie; mudanzas y mandados tienen destino; y desde la papelera se recupera como estaba.
 */
const FOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('publicar solo con el botón, volver del pago sin perder nada, pagar después, cancelar y recuperar', async ({ page }) => {
  await clienteQueLlegaAlPago(page);
  const datos = trabajoDePrueba();
  const trabajosConEseTitulo = async () => Number((await consulta<{ n: string }>('SELECT count(*) AS n FROM jobs WHERE title = $1', [datos.titulo]))[0].n);

  // ── Enter en un campo no publica ──
  await page.goto('/contracts/create');
  await page.getByPlaceholder('Ej: Reparación de caño en la cocina').fill(datos.titulo);
  await page.getByPlaceholder('Ej: Reparación de caño en la cocina').press('Enter');
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/contracts\/create/);
  expect(await trabajosConEseTitulo()).toBe(0);

  // ── Se publica con el botón: queda guardado antes de pagar ──
  await llenarYPublicar(page, datos);
  await expect(page).toHaveURL(/\/jobs\/[^/]+\/payment/, { timeout: 30_000 });
  const jobId = page.url().match(/\/jobs\/([^/]+)\/payment/)![1];
  await expect(page.getByTestId('publicacion-guardada')).toBeVisible();

  // ── «Atrás» del navegador: la publicación cargada, no un formulario vacío ──
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/edit`));
  await expect(page.locator(`input[value="${datos.titulo}"]`)).toBeVisible();

  // ── Destino y pie de foto desde la edición; al guardar, de vuelta al pago ──
  await page.getByText('Agregar dirección de destino').click();
  await page.locator('input[name=destinationLocation]').fill('Resistencia, Chaco');
  await page.keyboard.press('Escape');
  await page.locator('input[type=file][name=images]').setInputFiles({ name: 'antes.png', mimeType: 'image/png', buffer: FOTO });
  await page.getByRole('button', { name: /Usar|Listo|Guardar|Sin cambios|Aceptar/ }).first().click({ timeout: 8000 }).catch(() => undefined);
  await page.getByLabel('Pie de la foto 1').fill('El ropero grande');
  await page.getByRole('button', { name: /Guardar cambios/i }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/payment`), { timeout: 30_000 });
  const [guardado] = await consulta<{ destination: any; image_captions: Record<string, string> }>('SELECT destination, image_captions FROM jobs WHERE id = $1', [jobId]);
  expect(guardado.destination?.location).toBe('Resistencia, Chaco');
  expect(Object.values(guardado.image_captions)).toEqual(['El ropero grande']);
  expect(await trabajosConEseTitulo()).toBe(1);

  // ── Pagar después ──
  await page.getByRole('button', { name: 'Pagar y publicar después' }).click();
  await expect(page).toHaveURL(/\/my-jobs/);
  await expect(page.getByText(datos.titulo).first()).toBeVisible();

  // ── Cancelar la publicación: va a la papelera y se recupera como estaba ──
  await page.goto(`/jobs/${jobId}/payment`);
  await page.getByRole('button', { name: 'Cancelar publicación' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page).toHaveURL(/\/my-jobs/);
  await page.getByTestId('ver-papelera').click();
  const enLaPapelera = page.getByTestId('trabajo-en-la-papelera').filter({ hasText: datos.titulo });
  await expect(enLaPapelera).toContainText('Estaba:');
  await enLaPapelera.getByTestId('recuperar-trabajo').click();
  await expect(enLaPapelera).toHaveCount(0);
  const [vuelto] = await consulta<{ status: string; deleted_at: string | null }>('SELECT status, deleted_at FROM jobs WHERE id = $1', [jobId]);
  expect([vuelto.status, vuelto.deleted_at]).toEqual(['draft', null]);
});
