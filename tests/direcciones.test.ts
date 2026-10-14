import { describe, it, expect } from '@jest/globals';
import { aCasoTitulo, leerSugerencias, urlDeBusqueda, MINIMO_PARA_BUSCAR } from '../shared/geo/direcciones.js';

const respuesta = {
  direcciones: [
    { altura: { valor: 1234 }, calle: { nombre: 'CORRIENTES' }, localidad_censal: { nombre: 'Rafaela' }, departamento: { nombre: 'Castellanos' }, provincia: { nombre: 'Santa Fe' }, ubicacion: { lat: -31.26, lon: -61.5 } },
    { altura: { valor: null }, calle: { nombre: 'AV SANTA FE' }, localidad_censal: { nombre: null }, departamento: { nombre: 'La Capital' }, provincia: { nombre: 'Santa Fe' }, ubicacion: {} },
    { altura: { valor: 1234 }, calle: { nombre: 'CORRIENTES' }, localidad_censal: { nombre: 'Rafaela' }, provincia: { nombre: 'Santa Fe' } }, // repetida
    { altura: { valor: 5 }, calle: { nombre: '' } }, // sin calle: no sirve
  ],
};

describe('urlDeBusqueda', () => {
  it('no busca con menos de 4 caracteres ni con basura', () => {
    expect(MINIMO_PARA_BUSCAR).toBe(4);
    for (const v of ['', '  ab ', 'abc', null, undefined, 123]) expect(urlDeBusqueda(v)).toBeNull();
  });

  it('escapa lo que escribe la persona y acota el máximo', () => {
    const u = urlDeBusqueda('Av. Santa Fe  1234 & más')!;
    expect(u).toContain('direccion=Av.%20Santa%20Fe%201234%20%26%20m%C3%A1s');
    expect(u).toContain('max=6');
    expect(urlDeBusqueda('Corrientes', 500)).toContain('max=10');
    expect(urlDeBusqueda('Corrientes', 0)).toContain('max=1');
  });
});

describe('aCasoTitulo', () => {
  it('arma nombres de calles', () => {
    expect(aCasoTitulo('AV SANTA FE')).toBe('Av Santa Fe');
    expect(aCasoTitulo('JUAN DE GARAY')).toBe('Juan de Garay');
    expect(aCasoTitulo('DE LOS ANDES')).toBe('De los Andes');
  });
});

describe('leerSugerencias', () => {
  it('separa calle y número, localidad y provincia, sin repetidas ni sin calle', () => {
    const r = leerSugerencias(respuesta);
    expect(r.map((s) => s.etiqueta)).toEqual(['Corrientes 1234, Rafaela, Santa Fe', 'Av Santa Fe, La Capital, Santa Fe']);
    expect(r[0]).toMatchObject({ calle: 'Corrientes 1234', ciudad: 'Rafaela', provincia: 'Santa Fe', lat: -31.26, lon: -61.5 });
    expect(r[1].calle).toBe('Av Santa Fe'); // sin altura, no inventa un número
    expect(r[1].lat).toBeUndefined();
  });

  it('una respuesta rara da una lista vacía, nunca un error', () => {
    for (const raro of [null, undefined, {}, [], 'x', { direcciones: 'no' }, { direcciones: [null, 1, {}] }]) expect(leerSugerencias(raro)).toEqual([]);
  });
});
