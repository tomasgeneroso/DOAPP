import type { Page } from '@playwright/test';
import { test, expect } from '../ayudas/base';
import { administradorEn, clienteQueLlegaAlPago, estadoDelTrabajo, pagosDelTrabajo, publicarYLlegarAlPago } from '../ayudas/flujos';
import { comprobante, completarYaPague, cuentaDeDoapp, elegirTransferencia, type DatosDeLaOperacion } from '../ayudas/transferencia';
import { consulta } from '../ayudas/base-de-datos';

/**
 * Parte B de la lista de pruebas manuales: publicar pagando por transferencia bancaria. El pago no es automático: el cliente sube un comprobante y un
 * administrador lo aprueba o lo rechaza.
 *
 * Los datos de la cuenta de DOAPP salen del servidor (variables BANK_*): las pruebas las cargan con valores propios, y se comprueba que la pantalla muestra
 * ESOS y no los de ejemplo del código. Que en producción estén cargados los reales sigue siendo manual (es configuración del servidor, no del código).
 */

/** El cliente deja el pago hecho: transferencia elegida, datos y comprobante cargados, «Completar pago» tocado. */
async function pagarPorTransferencia(page: Page, titulo: string): Promise<DatosDeLaOperacion> {
  await elegirTransferencia(page);
  const operacion = await completarYaPague(page);
  await page.getByRole('button', { name: 'Completar pago' }).click();
  await expect(page).toHaveURL(/\/my-jobs/, { timeout: 30_000 });
  await expect.poll(async () => (await pagosDelTrabajo(titulo)).length).toBe(1);
  return operacion;
}

/** El administrador abre «Pagos pendientes» → «Pendiente Verificación» y devuelve la fila del pago de ese trabajo. */
async function filaDelPagoPendiente(admin: Page, titulo: string) {
  await admin.goto('/admin/pending-payments');
  await admin.getByRole('button', { name: /Pendiente Verificación/ }).click();
  const fila = admin.getByRole('row').filter({ hasText: titulo });
  await expect(fila).toBeVisible();
  return fila;
}

test.describe('B · publicar pagando por transferencia bancaria', () => {
  test('B1 · transferir, subir el comprobante y que el administrador lo apruebe', async ({ page, otraPersona }) => {
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);

    // Se muestran titular, CUIT, banco, CBU y alias de DOAPP: los reales (los cargados en el servidor), no los de ejemplo del código.
    await elegirTransferencia(page);
    expect(await cuentaDeDoapp(page)).toEqual({ titular: 'DOAPP PRUEBAS', cuit: '30-00000000-7', banco: 'Banco de Pruebas', cbu: '0170099220000067797370', alias: 'doapp.pruebas' });
    const cuerpo = await page.locator('body').innerText();
    for (const deEjemplo of ['DOAPP S.R.L.', 'Banco Galicia', '0070099920000123456789']) expect(cuerpo).not.toContain(deEjemplo.replace('Banco Galicia', 'Banco Galicia\u0000'));

    // Sube el comprobante: el pago queda pendiente de verificación y el trabajo NO está publicado.
    const operacion = await completarYaPague(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    await expect(page).toHaveURL(/\/my-jobs/, { timeout: 30_000 });
    await expect.poll(async () => (await pagosDelTrabajo(trabajo.datos.titulo)).length).toBe(1);
    const [pago] = await pagosDelTrabajo(trabajo.datos.titulo);
    expect(pago.status).toBe('pending_verification');
    expect(Number(pago.amount)).toBe(trabajo.totalEnDoapp);
    expect(await estadoDelTrabajo(trabajo.jobId)).not.toBe('open');

    // El administrador abre ese pago: ve el comprobante, el monto y quién lo subió.
    const admin = await otraPersona();
    await administradorEn(admin);
    const fila = await filaDelPagoPendiente(admin, trabajo.datos.titulo);
    await expect(fila).toContainText(cliente.correo);
    await expect(fila).toContainText('16172.14');
    await expect(fila.getByText('Ver', { exact: true })).toBeVisible();

    // Lo aprueba (comprobante propio, referencia, monto y fecha) y confirma la garantía.
    const avisos: string[] = [];
    admin.on('dialog', (d) => {
      avisos.push(d.message());
      void d.accept();
    });
    await fila.getByTitle('Verificar comprobante').click();
    await admin.locator('input[type=file]').last().setInputFiles(comprobante('extracto-del-banco.png'));
    await admin.getByPlaceholder('Ej: TRX-123456789').fill(operacion.numero);
    await admin.getByRole('button', { name: 'Verificar Comprobante', exact: true }).click();
    await expect.poll(() => avisos.length).toBeGreaterThan(0);
    expect(avisos[0]).toContain('Comprobante verificado');

    // Aprobado el comprobante, el trabajo pasa a Abierto (el pago queda completado) y el cliente recibe una notificación.
    await expect.poll(() => estadoDelTrabajo(trabajo.jobId), { timeout: 20_000 }).toBe('open');
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).map((p) => p.status)).toEqual(['completed']);
    await page.goto('/notifications');
    await expect(page.getByText(trabajo.datos.titulo).first()).toBeVisible();
    expect((await consulta<{ title: string }>('SELECT n.title FROM notifications n JOIN users u ON u.id = n.recipient_id WHERE lower(u.email) = lower($1)', [cliente.correo])).map((n) => n.title)).toContain('Pago aprobado');
  });

  test('B2 · el administrador rechaza el comprobante: el cliente lee el motivo, el trabajo sigue sin publicar y puede presentar otro', async ({ page, otraPersona }) => {
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    const primera = await pagarPorTransferencia(page, trabajo.datos.titulo);

    // El administrador lo rechaza escribiendo un motivo.
    const admin = await otraPersona();
    await administradorEn(admin);
    admin.on('dialog', (d) => void d.accept());
    const fila = await filaDelPagoPendiente(admin, trabajo.datos.titulo);
    await fila.getByTitle('Rechazar pago').click();
    const motivo = 'El comprobante no muestra el monto transferido.';
    await admin.getByPlaceholder('Ej: El comprobante no corresponde al monto indicado...').fill(motivo);
    await admin.getByRole('button', { name: 'Confirmar Rechazo' }).click();
    await expect.poll(async () => (await pagosDelTrabajo(trabajo.datos.titulo))[0].status).toMatch(/rejected|failed/);

    // El cliente recibe el motivo, y el trabajo sigue sin publicar.
    await expect
      .poll(async () => (await consulta('SELECT 1 FROM notifications n JOIN users u ON u.id = n.recipient_id WHERE lower(u.email) = lower($1) AND n.message ILIKE $2', [cliente.correo, `%${motivo}%`])).length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    expect(await estadoDelTrabajo(trabajo.jobId)).not.toBe('open');

    // Como cliente sube otro comprobante (con otro número de operación): se puede volver a presentar.
    await page.goto(`/jobs/${trabajo.jobId}/payment`);
    await elegirTransferencia(page);
    const segunda = await completarYaPague(page);
    expect(segunda.numero).not.toBe(primera.numero);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    await expect(page).toHaveURL(/\/my-jobs/, { timeout: 30_000 });

    // El administrador ve primero el comprobante más nuevo.
    await expect
      .poll(async () => (await consulta('SELECT status FROM payments WHERE description = $1 ORDER BY created_at DESC LIMIT 1', ['Publicación: ' + trabajo.datos.titulo]))[0]?.status)
      .toBe('pending_verification');
    const filaNueva = await filaDelPagoPendiente(admin, trabajo.datos.titulo);
    await filaNueva.getByText('Ver', { exact: true }).first().click();
    const visor = admin.locator('body');
    await expect(visor).toContainText(segunda.numero);
    const cuerpo = await visor.innerText();
    if (cuerpo.includes(primera.numero)) expect(cuerpo.indexOf(segunda.numero)).toBeLessThan(cuerpo.indexOf(primera.numero));
  });

  test('B3 · un archivo que no corresponde (.exe, .txt o demasiado pesado) se rechaza con un mensaje claro y no queda nada a medio guardar', async ({ page }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await elegirTransferencia(page);

    // Por la pantalla: cada archivo malo recibe su mensaje y no queda cargado.
    const malos: Array<[string, ReturnType<typeof comprobante>, RegExp]> = [
      ['un .exe', comprobante('virus.exe', 'application/x-msdownload', Buffer.from('MZ')), /PDF, un JPG o un PNG/],
      ['un .txt', comprobante('nota.txt', 'text/plain', Buffer.from('hola')), /PDF, un JPG o un PNG/],
      ['uno muy pesado', comprobante('enorme.png', 'image/png', Buffer.alloc(6 * 1024 * 1024)), /pesa más de 5 MB/],
    ];
    await page.getByRole('button', { name: /Ya pagué/ }).click();
    for (const [, archivo, mensaje] of malos) {
      await page.locator('#tf-archivo').setInputFiles(archivo);
      await expect(page.getByRole('alert').filter({ hasText: mensaje })).toBeVisible();
      await expect(page.getByAltText('Vista previa del comprobante')).toHaveCount(0);
    }
    expect(await pagosDelTrabajo(trabajo.datos.titulo)).toHaveLength(0);

    // Por la API directa (alguien que se saltea la pantalla): el servidor también los rechaza y no guarda nada.
    const operacion = await completarYaPague(page);
    await page.getByRole('button', { name: 'Completar pago' }).click();
    await expect(page).toHaveURL(/\/my-jobs/, { timeout: 30_000 });
    const [pago] = await pagosDelTrabajo(trabajo.datos.titulo);
    const antes = (await consulta('SELECT id FROM payment_proofs WHERE payment_id = $1', [pago.id])).length;
    for (const [, archivo] of malos) {
      const r = await page.request.post(`/api/payments/${pago.id}/upload-proof`, {
        multipart: { proof: archivo, bankReference: operacion.numero + 'x', senderName: 'Carla Prueba', transferAmount: String(trabajo.totalEnDoapp) },
      });
      expect(r.status(), `subir ${archivo.name}`).toBeGreaterThanOrEqual(400);
      expect(r.status()).toBeLessThan(500);
      expect(JSON.stringify(await r.json())).toMatch(/JPEG|JPG|PNG|PDF|archivo|pesa|tamaño|large/i);
    }
    expect((await consulta('SELECT id FROM payment_proofs WHERE payment_id = $1', [pago.id])).length).toBe(antes);
  });

  test('B4 · un comprobante ajeno no se puede ver: sin sesión da 401, un intruso 403, y lo ven el dueño del pago y el administrador', async ({ page, otraPersona }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    await pagarPorTransferencia(page, trabajo.datos.titulo);
    const [{ file_url: direccion }] = await consulta<{ file_url: string }>('SELECT pr.file_url FROM payment_proofs pr JOIN payments p ON p.id = pr.payment_id WHERE p.description = $1', ['Publicación: ' + trabajo.datos.titulo]);

    // El dueño del pago lo ve.
    expect((await page.request.get(direccion)).status()).toBe(200);

    // En una ventana privada (sin sesión): no autorizado.
    const privada = await otraPersona();
    expect((await privada.request.get(direccion)).status()).toBe(401);

    // Un intruso (otra cuenta, con sesión): prohibido.
    const paginaIntruso = await otraPersona();
    await clienteQueLlegaAlPago(paginaIntruso, 'intruso');
    expect((await paginaIntruso.request.get(direccion)).status()).toBe(403);

    // El equipo de administración lo ve.
    const paginaAdmin = await otraPersona();
    await administradorEn(paginaAdmin);
    expect((await paginaAdmin.request.get(direccion)).status()).toBe(200);
  });

  test('B5 · aprobar dos veces seguidas muy rápido: el trabajo se publica una sola vez y sin error', async ({ page, otraPersona }) => {
    const cliente = await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYLlegarAlPago(page);
    const operacion = await pagarPorTransferencia(page, trabajo.datos.titulo);

    const admin = await otraPersona();
    await administradorEn(admin);
    const avisos: string[] = [];
    admin.on('dialog', (d) => {
      avisos.push(d.message());
      void d.accept();
    });
    const fila = await filaDelPagoPendiente(admin, trabajo.datos.titulo);
    await fila.getByTitle('Verificar comprobante').click();
    await admin.locator('input[type=file]').last().setInputFiles(comprobante('extracto-del-banco.png'));
    await admin.getByPlaceholder('Ej: TRX-123456789').fill(operacion.numero);
    // Dos toques seguidos al mismo botón.
    await admin.getByRole('button', { name: 'Verificar Comprobante', exact: true }).dblclick();
    await expect.poll(() => estadoDelTrabajo(trabajo.jobId), { timeout: 20_000 }).toBe('open');
    await expect.poll(() => avisos.length).toBeGreaterThan(0);
    // Un solo cuadro de aviso, el del éxito: el segundo toque no llegó a hacer nada ni mostró un error.
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Comprobante verificado');

    // Y por la API, dos aprobaciones al mismo tiempo sobre el mismo pago: ninguna rompe (nada de 500) y no se duplica nada.
    const [pago] = await pagosDelTrabajo(trabajo.datos.titulo);
    const token = await admin.evaluate(() => localStorage.getItem('token'));
    const cuerpo = { bankReference: operacion.numero, transferAmount: String(pago.amount), transferDate: new Date().toISOString().slice(0, 10), notes: 'otra vez', proofUrl: '/uploads/payment-proofs/x.png' };
    const respuestas = await Promise.all([1, 2].map(() => admin.request.post(`/api/admin/payments/${pago.id}/approve`, { headers: { Authorization: `Bearer ${token}` }, data: cuerpo })));
    // Ya está aprobado: el servidor contesta que no se vuelve a aprobar (409), no un error.
    for (const r of respuestas) expect(r.status()).toBe(409);

    expect(await estadoDelTrabajo(trabajo.jobId)).toBe('open');
    expect((await pagosDelTrabajo(trabajo.datos.titulo)).map((p) => p.status)).toEqual(['completed']);
    expect(await consulta('SELECT id FROM jobs WHERE title = $1', [trabajo.datos.titulo])).toHaveLength(1);
    const avisosAlCliente = await consulta('SELECT n.id FROM notifications n JOIN users u ON u.id = n.recipient_id WHERE lower(u.email) = lower($1) AND n.title = $2', [cliente.correo, 'Pago aprobado']);
    // Una aprobación deja dos avisos al cliente (el del trabajo publicado y el del pago). Antes, con tres aprobaciones eran seis.
    expect(avisosAlCliente).toHaveLength(2);
    expect(await consulta('SELECT id FROM audit_logs WHERE action = $1 AND "targetId" = $2', ['payment.approve', pago.id])).toHaveLength(1);
  });
});
