import type { Page } from '@playwright/test';
import { expect } from './base';

/**
 * Pagar por transferencia bancaria, como lo hace el cliente: elige «Transferencia», mira a qué cuenta transferir, toca «Ya pagué», completa los datos de la operación
 * y adjunta el comprobante. Lo que va después (aprobarlo) es del administrador.
 */

/** Un PNG de 1×1 (un comprobante «de verdad» para el navegador: tiene el tipo y los bytes de una imagen). */
const PNG_DE_UN_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export function comprobante(nombre = 'comprobante.png', tipo = 'image/png', contenido: Buffer = PNG_DE_UN_PIXEL) {
  return { name: nombre, mimeType: tipo, buffer: contenido };
}

export interface DatosDeLaOperacion {
  numero: string;
  nombre: string;
  documento: string;
  banco: string;
}

let serie = 0;

/** Datos de una transferencia nueva: el sistema no deja usar dos veces el mismo número de operación, así que cada prueba trae el suyo. */
export function operacionNueva(): DatosDeLaOperacion {
  serie += 1;
  return { numero: `OP-${Date.now()}${serie}`, nombre: 'Carla Prueba', documento: '30123456', banco: 'Banco Galicia' };
}

/** En la pantalla de pago: elige «Transferencia» y espera a que aparezcan los datos de la cuenta de DOAPP. */
export async function elegirTransferencia(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Transferencia\s*24-48/ }).click();
  await expect(page.getByText('Datos para la transferencia')).toBeVisible();
}

/** Las filas «titular / CUIT / banco / CBU / alias» tal como las ve la persona. */
export async function cuentaDeDoapp(page: Page): Promise<Record<string, string>> {
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tomar = (rotulo: string, siguiente: string) => texto.match(new RegExp(`${rotulo} (.*?) ${siguiente}`))?.[1] ?? '';
  return {
    titular: tomar('Titular', 'CUIT'),
    cuit: tomar('CUIT', 'Banco'),
    banco: tomar('Banco', 'CBU / CVU'),
    cbu: tomar('CBU / CVU', 'Alias'),
    alias: tomar('Alias', 'Monto a transferir'),
  };
}

/** Toca «Ya pagué», completa los datos de la transferencia y adjunta el comprobante. No toca «Completar pago». */
export async function completarYaPague(
  page: Page,
  datos: DatosDeLaOperacion = operacionNueva(),
  archivo: ReturnType<typeof comprobante> | null = comprobante(),
): Promise<DatosDeLaOperacion> {
  const panel = page.locator('#panel-ya-pague');
  const yaPague = page.getByRole('button', { name: /Ya pagué/ });
  if ((await yaPague.getAttribute('aria-expanded')) !== 'true') await yaPague.click();
  await expect(yaPague).toHaveAttribute('aria-expanded', 'true');
  await panel.getByLabel('Número de operación').fill(datos.numero);
  await panel.getByLabel('Nombre de quien transfirió').fill(datos.nombre);
  await panel.getByLabel('DNI o CUIL/CUIT').fill(datos.documento);
  await panel.getByLabel('Banco o billetera de origen').fill(datos.banco);
  await panel.getByLabel('Fecha de la transferencia').fill(new Date().toISOString().slice(0, 10));
  if (archivo) await page.locator('#tf-archivo').setInputFiles(archivo);
  return datos;
}
