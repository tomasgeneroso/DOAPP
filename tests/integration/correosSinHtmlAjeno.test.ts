import { describe, it, expect, jest, afterAll } from '@jest/globals';

/**
 * Los correos de la plataforma no llevan HTML de otras personas (auditoría de seguridad, 2026-11-24).
 * Antes el mensaje de un chat, un nombre o el título de un trabajo se pegaban tal cual en el HTML: un mensaje con un enlace puesto llegaba a otra persona en un correo
 * con la marca de DOAPP (phishing con la firma buena).
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import emailService from '../../server/services/email.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { escaparHtml, desescaparHtml, escaparTextoDeLosCorreos } from '../../server/utils/escaparHtml.js';

const ENLACE_MALO = '<a href="https://doapp-verificacion.example/login">Verificá tu identidad acá</a> <img src="https://rastreo.example/p.gif">';

describe('correos sin HTML ajeno', () => {
  let usuario: any;
  afterAll(async () => { if (usuario) await User.destroy({ where: { id: usuario.id }, force: true }); });

  const capturar = async (hacer: (id: string) => Promise<void>): Promise<{ asunto: string; html: string }> => {
    usuario = usuario || (await crearUsuario({ role: 'client', notificationPreferences: { newMessage: true, jobUpdate: true, contractUpdate: true, email: true } }));
    const visto = { asunto: '', html: '' };
    const espia = jest.spyOn(emailService as any, 'sendToUser').mockImplementation(async (...a: any[]) => { visto.asunto = String(a[1]); visto.html = String(a[2]); return true; });
    await hacer(usuario.id);
    espia.mockRestore();
    return visto;
  };

  it('un mensaje de chat con un enlace puesto sale como TEXTO en el correo, no como enlace', async () => {
    const r = await capturar((id) => emailService.sendNewMessageNotification(id, 'Soporte DOAPP', ENLACE_MALO, 'conv-1'));
    expect(r.html).not.toContain('<a href="https://doapp-verificacion.example');
    expect(r.html).not.toContain('<img src="https://rastreo.example');
    expect(r.html).toContain('&lt;a href=&quot;https://doapp-verificacion.example/login&quot;&gt;');
  });

  it('el nombre de quien escribe y el título de un trabajo tampoco meten HTML', async () => {
    const r = await capturar((id) => emailService.sendJobUpdateNotification(id, `Pintura ${ENLACE_MALO}`, 'actualizado', 'job-1'));
    expect(r.html).not.toContain('<a href="https://doapp-verificacion.example');
    const m = await capturar((id) => emailService.sendNewMessageNotification(id, ENLACE_MALO, 'hola', 'conv-1'));
    expect(m.html).not.toContain('<a href="https://doapp-verificacion.example');
  });

  it('lo normal sale igual: texto común, acentos y los enlaces del propio correo', async () => {
    const r = await capturar((id) => emailService.sendNewMessageNotification(id, 'Ana Pérez', 'Hola, ¿cómo estás? Mañana a las 10.', 'conv-1'));
    expect(r.html).toContain('Hola, ¿cómo estás? Mañana a las 10.');
    expect(r.html).toContain('Ana Pérez');
    expect(r.html).toMatch(/<a [^>]*href="[^"]*\/chat\/conv-1"/); // el botón del correo sigue siendo un enlace
  });

  it('un apóstrofe en el nombre no rompe el asunto (el asunto no es HTML)', () => {
    expect(desescaparHtml(escaparHtml(`O'Brien & Hijos <x>`))).toBe(`O'Brien & Hijos <x>`);
  });

  it('solo se escapan los parámetros de TEXTO: una dirección de correo con apóstrofe no se toca', () => {
    class Falso {
      recibido: unknown[] = [];
      async sendAlgo(email: string, userName: string, token: string) { this.recibido = [email, userName, token]; }
      async sendEmail(subject: string) { this.recibido = [subject]; }
    }
    const f = escaparTextoDeLosCorreos(new Falso(), ['sendEmail']);
    void f.sendAlgo(`o'brien@x.com`, `<b>Ana</b>`, 'abc123');
    expect(f.recibido).toEqual([`o'brien@x.com`, '&lt;b&gt;Ana&lt;/b&gt;', 'abc123']);
    void f.sendEmail('<b>asunto</b>');
    expect(f.recibido).toEqual(['<b>asunto</b>']); // excluido
  });
});
