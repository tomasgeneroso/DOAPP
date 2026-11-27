import { test, expect } from '../ayudas/base';
import { consulta } from '../ayudas/base-de-datos';
import { administradorEn } from '../ayudas/flujos';

/**
 * Reporte del dueño (2026-11-27), con sus mismas cuentas: publica con una cuenta de administración y se postula con una de soporte. «Me mandaron postulación, mandé un mensaje y no apareció;
 * acepto y no queda registrado; no me llegó el aviso; no dice quién aceptó; no veo los detalles del trabajo ni el botón de terminar».
 */
test('quien publica (admin) acepta por Mensajes y las dos partes ven el trabajo y pueden terminarlo', async ({ page, otraPersona }, info) => {
  const publica = await administradorEn(page, 'admin');
  const otra = await otraPersona();
  const trabaja = await administradorEn(otra, 'support');
  const idDe = async (correo: string) => (await consulta<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [correo]))[0].id;
  const cliente = await idDe(publica.correo);

  // El trabajo ya llegó a su hora de inicio, como en el reporte (se publicó para «ahora»).
  const titulo = `[PRUEBA] Flete ${Date.now()}`;
  const [{ id: jobId }] = await consulta<{ id: string }>(
    `INSERT INTO jobs (id, title, summary, description, price, category, location, start_date, end_date, client_id, status, selected_workers, publication_paid, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'Mudanza chica', 'Llevar muebles de un departamento a otro.', 40000, 'Mudanzas', 'Corrientes', now() - interval '1 minute', now() + interval '10 minutes', $2, 'open', ARRAY[]::uuid[], true, now(), now())
     RETURNING id`,
    [titulo, cliente],
  );
  const postulacion = await otra.request.post('/api/proposals', { data: { job: jobId, coverLetter: 'Me interesa el trabajo', proposedPrice: 40000, estimatedDuration: 1 } });
  expect(postulacion.status(), await postulacion.text()).toBe(201);
  const [{ conversation_id: chat }] = await consulta<{ conversation_id: string }>("SELECT conversation_id FROM chat_messages WHERE metadata->>'action' IS NOT NULL AND metadata->>'jobId' = $1 LIMIT 1", [jobId]);

  // ── Quien publica: manda un mensaje desde «Mensajes» y lo ve al instante ──
  await page.goto(`/messages/${chat}`);
  await page.getByPlaceholder('Escribe un mensaje...').fill('Hola, te escribo por el flete');
  await page.getByPlaceholder('Escribe un mensaje...').press('Enter');
  await expect(page.getByText('Hola, te escribo por el flete').last()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Hola, te escribo por el flete').last()).toBeVisible();

  // ── Acepta desde la tarjeta ──
  await page.getByRole('button', { name: 'Aceptar' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aceptar' }).click();
  await page.goto(`/messages/${chat}`);
  await expect(page.getByTestId('quien-acepto').first()).toContainText('La aceptaste vos');

  // ── A quien trabaja le llegó el aviso ──
  await otra.goto('/notifications');
  await expect(otra.getByText('¡Has sido seleccionado!').first()).toBeVisible();

  // ── Las dos partes ven el trabajo, el seguimiento del contrato y cómo terminarlo ──
  for (const [persona, pagina] of [['publica', page], ['trabaja', otra]] as const) {
    await pagina.goto(`/jobs/${jobId}`);
    await expect(pagina.getByRole('heading', { name: titulo }).first()).toBeVisible();
    await expect(pagina.getByTestId('seguimiento-del-contrato')).toBeVisible({ timeout: 20_000 });
    await pagina.screenshot({ path: info.outputPath(`trabajo-visto-por-quien-${persona}.png`), fullPage: true });
    await expect(pagina.getByTestId('terminar-el-trabajo').first()).toBeVisible();
  }
});
