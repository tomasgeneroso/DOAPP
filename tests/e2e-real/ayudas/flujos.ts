import type { Page } from '@playwright/test';
import { expect } from './base';
import { Persona } from './personas';
import { agotarLasPublicacionesGratis, consulta } from './base-de-datos';
import { mp, type PagoDelGemelo } from './gemelos-cliente';
import { TARJETA_REAL, pagarConTarjeta } from './mercado-pago';
import { importeDe, llenarYPublicar, trabajoDePrueba, type DatosDelTrabajo } from './trabajos';

/** Pasos que se repiten en muchos casos de la lista de pruebas manuales. */

/** Una cuenta de cliente lista para llegar al pago: dada de alta (registro, Didit, correo) y sin publicaciones gratis (caso P3). */
export async function clienteQueLlegaAlPago(page: Page, etiqueta = 'cliente'): Promise<Persona> {
  const cliente = Persona.nueva(page, etiqueta);
  await cliente.darseDeAlta();
  await agotarLasPublicacionesGratis(cliente.correo);
  return cliente;
}

export interface TrabajoPorPagar {
  datos: DatosDelTrabajo;
  jobId: string;
  /** Lo que DOAPP muestra como «Total a pagar ahora». */
  totalEnDoapp: number;
}

/** Lee del resumen de pago de DOAPP cada línea: presupuesto, comisión, procesamiento, IVA y total. */
export async function leerResumenDelPago(page: Page): Promise<{ presupuesto: number; comision: number; procesamiento: number; iva: number; total: number }> {
  await expect(page.getByText('Resumen del Pago')).toBeVisible();
  // El resumen se dibuja por partes: se lee recién cuando están todas las líneas, como lo hace una persona que mira la pantalla entera.
  await expect(page.getByText('Total a pagar ahora')).toBeVisible();
  await expect(page.getByText(/IVA \(21%\) sobre el procesamiento/)).toBeVisible();
  const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const tomar = (rotulo: RegExp) => {
    const m = texto.match(rotulo);
    if (!m) throw new Error(`No encontré «${rotulo}» en el resumen del pago`);
    return importeDe(m[0].slice(m[0].lastIndexOf('$')));
  };
  return {
    presupuesto: tomar(/Presupuesto del trabajo \(Se pagará al trabajador al completar\) \$[\d.,]+/),
    comision: tomar(/Comisión de publicación \(\d+%\) \$[\d.,]+/),
    procesamiento: tomar(/Costo de procesamiento del pago \(\d+(?:[.,]\d+)?%\)[^$]*\$[\d.,]+/),
    iva: tomar(/IVA \(21%\) sobre el procesamiento \$[\d.,]+/),
    total: tomar(/Total a pagar ahora \$[\d.,]+/),
  };
}

/** Publica un trabajo y queda en la pantalla de pago. */
export async function publicarYLlegarAlPago(page: Page, datos: DatosDelTrabajo = trabajoDePrueba()): Promise<TrabajoPorPagar> {
  await llenarYPublicar(page, datos);
  await expect(page).toHaveURL(/\/jobs\/[^/]+\/payment/, { timeout: 30_000 });
  const jobId = page.url().match(/\/jobs\/([^/]+)\/payment/)![1];
  const resumen = await leerResumenDelPago(page);
  return { datos, jobId, totalEnDoapp: resumen.total };
}

/** Un administrador: se da de alta, se le da el rol como lo hace el dueño y vuelve a entrar. */
export async function administradorEn(pagina: Page, rol: 'admin' | 'owner' | 'super_admin' | 'support' = 'admin'): Promise<Persona> {
  const admin = Persona.nueva(pagina, rol === 'owner' ? 'dueno' : rol);
  await admin.darseDeAlta();
  admin.darRol(rol);
  await admin.reingresar();
  return admin;
}

/** En el panel de Publicaciones del administrador: la fila de un trabajo (por su título). */
export function filaDelTrabajo(pagina: Page, titulo: string) {
  return pagina.getByRole('row').filter({ hasText: titulo });
}

export interface FilaDePago {
  id: string;
  status: string;
  amount: string;
  payment_type: string;
  payer_id: string | null;
  description: string | null;
  mercadopago_preference_id: string | null;
  mercadopago_payment_id: string | null;
}

/** Los pagos de la publicación de un trabajo, como los guardó el sistema (el pago lleva el título del trabajo en su descripción). */
export async function pagosDelTrabajo(titulo: string): Promise<FilaDePago[]> {
  return consulta<FilaDePago>("SELECT id, status, amount, payment_type, payer_id, description, mercadopago_preference_id, mercadopago_payment_id FROM payments WHERE description LIKE $1 ORDER BY created_at", ['%' + titulo + '%']);
}

/** Lo que Mercado Pago cobró por la publicación de un trabajo: sus pagos, ligados al trabajo por la preferencia que DOAPP le creó. */
export async function pagosEnMercadoPagoDe(titulo: string): Promise<PagoDelGemelo[]> {
  const preferencias = (await pagosDelTrabajo(titulo)).map((p) => p.mercadopago_preference_id).filter((x): x is string => !!x);
  return (await mp.pagos()).filter((p) => preferencias.includes(p.preference_id));
}

export async function estadoDelTrabajo(jobId: string): Promise<string> {
  const [fila] = await consulta<{ status: string }>('SELECT status FROM jobs WHERE id = $1', [jobId]);
  return fila?.status;
}

/** Publica un trabajo, paga con la tarjeta que aprueba y queda en la pantalla de éxito («tu publicación está en revisión»). */
export async function publicarYPagar(page: Page, datos?: DatosDelTrabajo): Promise<TrabajoPorPagar> {
  const trabajo = await publicarYLlegarAlPago(page, datos);
  await page.getByRole('button', { name: 'Completar pago' }).click();
  await pagarConTarjeta(page, TARJETA_REAL);
  await expect(page).toHaveURL(/\/payment\/success/);
  await expect(page.getByText('Recibimos tu pago: tu publicación está en revisión')).toBeVisible();
  return trabajo;
}

/**
 * El administrador aprueba una publicación desde Publicaciones. La pantalla pregunta «¿Estás seguro?» y después avisa «aprobada exitosamente»: la persona
 * toca Aceptar las dos veces. Devuelve los textos de esos dos cuadros.
 */
export async function aprobarPublicacion(pagina: Page, titulo: string): Promise<string[]> {
  const avisos: string[] = [];
  pagina.on('dialog', (d) => {
    avisos.push(d.message());
    void d.accept();
  });
  await pagina.goto('/admin/jobs');
  const fila = filaDelTrabajo(pagina, titulo);
  await expect(fila).toContainText('Pendiente Aprobación');
  await fila.getByRole('button', { name: 'Aprobar' }).click();
  await expect(fila).toContainText('Abierto');
  return avisos;
}
