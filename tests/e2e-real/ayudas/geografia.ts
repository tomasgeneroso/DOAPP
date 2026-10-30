import type { Route } from '@playwright/test';

/**
 * El gemelo de las DIRECCIONES. La web consulta dos servicios públicos desde el navegador mientras alguien escribe una dirección: Georef (datos.gob.ar,
 * calles y alturas que existen) y Nominatim (el código postal de un punto del mapa). Acá hay una geografía chica y fija con el mismo formato de respuesta:
 * un puñado de calles reales con su rango de números. Lo que no está en la lista «no existe» (igual que una calle inventada en Georef).
 */
interface Calle {
  nombre: string;
  desde: number;
  hasta: number;
  lat: number;
  lon: number;
  barrio: string;
  codigoPostal: string;
}

const CIUDAD = 'Ciudad Autónoma de Buenos Aires';
export const CALLES: Calle[] = [
  { nombre: 'AV. SANTA FE', desde: 1, hasta: 6899, lat: -34.5955, lon: -58.4101, barrio: 'PALERMO', codigoPostal: 'C1425' },
  { nombre: 'AV. CORRIENTES', desde: 1, hasta: 9099, lat: -34.6037, lon: -58.3816, barrio: 'SAN NICOLAS', codigoPostal: 'C1043' },
  { nombre: 'AV. CABILDO', desde: 1, hasta: 5400, lat: -34.5614, lon: -58.4503, barrio: 'BELGRANO', codigoPostal: 'C1428' },
  { nombre: 'THAMES', desde: 1, hasta: 2400, lat: -34.5876, lon: -58.4326, barrio: 'PALERMO', codigoPostal: 'C1414' },
];

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

function separar(texto: string): { calle: string; altura: number | null } {
  const m = sinTildes(texto).match(/^(.*?)(?:\s+(\d+))?$/);
  return { calle: (m?.[1] || '').trim(), altura: m?.[2] ? Number(m[2]) : null };
}

const coincide = (c: Calle, buscada: string) => {
  const a = sinTildes(c.nombre);
  const b = buscada.replace(/^av\s/, 'av ');
  return !!b && (a.includes(b) || b.includes(a) || a.replace(/^av /, '').includes(b.replace(/^av /, '')));
};

const localidad = (c: Calle) => ({ nombre: c.barrio, id: '0' });

export async function responderGeografia(route: Route): Promise<boolean> {
  const url = new URL(route.request().url());
  const json = (cuerpo: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuerpo) });

  if (url.hostname === 'apis.datos.gob.ar' && url.pathname.endsWith('/direcciones')) {
    const { calle, altura } = separar(url.searchParams.get('direccion') || '');
    const encontradas = CALLES.filter((c) => coincide(c, calle) && (altura === null || (altura >= c.desde && altura <= c.hasta)));
    await json({
      direcciones: encontradas.map((c) => ({
        calle: { nombre: c.nombre },
        altura: { valor: altura ?? undefined },
        localidad_censal: localidad(c),
        departamento: { nombre: c.barrio },
        provincia: { nombre: CIUDAD },
        ubicacion: { lat: c.lat, lon: c.lon },
      })),
      cantidad: encontradas.length,
    });
    return true;
  }

  if (url.hostname === 'apis.datos.gob.ar' && url.pathname.endsWith('/calles')) {
    const nombre = sinTildes(url.searchParams.get('nombre') || '');
    const encontradas = CALLES.filter((c) => coincide(c, nombre));
    await json({
      calles: encontradas.map((c) => ({
        nombre: c.nombre,
        altura: { inicio: { derecha: c.desde, izquierda: c.desde }, fin: { derecha: c.hasta, izquierda: c.hasta } },
        localidad_censal: localidad(c),
        provincia: { nombre: CIUDAD },
      })),
    });
    return true;
  }

  if (url.hostname === 'nominatim.openstreetmap.org') {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (url.pathname.endsWith('/reverse')) {
      const cerca = [...CALLES].sort((a, b) => Math.hypot(a.lat - lat, a.lon - lon) - Math.hypot(b.lat - lat, b.lon - lon))[0];
      await json({ address: { postcode: cerca?.codigoPostal || 'C1425', country_code: 'ar', road: cerca?.nombre }, lat, lon });
      return true;
    }
    const q = sinTildes(url.searchParams.get('q') || '');
    const c = CALLES.find((x) => q.includes(sinTildes(x.nombre).replace(/^av /, ''))) || CALLES[0];
    await json([{ lat: String(c.lat), lon: String(c.lon), display_name: `${c.nombre}, ${c.barrio}, ${CIUDAD}, Argentina` }]);
    return true;
  }
  return false;
}
