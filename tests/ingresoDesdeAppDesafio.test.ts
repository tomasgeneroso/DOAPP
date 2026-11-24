import { describe, it, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { emitirCodigoDeApp, canjearCodigoDeApp, estadoDeLaApp, leerEstadoDeLaApp, esDesafioValido, _vaciarCodigosDeApp } from '../server/services/ingresoDesdeApp';

/**
 * El código del ingreso con Google/X vuelve a la app por `doapp://…`, un esquema que cualquier otra app del teléfono puede registrar (auditoría de seguridad,
 * 2026-11-24). Con el DESAFÍO (hash de un secreto de la app) el código solo lo canjea quien tiene el secreto.
 */
describe('ingreso desde la app: el código atado a la app que lo empezó', () => {
  const secreto = crypto.randomBytes(32).toString('hex');
  const desafio = crypto.createHash('sha256').update(secreto).digest('hex');
  beforeEach(() => _vaciarCodigosDeApp());

  it('con el secreto correcto se canjea', () => {
    const c = emitirCodigoDeApp('u1', Date.now(), desafio);
    expect(canjearCodigoDeApp(c, Date.now(), secreto)).toBe('u1');
  });

  it('quien intercepta el código SIN el secreto no lo canjea, y el código se gasta (tampoco sirve después con el secreto)', () => {
    const c = emitirCodigoDeApp('u1', Date.now(), desafio);
    expect(canjearCodigoDeApp(c, Date.now())).toBeNull();
    expect(canjearCodigoDeApp(c, Date.now(), secreto)).toBeNull();
  });

  it('con un secreto equivocado, tampoco', () => {
    const c = emitirCodigoDeApp('u1', Date.now(), desafio);
    expect(canjearCodigoDeApp(c, Date.now(), crypto.randomBytes(32).toString('hex'))).toBeNull();
  });

  it('un secreto que no es texto o es muy corto o muy largo se rechaza', () => {
    for (const malo of [undefined, null, 123, 'corto', 'x'.repeat(500), {}]) {
      const c = emitirCodigoDeApp('u1', Date.now(), desafio);
      expect(canjearCodigoDeApp(c, Date.now(), malo)).toBeNull();
    }
  });

  it('una app vieja, que no manda desafío, sigue andando como antes', () => {
    const c = emitirCodigoDeApp('u1');
    expect(canjearCodigoDeApp(c)).toBe('u1');
  });

  it('un desafío mal formado se ignora (no deja un código imposible de canjear)', () => {
    const c = emitirCodigoDeApp('u1', Date.now(), 'no-es-un-hash');
    expect(canjearCodigoDeApp(c)).toBe('u1');
  });

  it('venció a los 2 minutos aunque el secreto sea el correcto', () => {
    const ahora = Date.now();
    const c = emitirCodigoDeApp('u1', ahora, desafio);
    expect(canjearCodigoDeApp(c, ahora + 3 * 60_000, secreto)).toBeNull();
  });

  describe('el desafío viaja en «state» de Google', () => {
    it('arma y lee app, app:<desafío> y lo que no es de la app', () => {
      expect(estadoDeLaApp(undefined)).toBe('app');
      expect(estadoDeLaApp('basura')).toBe('app');
      expect(estadoDeLaApp(desafio)).toBe(`app:${desafio}`);
      expect(leerEstadoDeLaApp('app')).toEqual({ esApp: true });
      expect(leerEstadoDeLaApp(`app:${desafio}`)).toEqual({ esApp: true, desafio });
      expect(leerEstadoDeLaApp('app:malo')).toEqual({ esApp: false });
      expect(leerEstadoDeLaApp('link:xyz')).toEqual({ esApp: false });
      expect(leerEstadoDeLaApp(undefined)).toEqual({ esApp: false });
      expect(esDesafioValido(desafio)).toBe(true);
      expect(esDesafioValido(desafio.toUpperCase())).toBe(false);
    });
  });
});
