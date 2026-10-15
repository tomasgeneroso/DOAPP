import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  alturaEnRango,
  buscarCodigoPostal,
  buscarSugerencias,
  leerCalles,
  normalizarCodigoPostal,
  separarCalleYAltura,
  urlDeCalles,
  urlDeCodigoPostal,
} from '../shared/geo/direcciones.js';

/**
 * Direcciones que EXISTEN: las calles con el rango de números que tienen (Georef/INDEC) y el código postal de la ubicación
 * elegida (OpenStreetMap). Todo con la red simulada: ninguna prueba llama a un servicio externo.
 */

const calles = {
  calles: [
    { nombre: 'AV CORRIENTES', altura: { inicio: { derecha: 0, izquierda: 0 }, fin: { derecha: 6899, izquierda: 6900 } }, localidad_censal: { nombre: 'Ciudad Autónoma de Buenos Aires' }, provincia: { nombre: 'Ciudad Autónoma de Buenos Aires' } },
    { nombre: 'CORRIENTES', altura: { inicio: { derecha: 101, izquierda: 100 }, fin: { derecha: 1899, izquierda: 1898 } }, localidad_censal: { nombre: 'Ayacucho' }, provincia: { nombre: 'Buenos Aires' } },
    { nombre: 'CORRIENTES', altura: { inicio: { derecha: 101, izquierda: 100 }, fin: { derecha: 1899, izquierda: 1898 } }, localidad_censal: { nombre: 'Ayacucho' }, provincia: { nombre: 'Buenos Aires' } }, // repetida
    { nombre: 'SIN RANGO', altura: { inicio: { derecha: 0, izquierda: 0 }, fin: { derecha: 0, izquierda: 0 } } },
    { nombre: '', altura: { fin: { derecha: 10 } } },
  ],
};

describe('separarCalleYAltura', () => {
  it('separa el número del final y deja sin número lo que no lo tiene', () => {
    expect(separarCalleYAltura('Av Corrientes 1234')).toEqual({ calle: 'Av Corrientes', altura: 1234 });
    expect(separarCalleYAltura('  San  Martín,  45 ')).toEqual({ calle: 'San Martín', altura: 45 });
    expect(separarCalleYAltura('Corrientes')).toEqual({ calle: 'Corrientes', altura: null });
    expect(separarCalleYAltura('25 de Mayo 300')).toEqual({ calle: '25 de Mayo', altura: 300 });
    for (const raro of [null, undefined, '', 123]) expect(separarCalleYAltura(raro).altura).toBeNull();
  });
});

describe('leerCalles', () => {
  it('el rango de alturas que existen, sin repetidas ni calles sin rango', () => {
    const r = leerCalles(calles);
    expect(r.map((c) => c.etiqueta)).toEqual([
      'Av Corrientes, Ciudad Autónoma de Buenos Aires (1–6900)',
      'Corrientes, Ayacucho, Buenos Aires (100–1899)',
    ]);
    expect(r[0]).toMatchObject({ calle: 'Av Corrientes', desde: 1, hasta: 6900 });
  });

  it('una misma calle partida por tramos (comunas) se junta en una entrada con todo el rango', () => {
    const tramo = (ini: number, fin: number) => ({ nombre: 'AV CORRIENTES', altura: { inicio: { derecha: ini, izquierda: ini }, fin: { derecha: fin, izquierda: fin + 1 } }, localidad_censal: { nombre: 'CABA' }, provincia: { nombre: 'CABA' } });
    const r = leerCalles({ calles: [tramo(0, 1800), tramo(1801, 3400), tramo(3401, 6899)] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ calle: 'Av Corrientes', desde: 1, hasta: 6900 });
  });

  it('una respuesta rara da una lista vacía', () => {
    for (const raro of [null, undefined, {}, [], 'x', { calles: 'no' }, { calles: [null, 1, {}] }]) expect(leerCalles(raro)).toEqual([]);
  });

  it('alturaEnRango', () => {
    const c = { desde: 100, hasta: 1899 };
    expect([alturaEnRango(99, c), alturaEnRango(100, c), alturaEnRango(1899, c), alturaEnRango(1900, c)]).toEqual([false, true, true, false]);
  });

  it('urlDeCalles: no busca con poco texto y escapa lo escrito', () => {
    expect(urlDeCalles('ab')).toBeNull();
    expect(urlDeCalles('Av. Santa Fe & más')).toContain('nombre=Av.%20Santa%20Fe%20%26%20m%C3%A1s');
  });
});

describe('buscarSugerencias (con la red simulada)', () => {
  const original = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = original;
  });
  const simular = (respuestas: Record<string, unknown>) => {
    (globalThis as any).fetch = jest.fn(async (url: any) => {
      const clave = Object.keys(respuestas).find((k) => String(url).includes(k));
      if (!clave) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => respuestas[clave] };
    });
  };
  const dirs = { direcciones: [{ altura: { valor: 1234 }, calle: { nombre: 'AV CORRIENTES' }, localidad_censal: { nombre: 'CABA' }, provincia: { nombre: 'CABA' }, ubicacion: { lat: -34.6, lon: -58.38 } }] };

  it('con un número que existe, devuelve la dirección con su ubicación', async () => {
    simular({ '/direcciones': dirs });
    const r = await buscarSugerencias('Av Corrientes 1234');
    expect(r.direcciones[0]).toMatchObject({ calle: 'Av Corrientes 1234', lat: -34.6, lon: -58.38 });
    expect(r.calles).toEqual([]);
    expect(r.alturaInexistente).toBeUndefined();
  });

  it('sin número, ofrece las calles con el rango de números que existen', async () => {
    simular({ '/calles': calles });
    const r = await buscarSugerencias('Corrientes');
    expect(r.direcciones).toEqual([]);
    expect(r.calles.map((c) => `${c.desde}-${c.hasta}`)).toEqual(['1-6900', '100-1899']);
  });

  it('con un número que NO existe en ninguna calle con ese nombre, lo dice y da el mayor que existe', async () => {
    simular({ '/direcciones': { direcciones: [] }, '/calles': calles });
    const r = await buscarSugerencias('Corrientes 99999');
    expect(r.direcciones).toEqual([]);
    expect(r.alturaInexistente).toEqual({ altura: 99999, mayor: 6900 });
    expect(r.calles.length).toBe(2);
  });

  it('si OTRA calle del mismo nombre sí tiene ese número, no dice que no existe (ofrece esa)', async () => {
    simular({ '/direcciones': { direcciones: [] }, '/calles': calles });
    const r = await buscarSugerencias('Corrientes 150');
    expect(r.alturaInexistente).toBeUndefined();
    expect(r.calles.map((c) => c.hasta)).toEqual([6900, 1899]);
  });

  it('sin red o con error de la API, listas vacías (nunca un error)', async () => {
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('sin red');
    });
    expect(await buscarSugerencias('Corrientes 12')).toEqual({ direcciones: [], calles: [] });
    expect(await buscarSugerencias('Corrientes')).toEqual({ direcciones: [], calles: [] });
    (globalThis as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await buscarSugerencias('Corrientes')).toEqual({ direcciones: [], calles: [] });
  });
});

describe('código postal', () => {
  const original = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = original;
  });

  it('solo acepta formatos argentinos', () => {
    for (const ok of ['1043', 'C1043', 'c1043aaj', ' C1043AAJ ', 'B 1900']) expect(normalizarCodigoPostal(ok)).not.toBeNull();
    expect(normalizarCodigoPostal('c1043aaj')).toBe('C1043AAJ');
    expect(normalizarCodigoPostal('B 1900')).toBe('B1900');
    for (const mal of ['', 'abc', '12345', 'C1043A', '10-43', 'SW1A 1AA', null, undefined, 1043.5]) expect(normalizarCodigoPostal(mal)).toBeNull();
  });

  it('la dirección de consulta lleva la ubicación y rechaza coordenadas imposibles', () => {
    expect(urlDeCodigoPostal(-34.6, -58.38)).toContain('lat=-34.6&lon=-58.38');
    for (const [la, lo] of [[undefined, 1], [95, 0], [0, 200], ['x', 'y'], [null, null]]) expect(urlDeCodigoPostal(la, lo)).toBeNull();
  });

  it('lee el código postal de la respuesta, solo si es de Argentina y tiene forma de código postal argentino', async () => {
    const responde = (j: unknown, ok = true) => {
      (globalThis as any).fetch = jest.fn(async () => ({ ok, json: async () => j }));
    };
    responde({ address: { postcode: 'C1043AAJ', country_code: 'ar' } });
    expect(await buscarCodigoPostal(-34.6, -58.38)).toBe('C1043AAJ');
    responde({ address: { postcode: '8400', country_code: 'ar' } });
    expect(await buscarCodigoPostal(-41.1, -71.3)).toBe('8400');
    responde({ address: { postcode: '1100', country_code: 'uy' } }); // otro país
    expect(await buscarCodigoPostal(-34.9, -56.1)).toBeNull();
    responde({ address: { postcode: 'basura', country_code: 'ar' } });
    expect(await buscarCodigoPostal(-34.6, -58.38)).toBeNull();
    responde({ address: {} });
    expect(await buscarCodigoPostal(-34.6, -58.38)).toBeNull();
    responde({}, false);
    expect(await buscarCodigoPostal(-34.6, -58.38)).toBeNull();
  });

  it('sin coordenadas no pregunta nada; sin red, null', async () => {
    const f = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    (globalThis as any).fetch = f;
    expect(await buscarCodigoPostal(undefined, undefined)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('sin red');
    });
    expect(await buscarCodigoPostal(-34.6, -58.38)).toBeNull();
  });
});
