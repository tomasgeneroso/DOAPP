import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { guardarDestino, tomarDestino } from '../client/utils/destinoDespuesDeGoogle.js';

/**
 * Entrar con Google o X sale a otro sitio y vuelve a /auth/callback: ahí se perdía de dónde venía la persona y siempre terminaba
 * en la portada, mientras que el ingreso con correo sí vuelve a donde estaba. El destino se guarda antes de salir.
 */

function almacenFalso() {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
  };
}

describe('destino después de entrar con Google/X', () => {
  let original: unknown;
  beforeEach(() => {
    original = (globalThis as any).localStorage;
    (globalThis as any).localStorage = almacenFalso();
  });
  afterEach(() => {
    (globalThis as any).localStorage = original;
    jest.useRealTimers();
  });

  it('vuelve a la ruta guardada, una sola vez', () => {
    guardarDestino('/jobs/123?x=1');
    expect(tomarDestino()).toBe('/jobs/123?x=1');
    expect(tomarDestino()).toBeNull();
  });

  it('la portada o nada guardado no cambia el comportamiento de siempre (null → portada)', () => {
    guardarDestino('/');
    expect(tomarDestino()).toBeNull();
    expect(tomarDestino()).toBeNull();
  });

  it('solo rutas de esta aplicación: un destino externo se descarta', () => {
    for (const malo of ['//sitio-malo.com', 'https://sitio-malo.com', '/\\sitio-malo.com', 'javascript:alert(1)']) {
      guardarDestino(malo);
      expect(tomarDestino()).toBeNull();
    }
  });

  it('un valor manipulado en el almacenamiento tampoco sirve', () => {
    localStorage.setItem('doapp:destino-tras-ingresar', JSON.stringify({ destino: '//sitio-malo.com', en: Date.now() }));
    expect(tomarDestino()).toBeNull();
    localStorage.setItem('doapp:destino-tras-ingresar', '{no es json');
    expect(tomarDestino()).toBeNull();
    localStorage.setItem('doapp:destino-tras-ingresar', JSON.stringify({ destino: '/jobs/1' }));
    expect(tomarDestino()).toBeNull(); // sin fecha
  });

  it('vence a los 15 minutos', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    guardarDestino('/jobs/1');
    jest.setSystemTime(new Date('2026-10-14T12:14:00Z'));
    expect(tomarDestino()).toBe('/jobs/1');
    guardarDestino('/jobs/2');
    jest.setSystemTime(new Date('2026-10-14T12:30:00Z'));
    expect(tomarDestino()).toBeNull();
  });

  it('sin almacenamiento (modo privado) no rompe', () => {
    (globalThis as any).localStorage = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
      removeItem: () => { throw new Error('bloqueado'); },
    };
    expect(() => guardarDestino('/jobs/1')).not.toThrow();
    expect(tomarDestino()).toBeNull();
  });
});

describe('pantallas de ingreso y registro', () => {
  const login = readFileSync(join(process.cwd(), 'client/pages/LoginScreen.tsx'), 'utf8');
  const callback = readFileSync(join(process.cwd(), 'client/pages/AuthCallback.tsx'), 'utf8');

  it('Google y X van primero y el formulario después, en login y en registro (el bloque es único, sobre el formulario)', () => {
    const social = login.indexOf('{opcionesSociales}');
    const formulario = login.indexOf('<form className="space-y-4 sm:space-y-6"');
    expect(social).toBeGreaterThan(0);
    expect(formulario).toBeGreaterThan(social);
    // no quedó un segundo bloque social debajo del formulario
    expect(login.slice(formulario).includes('/auth/google')).toBe(false);
  });

  it('hay un botón para contactar a soporte, y los botones sociales recuerdan el destino', () => {
    expect(login).toMatch(/to="\/contact"/);
    expect(login).toMatch(/Contactar soporte/);
    expect((login.match(/onClick=\{recordarDestino\}/g) || []).length).toBe(2);
  });

  it('el ingreso con Google/X que falla vuelve con ?error= y la pantalla lo explica', () => {
    expect(login).toMatch(/get\("error"\)/);
  });

  it('al volver de Google/X se va al destino guardado', () => {
    expect(callback).toMatch(/tomarDestino\(\)/);
  });
});
