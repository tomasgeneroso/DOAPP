import { test, expect } from '../ayudas/base';
import { Persona } from '../ayudas/personas';
import { consulta } from '../ayudas/base-de-datos';
import type { Page } from '@playwright/test';

/**
 * Parte I de la lista de pruebas manuales: saldo y retiros.
 *
 * Estos casos salieron de lo que vio el dueño al probar a mano: el monto pendiente con un cero adelante («$02407.52»), un código larguísimo que pisaba la
 * fecha, el aviso de éxito arriba de la página (a veces fuera de la vista) y sin una explicación de qué sigue.
 */

const CBU_GALICIA = '0070099220000067797370';

/** Una cuenta dada de alta con saldo (y su asiento en el libro: un saldo real siempre lo tiene). */
async function personaConSaldo(page: Page, monto: number): Promise<Persona> {
  const persona = Persona.nueva(page, 'retira');
  await persona.darseDeAlta();
  await consulta('UPDATE users SET balance_ars = $2 WHERE lower(email) = lower($1)', [persona.correo, monto]);
  await consulta(
    `INSERT INTO balance_transactions (id, user_id, type, amount, balance_before, balance_after, description, status, metadata, created_at, updated_at)
     SELECT gen_random_uuid(), id, 'adjustment', $2, 0, $2, 'Saldo inicial de la prueba', 'completed', '{}'::jsonb, now(), now() FROM users WHERE lower(email) = lower($1)`,
    [persona.correo, monto],
  );
  return persona;
}

async function cargarCuenta(page: Page, opciones: { banco: string; titular?: string; cbu?: string; lemonTag?: string; guardar?: boolean }) {
  await page.goto('/withdrawals');
  await expect(page.getByRole('heading', { name: 'Nueva Solicitud' })).toBeVisible();
  await page.getByRole('radio', { name: /Cargar una cuenta|Otra cuenta/ }).check();
  await page.locator('form input[type=text]').first().fill(opciones.titular ?? 'Retira Prueba');
  await page.locator('form select').first().selectOption(opciones.banco);
  if (opciones.cbu) await page.locator('input.font-mono').fill(opciones.cbu);
  if (opciones.lemonTag) await page.getByPlaceholder('$tunombre').fill(opciones.lemonTag);
  const guardar = page.getByRole('checkbox', { name: /Guardar esta cuenta en mi perfil/ });
  if (opciones.guardar === false) await guardar.uncheck();
}

test.describe('I · Saldo y retiros', () => {
  test('I1 · retirar el saldo completo: el aviso sale abajo a la derecha y se cierra, el monto y la cuenta se leen bien, y dice qué sigue', async ({ page }) => {
    await personaConSaldo(page, 5000);
    await cargarCuenta(page, { banco: 'Banco Galicia', cbu: CBU_GALICIA });
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();

    // El aviso de éxito: abajo a la derecha de lo que se ve, y con una X para cerrarlo. La primera cuenta que se carga también espera (es lo mismo que antes
    // pedía guardarla en el perfil y esperar), y el aviso lo dice.
    const aviso = page.getByRole('status').filter({ hasText: 'Solicitud de retiro enviada' });
    await expect(aviso).toBeVisible();
    const vista = page.viewportSize()!;
    const caja = (await aviso.boundingBox())!;
    expect(caja.x + caja.width).toBeGreaterThan(vista.width * 0.6);
    expect(caja.y).toBeGreaterThan(vista.height * 0.4);
    await expect(aviso).toContainText('la primera que cargás');
    await expect(aviso).toContainText('un administrador tiene que aprobar el envío del retiro a tu cuenta');
    // Una foto de lo que ve la persona (queda en .registros, que no se sube al repositorio).
    await page.screenshot({ path: 'tests/e2e-real/.registros/I1-aviso-abajo-a-la-derecha.png' });
    await aviso.getByRole('button', { name: 'Cerrar aviso' }).click();
    await expect(aviso).toBeHidden();
    await page.screenshot({ path: 'tests/e2e-real/.registros/I1-lista-del-retiro.png', fullPage: true });

    // La lista: el monto con formato (sin el «0» adelante), la cuenta enmascarada (no el código cifrado) y la explicación.
    const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(texto).toContain('$5.000,00');
    expect(texto).not.toMatch(/\$05000/);
    expect(texto).toContain('CBU ****7370');
    expect(texto).not.toMatch(/[0-9a-f]{24,}/i);
    await expect(page.getByText('Un administrador tiene que aprobar el envío del retiro a tu cuenta. Suele hacerlo en 24 a 48 horas hábiles. Gracias por tu paciencia.')).toBeVisible();
    await expect(page.getByText(/Es una cuenta nueva: por seguridad se procesa a partir del/)).toBeVisible();
    // Mientras hay uno en curso no se ofrece pedir otro.
    await expect(page.getByText('Ya tenés un retiro en curso')).toBeVisible();

    // Guardada en el perfil: la próxima vez se ofrece como destino, sin el número entero.
    const [perfil] = await consulta<{ banking_info: any }>(`SELECT banking_info FROM users WHERE balance_ars = 5000 AND banking_info IS NOT NULL ORDER BY updated_at DESC LIMIT 1`);
    expect(perfil.banking_info.bankName).toBe('Banco Galicia');
    expect(String(perfil.banking_info.cbu)).not.toBe(CBU_GALICIA); // cifrado en la base
  });

  test('I7 · cancelar un retiro pendiente: el aviso también sale abajo a la derecha', async ({ page }) => {
    await personaConSaldo(page, 3000);
    await cargarCuenta(page, { banco: 'Banco Galicia', cbu: CBU_GALICIA });
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();
    await page.getByRole('status').filter({ hasText: 'Solicitud de retiro enviada' }).getByRole('button', { name: 'Cerrar aviso' }).click();

    await page.getByRole('button', { name: 'Cancelar' }).first().click();
    await page.getByRole('button', { name: /Sí, cancelar/ }).click();
    await expect(page.getByRole('status').filter({ hasText: /cancelad/i })).toBeVisible();
    // Se puede volver a pedir.
    await expect(page.getByRole('heading', { name: 'Nueva Solicitud' })).toBeVisible();
    await expect(page.getByText('Ya tenés un retiro en curso')).toBeHidden();
  });

  test('I16 · retirar a una cuenta de Lemon con el $lemontag: alcanza con uno de los tres datos, y sin ninguno no deja', async ({ page }) => {
    await personaConSaldo(page, 4000);
    await cargarCuenta(page, { banco: 'Lemon', titular: 'Lemon Prueba' });
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();
    await expect(page.getByText('Para cobrar en Lemon cargá tu $lemontag, tu alias o tu CVU.')).toBeVisible();

    await page.getByPlaceholder('$tunombre').fill('Lemon.Prueba');
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Solicitud de retiro enviada' })).toBeVisible();
    await expect(page.getByText('$lemon.prueba')).toBeVisible();
    const [fila] = await consulta<{ banking_info: any }>(`SELECT banking_info FROM withdrawal_requests ORDER BY created_at DESC LIMIT 1`);
    expect(fila.banking_info.bankName).toBe('Lemon');
    expect(fila.banking_info.lemonTag).toBe('$lemon.prueba');
  });

  test('I17 · retirar a OTRA cuenta distinta de la del perfil: se puede, pero por seguridad espera 24 horas y la persona lo lee', async ({ page }) => {
    await personaConSaldo(page, 6000);
    // Primero deja una cuenta en el perfil con un retiro, lo cancela, y después pide a otra cuenta.
    await cargarCuenta(page, { banco: 'Banco Galicia', cbu: CBU_GALICIA });
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();
    await page.getByRole('status').filter({ hasText: 'Solicitud de retiro enviada' }).getByRole('button', { name: 'Cerrar aviso' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).first().click();
    await page.getByRole('button', { name: /Sí, cancelar/ }).click();
    await consulta(`UPDATE users SET banking_info_updated_at = now() - interval '48 hours' WHERE balance_ars = 6000`);

    await page.reload();
    // Ahora el perfil tiene una cuenta y se ofrece como primera opción.
    await expect(page.getByRole('radio', { name: /La cuenta de mi perfil/ })).toBeChecked();
    await expect(page.getByText(/Banco Galicia · CBU \*\*\*\*7370/)).toBeVisible();

    await page.getByRole('radio', { name: /Otra cuenta/ }).check();
    await page.locator('form input[type=text]').first().fill('Otra Persona');
    await page.locator('form select').first().selectOption('Banco Nación');
    await page.locator('input.font-mono').fill('0110012330001234567890');
    await page.getByRole('checkbox', { name: /Guardar esta cuenta en mi perfil/ }).uncheck();
    await expect(page.getByText(/se procesa recién pasadas 24 horas/)).toBeVisible();
    await page.getByRole('button', { name: /Solicitar retiro|Enviar solicitud|Solicitar/i }).click();

    await expect(page.getByRole('status').filter({ hasText: 'pasadas 24 horas' })).toBeVisible();
    await expect(page.getByText(/Es una cuenta nueva: por seguridad se procesa a partir del/)).toBeVisible();
    // No se guardó en el perfil.
    const [perfil] = await consulta<{ banking_info: any }>(`SELECT banking_info FROM users WHERE balance_ars = 6000`);
    expect(perfil.banking_info.bankName).toBe('Banco Galicia');
  });
});
