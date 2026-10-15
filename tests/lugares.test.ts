import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { buscarLugares, detallesDeUbicacion, leerLugares, sanearCalle, sanearNumeroDePuerta, urlDeLugares, validarCalleYNumero } from '../shared/geo/lugares.js';

/** Lugares y direcciones reales del formulario de un trabajo. La red está simulada: ninguna prueba llama a un servicio externo. */

const direccion = {
  lat: '-27.4698', lon: '-58.8306',
  name: '', display_name: '967, San Luis, Barrio Deportes, Seccional 1°, Corrientes, Argentina',
  address: { house_number: '967', road: 'San Luis', neighbourhood: 'Barrio Deportes', city: 'Corrientes', state: 'Corrientes', postcode: 'W3400', country_code: 'ar' },
};
const barrio = {
  lat: '-34.5889', lon: '-58.4306', name: 'Palermo', display_name: 'Palermo, Buenos Aires, Argentina',
  address: { suburb: 'Palermo', city: 'Buenos Aires', state: 'Ciudad Autónoma de Buenos Aires', postcode: 'C1425', country_code: 'ar' },
};

describe('leerLugares', () => {
  it('una dirección exacta trae calle, número, barrio, ciudad, provincia, código postal y ubicación', () => {
    const [l] = leerLugares([direccion]);
    expect(l).toMatchObject({ calle: 'San Luis', numero: '967', barrio: 'Barrio Deportes', ciudad: 'Corrientes', provincia: 'Corrientes', codigoPostal: 'W3400', lat: -27.4698, lon: -58.8306 });
    expect(l.etiqueta).toBe('San Luis 967, Barrio Deportes, Corrientes, Corrientes');
  });

  it('un barrio o una localidad no inventan calle ni número', () => {
    const [l] = leerLugares([barrio]);
    expect(l).toMatchObject({ calle: '', numero: '', barrio: 'Palermo', ciudad: 'Buenos Aires', codigoPostal: 'C1425' });
    expect(l.etiqueta).toBe('Palermo, Buenos Aires, Ciudad Autónoma de Buenos Aires');
  });

  it('del número de casa solo quedan dígitos («967 bis», «S/N», «0012»)', () => {
    const con = (house_number: string) => leerLugares([{ ...direccion, address: { ...direccion.address, house_number } }])[0].numero;
    expect(con('967 bis')).toBe('967');
    expect(con('12-14')).toBe('12');
    expect(con('S/N')).toBe('');
    expect(con('0012')).toBe('12');
  });

  it('descarta lo que no tiene ubicación o es de otro país, y las repetidas', () => {
    const r = leerLugares([direccion, direccion, { ...direccion, lat: 'x' }, { ...direccion, address: { ...direccion.address, country_code: 'uy' } }, null, 1, {}]);
    expect(r).toHaveLength(1);
  });

  it('una respuesta rara da una lista vacía', () => {
    for (const raro of [null, undefined, {}, 'x', 5]) expect(leerLugares(raro)).toEqual([]);
  });

  it('código postal con otro formato no se acepta', () => {
    expect(leerLugares([{ ...direccion, address: { ...direccion.address, postcode: 'SW1A 1AA' } }])[0].codigoPostal).toBeNull();
  });
});

describe('urlDeLugares', () => {
  it('no busca con poco texto y escapa lo escrito', () => {
    expect(urlDeLugares('ab')).toBeNull();
    expect(urlDeLugares('San Luis 967 & más')).toContain('q=San%20Luis%20967%20%26%20m%C3%A1s');
    expect(urlDeLugares('San Luis 967')).toContain('addressdetails=1');
  });
});

describe('red simulada', () => {
  const original = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = original;
  });

  it('buscarLugares: la lista, o vacía si falla', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => [direccion] }));
    expect((await buscarLugares('San Luis 967')).length).toBe(1);
    (globalThis as any).fetch = jest.fn(async () => {
      throw new Error('sin red');
    });
    expect(await buscarLugares('San Luis 967')).toEqual([]);
    (globalThis as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect(await buscarLugares('San Luis 967')).toEqual([]);
  });

  it('detallesDeUbicacion: código postal, barrio y ciudad de un punto (solo Argentina)', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ address: direccion.address }) }));
    expect(await detallesDeUbicacion(-27.4698, -58.8306)).toEqual({ codigoPostal: 'W3400', barrio: 'Barrio Deportes', ciudad: 'Corrientes', provincia: 'Corrientes' });
    (globalThis as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ address: { ...direccion.address, country_code: 'br' } }) }));
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
