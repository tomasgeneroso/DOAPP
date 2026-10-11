import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { urlsDeRetorno, esOrigenApp } from '../server/services/urlsDeRetorno.js';

/**
 * A dónde devuelve Mercado Pago. Desde la web todo sigue igual; desde la app del celular vuelve a una página pública que
 * lleva de regreso a la app (la página web de éxito necesita una sesión iniciada en el navegador del teléfono).
 */
describe('urlsDeRetorno', () => {
  const web = { exito: 'https://web.test/payment/success?type=x', cancelado: 'https://web.test/cancel' };
  const original = process.env.CLIENT_URL;
  beforeEach(() => { process.env.CLIENT_URL = 'https://doapparg.com/'; });
  afterEach(() => { if (original === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = original; });

  it('sin origen, o con cualquier otro origen, devuelve las direcciones de la web tal cual', () => {
    for (const origen of [undefined, null, '', 'web', 'APP', 'app ', true, 1, {}]) {
      expect(urlsDeRetorno(origen, web, { tipo: 'publicacion' })).toEqual({ successUrl: web.exito, cancelUrl: web.cancelado });
    }
  });

  it('con origen «app» va a la página de retorno a la app, con el tipo, el estado y los ids', () => {
    const r = urlsDeRetorno('app', web, { tipo: 'cotizacion', ids: { proposalId: 'p-1' } });
    expect(r.successUrl).toBe('https://doapparg.com/payment/app-return?tipo=cotizacion&estado=ok&proposalId=p-1');
    expect(r.cancelUrl).toBe('https://doapparg.com/payment/app-return?tipo=cotizacion&estado=cancelado&proposalId=p-1');
  });

  it('no deja una barra de más antes de la ruta, y escapa lo que viene en los ids', () => {
    const r = urlsDeRetorno('app', web, { tipo: 'contrato', ids: { contractId: 'a b&c=d' } });
    expect(r.successUrl.startsWith('https://doapparg.com/payment/app-return?')).toBe(true);
    expect(r.successUrl).not.toContain('//payment');
    expect(r.successUrl).toContain('contractId=a+b%26c%3Dd');
    expect(new URL(r.successUrl).searchParams.get('contractId')).toBe('a b&c=d');
  });

  it('los ids no pueden pisar el tipo ni el estado', () => {
    const r = urlsDeRetorno('app', web, { tipo: 'publicacion', ids: { estado: 'hackeado', tipo: 'otro', jobId: '1' } });
    const q = new URL(r.successUrl).searchParams;
    expect(q.getAll('tipo')).toEqual(['publicacion']);
    expect(q.getAll('estado')).toEqual(['ok']);
    expect(q.get('jobId')).toBe('1');
  });

  it('esOrigenApp solo acepta la palabra exacta', () => {
    expect(esOrigenApp('app')).toBe(true);
    for (const x of ['App', 'mobile', undefined, null, 1, true, ['app']]) expect(esOrigenApp(x)).toBe(false);
  });
});
