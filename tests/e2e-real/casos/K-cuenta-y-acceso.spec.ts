import { test, expect } from '../ayudas/base';
import { Persona } from '../ayudas/personas';
import { correo } from '../ayudas/gemelos-cliente';

/**
 * Parte K de la lista de pruebas manuales: cuenta y acceso. Cada prueba lleva el número del caso de la lista.
 */
test.describe('K · cuenta y acceso', () => {
  test('K1/K49/K58 · registrarse con correo y contraseña, verificar la identidad y confirmar el correo', async ({ page }) => {
    const persona = Persona.nueva(page, 'carla');
    await persona.registrarse();

    // Al terminar el registro todavía no hay sesión abierta: primero hay que confirmar el correo (K49).
    const mail = await correo.esperar(persona.correo, /Confirmá tu email/i);
    expect(mail.enlaces.some((e) => /verify-email\?token=/.test(e))).toBe(true);

    await persona.confirmarElCorreo();
    await persona.ingresar();
    await page.waitForURL((u) => !/\/(login|register|verify-email)/.test(u.pathname));
    await expect(page.locator('#root')).not.toBeEmpty();
  });
});
