import { test, expect } from '../ayudas/base';
import { Persona } from '../ayudas/personas';
import { consulta } from '../ayudas/base-de-datos';
import { administradorEn, aprobarPublicacion, clienteQueLlegaAlPago, publicarYPagar } from '../ayudas/flujos';
import type { Page } from '@playwright/test';

/**
 * Todo se ve al instante (casos M12, I21 y F22 de la lista de pruebas manuales).
 *
 * Pedido del dueño: los mensajes y las notificaciones, y todo lo de contratos, trabajos y dinero, se actualizan solos en las pantallas que ya están abiertas.
 * Acá hay DOS personas con el navegador abierto: una cambia algo y la otra tiene que verlo SIN recargar la página. Se comprueba con una marca puesta en la
 * página: si la web se hubiera recargado, la marca desaparece y la prueba falla.
 */

const CBU_GALICIA = '0070099220000067797370';

/** Abre una pantalla y espera a que el tiempo real (socket) quede conectado, para que lo que pase después no se pierda. */
async function abrirYEsperarElTiempoReal(page: Page, ruta: string) {
  const conexion = page.waitForEvent('websocket', { predicate: (ws) => ws.url().includes('/socket.io/'), timeout: 20_000 });
  await page.goto(ruta);
  await conexion;
  // El saludo del servidor (autenticación) llega un instante después de abrirse el canal.
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
  });
}

const seguiSinRecargar = (page: Page) => page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga === true);

/** Lo que dice el globito rojo de la campanita (0 si no hay). */
async function numeroDeLaCampanita(page: Page): Promise<number> {
  const texto = await page.getByRole('button', { name: 'Notificaciones' }).first().locator('span').first().textContent({ timeout: 1000 }).catch(() => null);
  if (!texto) return 0;
  return texto.trim() === '9+' ? 10 : Number(texto.trim());
}

async function personaConSaldo(page: Page, monto: number): Promise<Persona> {
  const persona = Persona.nueva(page, 'vivo');
  await persona.darseDeAlta();
  await consulta('UPDATE users SET balance_ars = $2 WHERE lower(email) = lower($1)', [persona.correo, monto]);
  await consulta(
    `INSERT INTO balance_transactions (id, user_id, type, amount, balance_before, balance_after, description, status, metadata, created_at, updated_at)
     SELECT gen_random_uuid(), id, 'adjustment', $2, 0, $2, 'Saldo inicial de la prueba', 'completed', '{}'::jsonb, now(), now() FROM users WHERE lower(email) = lower($1)`,
    [persona.correo, monto],
  );
  return persona;
}

/**
 * Un trabajo EN CURSO entre dos personas ya dadas de alta, con su contrato y la garantía del pago, a punto de terminar (queda poco para la hora de fin:
 * el botón de «terminé el trabajo» se habilita 5 minutos antes). Es la situación que en la vida real lleva días de armar; se prepara en la base de las pruebas
 * y todo lo que pasa DESPUÉS lo hacen las personas con el navegador.
 */
async function prepararTrabajoEnCurso(correoDelCliente: string, correoDelTrabajador: string): Promise<{ jobId: string; contractId: string }> {
  const [cliente] = await consulta<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [correoDelCliente]);
  const [trabajador] = await consulta<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [correoDelTrabajador]);
  const [job] = await consulta<{ id: string }>(
    `INSERT INTO jobs (id, title, summary, description, price, category, location, start_date, end_date, client_id, status, selected_workers, publication_paid, created_at, updated_at)
     VALUES (gen_random_uuid(), '[PRUEBA] Trabajo a punto de terminar', 'Se confirma desde las dos partes', 'Trabajo de prueba para ver cómo se actualizan las pantallas cuando las dos partes confirman.', 10000, 'Reparaciones', 'Almagro',
             now() - interval '2 hours', now() + interval '3 minutes', $1, 'in_progress', ARRAY[$2::uuid], true, now(), now())
     RETURNING id`,
    [cliente.id, trabajador.id],
  );
  const [contrato] = await consulta<{ id: string }>(
    `INSERT INTO contracts (id, job_id, client_id, doer_id, type, price, total_price, start_date, end_date, status, payment_status, escrow_status, terms_accepted, terms_accepted_by_client, terms_accepted_by_doer, client_confirmed, doer_confirmed, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'trabajo', 10000, 10000, now() - interval '2 hours', now() + interval '3 minutes', 'in_progress', 'escrow', 'held_escrow', true, true, true, false, false, now(), now())
     RETURNING id`,
    [job.id, cliente.id, trabajador.id],
  );
  return { jobId: job.id, contractId: contrato.id };
}

test.describe('Tiempo real · todo se ve al instante', () => {
  test('M12 · el administrador aprueba la publicación: la campanita y la lista de notificaciones del cliente se actualizan SIN recargar', async ({ page, otraPersona }) => {
    await clienteQueLlegaAlPago(page);
    const trabajo = await publicarYPagar(page);

    // El cliente deja abierta SU lista de notificaciones: ahí escuchan a la vez la campanita del menú y la lista (antes una pisaba a la otra).
    await abrirYEsperarElTiempoReal(page, '/notifications');
    await expect(page.getByText('Publicación aprobada')).toHaveCount(0);
    const antes = await numeroDeLaCampanita(page);

    const paginaAdmin = await otraPersona();
    await administradorEn(paginaAdmin);
    await aprobarPublicacion(paginaAdmin, trabajo.datos.titulo);

    // Sin tocar nada: aparece la notificación en la lista y la campanita suma uno.
    await expect(page.getByText('Publicación aprobada').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(trabajo.datos.titulo).first()).toBeVisible();
    await expect.poll(() => numeroDeLaCampanita(page), { timeout: 10_000 }).toBe(antes + 1);
    expect(await seguiSinRecargar(page)).toBe(true);
    await page.screenshot({ path: 'tests/e2e-real/.registros/L1-notificacion-en-vivo.png' });

    // Y en la base hay UNA sola notificación (no una por cada camino que avisa).
    const filas = await consulta<{ n: string }>(`SELECT count(*) AS n FROM notifications WHERE title = 'Publicación aprobada' AND message LIKE $1`, [`%${trabajo.datos.titulo}%`]);
    expect(Number(filas[0].n)).toBe(1);
  });

  test('I21 · un retiro: la administración lo ve aparecer, lo rechaza, y la persona ve el cambio y recupera su saldo SIN recargar', async ({ page, otraPersona }) => {
    const persona = await personaConSaldo(page, 5000);

    // La administración deja abierta su lista de retiros.
    const paginaAdmin = await otraPersona();
    await administradorEn(paginaAdmin);
    await abrirYEsperarElTiempoReal(paginaAdmin, '/admin/withdrawals');

    // La persona pide el retiro.
    await page.goto('/withdrawals');
    await expect(page.getByRole('heading', { name: 'Nueva Solicitud' })).toBeVisible();
    await page.getByRole('radio', { name: /Cargar una cuenta|Otra cuenta/ }).check();
    await page.locator('form input[type=text]').first().fill('Vivo Prueba');
    await page.locator('form select').first().selectOption('Banco Galicia');
    await page.locator('input.font-mono').fill(CBU_GALICIA);
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Solicitud de retiro enviada' })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
    });

    // La administración lo ve aparecer, sin recargar.
    const fila = paginaAdmin.locator('tbody tr').filter({ hasText: persona.correo });
    await expect(fila).toBeVisible({ timeout: 10_000 });
    expect(await seguiSinRecargar(paginaAdmin)).toBe(true);
    await paginaAdmin.screenshot({ path: 'tests/e2e-real/.registros/L2-administracion-ve-el-retiro.png' });

    // La administración lo rechaza (abre el detalle, escribe el motivo y confirma).
    // La pantalla pregunta «¿Rechazar este retiro?» con un cuadro del navegador: la persona toca Aceptar.
    paginaAdmin.on('dialog', (d) => void d.accept());
    await fila.getByRole('button', { name: /Ver detalle/i }).click();
    await paginaAdmin.getByPlaceholder('Explicá por qué se rechaza esta solicitud').fill('Prueba de tiempo real: se rechaza para ver el cambio en vivo');
    await paginaAdmin.getByRole('button', { name: 'Rechazar solicitud' }).click();

    // La persona lo ve sin tocar nada: el retiro figura rechazado y puede volver a pedir.
    await expect(page.getByText('Rechazado').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ya tenés un retiro en curso')).toBeHidden();
    expect(await seguiSinRecargar(page)).toBe(true);
    await page.screenshot({ path: 'tests/e2e-real/.registros/L2-persona-ve-el-rechazo.png', fullPage: true });
  });

  test('F22 · las dos partes confirman que el trabajo terminó: cada una ve el cambio de la otra y el dueño ve «completado», SIN recargar', async ({ page, otraPersona }) => {
    const dueno = Persona.nueva(page, 'dueno');
    await dueno.darseDeAlta();
    const paginaDelTrabajador = await otraPersona();
    const trabajador = Persona.nueva(paginaDelTrabajador, 'obrero');
    await trabajador.darseDeAlta();
    const { jobId, contractId } = await prepararTrabajoEnCurso(dueno.correo, trabajador.correo);

    // Las dos personas dejan abierta la pantalla del trabajo.
    await abrirYEsperarElTiempoReal(page, `/jobs/${jobId}`);
    await abrirYEsperarElTiempoReal(paginaDelTrabajador, `/jobs/${jobId}`);
    const confirmar = (p: Page) => p.getByRole('button', { name: /Confirmar finalización del trabajo|Confirmar mi trabajo|Confirmar trabajo hecho/i }).first();
    await expect(confirmar(page)).toBeVisible({ timeout: 15_000 });
    await expect(confirmar(paginaDelTrabajador)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'tests/e2e-real/.registros/L3-antes-dueno.png', fullPage: true });

    // El trabajador toca «terminé»: se guarda su confirmación.
    await confirmar(paginaDelTrabajador).click();
    await expect.poll(async () => (await consulta<{ doer_confirmed: boolean }>('SELECT doer_confirmed FROM contracts WHERE id = $1', [contractId]))[0].doer_confirmed, { timeout: 15_000 }).toBe(true);
    await paginaDelTrabajador.screenshot({ path: 'tests/e2e-real/.registros/L3-trabajador-confirmo.png', fullPage: true });

    // El dueño, que no tocó nada, ya ve que el trabajo espera su confirmación (antes seguía «En progreso» hasta recargar).
    await expect(page.getByText('Esperando confirmación').first()).toBeVisible({ timeout: 15_000 });
    expect(await seguiSinRecargar(page)).toBe(true);
    await page.screenshot({ path: 'tests/e2e-real/.registros/L3-dueno-ve-que-falta-su-confirmacion.png', fullPage: true });

    // El dueño toca «terminó»: las dos partes confirmaron, el contrato y el trabajo quedan completados.
    await confirmar(page).click();
    await expect.poll(async () => (await consulta<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [contractId]))[0].status, { timeout: 15_000 }).toBe('completed');
    await expect.poll(async () => (await consulta<{ status: string }>('SELECT status FROM jobs WHERE id = $1', [jobId]))[0].status, { timeout: 15_000 }).toBe('completed');

    // El trabajador, que NO tocó nada después, ve el trabajo completado sin recargar (antes la pantalla de la otra parte se quedaba «en curso»).
    await expect(paginaDelTrabajador.getByText(/completad/i).first()).toBeVisible({ timeout: 15_000 });
    expect(await seguiSinRecargar(paginaDelTrabajador)).toBe(true);
    await expect(confirmar(paginaDelTrabajador)).toBeHidden();
    await paginaDelTrabajador.screenshot({ path: 'tests/e2e-real/.registros/L3-trabajador-ve-completado.png', fullPage: true });
    // Y el dueño ve lo mismo en la suya.
    await expect(page.getByText(/completad/i).first()).toBeVisible();
    expect(await seguiSinRecargar(page)).toBe(true);
    await page.screenshot({ path: 'tests/e2e-real/.registros/L3-dueno-ve-completado.png', fullPage: true });
  });
});
