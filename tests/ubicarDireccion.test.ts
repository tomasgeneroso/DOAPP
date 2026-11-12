import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { consultaLibre, esDireccionCompleta, hayQueUbicar, ubicarDireccion, zoomPara } from '../shared/geo/ubicar.js';

/**
 * El mapa del formulario de un trabajo (2026-11-11: «no me reubica el pin, tiene que estar constantemente actualizándose» y «no me deja seleccionar la categoría»).
 *
 * Antes la dirección que se buscaba repetía el número y la localidad («Ayacucho 470, H3500 Resistencia, Chaco, Argentina 470, …») y el buscador devolvía la «Ayacucho» de Buenos
 * Aires; además el mapa solo leía las coordenadas al abrirse. Y el formulario se redibujaba en el evento `input`, antes del `change` del selector, y React le devolvía la categoría vieja.
 */
const RAIZ = process.cwd();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const georef = (lat: number, lon: number, ciudad = 'Resistencia', provincia = 'Chaco') => ({
  direcciones: [{ calle: { nombre: 'AYACUCHO' }, altura: { valor: 470 }, localidad_censal: { nombre: ciudad }, provincia: { nombre: provincia }, ubicacion: { lat, lon } }],
});
const osm = (lat: number, lon: number) => [{ lat: String(lat), lon: String(lon), address: { country_code: 'ar', road: 'Ayacucho', house_number: '470', city: 'Resistencia', state: 'Chaco' } }];

function simularRed(handlers: { georef?: () => unknown; osm?: () => unknown }) {
  const pedidos: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    pedidos.push(u);
    const cuerpo = u.includes('apis.datos.gob.ar') ? handlers.georef?.() : u.includes('nominatim') ? handlers.osm?.() : undefined;
    return { ok: cuerpo !== undefined, json: async () => cuerpo } as Response;
  }) as typeof fetch;
  return pedidos;
}

describe('qué se le pregunta al buscador', () => {
  it('una calle simple con número: «Ayacucho 470» más la localidad, sin repetir nada', () => {
    expect(consultaLibre({ calle: 'Ayacucho', numero: '470', lugar: 'Resistencia, Chaco' })).toBe('Ayacucho 470, Resistencia, Chaco, Argentina');
    expect(consultaLibre({ calle: 'Ayacucho 470', numero: '470', lugar: 'Resistencia, Chaco' })).toBe('Ayacucho 470, Resistencia, Chaco, Argentina'); // el número ya estaba en la calle
  });

  it('una calle que ya es una dirección completa se manda tal cual: no se le agrega el número ni la ubicación otra vez (el error del pin en Buenos Aires)', () => {
    const completa = 'Ayacucho 470, H3500 Resistencia, Chaco, Argentina';
    expect(esDireccionCompleta(completa)).toBe(true);
    expect(consultaLibre({ calle: completa, numero: '470', lugar: 'Chaco' })).toBe(completa);
    expect(consultaLibre({ calle: 'Ayacucho 470, Resistencia', numero: '470' })).toBe('Ayacucho 470, Resistencia, Argentina');
  });

  it('sin calle, la localidad sola; y sin nada que buscar no se busca', () => {
    expect(consultaLibre({ lugar: 'Resistencia, Chaco' })).toBe('Resistencia, Chaco, Argentina');
    expect(consultaLibre({})).toBe('');
    expect(hayQueUbicar({})).toBe(false);
    expect(hayQueUbicar({ calle: 'Av' })).toBe(false);
    expect(hayQueUbicar({ lugar: 'Rosario' })).toBe(true);
  });

  it('el zoom depende de qué tan precisa es la dirección: número → de cerca; calle → medio; localidad → de lejos', () => {
    expect(zoomPara({ calle: 'Ayacucho', numero: '470' })).toBe(17);
    expect(zoomPara({ calle: 'Ayacucho' })).toBe(16);
    expect(zoomPara({ lugar: 'Resistencia, Chaco' })).toBe(13);
  });
});

describe('ubicarDireccion', () => {
  it('con una calle simple busca primero en Georef, ACOTADO a la provincia y la localidad, y usa su punto', async () => {
    const pedidos = simularRed({ georef: () => georef(-27.4538, -58.9867) });
    const r = await ubicarDireccion({ calle: 'Ayacucho', numero: '470', lugar: 'Resistencia, Chaco', provincia: 'Chaco', ciudad: 'Resistencia' });
    expect(r).toEqual({ lat: -27.4538, lon: -58.9867, zoom: 17, fuente: 'georef' });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toContain('provincia=Chaco');
    expect(pedidos[0]).toContain('localidad_censal=Resistencia');
    expect(decodeURIComponent(pedidos[0])).toContain('direccion=Ayacucho 470');
  });

  it('si Georef no la tiene, cae a OpenStreetMap con el texto armado', async () => {
    const pedidos = simularRed({ georef: () => ({ direcciones: [] }), osm: () => osm(-27.45, -58.98) });
    const r = await ubicarDireccion({ calle: 'Ayacucho', numero: '470', lugar: 'Resistencia, Chaco', provincia: 'Chaco', ciudad: 'Resistencia' });
    expect(r).toMatchObject({ lat: -27.45, lon: -58.98, fuente: 'osm' });
    expect(pedidos).toHaveLength(2);
    expect(decodeURIComponent(pedidos[1])).toContain('q=Ayacucho 470, Resistencia, Chaco, Argentina');
  });

  it('una dirección completa va directo a OpenStreetMap y no consulta Georef', async () => {
    const pedidos = simularRed({ osm: () => osm(-27.45, -58.98) });
    const r = await ubicarDireccion({ calle: 'Ayacucho 470, H3500 Resistencia, Chaco, Argentina', numero: '470', lugar: 'Resistencia, Chaco' });
    expect(r).toMatchObject({ fuente: 'osm', zoom: 17 });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toContain('nominatim');
    const q = decodeURIComponent(pedidos[0]).split('&q=')[1];
    expect(q).toBe('Ayacucho 470, H3500 Resistencia, Chaco, Argentina'); // sin el número ni la localidad repetidos
  });

  it('con solo la localidad se centra en ella, de lejos', async () => {
    simularRed({ osm: () => osm(-27.46, -58.98) });
    expect(await ubicarDireccion({ lugar: 'Resistencia, Chaco' })).toMatchObject({ zoom: 13, fuente: 'osm' });
  });

  it('si no encuentra nada devuelve null (el mapa dice «no encontramos esa dirección» y deja el pin a mano); con la red caída también', async () => {
    simularRed({ georef: () => ({ direcciones: [] }), osm: () => [] });
    expect(await ubicarDireccion({ calle: 'Calle Inexistente', numero: '9', lugar: 'Resistencia, Chaco' })).toBeNull();
    globalThis.fetch = (async () => { throw new Error('sin red'); }) as typeof fetch;
    expect(await ubicarDireccion({ calle: 'Ayacucho', numero: '470', lugar: 'Resistencia, Chaco' })).toBeNull();
  });

  it('una búsqueda abortada (la persona siguió escribiendo) no devuelve un punto viejo', async () => {
    const control = new AbortController();
    simularRed({ georef: () => { control.abort(); return georef(-27.4538, -58.9867); } });
    expect(await ubicarDireccion({ calle: 'Ayacucho', numero: '470', provincia: 'Chaco' }, { signal: control.signal })).toBeNull();
  });
});

describe('guardas del formulario de un trabajo', () => {
  const pantalla = readFileSync(join(RAIZ, 'client/pages/CreateContractScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const mapa = readFileSync(join(RAIZ, 'client/components/LocationPinMap.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('el formulario NO escucha «onInput»: se redibujaba antes del «change» del selector y React le devolvía la categoría vieja (no dejaba elegir)', () => {
    const etiqueta = pantalla.match(/<form [^>]*>/)?.[0] ?? '';
    expect(etiqueta).toContain('onChange=');
    expect(etiqueta).not.toContain('onInput=');
  });

  it('el mapa recibe las coordenadas y las partes de la dirección (no solo al abrirse) y avisa cuando la persona coloca el pin', () => {
    const uso = pantalla.slice(pantalla.indexOf('<LocationPinMap'), pantalla.indexOf('/>', pantalla.indexOf('<LocationPinMap')));
    for (const prop of ['calle=', 'numero=', 'lugar=', 'provincia=', 'ciudad=', 'lat={latitude}', 'lng={longitude}', 'onPinMovedByUser=']) expect(uso).toContain(prop);
    expect(mapa).toMatch(/useEffect\(\(\) => \{[\s\S]*?moverA\(lat, lng, 17\)/); // el pin sigue a las coordenadas que le llegan
  });
});
