import { describe, it, expect } from '@jest/globals';
import { sanearRubros, sanearZonas, sanearRadio, rolDeLaCuenta, esTrabajador, etiquetaDeRubro, MAXIMO_DE_ZONAS } from '../shared/perfiles/zonaDeTrabajo';

describe('rubros y zona de trabajo (saneado)', () => {
  it('rubros: solo los que existen, sin repetir; lo que no es una lista da []', () => {
    expect(sanearRubros(['plomeria', 'plomeria', 'inventado', 3, null, 'pintura'])).toEqual(['plomeria', 'pintura']);
    expect(sanearRubros('plomeria')).toEqual([]);
    expect(sanearRubros(undefined)).toEqual([]);
  });

  it('radio: entero entre 1 y 300, o null', () => {
    expect(sanearRadio(25)).toBe(25);
    expect(sanearRadio('10.4')).toBe(10);
    for (const x of [0, -5, 301, 'mucho', null, undefined, '']) expect(sanearRadio(x)).toBeNull();
  });

  it('zonas: con nombre de 2 a 80 caracteres, sin repetir (sin importar mayúsculas), con tope y radio opcional', () => {
    expect(sanearZonas([{ name: ' Palermo ', radiusKm: 10 }, { name: 'palermo' }, { name: 'x' }, { name: 'Tigre', radiusKm: 'mucho' }, 'texto', null]))
      .toEqual([{ name: 'Palermo', radiusKm: 10 }, { name: 'Tigre' }]);
    const muchas = Array.from({ length: 30 }, (_, i) => ({ name: `Zona ${i}` }));
    expect(sanearZonas(muchas)).toHaveLength(MAXIMO_DE_ZONAS);
    expect(sanearZonas({ name: 'no es lista' })).toEqual([]);
  });

  it('el tipo de cuenta del registro da el rol; sin elegir (o algo raro), cliente', () => {
    expect(rolDeLaCuenta('worker')).toBe('doer');
    expect(rolDeLaCuenta('both')).toBe('both');
    expect(rolDeLaCuenta('client')).toBe('client');
    expect(rolDeLaCuenta('admin')).toBe('client');
    expect(rolDeLaCuenta(undefined)).toBe('client');
    expect(esTrabajador('doer')).toBe(true);
    expect(esTrabajador('both')).toBe(true);
    expect(esTrabajador('client')).toBe(false);
  });

  it('la etiqueta de un rubro sale del catálogo de los trabajos', () => {
    expect(etiquetaDeRubro('plomeria')).toBe('Plomería');
    expect(etiquetaDeRubro('desconocido')).toBe('desconocido');
  });
});
