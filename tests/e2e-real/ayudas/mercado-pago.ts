import type { Page } from '@playwright/test';
import { expect } from './base';
import { importeDe } from './trabajos';

/**
 * Lo que una persona hace en la página de pago de Mercado Pago (el gemelo: ver `gemelos/mercadopago.ts`). Las tarjetas son las mismas de la lista de
 * pruebas manuales: «tu tarjeta real» (acá una de prueba que el gemelo trata como real: aprueba con el código 123 y un vencimiento futuro) y los errores
 * «a propósito» (un código de seguridad o un vencimiento equivocados).
 */
export interface Tarjeta {
  numero: string;
  titular: string;
  vencimiento: string;
  codigo: string;
  documento?: string;
  cuotas?: number;
  cupon?: string;
}

export const TARJETA_REAL: Tarjeta = { numero: '4509 9535 6623 3704', titular: 'Carla Prueba', vencimiento: '11/30', codigo: '123', documento: '30123456' };
export const CODIGO_EQUIVOCADO: Tarjeta = { ...TARJETA_REAL, codigo: '999' };
export const VENCIMIENTO_EQUIVOCADO: Tarjeta = { ...TARJETA_REAL, vencimiento: '01/20' };
export const SIN_FONDOS: Tarjeta = { ...TARJETA_REAL, titular: 'FUND' };

/** El total que Mercado Pago muestra para pagar. */
export async function totalEnMercadoPago(page: Page): Promise<number> {
  await expect(page).toHaveURL(/localhost:3201\/checkout\//);
  return importeDe(await page.getByTestId('total-a-pagar').innerText());
}

/** Llena la tarjeta y toca «Pagar». Después de esto Mercado Pago muestra el rechazo o devuelve a DOAPP (según la tarjeta). */
export async function pagarConTarjeta(page: Page, t: Tarjeta): Promise<void> {
  await expect(page).toHaveURL(/localhost:3201\/checkout\//);
  await page.getByLabel('Número de tarjeta').fill(t.numero);
  await page.getByLabel('Nombre y apellido del titular').fill(t.titular);
  await page.getByLabel('Vencimiento (MM/AA)').fill(t.vencimiento);
  await page.getByLabel('Código de seguridad').fill(t.codigo);
  await page.getByLabel('DNI del titular').fill(t.documento ?? '30123456');
  if (t.cuotas) await page.getByLabel('Cuotas').selectOption(String(t.cuotas));
  if (t.cupon) await page.getByLabel(/Cupón de descuento/).fill(t.cupon);
  await page.getByRole('button', { name: 'Pagar', exact: true }).click();
}

/** Elige «Efectivo» y genera el cupón (sin pagarlo). Devuelve el número de pago. */
export async function generarCuponDeEfectivo(page: Page): Promise<number> {
  await page.getByRole('link', { name: 'Efectivo' }).click();
  await page.getByRole('button', { name: 'Generar cupón de pago' }).click();
  return Number(await page.getByTestId('numero-de-pago').innerText());
}

/** En la página de rechazo de Mercado Pago, «Volver al sitio». */
export async function volverDesdeMercadoPago(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Volver al sitio' }).click();
}
