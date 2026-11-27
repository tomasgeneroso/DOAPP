import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { conRemitente, correoAlEquipo, casillaDeSoporte } from '../server/utils/remitenteDeCorreo';

/** Desde qué dirección sale cada correo (pedido del dueño, 2026-11-27: lo automático desde noreply; lo que pide respuesta y lo que llega a DOAPP, por soporte). */
describe('remitente de los correos', () => {
  const antes = process.env.SUPPORT_EMAIL;
  afterEach(() => {
    if (antes === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = antes;
  });

  it('un correo automático no fuerza remitente ni respuesta: sale con el de siempre del servidor (noreply)', () => {
    const r = conRemitente({ to: 'x@ejemplo.com' } as any);
    expect([(r as any).from, (r as any).replyTo]).toEqual([undefined, undefined]);
  });

  it('uno que pide respuesta sale de soporte y la respuesta llega a soporte', () => {
    delete process.env.SUPPORT_EMAIL;
    const r: any = conRemitente({ conRespuesta: true });
    expect(r.from).toBe('"DOAPP Soporte" <support@doapparg.com>');
    expect(r.replyTo).toBe('support@doapparg.com');
  });

  it('lo que va al equipo llega a soporte y «Responder» le escribe a quien lo mandó', () => {
    process.env.SUPPORT_EMAIL = 'ayuda@doapparg.com';
    const r = correoAlEquipo({ asunto: 'Sugerencia', html: '<p>hola</p>', responderA: 'persona@ejemplo.com' });
    expect([r.to, r.replyTo, casillaDeSoporte()]).toEqual(['ayuda@doapparg.com', 'persona@ejemplo.com', 'ayuda@doapparg.com']);
    expect(r.from).toContain('ayuda@doapparg.com');
    expect(correoAlEquipo({ asunto: 'x', html: 'y' }).replyTo).toBe('ayuda@doapparg.com');
  });

  /** Si un texto le pide a la persona que conteste el correo, ese correo no puede salir de noreply. */
  it('todo correo que invita a responder está marcado para salir de soporte', () => {
    const archivos = ['server/services/email.ts', 'server/routes/admin/contact.ts'];
    for (const f of archivos) {
      const s = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      for (const m of s.matchAll(/respond(iendo|é) este (email|correo)/gi)) {
        expect(`${f}: ${s.slice(m.index!, m.index! + 900).includes('conRespuesta: true')}`).toBe(`${f}: true`);
      }
    }
  });

  it('el formulario de contacto y los tickets avisan a soporte', () => {
    for (const f of ['server/routes/contact.ts', 'server/routes/tickets.ts', 'server/services/problemasDelTrabajo.ts']) {
      const s = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      expect(`${f}: ${s.includes('correoAlEquipo(')}`).toBe(`${f}: true`);
      expect(s).not.toMatch(/to:\s*supportEmail/);
    }
  });
});
