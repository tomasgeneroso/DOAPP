import { test, expect } from '../ayudas/base';
import { consulta } from '../ayudas/base-de-datos';
import { Persona } from '../ayudas/personas';

/**
 * Pedidos del dueño (2026-11-27), mirados en pantalla: chats cerrados en su pestaña y de solo lectura; los avisos del equipo como avisos (salían como postulaciones vacías); el presupuesto
 * apagado con su motivo cuando ya hay alguien elegido; el cobro en el saldo como UN movimiento con su estado; «ya lo compartiste» en lugar de ofrecer compartir otra vez; y las etiquetas.
 */
test('chats cerrados, avisos del equipo, presupuesto bloqueado, un solo cobro, ya compartido y etiquetas', async ({ page, otraPersona }, info) => {
  test.setTimeout(240_000);
  const yo = Persona.nueva(page, 'equipo');
  await yo.darseDeAlta();
  const otro = Persona.nueva(await otraPersona(), 'companero');
  await otro.darseDeAlta();
  const idDe = async (correo: string) => (await consulta<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [correo]))[0].id;
  const [miId, suId] = [await idDe(yo.correo), await idDe(otro.correo)];
  const sello = Date.now().toString(36);

  const trabajo = async (titulo: string, estado: string, dueno: string, elegidos: string[], dias: number, etiquetas = '{}') =>
    (await consulta<{ id: string }>(
      `INSERT INTO jobs (id, title, summary, description, price, category, tags, location, start_date, end_date, client_id, status, selected_workers, max_workers, publication_paid, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Resumen de prueba', 'Descripción de un trabajo de prueba.', 20000, 'Reparaciones', $6, 'Corrientes', now() + make_interval(days => $5), now() + make_interval(days => $5 + 1), $2, $3, $4, 3, true, now(), now()) RETURNING id`,
      [titulo, dueno, estado, `{${elegidos.join(',')}}`, dias, etiquetas],
    ))[0].id;

  // ── Un trabajo en equipo ya terminado, con su chat y sus avisos ──
  const terminado = await trabajo(`[PRUEBA] Equipo ${sello}`, 'completed', miId, [suId], -3);
  const [{ id: chat }] = await consulta<{ id: string }>(
    `INSERT INTO conversations (id, participants, job_id, type, unread_count, metadata, archived, archived_by, last_message, last_message_at, created_at, updated_at)
     VALUES (gen_random_uuid(), ARRAY[$1::uuid, $2::uuid], $3, 'contract', '{}'::jsonb, '{}'::jsonb, false, ARRAY[]::uuid[], 'Aviso', now(), now(), now()) RETURNING id`,
    [miId, suId, terminado],
  );
  await consulta('UPDATE jobs SET group_chat_id = $2 WHERE id = $1', [terminado, chat]);
  await consulta(
    `INSERT INTO chat_messages (id, conversation_id, sender_id, message, type, metadata, read, deleted, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, '👤 Ana se sumó al equipo (1 de 3).', 'system', jsonb_build_object('jobId', $3::text, 'action', 'equipo_suma', 'equipo', true), false, false, now(), now())`,
    [chat, miId, terminado],
  );

  await page.goto('/messages');
  await expect(page.getByRole('tab', { name: /Chats cerrados/ })).toBeVisible();
  await page.getByRole('tab', { name: /Chats cerrados/ }).click();
  await page.getByText(`[PRUEBA] Equipo ${sello}`).first().click();
  await expect(page.getByTestId('chat-cerrado')).toBeVisible();
  await expect(page.getByTestId('aviso-del-sistema').filter({ hasText: 'Ana se sumó al equipo' })).toBeVisible();
  await expect(page.getByTestId('aviso-del-sistema').filter({ hasText: 'este chat se cierra' })).toBeVisible();
  await expect(page.getByText('Te postulaste a este trabajo')).toHaveCount(0);
  await expect(page.getByPlaceholder('Escribe un mensaje...')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('chat-cerrado.png') });
  await page.goto('/messages');
  await expect(page.getByRole('tab', { name: 'Abiertos' })).toBeVisible();
  await expect(page.getByText(`[PRUEBA] Equipo ${sello}`)).toHaveCount(0);

  // ── Con alguien ya elegido, el presupuesto no se ofrece: se dice por qué ──
  const conElegido = await trabajo(`[PRUEBA] Con elegido ${sello}`, 'open', miId, [suId], 5);
  await page.goto(`/jobs/${conElegido}`);
  await page.getByRole('button', { name: /^Acciones/ }).first().click();
  await expect(page.getByTestId('motivo-sin-cambio-de-presupuesto')).toContainText('Ya elegiste');
  await page.screenshot({ path: info.outputPath('presupuesto-bloqueado.png') });
  await page.goto(`/jobs/${conElegido}/edit`);
  await expect(page.getByTestId('precio-bloqueado')).toBeVisible();

  // ── El cobro: un solo movimiento que dice en qué está ──
  const ajeno = await trabajo(`[PRUEBA] Cobro ${sello}`, 'completed', suId, [miId], -4, '{plomeria}');
  const [{ id: contrato }] = await consulta<{ id: string }>(
    `INSERT INTO contracts (id, job_id, client_id, doer_id, type, price, total_price, start_date, end_date, status, payment_status, escrow_status, terms_accepted, terms_accepted_by_client, terms_accepted_by_doer, client_confirmed, doer_confirmed, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'trabajo', 5000, 5000, now() - interval '4 days', now() - interval '3 days', 'completed', 'pending_payout', 'released', true, true, true, true, true, '2020-01-01', '2020-01-01') RETURNING id`,
    [ajeno, suId, miId],
  );
  for (const texto of [`Pago por contrato #${contrato} - Cobro ${sello}`, `Pago pendiente por trabajo completado: Cobro ${sello}`]) {
    await consulta(
      `INSERT INTO balance_transactions (id, user_id, type, amount, balance_before, balance_after, description, status, related_contract_id, metadata, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'payment', 5000, 0, 5000, $2, 'pending', $3, '{}'::jsonb, now(), now())`,
      [miId, texto, contrato],
    );
  }
  await page.goto('/balance');
  await expect(page.getByText('Pendiente: te lo paga DOAPP')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('saldo.png'), fullPage: true });

  // ── Un trabajo terminado: primero se ofrece compartir; ya compartido, se enlaza ──
  await page.goto('/my-jobs?tab=realizados');
  const tarjeta = page.locator('li, article, div').filter({ hasText: `[PRUEBA] Cobro ${sello}` }).last();
  await expect(tarjeta).toBeVisible();
  const compartido = await page.request.post('/api/posts', { data: { title: `Cobro ${sello}`, description: 'Así quedó el trabajo.', type: 'post', linkedJob: ajeno, tags: ['#Plomería'] } });
  expect(compartido.status(), await compartido.text()).toBeLessThan(300);
  await page.goto(`/portfolio/create?fromJob=${ajeno}`);
  await expect(page.getByText('Ya habías compartido este trabajo').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver trabajo compartido' })).toBeVisible();
  await page.goto('/my-jobs?tab=realizados&compartidos=si');
  await expect(page.getByTestId('trabajo-ya-compartido').first()).toContainText('Ya habías compartido este trabajo');

  // ── Etiquetas: la página junta lo público que la usa ──
  await page.goto('/etiquetas/plomeria');
  await expect(page.getByText(`Cobro ${sello}`).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('etiqueta.png'), fullPage: true });
});
