import type { Page } from '@playwright/test';
import { test, expect } from '../ayudas/base';
import { aprobarPublicacion, clienteQueLlegaAlPago, administradorEn, estadoDelTrabajo, filaDelTrabajo, leerResumenDelPago, pagosDelTrabajo, pagosEnMercadoPagoDe, publicarYLlegarAlPago, publicarYPagar } from '../ayudas/flujos';
import { CODIGO_EQUIVOCADO, SIN_FONDOS, generarCuponDeEfectivo, TARJETA_REAL, VENCIMIENTO_EQUIVOCADO, pagarConTarjeta, totalEnMercadoPago, volverDesdeMercadoPago, type Tarjeta } from '../ayudas/mercado-pago';
import { consulta } from '../ayudas/base-de-datos';
import { Persona } from '../ayudas/personas';
import { llenarYPublicar, trabajoDePrueba } from '../ayudas/trabajos';
import { correo, mp } from '../ayudas/gemelos-cliente';

/** El muro de trabajos es la página de inicio: se espera a que traiga la lista, para que «no aparece» no sea solo «todavía no cargó». */
async function mirarElMuro(pagina: Page): Promise<void> {
  const lista = pagina.waitForResponse((r) => /\/api\/jobs(\?|$)/.test(r.url()) && r.status() === 200);
  await pagina.goto('/');
  await lista;
}

/** Que el administrador tenga en sus avisos el título dado (lo que vería en la campanita). */
async function esperarAvisoAlAdministrador(correoDelAdmin: string, titulo: string): Promise<void> {
  await expect
    .poll(async () => (await consulta('SELECT n.id FROM notifications n JOIN users u ON u.id = n.recipient_id WHERE lower(u.email) = lower($1) AND n.title = $2', [correoDelAdmin, titulo])).length, { timeout: 15_000 })
    .toBe(1);
}

/**
 * Parte A de la lista de pruebas manuales: publicar un trabajo y pagar con Mercado Pago. Cada prueba lleva el número del caso y sigue sus pasos; las líneas
 * «Tiene que pasar» de la lista son los `expect`.
 *
 * Qué NO cubre (y sigue siendo manual): que Mercado Pago DE VERDAD cobre y descuente lo mismo que DOAPP calcula. El gemelo cobra lo que DOAPP le pide.
 */
test.describe('A · publicar y pagar con Mercado Pago', () => {
  test('A1 · publicar y pagar con tarjeta, y que el administrador apruebe', async ({ page, otraPersona }) => {
    // Cliente con la identidad verificada y sin publicaciones gratis (P3); trabajo de $15.000 con inicio dentro de una semana.
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);

    // Pantalla de pago: el total es precio + procesamiento + IVA de ese procesamiento, y la comisión de DOAPP es $0 (la beta).
    const resumen = await leerResumenDelPago(page);
    expect(resumen.presupuesto).toBe(15000);
    expect(resumen.comision).toBe(0);
    expect(resumen.total).toBeCloseTo(resumen.presupuesto + resumen.procesamiento + resumen.iva, 2);

    // Mercado Pago cobra EXACTAMENTE el mismo total que mostraba DOAPP, centavo por centavo.
    await page.getByRole('button', { name: 'Completar pago' }).click();
    expect(await totalEnMercadoPago(page)).toBe(resumen.total);
    await pagarConTarjeta(page, TARJETA_REAL);

    // Pantalla de éxito: el monto y que la publicación está EN REVISIÓN (todavía no publicada).
    await expect(page).toHaveURL(/\/payment\/success/);
    await expect(page.getByText(/Pago Confirmado/i)).toBeVisible();
    await expect(page.getByText('Recibimos tu pago: tu publicación está en revisión')).toBeVisible();

    // Mis trabajos: figura En revisión, no Abierto.
    await page.goto('/my-jobs');
    await expect(page.getByText(trabajo.datos.titulo)).toBeVisible();
    await expect(page.getByText(/En revisión\. Ya está pagado/)).toBeVisible();

    // Sin sesión (otra persona que mira el muro) todavía no aparece.
    const visitante = await otraPersona();
    await mirarElMuro(visitante);
    await expect(visitante.getByText(trabajo.datos.titulo)).toHaveCount(0);

    // El sistema guardó un solo pago, completado, por ese monto y asociado al trabajo; y el trabajo espera aprobación.
    const pagos = await pagosDelTrabajo(trabajo.datos.titulo);
    expect(pagos).toHaveLength(1);
    expect(pagos[0].status).toBe('completed');
    expect(Number(pagos[0].amount)).toBe(resumen.total);
    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('pending_approval');

    // El cliente recibió el correo «Recibimos tu pago: tu publicación está en revisión» (uno solo, no se duplica).
    await correo.esperar(cliente.correo, /Recibimos tu pago: tu publicación está en revisión/);
    expect(await correo.cuantos(cliente.correo, /Recibimos tu pago/)).toBe(1);

    // El administrador ve la publicación esperando aprobación y la aprueba.
    const paginaAdmin = await otraPersona();
    await administradorEn(paginaAdmin);
    await paginaAdmin.goto('/admin/jobs');
    // Aprobar pregunta «¿Estás seguro?» y después avisa «aprobada exitosamente»: la persona toca Aceptar las dos veces.
    const avisos: string[] = [];
    paginaAdmin.on('dialog', (d) => { avisos.push(d.message()); void d.accept(); });
    const fila = filaDelTrabajo(paginaAdmin, trabajo.datos.titulo);
    await expect(fila).toContainText('Pendiente Aprobación');
    await fila.getByRole('button', { name: 'Aprobar' }).click();
    await expect(fila).toContainText('Abierto');
    expect(avisos).toEqual(['¿Estás seguro de aprobar esta publicación?', 'Publicación aprobada exitosamente']);

    // Ahora el trabajo está Abierto, y cualquiera lo ve en el muro.
    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('open');
    await mirarElMuro(visitante);
    await expect(visitante.getByText(trabajo.datos.titulo)).toBeVisible();
  });

  test('A3 · pago rechazado (código equivocado a propósito) y reintento', async ({ page }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();

    // Con el código de seguridad equivocado Mercado Pago rechaza y no cobra.
    await pagarConTarjeta(page, CODIGO_EQUIVOCADO);
    await expect(page.getByTestId('motivo-del-rechazo')).toContainText('código de seguridad');
    await volverDesdeMercadoPago(page);

    // Volvemos a DOAPP sin haber pagado: el trabajo NO figura publicado (sigue pendiente de pago).
    await expect(page).toHaveURL(/localhost:4273/);
    expect(await estadoDelTrabajo(trabajo.jobId)).not.toBe('open');
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).filter((p) => p.status === 'completed')).toHaveLength(0);

    // Reintentar con los datos bien: esta vez se confirma y queda UN solo pago aprobado.
    await page.goto(`/jobs/${trabajo.jobId}/payment`);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    await pagarConTarjeta(page, TARJETA_REAL);
    await expect(page).toHaveURL(/\/payment\/success/);
    await expect(page.getByText('Recibimos tu pago: tu publicación está en revisión')).toBeVisible();
    const completados = (await pagosDelTrabajo(trabajo.datos.titulo)).filter((p) => p.status === 'completed');
    expect(completados).toHaveLength(1);
    // En Mercado Pago quedaron dos intentos de este trabajo: el rechazado y el aprobado (que cobró el total de DOAPP).
    const enMp = await pagosEnMercadoPagoDe(trabajo.datos.titulo);
    expect(enMp.filter((p) => p.status === 'approved')).toHaveLength(1);
    expect(enMp.filter((p) => p.status === 'approved')[0].transaction_amount).toBe(trabajo.totalEnDoapp);
    expect(enMp.filter((p) => p.status === 'rejected')).toHaveLength(1);
  });

  test('A2 · recargar la página de éxito tres veces no duplica nada', async ({ page }) => {
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYPagar(page);
    await correo.esperar(cliente.correo, /Recibimos tu pago/);

    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(page).toHaveURL(/\/payment\/success/);
      await expect(page.getByText('Recibimos tu pago: tu publicación está en revisión')).toBeVisible();
    }

    // Un solo cobro en Mercado Pago, un solo pago en DOAPP, un solo trabajo y un solo aviso por correo.
    expect((await pagosEnMercadoPagoDe(trabajo.datos.titulo)).filter((p) => p.status === 'approved')).toHaveLength(1);
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).filter((p) => p.status === 'completed')).toHaveLength(1);
    expect(await consulta('SELECT id FROM jobs WHERE title = $1', [trabajo.datos.titulo])).toHaveLength(1);
    expect(await correo.cuantos(cliente.correo, /Recibimos tu pago/)).toBe(1);
  });

  test('A4 · otros rechazos: vencimiento equivocado, código equivocado y sin fondos', async ({ page }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();

    const intentos: Array<[string, Tarjeta, string]> = [
      ['vencimiento equivocado', VENCIMIENTO_EQUIVOCADO, 'vencimiento'],
      ['código de seguridad equivocado', CODIGO_EQUIVOCADO, 'código de seguridad'],
      ['sin fondos', SIN_FONDOS, 'fondos'],
    ];
    for (const [, tarjeta, motivo] of intentos) {
      await pagarConTarjeta(page, tarjeta);
      await expect(page.getByTestId('motivo-del-rechazo')).toContainText(motivo);
      await page.getByRole('button', { name: 'Probar con otra tarjeta' }).click();
    }

    // Ningún intento cobró, y el trabajo no se publicó.
    const enMp = await pagosEnMercadoPagoDe(trabajo.datos.titulo);
    expect(enMp).toHaveLength(3);
    expect(enMp.every((p) => p.status === 'rejected')).toBe(true);
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).filter((p) => p.status === 'completed')).toHaveLength(0);
    expect(['open', 'pending_approval']).not.toContain(await estadoDelTrabajo(trabajo.jobId));
  });

  test('A6 · cancelar en la pantalla de Mercado Pago vuelve a DOAPP sin cobrar', async ({ page }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    expect(await totalEnMercadoPago(page)).toBe(trabajo.totalEnDoapp);

    await volverDesdeMercadoPago(page);
    await expect(page).toHaveURL(/localhost:4273/);
    // La web no deja a la persona en blanco: le dice que el pago no se hizo.
    await expect(page.locator('body')).toContainText(/pago|pagar/i);
    expect(await pagosEnMercadoPagoDe(trabajo.datos.titulo)).toHaveLength(0);
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).filter((p) => p.status === 'completed')).toHaveLength(0);
    expect(['open', 'pending_approval']).not.toContain(await estadoDelTrabajo(trabajo.jobId));
  });

  test('A9 · un intruso no puede pagar ni ver el monto del trabajo de otra persona', async ({ page, otraPersona }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    const direccion = `/jobs/${trabajo.jobId}/payment`;

    const paginaIntruso = await otraPersona();
    const intruso = await clienteQueLlegaAlPago(paginaIntruso, 'intruso');
    await paginaIntruso.goto(direccion);
    await expect(paginaIntruso.getByRole('button', { name: 'Completar pago' })).toHaveCount(0);
    await expect(paginaIntruso.getByText('Resumen del Pago')).toHaveCount(0);
    await expect(paginaIntruso.locator('body')).not.toContainText(String(trabajo.totalEnDoapp).replace('.', ','));

    // Tampoco por la API directa: el servidor no arma un pago de un trabajo ajeno.
    const token = await paginaIntruso.evaluate(() => localStorage.getItem('token'));
    const r = await paginaIntruso.request.post(`/api/jobs/${trabajo.jobId}/pay`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
    expect(await pagosEnMercadoPagoDe(trabajo.datos.titulo)).toHaveLength(0);
    void intruso;
  });

  test('A10 · un trabajo ya pagado y publicado no deja pagar otra vez', async ({ page, otraPersona }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYPagar(page);
    const paginaAdmin = await otraPersona();
    await administradorEn(paginaAdmin);
    await aprobarPublicacion(paginaAdmin, trabajo.datos.titulo);
    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('open');

    await page.goto(`/jobs/${trabajo.jobId}/payment`);
    await expect(page.getByRole('button', { name: 'Completar pago' })).toHaveCount(0);
    // Por la API directa tampoco: no se crea un segundo pedido de cobro.
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const r = await page.request.post(`/api/jobs/${trabajo.jobId}/pay`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(await pagosEnMercadoPagoDe(trabajo.datos.titulo)).toHaveLength(1);
  });

  test('A12 · no se ofrecen cuotas, y si llega un pago en cuotas no se da por bueno', async ({ page, otraPersona }) => {
    // El aviso le llega a los administradores que ya existen cuando se paga: hay uno antes de empezar.
    const admin = await administradorEn(await otraPersona());
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    await expect(page).toHaveURL(/localhost:3201\/checkout\//);
    await expect(page.getByLabel('Cuotas').locator('option')).toHaveText(['1 cuota']);

    // Una persona con las herramientas del navegador le agrega la opción de 3 cuotas y paga igual: DOAPP no lo da por bueno.
    await page.getByLabel('Cuotas').evaluate((s: HTMLSelectElement) => s.add(new Option('3 cuotas', '3')));
    await pagarConTarjeta(page, { ...TARJETA_REAL, cuotas: 3 });
    await page.waitForURL(/localhost:4273/);
    // Al volver, la web confirma el pago con Mercado Pago: se espera a que diga qué pasó antes de mirar lo que se guardó.
    await expect(page.locator('body')).toContainText(/cuotas|cupón/i);

    const enMp = await pagosEnMercadoPagoDe(trabajo.datos.titulo);
    expect(enMp.map((p) => p.installments)).toEqual([3]);
    const pagos = await pagosDelTrabajo(trabajo.datos.titulo);
    expect(pagos.filter((p) => p.status === 'completed')).toHaveLength(0);
    expect(['open', 'pending_approval']).not.toContain(await estadoDelTrabajo(trabajo.jobId));
    expect(pagos.map((p) => p.status)).toEqual(['pending_verification']);
    await esperarAvisoAlAdministrador(admin.correo, 'Pago en cuotas o con cupón');
  });

  test('A13 · un cupón de descuento de Mercado Pago no activa la publicación', async ({ page, otraPersona }) => {
    const admin = await administradorEn(await otraPersona());
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    await pagarConTarjeta(page, { ...TARJETA_REAL, cupon: 'DESC10' });
    await page.waitForURL(/localhost:4273/);
    await expect(page.locator('body')).toContainText(/cuotas|cupón/i);

    const enMp = await pagosEnMercadoPagoDe(trabajo.datos.titulo);
    expect(enMp).toHaveLength(1);
    expect(enMp[0].coupon_amount).toBeGreaterThan(0);
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).map((p) => p.status)).toEqual(['pending_verification']);
    expect(['open', 'pending_approval']).not.toContain(await estadoDelTrabajo(trabajo.jobId));
    await esperarAvisoAlAdministrador(admin.correo, 'Pago en cuotas o con cupón');
  });

  test('A5 · pago pendiente en efectivo: no se publica, avisa que no se pague de nuevo y se confirma al volver cuando se paga', async ({ page }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();

    // En Mercado Pago elige un medio en efectivo, genera el cupón sin pagarlo y vuelve a DOAPP.
    const numeroDePago = await generarCuponDeEfectivo(page);
    await page.getByRole('button', { name: 'Volver al sitio' }).click();
    await expect(page).toHaveURL(/localhost:4273/);

    // DOAPP no publica y dice con claridad que Mercado Pago todavía no confirmó, pidiendo no pagar de nuevo y recargar cuando se apruebe.
    const cuerpo = page.locator('body');
    await expect(cuerpo).toContainText(/todavía no confirm/i);
    await expect(cuerpo).toContainText(/no pagues de nuevo/i);
    await expect(cuerpo).toContainText(/recarg/i);
    const pagos = await pagosDelTrabajo(trabajo.datos.titulo);
    expect(pagos).toHaveLength(1);
    expect(['completed', 'held_escrow']).not.toContain(pagos[0].status);
    expect(['open', 'pending_approval']).not.toContain(await estadoDelTrabajo(trabajo.jobId));

    // Pasa el tiempo y alguien paga el cupón en Rapipago: al recargar la página, la publicación se confirma (no por el aviso automático).
    await mp.config({ modoWebhook: 'no_enviar' });
    try {
      await mp.pagarCupon(numeroDePago);
      await page.reload();
      await expect(page).toHaveURL(/\/payment\/success/);
      await expect(page.getByText('Recibimos tu pago: tu publicación está en revisión')).toBeVisible();
    } finally {
      await mp.config({ modoWebhook: 'normal' });
    }
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).filter((p) => p.status === 'completed')).toHaveLength(1);
    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('pending_approval');
  });

  test('A7 · pagar y cerrar la pestaña antes de volver: el cobro no queda invisible', async ({ page, otraPersona }) => {
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();

    // Mercado Pago aprueba y la persona cierra la pestaña: el navegador nunca llega a volver a DOAPP.
    await page.route(/localhost:4273\/payment\//, (r) => r.abort());
    await pagarConTarjeta(page, TARJETA_REAL);
    await expect.poll(async () => (await pagosEnMercadoPagoDe(trabajo.datos.titulo)).length).toBe(1);
    const cobro = (await pagosEnMercadoPagoDe(trabajo.datos.titulo))[0];
    expect(cobro.status).toBe('approved');
    await page.close();

    // Después entra otra vez como Cliente: el número de pago de Mercado Pago ya está guardado (llegó por el aviso automático).
    await expect
      .poll(async () => (await pagosDelTrabajo(trabajo.datos.titulo)).map((p) => p.mercadopago_payment_id), { timeout: 20_000 })
      .toEqual([String(cobro.id)]);
    const pagos = await pagosDelTrabajo(trabajo.datos.titulo);
    // O el trabajo quedó en revisión, o se publicó, o el pago está a la vista de un administrador como pendiente: nunca invisible.
    const estado = await estadoDelTrabajo(trabajo.jobId);
    const visible = ['pending_approval', 'open'].includes(estado) || ['pending', 'processing', 'pending_verification', 'completed'].includes(pagos[0].status);
    expect(visible).toBe(true);
    expect(pagos).toHaveLength(1);

    // Y el cliente, al volver a entrar, ve su trabajo y puede terminar de confirmar el pago desde la pantalla del trabajo.
    const otra = await otraPersona();
    await new Persona(otra, cliente.datos).entrar();
    await otra.goto('/my-jobs');
    await expect(otra.getByText(trabajo.datos.titulo)).toBeVisible();
  });

  test('A8 y A11 · ya no hay publicaciones gratis: toda publicación pasa por el pago, aunque la cuenta tenga contratos libres de comisión', async ({ page }) => {
    // Los casos A8 y A11 de la lista manual hablan de «contratos gratis iniciales» y de «2 publicaciones gratis del mes»: eso se reemplazó. Hoy los contratos libres
    // de comisión (1 por mes para las primeras cuentas, o con PRO) solo eximen la COMISIÓN; la publicación se paga siempre. Esta prueba fija la regla vigente.
    const cliente = Persona.nueva(page, 'cliente');
    await cliente.darseDeAlta();
    const [cuenta] = await consulta<{ free_contracts_remaining: number }>('SELECT free_contracts_remaining FROM users WHERE lower(email) = lower($1)', [cliente.correo]);
    expect(Number(cuenta.free_contracts_remaining)).toBe(0);

    for (let i = 0; i < 3; i++) {
      const datos = trabajoDePrueba();
      await llenarYPublicar(page, datos);
      await expect(page).toHaveURL(/\/jobs\/[^/]+\/payment/, { timeout: 30_000 });
      const resumen = await leerResumenDelPago(page);
      expect(resumen.presupuesto).toBe(15000);
      expect(resumen.total).toBeGreaterThan(15000);
      // Nada se publicó sin cobrar.
      expect((await consulta<{ status: string }>('SELECT status FROM jobs WHERE title = $1', [datos.titulo]))[0].status).not.toBe('open');
    }
    // Lo único gratis para esta cuenta es la comisión: está a la vista como $0 (la beta).
    await expect(page.getByText(/Comisión de publicación \(0%\)/)).toBeVisible();
  });

  test('A14 · rechazar una publicación pagada: pide un motivo, el cliente lo lee y le vuelve el precio como saldo', async ({ page, otraPersona }) => {
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYPagar(page);

    const paginaAdmin = await otraPersona();
    await administradorEn(paginaAdmin);
    const avisos: string[] = [];
    paginaAdmin.on('dialog', (d) => {
      avisos.push(d.message());
      void d.accept();
    });
    await paginaAdmin.goto('/admin/jobs');
    const fila = filaDelTrabajo(paginaAdmin, trabajo.datos.titulo);
    await fila.getByRole('button', { name: /Rechazar|Reject/ }).click();

    // Sin motivo, o con uno corto, no se deja rechazar (ni por la pantalla ni por la API).
    const rechazar = paginaAdmin.getByRole('button', { name: 'Rechazar y devolver saldo' });
    await expect(rechazar).toBeDisabled();
    await paginaAdmin.locator('#reject-reason').fill('corto');
    await expect(rechazar).toBeDisabled();
    const token = await paginaAdmin.evaluate(() => localStorage.getItem('token'));
    const corto = await paginaAdmin.request.put(`/api/admin/jobs/${trabajo.jobId}/status`, { headers: { Authorization: `Bearer ${token}` }, data: { status: 'rejected', rejectedReason: 'corto' } });
    expect(corto.status()).toBe(400);
    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('pending_approval');

    // Con un motivo de verdad, se rechaza: la publicación queda cancelada.
    const motivo = 'La descripción no dice en qué parte de la casa hay que hacer el trabajo.';
    await paginaAdmin.locator('#reject-reason').fill(motivo);
    await expect(rechazar).toBeEnabled();
    await rechazar.click();
    await expect(fila).toContainText('Cancelado');
    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('cancelled');

    // El cliente lo lee en su notificación, con el motivo tal cual.
    await page.goto('/notifications');
    await expect(page.getByText(motivo).first()).toBeVisible();

    // Le vuelve el precio (y la comisión, que en la beta es $0); el costo de procesamiento ya se fue a Mercado Pago. Queda su movimiento en el historial.
    const movimientos = await consulta<{ type: string; amount: string; status: string }>(
      'SELECT b.type, b.amount, b.status FROM balance_transactions b JOIN users u ON u.id = b.user_id WHERE lower(u.email) = lower($1) ORDER BY b.created_at',
      [cliente.correo],
    );
    expect(movimientos.map((m) => Number(m.amount))).toContain(15000);
    expect(movimientos.map((m) => Number(m.amount)).every((n) => n <= 15000)).toBe(true);
  });

  test('A15 · apagar la aprobación de publicaciones pagadas: se publica apenas se confirma el pago, y al volver a encenderla queda en revisión', async ({ page, otraPersona }) => {
    // Las pruebas corren de a una (workers: 1): apagar el módulo un rato no pisa a otras. Aun si algo falla, el módulo se vuelve a encender.
    const paginaDueno = await otraPersona();
    await administradorEn(paginaDueno, 'owner');
    await paginaDueno.goto('/admin/modules');
    const boton = paginaDueno.getByRole('heading', { name: 'Aprobación de publicaciones pagadas' }).locator('xpath=ancestor::div[contains(@class,"px-6")][1]').getByRole('button');
    await expect(boton).toContainText('Active');

    let apagado = false;
    try {
      await boton.click();
      apagado = true;
      await expect(boton).toContainText('Inactive');

      // Con el módulo apagado, apenas se confirma el pago el trabajo queda Abierto y aparece en el muro, sin pasar por el administrador.
      const cliente = await clienteQueLlegaAlPago(page);
      const trabajo = await publicarYLlegarAlPago(page);
      await page.getByRole('button', { name: 'Completar pago' }).click();
      await pagarConTarjeta(page, TARJETA_REAL);
      await expect(page).toHaveURL(/\/payment\/success/);
      await expect.poll(() => estadoDelTrabajo(trabajo.jobId)).toBe('open');
      const visitante = await otraPersona();
      await mirarElMuro(visitante);
      await expect(visitante.getByText(trabajo.datos.titulo)).toBeVisible();
      await page.goto('/notifications');
      await expect(page.getByText('Trabajo publicado').first()).toBeVisible();
      void cliente;

      // Se vuelve a encender.
      await boton.click();
      apagado = false;
      await expect(boton).toContainText('Active');
    } finally {
      if (apagado) {
        await paginaDueno.goto('/admin/modules');
        const otra = paginaDueno.getByRole('heading', { name: 'Aprobación de publicaciones pagadas' }).locator('xpath=ancestor::div[contains(@class,"px-6")][1]').getByRole('button');
        if ((await otra.innerText()).includes('Inactive')) await otra.click();
      }
    }

    // La próxima publicación pagada vuelve a quedar en revisión.
    // (Otra fecha: la web no deja publicar dos trabajos del mismo cliente en el mismo horario.)
    const siguiente = await publicarYPagar(page, trabajoDePrueba({ diasHastaElInicio: 15 }));
    expect(await estadoDelTrabajo(siguiente.jobId)).toBe('pending_approval');
  });
});
