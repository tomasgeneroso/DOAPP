import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { cambiosPorElBarrio, consultasDeBarrio, nombreDeZona, ubicarBarrio, ubicarCodigoPostal } from '../shared/geo/coherenciaDeDireccion';

/**
 * La dirección queda congruente al cambiar el barrio o el código postal a mano (pedido del dueño, 2026-11-13): el mapa, la ciudad y el código postal (o el
 * barrio) cambian con ello, y la calle de antes se borra si ya no corresponde. Sin red: Nominatim se simula.
 */
const resultado = (a: Record<string, string>, lat = '-34.6', lon = '-58.4') => ({ lat, lon, name: a.suburb || '', display_name: a.suburb || '', address: { country_code: 'ar', ...a } });

function simularRed(porUrl: (url: string) => unknown) {
  (global as any).fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => porUrl(String(url)) }));
}

afterEach(() => { delete (global as any).fetch; });

describe('consultas y nombres', () => {
  it('las búsquedas van de la más precisa a la más amplia y sin repetirse', () => {
    expect(consultasDeBarrio('Palermo Soho', { ciudad: 'Buenos Aires', provincia: 'CABA' })).toEqual([
      'Palermo Soho, Buenos Aires, CABA', 'Palermo Soho, CABA', 'Palermo Soho, Argentina',
    ]);
    expect(consultasDeBarrio('ab')).toEqual([]);
    expect(nombreDeZona('CABA', 'CABA')).toBe('CABA');
    expect(nombreDeZona('Rosario', 'Santa Fe')).toBe('Rosario, Santa Fe');
  });
});

describe('ubicarBarrio', () => {
  it('trae el punto, la ciudad, la provincia y el código postal del barrio', async () => {
    simularRed(() => [resultado({ suburb: 'Villa Crespo', city: 'Buenos Aires', state: 'Ciudad Autónoma de Buenos Aires', postcode: 'C1414' }, '-34.60', '-58.44')]);
    const z = await ubicarBarrio('Villa Crespo', { ciudad: 'Rosario', provincia: 'Santa Fe' });
    expect(z).toMatchObject({ lat: -34.6, lon: -58.44, ciudad: 'Buenos Aires', provincia: 'Ciudad Autónoma de Buenos Aires', codigoPostal: 'C1414' });
  });

  it('si el resultado no trae código postal, se pregunta por el punto', async () => {
    simularRed((url) => url.includes('/reverse')
      ? { address: { country_code: 'ar', postcode: '1425', city: 'Buenos Aires', state: 'CABA', suburb: 'Palermo' } }
      : [resultado({ suburb: 'Palermo', city: 'Buenos Aires', state: 'CABA' })]);
    expect((await ubicarBarrio('Palermo Soho')))?.toMatchObject({ codigoPostal: '1425' });
  });

  it('un barrio que no existe devuelve null y no toca nada', async () => {
    simularRed(() => []);
    expect(await ubicarBarrio('Barrio Inventado')).toBeNull();
  });
});

describe('ubicarCodigoPostal', () => {
  it('solo acepta un resultado que de verdad tenga ESE código postal', async () => {
    simularRed((url) => url.includes('/reverse')
      ? { address: { country_code: 'ar', suburb: 'Recoleta', city: 'Buenos Aires', state: 'CABA', postcode: 'C1425' } }
      : [resultado({ suburb: 'Otro', postcode: 'C9999', city: 'X', state: 'Y' }), resultado({ suburb: 'Recoleta', postcode: 'C1425', city: 'Buenos Aires', state: 'CABA' }, '-34.59', '-58.39')]);
    const z = await ubicarCodigoPostal('1425', { ciudad: 'Buenos Aires', provincia: 'CABA' });
    expect(z).toMatchObject({ lat: -34.59, lon: -58.39, barrio: 'Recoleta', ciudad: 'Buenos Aires' });
  });

  it('un código que nadie tiene, o escrito mal, devuelve null', async () => {
    simularRed(() => [resultado({ suburb: 'Otro', postcode: 'C9999', city: 'X', state: 'Y' })]);
    expect(await ubicarCodigoPostal('1425')).toBeNull();
    expect(await ubicarCodigoPostal('xx')).toBeNull();
  });
});

describe('cambiosPorElBarrio', () => {
  const z = { lat: -34.6, lon: -58.4, ciudad: 'Buenos Aires', provincia: 'CABA', barrio: 'Palermo', codigoPostal: 'C1425' };

  it('cambia el mapa, la ciudad si es otra y el código postal; el de la lista manda', () => {
    const c = cambiosPorElBarrio(z, { ciudad: 'Rosario', provincia: 'Santa Fe' }, false, 'C1426');
    expect(c).toMatchObject({ lat: -34.6, lon: -58.4, ubicacion: 'Buenos Aires, CABA', codigoPostal: 'C1426', borrarCalle: false });
  });

  it('si la ciudad es la misma no se reescribe la ubicación', () => {
    expect(cambiosPorElBarrio(z, { ciudad: 'buenos aires', provincia: 'CABA' }, false).ubicacion).toBeNull();
  });

  it('con una calle escrita, se borra (ya no corresponde al barrio nuevo)', () => {
    expect(cambiosPorElBarrio(z, { ciudad: 'Buenos Aires' }, true).borrarCalle).toBe(true);
  });
});
