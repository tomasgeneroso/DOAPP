import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { buscarLugares, detallesDeUbicacion, leerLugares, sanearCalle, sanearNumeroDePuerta, urlDeLugares, validarCalleYNumero } from '../shared/geo/lugares.js';

/** Lugares y direcciones reales del formulario de un trabajo. La red está simulada: ninguna prueba llama a un servicio externo. */

const feature = (propiedades: Record<string, unknown>, lon = -58.8306, lat = -27.4698) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { countrycode: 'AR', ...propiedades } });
const coleccion = (...features: unknown[]) => ({ type: 'FeatureCollection', features });
const PROPIEDADES = { type: 'house', housenumber: '967', street: 'San Luis', locality: 'Barrio Deportes', district: 'Seccional 1°', city: 'Corrientes', state: 'Corrientes', postcode: 'W3400' };
const direccion = feature(PROPIEDADES);
const barrio = feature({ type: 'district', name: 'Palermo', city: 'Buenos Aires', state: 'Ciudad Autónoma de Buenos Aires', postcode: 'C1425' }, -58.4306, -34.5889);

describe('leerLugares', () => {
  it('una dirección exacta trae calle, número, barrio, ciudad, provincia, código postal y ubicación', () => {
    const [l] = leerLugares(coleccion(direccion));
    expect(l).toMatchObject({ calle: 'San Luis', numero: '967', barrio: 'Barrio Deportes', ciudad: 'Corrientes', provincia: 'Corrientes', codigoPostal: 'W3400', lat: -27.4698, lon: -58.8306 });
    expect(l.etiqueta).toBe('San Luis 967, Barrio Deportes, Corrientes, Corrientes');
  });

  it('un barrio o una localidad no inventan calle ni número', () => {
    const [l] = leerLugares(coleccion(barrio));
    expect(l).toMatchObject({ calle: '', numero: '', barrio: 'Palermo', ciudad: 'Buenos Aires', codigoPostal: 'C1425' });
    expect(l.etiqueta).toBe('Palermo, Buenos Aires, Ciudad Autónoma de Buenos Aires');
  });

  it('del número de casa solo quedan dígitos («967 bis», «S/N», «0012»)', () => {
    const con = (housenumber: string) => leerLugares(coleccion(feature({ ...PROPIEDADES, housenumber })))[0].numero;
    expect(con('967 bis')).toBe('967');
    expect(con('12-14')).toBe('12');
    expect(con('S/N')).toBe('');
    expect(con('0012')).toBe('12');
  });

  it('descarta lo que no tiene ubicación o es de otro país, y las repetidas', () => {
    const r = leerLugares(coleccion(direccion, direccion, feature(PROPIEDADES, 'x' as never), feature({ ...PROPIEDADES, countrycode: 'UY' }), null, 1, {}));
    expect(r).toHaveLength(1);
  });

  it('una respuesta rara da una lista vacía', () => {
    for (const raro of [null, undefined, {}, 'x', 5]) expect(leerLugares(raro)).toEqual([]);
  });

  it('código postal con otro formato no se acepta', () => {
    expect(leerLugares(coleccion(feature({ ...PROPIEDADES, postcode: 'SW1A 1AA' })))[0].codigoPostal).toBeNull();
  });

  it('una calle o una localidad que son el resultado mismo traen su nombre', () => {
    expect(leerLugares(coleccion(feature({ type: 'street', name: 'Junín', city: 'Corrientes', state: 'Corrientes' })))[0]).toMatchObject({ calle: 'Junín', numero: '', ciudad: 'Corrientes' });
    expect(leerLugares(coleccion(feature({ type: 'city', name: 'Resistencia', state: 'Chaco' })))[0]).toMatchObject({ calle: '', ciudad: 'Resistencia', etiqueta: 'Resistencia, Chaco' });
  });

  it('lo que se llama como lo buscado va primero: «Palermo» antes que un lugar de adentro de Palermo', () => {
    const aeroparque = feature({ type: 'house', name: 'Aeroparque', street: 'Costanera', district: 'Palermo', city: 'Buenos Aires' }, -58.41, -34.55);
    expect(leerLugares(coleccion(aeroparque, barrio), 'Palermo, Buenos Aires').map((l) => l.etiqueta.split(',')[0])).toEqual(['Palermo', 'Aeroparque']);
    expect(leerLugares(coleccion(aeroparque, barrio))[0].etiqueta).toBe('Aeroparque, Palermo, Buenos Aires');
  });
});

describe('urlDeLugares', () => {
  it('no busca con poco texto y escapa lo escrito', () => {
    expect(urlDeLugares('ab')).toBeNull();
    expect(urlDeLugares('San Luis 967 & más')).toContain('q=San%20Luis%20967%20%26%20m%C3%A1s');
    const url = urlDeLugares('San Luis 967')!;
    expect(url.startsWith('https://photon.komoot.io/api?')).toBe(true);
    // Solo Argentina, y sin «lang=es»: Photon responde 400 a ese idioma.
    expect(url).toContain('countrycode=AR');
    expect(url).toContain('lang=default');
  });
});

describe('red simulada', () => {
  const original = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = original;
  });

  it('buscarLugares: la lista, o vacía si falla', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => coleccion(direccion) }));
    expect((await buscarLugares('San Luis 967')).length).toBe(1);
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('sin red');
    });
    expect(await buscarLugares('San Luis 967')).toEqual([]);
    (globalThis as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await buscarLugares('San Luis 967')).toEqual([]);
  });

  it('detallesDeUbicacion: código postal, barrio y ciudad de un punto (solo Argentina)', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => coleccion(feature({ ...PROPIEDADES, postcode: undefined }), feature(PROPIEDADES)) }));
    expect(await detallesDeUbicacion(-27.4698, -58.8306)).toEqual({ codigoPostal: 'W3400', barrio: 'Barrio Deportes', ciudad: 'Corrientes', provincia: 'Corrientes' });
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => coleccion(feature({ ...PROPIEDADES, countrycode: 'BR' })) }));
    expect(await detallesDeUbicacion(-27, -58)).toBeNull();
  });

  it('detallesDeUbicacion: sin coordenadas válidas no pregunta nada', async () => {
    const f = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    (globalThis as any).fetch = f;
    for (const [la, lo] of [[undefined, 1], [95, 0], [0, 200], ['x', 'y']]) expect(await detallesDeUbicacion(la, lo)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('sanearNumeroDePuerta', () => {
  it('solo dígitos, hasta 6, sin ceros a la izquierda', () => {
    expect(sanearNumeroDePuerta('1234')).toBe('1234');
    expect(sanearNumeroDePuerta('12a')).toBe('12');
    expect(sanearNumeroDePuerta('S/N')).toBe('');
    expect(sanearNumeroDePuerta('0012')).toBe('12');
    expect(sanearNumeroDePuerta('1234567')).toBe('123456');
    for (const raro of [null, undefined, '', {}, 12]) expect(typeof sanearNumeroDePuerta(raro)).toBe('string');
    expect(sanearNumeroDePuerta(12)).toBe('12');
  });
});

describe('sanearCalle', () => {
  it('saca el número de la casa que quedó escrito en la calle', () => {
    expect(sanearCalle('Av Corrientes 1234')).toEqual({ calle: 'Av Corrientes', numero: '1234' });
    expect(sanearCalle('  San  Luis,  967 ')).toEqual({ calle: 'San Luis', numero: '967' });
  });

  it('cuando el número es parte del nombre no lo separa', () => {
    for (const nombre of ['Calle 14', 'Ruta 9', 'Pasaje 3', 'Avenida 7', '25 de Mayo', '9 de Julio']) expect(sanearCalle(nombre)).toEqual({ calle: nombre, numero: '' });
  });

  it('una calle sin número queda igual; lo raro no rompe', () => {
    expect(sanearCalle('Corrientes')).toEqual({ calle: 'Corrientes', numero: '' });
    for (const raro of [null, undefined, '', 123]) expect(sanearCalle(raro).numero).toBe('');
    expect(sanearCalle('<b>Santa Fe</b> 100').calle).toBe('bSanta Fe/b');
  });
});

describe('validarCalleYNumero', () => {
  it('bien: calle con letras y número de dígitos (o vacío)', () => {
    expect(validarCalleYNumero('Av Corrientes', '1234')).toBeNull();
    expect(validarCalleYNumero('Calle 14', '500')).toBeNull();
    expect(validarCalleYNumero('', '')).toBeNull();
    expect(validarCalleYNumero('San Martín', '')).toBeNull();
  });

  it('mal: letras en el número, calle solo de números, número repetido en la calle', () => {
    expect(validarCalleYNumero('Av Corrientes', '12a')).toMatch(/solo puede tener números/);
    expect(validarCalleYNumero('Av Corrientes', 'S/N')).toMatch(/solo puede tener números/);
    expect(validarCalleYNumero('1234', '5')).toMatch(/nombre de la calle/);
    expect(validarCalleYNumero('Av Corrientes 1234', '1234')).toMatch(/dos veces/);
    expect(validarCalleYNumero('x'.repeat(121), '')).toMatch(/demasiado larga/);
  });
});
