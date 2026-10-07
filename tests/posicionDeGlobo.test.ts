import { describe, it, expect } from '@jest/globals';
import { posicionarGlobo, type Caja } from '../client/utils/posicionDeGlobo.js';

/**
 * El globo de explicación tiene que leerse siempre: sin cortarse contra el borde de
 * la pantalla y sin tapar el concepto que explica. La cuenta es pura, así que se
 * prueba acá; en el navegador sólo se mira que el globo aparezca donde dice.
 */

const VENTANA = { width: 1000, height: 700 };
const GLOBO = { width: 300, height: 80 };
const SEP = 8;
const MARGEN = 8;

const concepto = (left: number, top: number, width = 120, height = 20): Caja => ({ left, top, width, height });

describe('posicionarGlobo', () => {
  it('por defecto va debajo del concepto, centrado', () => {
    const c = concepto(400, 200);
    const p = posicionarGlobo(c, GLOBO, VENTANA);
    expect(p.lado).toBe('abajo');
    expect(p.top).toBe(200 + 20 + SEP);
    expect(p.left).toBe(400 + 60 - 150);
  });

  it('si abajo no entra, va arriba', () => {
    const c = concepto(400, 650);
    const p = posicionarGlobo(c, GLOBO, VENTANA);
    expect(p.lado).toBe('arriba');
    expect(p.top).toBe(650 - SEP - 80);
  });

  it('nunca tapa al concepto: el globo no se superpone con él', () => {
    for (const top of [0, 30, 150, 300, 600, 650, 690]) {
      const c = concepto(400, top);
      const p = posicionarGlobo(c, GLOBO, VENTANA);
      const hayChoque = p.top < c.top + c.height && p.top + GLOBO.height > c.top;
      // Con lugar de un lado, no hay superposición. Sólo se tolera si no cabe en ninguno.
      const cabeAlgunLado = c.top + c.height + SEP + GLOBO.height <= VENTANA.height - MARGEN || c.top - SEP - GLOBO.height >= MARGEN;
      if (cabeAlgunLado) expect({ top, hayChoque }).toEqual({ top, hayChoque: false });
    }
  });

  it('en el borde izquierdo no se corta', () => {
    const p = posicionarGlobo(concepto(2, 200, 40), GLOBO, VENTANA);
    expect(p.left).toBe(MARGEN);
  });

  it('en el borde derecho no se corta', () => {
    const p = posicionarGlobo(concepto(960, 200, 40), GLOBO, VENTANA);
    expect(p.left + GLOBO.width).toBeLessThanOrEqual(VENTANA.width - MARGEN);
    expect(p.left).toBe(VENTANA.width - GLOBO.width - MARGEN);
  });

  it('en una ventana angosta (celular) entra entero', () => {
    const celular = { width: 360, height: 640 };
    for (const left of [0, 100, 250, 340]) {
      const p = posicionarGlobo(concepto(left, 300, 80), { width: 288, height: 90 }, celular);
      expect(p.left).toBeGreaterThanOrEqual(MARGEN);
      expect(p.left + 288).toBeLessThanOrEqual(celular.width - MARGEN);
    }
  });

  it('un globo más ancho que la ventana arranca en el margen izquierdo', () => {
    const p = posicionarGlobo(concepto(100, 100), { width: 500, height: 60 }, { width: 400, height: 600 });
    expect(p.left).toBe(MARGEN);
  });

  it('si no entra ni arriba ni abajo, elige el lado con más lugar y queda dentro de la ventana', () => {
    const baja = { width: 1000, height: 120 };
    // concepto cerca del borde de abajo: más lugar arriba
    const a = posicionarGlobo(concepto(400, 100), { width: 300, height: 100 }, baja);
    expect(a.top).toBeGreaterThanOrEqual(MARGEN);
    // ventana de 120 con globo de 100: el tope es 120 - 100 - 8 = 12, y no se pasa
    expect(a.top).toBeLessThanOrEqual(12);
    const b = posicionarGlobo(concepto(400, 10), { width: 300, height: 100 }, baja);
    expect(b.top).toBeGreaterThanOrEqual(MARGEN);
  });

  it('el globo siempre arranca dentro de la ventana, con cualquier concepto', () => {
    for (let top = -20; top <= 760; top += 20) {
      for (let left = -50; left <= 1050; left += 50) {
        const p = posicionarGlobo(concepto(left, top), GLOBO, VENTANA);
        expect(p.top).toBeGreaterThanOrEqual(MARGEN);
        expect(p.left).toBeGreaterThanOrEqual(MARGEN);
        expect(p.left + GLOBO.width).toBeLessThanOrEqual(VENTANA.width - MARGEN);
        expect(p.top + GLOBO.height).toBeLessThanOrEqual(VENTANA.height - MARGEN);
      }
    }
  });
});
