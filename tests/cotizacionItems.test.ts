import { describe, it, expect } from '@jest/globals';
import { motivoDeItemsInvalidos, totalCobrable } from '../shared/cotizaciones/items';

/** Una cotización de $0,00 se pudo enviar y al aceptarla Mercado Pago respondía «unit_price invalid» (2026-11-12). */
describe('ítems de una cotización', () => {
  it('sirven: descripción, cantidad y precio mayores que cero', () => {
    expect(motivoDeItemsInvalidos([{ description: 'Servicio de plomería', qty: 1, unitPrice: 15000 }])).toBeNull();
    expect(motivoDeItemsInvalidos([{ description: 'Horas', qty: 2.5, unitPrice: '4000' }])).toBeNull();
  });

  it('un ítem en $0 (lo que dejan las plantillas sin completar) se rechaza diciendo cuál', () => {
    expect(motivoDeItemsInvalidos([{ description: 'A', qty: 1, unitPrice: 100 }, { description: 'B', qty: 1, unitPrice: 0 }])).toMatch(/ítem 2 tiene precio \$0/);
  });

  it('sin ítems, sin descripción, con cantidad cero, negativa o texto: se rechaza', () => {
    expect(motivoDeItemsInvalidos([])).toMatch(/al menos un ítem/);
    expect(motivoDeItemsInvalidos(undefined)).toMatch(/al menos un ítem/);
    expect(motivoDeItemsInvalidos([{ description: ' ', qty: 1, unitPrice: 5 }])).toMatch(/descripción/);
    expect(motivoDeItemsInvalidos([{ description: 'A', qty: 0, unitPrice: 5 }])).toMatch(/cantidad/);
    expect(motivoDeItemsInvalidos([{ description: 'A', qty: -1, unitPrice: 5 }])).toMatch(/cantidad/);
    expect(motivoDeItemsInvalidos([{ description: 'A', qty: 'x', unitPrice: 5 }])).toMatch(/cantidad/);
    expect(motivoDeItemsInvalidos([{ description: 'A', qty: 1, unitPrice: -5 }])).toMatch(/precio/);
    expect(motivoDeItemsInvalidos([{ description: 'A', qty: 1, unitPrice: NaN }])).toMatch(/precio/);
  });

  it('un total cobrable es un número mayor que cero', () => {
    expect(totalCobrable(0)).toBe(false);
    expect(totalCobrable('0')).toBe(false);
    expect(totalCobrable(null)).toBe(false);
    expect(totalCobrable(NaN)).toBe(false);
    expect(totalCobrable('1500.50')).toBe(true);
  });
});
