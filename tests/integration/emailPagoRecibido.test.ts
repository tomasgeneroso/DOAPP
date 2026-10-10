import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * El email «Recibimos tu pago».
 *
 * Lleva texto que escribe la gente (el título del trabajo, el nombre), así que se escapa antes de entrar al HTML: un
 * título como `<script>…</script>` no puede terminar siendo código dentro del correo. Y respeta las preferencias: quien
 * apagó los avisos de pagos o el email no recibe nada.
 */
describe('email de pago recibido', () => {
  let usuario: any;
  let emailService: any;
  const enviados: Array<{ userId: string; asunto: string; html: string }> = [];

  beforeAll(async () => {
    emailService = (await import('../../server/services/email.js')).default;
    usuario = await crearUsuario({
      role: 'client',
      name: 'Ana <i>Prueba</i>',
      notificationPreferences: { email: true, paymentUpdate: true },
    });
    jest.spyOn(emailService, 'sendToUser').mockImplementation((async (userId: string, asunto: string, html: string) => {
      enviados.push({ userId, asunto, html });
      return true;
    }) as any);
  });

  afterEach(() => { enviados.length = 0; });

  afterAll(async () => {
    jest.restoreAllMocks();
    try { await User.destroy({ where: { id: usuario.id }, force: true }); } catch { /* ok */ }
  });

  it('escapa el HTML del título del trabajo y del nombre, y lleva el monto y el botón al detalle', async () => {
    await emailService.sendPagoRecibido(usuario.id, {
      titulo: 'Recibimos tu pago',
      mensaje: 'Tu pago por "<script>alert(1)</script>" quedó registrado.',
      monto: 1234.5,
      ruta: '/contracts/abc-123',
    });

    expect(enviados).toHaveLength(1);
    const { html, asunto } = enviados[0];
    expect(asunto).toBe('Recibimos tu pago');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<i>Prueba</i>');
    expect(html).toContain('&lt;i&gt;Prueba&lt;/i&gt;');
    expect(html).toContain('/contracts/abc-123');
    expect(html).toMatch(/1\.?234,5/);
  });

  it('si el usuario apagó los avisos de pagos, no se manda nada', async () => {
    await User.update({ notificationPreferences: { email: true, paymentUpdate: false } } as any, { where: { id: usuario.id } });

    await emailService.sendPagoRecibido(usuario.id, { titulo: 'Recibimos tu pago', mensaje: 'x' });

    expect(enviados).toHaveLength(0);
  });

  it('sin monto no inventa uno', async () => {
    await User.update({ notificationPreferences: { email: true, paymentUpdate: true } } as any, { where: { id: usuario.id } });

    await emailService.sendPagoRecibido(usuario.id, { titulo: 'Recibimos tu pago', mensaje: 'Sin monto' });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].html).not.toContain('NaN');
    expect(enviados[0].html).not.toContain('$undefined');
  });
});
