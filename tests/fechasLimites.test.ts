import { describe, it, expect } from '@jest/globals';
import { hoyEnArgentina, noEsAnteriorAHoy, esAnteriorAHoy, minimoHoy, maximoNacimiento, soloElDia } from '../shared/fechas/limites.js';

/** Un «válido hasta» o un vencimiento no puede ser de un día que ya pasó; el nacimiento siempre es anterior a hoy. Hoy = el día de Argentina. */
describe('límites de fechas', () => {
  // 21:30 en Argentina del 20/10 ya es el 21/10 en UTC: el «hoy» del formulario tiene que ser el 20.
  const nocheDelVeinte = new Date('2026-10-21T00:30:00Z');

  it('hoy es el día de Argentina, no el de UTC', () => {
    expect(hoyEnArgentina(nocheDelVeinte)).toBe('2026-10-20');
    expect(minimoHoy(nocheDelVeinte)).toBe('2026-10-20');
  });

  it('«válido hasta»: hoy y el futuro valen; un día anterior (o un año anterior) no', () => {
    expect(noEsAnteriorAHoy('2026-10-20', nocheDelVeinte)).toBe(true);
    expect(noEsAnteriorAHoy('2026-10-21', nocheDelVeinte)).toBe(true);
    expect(noEsAnteriorAHoy('2026-10-19', nocheDelVeinte)).toBe(false);
    expect(noEsAnteriorAHoy('2025-10-20', nocheDelVeinte)).toBe(false);
    expect(noEsAnteriorAHoy('2026-10-20T15:00:00.000Z', nocheDelVeinte)).toBe(true);
  });

  it('lo que no es una fecha no pasa (en ninguno de los dos sentidos)', () => {
    for (const x of ['', 'mañana', null, undefined, 123, '2026-13-45']) {
      expect(noEsAnteriorAHoy(x as any, nocheDelVeinte)).toBe(false);
      expect(esAnteriorAHoy(x as any, nocheDelVeinte)).toBe(false);
    }
    expect(soloElDia(new Date('invalid'))).toBeNull();
  });

  it('el nacimiento sí tiene que ser ANTES de hoy', () => {
    expect(esAnteriorAHoy('1990-05-17', nocheDelVeinte)).toBe(true);
    expect(esAnteriorAHoy('2026-10-20', nocheDelVeinte)).toBe(false);
    expect(esAnteriorAHoy('2027-01-01', nocheDelVeinte)).toBe(false);
    expect(maximoNacimiento(nocheDelVeinte)).toBe('2026-10-19');
  });
});
