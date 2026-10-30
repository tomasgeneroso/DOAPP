import type { Page } from '@playwright/test';
import { expect } from './base';

/** Lo que una persona hace con las publicaciones: llenar el formulario de «Publicar un trabajo», pagar, mirar «Mis trabajos». */

export interface DatosDelTrabajo {
  titulo: string;
  resumen: string;
  descripcion: string;
  presupuesto: number;
  /** Calle y número que existen en el gemelo de direcciones (ver `geografia.ts`). */
  calle: string;
  numero: string;
  barrio: string;
  codigoPostal: string;
  /** Cuántos días desde hoy empieza el trabajo. */
  diasHastaElInicio: number;
}

let serie = 0;

export function trabajoDePrueba(over: Partial<DatosDelTrabajo> = {}): DatosDelTrabajo {
  serie += 1;
  return {
    titulo: `[PRUEBA] Arreglo de caño en la cocina ${Date.now().toString(36)}${serie}`,
    resumen: 'Se pierde agua debajo de la bacha de la cocina',
    descripcion: 'Hay una pérdida de agua debajo de la bacha de la cocina. Hay que cambiar el caño y probar que no gotee más.',
    presupuesto: 15000,
    calle: 'Av. Santa Fe',
    numero: '3253',
    barrio: 'Palermo',
    codigoPostal: 'C1425',
    diasHastaElInicio: 7,
    ...over,
  };
}

/** Elige en el calendario (el de «Fechas del trabajo») un día de inicio y uno de fin, contando desde hoy. */
async function elegirFechas(page: Page, diasHastaElInicio: number): Promise<void> {
  await page.getByPlaceholder('Elegí cuándo empieza y cuándo termina').click();
  const inicio = new Date(Date.now() + diasHastaElInicio * 86_400_000);
  const fin = new Date(inicio.getTime() + 86_400_000);
  const etiqueta = (d: Date) => d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
  const elegir = async (d: Date) => {
    const dia = page.locator(`.react-datepicker__day[aria-label$="${etiqueta(d)}"]:not(.react-datepicker__day--disabled)`).first();
    for (let i = 0; i < 3 && !(await dia.isVisible()); i++) await page.locator('.react-datepicker__navigation--next').first().click();
    await dia.click();
  };
  await elegir(inicio);
  await elegir(fin);
  // El calendario pide además las horas de inicio y de fin: se dejan las que propone.
  await page.keyboard.press('Escape');
}

/** Llena el formulario de «Publicar un trabajo» como lo haría una persona y toca «Publicar trabajo». No espera lo que pasa después. */
export async function llenarYPublicar(page: Page, t: DatosDelTrabajo): Promise<void> {
  await page.goto('/contracts/create');
  await page.getByPlaceholder('Ej: Reparación de caño en la cocina').fill(t.titulo);
  await page.getByPlaceholder('Ej: Necesito arreglar una pérdida de agua en la cocina').fill(t.resumen);
  await page.locator('textarea[name=description]').fill(t.descripcion);
  await page.locator('select').first().selectOption({ index: 1 });
  await page.getByPlaceholder('15.000').fill(String(t.presupuesto));
  await page.locator('input[name=location]').fill('Palermo, Buenos Aires');
  await page.getByPlaceholder('ej. Calle 123').fill(t.calle);
  await page.getByPlaceholder('ej. 1234').fill(t.numero);
  await page.getByPlaceholder('Ej: Palermo, Villa Crespo').fill(t.barrio);
  await page.getByPlaceholder('Ej: C1425 o 1425').fill(t.codigoPostal);
  await elegirFechas(page, t.diasHastaElInicio);
  await page.getByRole('button', { name: 'Publicar trabajo' }).click();
  // Si todavía no cargó sus datos bancarios, la web se lo ofrece antes de seguir: una persona toca «Continuar sin agregar».
  const sinDatos = page.getByRole('button', { name: 'Continuar sin agregar' });
  if (await sinDatos.waitFor({ state: 'visible', timeout: 6000 }).then(() => true, () => false)) await sinDatos.click();
}

export const pesos = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lee un importe escrito como «$ 15.372,10», «$15.372,10» o «$15.000». */
export function importeDe(texto: string): number {
  const m = texto.match(/\$\s?(\d[\d.]*(?:,\d{1,2})?)/);
  if (!m) throw new Error(`No encontré un importe en: ${texto}`);
  return Number(m[1].replace(/\./g, '').replace(',', '.'));
}

export async function esperarAPagar(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/jobs\/[^/]+\/payment/, { timeout: 30_000 });
}
