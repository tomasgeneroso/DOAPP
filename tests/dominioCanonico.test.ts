import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { destinoCanonico, dominiosQueRedirigen, hostDe, redirigirDominiosAlternativos } from '../server/middleware/dominioCanonico.js';

/** doapparg.site respondía con el sitio y la API completos: tiene que redirigir a doapparg.com y nada más. */
describe('dominio canónico', () => {
  const ejecutar = (host: string, metodo = 'GET', url = '/login?x=1') => {
    const req: any = { hostname: host, headers: { host }, method: metodo, originalUrl: url };
    const salida: any = { redirigido: null, estado: null, cuerpo: null, siguio: false };
    const res: any = {
      redirect: (codigo: number, destino: string) => { salida.redirigido = { codigo, destino }; },
      status: (c: number) => { salida.estado = c; return { json: (b: unknown) => { salida.cuerpo = b; } }; },
    };
    redirigirDominiosAlternativos()(req, res, () => { salida.siguio = true; });
    return salida;
  };

  it('doapparg.site y su www redirigen (301) a la misma ruta en .com, con la consulta', () => {
    for (const host of ['doapparg.site', 'www.doapparg.site', 'DOAPPARG.SITE', 'doapparg.site:443']) {
      const r = ejecutar(host);
      expect(r.siguio).toBe(false);
      expect(r.redirigido).toEqual({ codigo: 301, destino: 'https://doapparg.com/login?x=1' });
    }
  });

  it('www.doapparg.com también va al .com', () => {
    expect(ejecutar('www.doapparg.com').redirigido?.destino).toBe('https://doapparg.com/login?x=1');
  });

  it('un POST desde un dominio alternativo se rechaza (421), no se redirige', () => {
    const r = ejecutar('doapparg.site', 'POST', '/api/auth/login');
    expect(r.estado).toBe(421);
    expect(r.redirigido).toBeNull();
  });

  it('el dominio principal, staging y localhost siguen de largo', () => {
    for (const host of ['doapparg.com', 'staging.doapparg.com', 'localhost', '127.0.0.1']) {
      expect(ejecutar(host).siguio).toBe(true);
    }
  });

  it('el destino siempre es el dominio principal: una ruta rara no lo cambia', () => {
    expect(destinoCanonico('//evil.com/x')).toBe('https://doapparg.com/');
    expect(destinoCanonico('/ok?a=b')).toBe('https://doapparg.com/ok?a=b');
    expect(destinoCanonico('evil.com')).toBe('https://doapparg.com/');
  });

  it('DOMINIOS_QUE_REDIRIGEN suma dominios y descarta lo que no es un dominio', () => {
    expect(dominiosQueRedirigen('otro.site, DOAPPARG.COM, raro host, ')).toEqual(expect.arrayContaining(['doapparg.site', 'otro.site']));
    expect(dominiosQueRedirigen('doapparg.com')).not.toContain('doapparg.com');
    expect(dominiosQueRedirigen('raro host')).not.toContain('raro host');
    expect(hostDe(undefined)).toBe('');
  });

  it('está conectado en el servidor, antes que el resto, y la web redirige también por si el sitio llega servido desde otro dominio', () => {
    const servidor = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
    expect(servidor).toMatch(/app\.use\(redirigirDominiosAlternativos\(\)\)/);
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/doapparg\.site/);
    expect(html).toMatch(/location\.replace\(/);
  });
});
