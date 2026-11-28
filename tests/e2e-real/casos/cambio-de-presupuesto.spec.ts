import { test, expect } from '../ayudas/base';
import { consulta } from '../ayudas/base-de-datos';
import { administradorEn } from '../ayudas/flujos';

/**
 * Reglas del dueño (2026-11-27), recorridas en un navegador real con las dos partes:
 *  1. con alguien elegido, quien publica ve lo que va a pasar y lo PIDE; la persona elegida lo acepta; recién ahí cambia, y lo que queda a favor no se puede retirar
 *     hasta que el trabajo termine;
 *  2. si una acción falla y la pantalla no dice nada, aparece el aviso.
 */
const idDe = async (correo: string) => (await consulta<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [correo]))[0].id;

/** Un trabajo publicado y pagado por transferencia (con su pago confirmado: sin él no se puede dejar plata a favor). */
async function trabajoPagado(cliente: string, titulo: string): Promise<string> {
  const [{ id: jobId }] = await consulta<{ id: string }>(
    `INSERT INTO jobs (id, title, summary, description, price, category, location, start_date, end_date, client_id, status, selected_workers, publication_paid, pricing_mode, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Pintar una habitación', 'Pintar las paredes de una habitación mediana.', 40000, 'Pintura', 'Corrientes', now() + interval '3 days', now() + interval '4 days', $2, 'open', ARRAY[]::uuid[], true, 'fixed', now(), now())
     RETURNING id`,
    [titulo, cliente],
  );
  const [{ id: pagoId }] = await consulta<{ id: string }>(
    `INSERT INTO payments (id, payer_id, job_id, amount, currency, status, payment_type, payment_method, approved_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 44000, 'ARS', 'completed', 'job_publication', 'bank_transfer', now(), now(), now()) RETURNING id`,
    [cliente, jobId],
  );
  await consulta('UPDATE jobs SET publication_payment_id = $1 WHERE id = $2', [pagoId, jobId]);
  return jobId;
}

test('con alguien elegido, el presupuesto cambia recién cuando acepta, y lo que queda a favor espera a que el trabajo termine', async ({ page, otraPersona }, info) => {
  const publica = await administradorEn(page, 'admin');
  const otra = await otraPersona();
  const trabaja = await administradorEn(otra, 'support');
  const cliente = await idDe(publica.correo);
  const titulo = `[PRUEBA] Pintura ${Date.now()}`;
  const jobId = await trabajoPagado(cliente, titulo);

  const postulacion = await otra.request.post('/api/proposals', { data: { job: jobId, coverLetter: 'Me interesa pintar', proposedPrice: 40000, estimatedDuration: 1 } });
  expect(postulacion.status(), await postulacion.text()).toBe(201);
  const [{ id: propuesta }] = await consulta<{ id: string }>('SELECT id FROM proposals WHERE job_id = $1', [jobId]);
  const aceptada = await page.request.put(`/api/proposals/${propuesta}/approve`, { data: {} });
  expect(aceptada.ok(), await aceptada.text()).toBeTruthy();

  // ── Quien publica: antes de aceptar ve lo que va a pasar ──
  await page.goto(`/jobs/${jobId}`);
  await page.getByRole('button', { name: /^Acciones$/ }).click();
  await page.getByRole('button', { name: 'Cambiar presupuesto' }).click();
  await page.locator('#presupuesto-nuevo').fill('32000');
  await page.locator('#presupuesto-motivo').fill('Es una habitación más chica de lo previsto');
  await expect(page.getByTestId('aceptar-el-cambio')).toHaveCount(0);
  await page.getByTestId('revisar-el-cambio').click();
  const efectos = page.getByTestId('efectos-del-cambio');
  await expect(efectos).toContainText('tiene que aceptar');
  await expect(efectos).toContainText('cuando el trabajo termine');
  await expect(efectos).toContainText('no se devuelve');
  await page.waitForTimeout(800); // que termine la transición antes de la captura
  await page.screenshot({ path: info.outputPath('1-antes-de-aceptar.png') });
  await page.getByTestId('aceptar-el-cambio').click();
  await expect(page.getByTestId('cambio-de-presupuesto')).toContainText('Falta que responda');
  expect((await consulta<{ price: string }>('SELECT price FROM jobs WHERE id = $1', [jobId]))[0].price).toContain('40000');

  // ── La persona elegida lo ve y acepta (en el celular) ──
  await otra.setViewportSize({ width: 390, height: 844 });
  await otra.goto(`/jobs/${jobId}`);
  const pedido = otra.getByTestId('cambio-de-presupuesto');
  await expect(pedido).toContainText('Te piden cambiar el presupuesto');
  await otra.screenshot({ path: info.outputPath('2-quien-trabaja-lo-ve-en-el-celular.png') });
  await otra.getByTestId('aceptar-presupuesto').click();
  await expect(otra.getByTestId('cambio-de-presupuesto')).toContainText(/ya quedó con el monto nuevo/i);

  const [fila] = await consulta<{ precio: string; contrato: string }>('SELECT j.price AS precio, c.price AS contrato FROM jobs j JOIN contracts c ON c.job_id = j.id WHERE j.id = $1', [jobId]);
  expect([Number(fila.precio), Number(fila.contrato)]).toEqual([32000, 32000]);

  // ── Lo que quedó a favor figura, y dice qué falta para retirarlo ──
  await page.goto('/withdrawals');
  await expect(page.getByTestId('que-falta-para-retirar').first()).toContainText(/trabajo termine/i);
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('3-retiros.png'), fullPage: true });

  await page.goto('/notifications');
  await expect(page.getByText('Aceptaron el cambio de presupuesto').first()).toBeVisible();
});

test('si una acción falla y la pantalla no dice nada, aparece el aviso', async ({ page }, info) => {
  await administradorEn(page, 'admin');
  await page.goto('/');
  await page.route('**/api/prueba-de-falla', (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'El servidor no pudo guardar tu cambio.' }) }));
  // Lo que hace una pantalla que se olvida del error: pide y no mira la respuesta.
  await page.evaluate(() => {
    void fetch('/api/prueba-de-falla', { method: 'POST' }).catch(() => undefined);
    // Mientras tanto aparecen cosas rojas que NO son un cartel de error: el globito de las notificaciones y un botón (así la red se quedaba callada).
    const globito = Object.assign(document.createElement('span'), { className: 'bg-red-500', textContent: '1' });
    const boton = Object.assign(document.createElement('button'), { className: 'text-red-600 border-red-600', textContent: 'Eliminar la publicación' });
    document.body.append(globito, boton);
  });
  await expect(page.getByText('El servidor no pudo guardar tu cambio.')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: info.outputPath('4-aviso-de-falla.png') });
});
