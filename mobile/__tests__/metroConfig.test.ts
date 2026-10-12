/**
 * La app NO COMPILABA: `shared/legal/terms.structure.ts` importa '../constants/membershipPricing.js' (Node exige la
 * extensión aunque el archivo real sea `.ts`) y Metro buscaba el `.js` al pie de la letra. El CI no compila la app, así que
 * nadie lo vio hasta pedir el paquete web. `metro.resolverJs.js` (usado por metro.config.js) ahora prueba sin la extensión cuando el `.js` no existe.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolvedorConExtensionJs } = require('../metro.resolverJs');

const contexto = (existentes: string[]) => {
  const pedidos: string[] = [];
  return {
    pedidos,
    resolveRequest: (_ctx: unknown, nombre: string) => {
      pedidos.push(nombre);
      if (existentes.includes(nombre)) return { type: 'sourceFile', filePath: nombre };
      throw new Error(`no existe ${nombre}`);
    },
  };
};

describe('metro.config.js: imports relativos con .js que en realidad son .ts', () => {
  const resolver = resolvedorConExtensionJs(undefined) as (c: any, n: string, p: string) => any;

  it('hay un resolvedor propio', () => {
    expect(typeof resolver).toBe('function');
  });

  it('si el .js no existe, prueba sin la extensión (el .ts de shared/)', () => {
    const ctx = contexto(['../constants/membershipPricing']);
    expect(resolver(ctx, '../constants/membershipPricing.js', 'web')).toEqual({ type: 'sourceFile', filePath: '../constants/membershipPricing' });
    expect(ctx.pedidos).toEqual(['../constants/membershipPricing.js', '../constants/membershipPricing']);
  });

  it('si el .js existe de verdad, usa ese y no prueba otra cosa', () => {
    const ctx = contexto(['./hecho-a-mano.js']);
    expect(resolver(ctx, './hecho-a-mano.js', 'ios').filePath).toBe('./hecho-a-mano.js');
    expect(ctx.pedidos).toEqual(['./hecho-a-mano.js']);
  });

  it('si no existe ni con ni sin extensión, falla (no inventa un módulo)', () => {
    const ctx = contexto([]);
    expect(() => resolver(ctx, '../nada.js', 'android')).toThrow();
  });

  it('no toca los imports que no son relativos con .js (paquetes, rutas sin extensión)', () => {
    const ctx = contexto(['react', './sin-extension']);
    expect(resolver(ctx, 'react', 'web').filePath).toBe('react');
    expect(resolver(ctx, './sin-extension', 'web').filePath).toBe('./sin-extension');
    expect(ctx.pedidos).toEqual(['react', './sin-extension']);
  });

  it('un paquete cuyo nombre termina en .js (no relativo) tampoco se reescribe', () => {
    const ctx = contexto([]);
    expect(() => resolver(ctx, 'chart.js', 'web')).toThrow();
    expect(ctx.pedidos).toEqual(['chart.js']);
  });
});

describe('metro.config.js usa ese resolvedor', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const texto = fs.readFileSync(path.join(__dirname, '..', 'metro.config.js'), 'utf8');

  it('lo importa y lo asigna a config.resolver.resolveRequest', () => {
    expect(texto).toMatch(/require\('\.\/metro\.resolverJs'\)/);
    expect(texto).toMatch(/config\.resolver\.resolveRequest\s*=\s*resolvedorConExtensionJs\(config\.resolver\.resolveRequest\)/);
  });
});
