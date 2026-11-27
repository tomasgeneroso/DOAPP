import { describe, it, expect } from '@jest/globals';
import { generarClaveFuerte, motivoDeClaveDebil, LARGO_DE_UNA_CLAVE_GENERADA } from '../shared/seguridad/clave.js';
import { motivoDeSmtp } from '../server/services/email.js';

/** «La contraseña segura debe ser extremadamente segura» (pedido del dueño, 2026-11-26). */
describe('clave generada por el sistema', () => {
  it('32 caracteres con los cuatro grupos, sin los que se confunden, y distinta cada vez', () => {
    const muchas = Array.from({ length: 300 }, () => generarClaveFuerte());
    for (const c of muchas) {
      expect(c).toHaveLength(LARGO_DE_UNA_CLAVE_GENERADA);
      for (const grupo of [/[A-Z]/, /[a-z]/, /[2-9]/, /[!#$%*+\-=?@_]/]) expect(c).toMatch(grupo);
      expect(c).not.toMatch(/[0O1lI\s]/);
      expect(motivoDeClaveDebil(c)).toBeNull(); // sirve también donde se pide una contraseña común
    }
    expect(new Set(muchas).size).toBe(300);
    // Usa todo el abecedario: no hay caracteres que nunca salen.
    expect(new Set(muchas.join('')).size).toBeGreaterThanOrEqual(65);
  });
});

describe('por qué no salió un correo', () => {
  it('lo dice en palabras y nunca repite lo que contestó el servidor (puede traer direcciones)', () => {
    expect(motivoDeSmtp({ code: 'EAUTH' })).toMatch(/usuario o la contraseña/);
    expect(motivoDeSmtp({ code: 'ETIMEDOUT' })).toMatch(/No se pudo conectar/);
    expect(motivoDeSmtp({ responseCode: 550, response: '550 persona@ejemplo.com rechazada' } as never)).toMatch(/código 550/);
    expect(motivoDeSmtp({ responseCode: 550, message: 'persona@ejemplo.com' } as never)).not.toContain('@');
    expect(motivoDeSmtp(null)).toMatch(/registro del servidor/);
  });
});
