import { buscarLugares } from '../../shared/geo/lugares';

const CLAVE_DE_PUNTOS = 'doapp:puntos-del-mapa';
const MAXIMO_DE_PUNTOS = 300;
const enMemoria = new Map<string, [number, number]>();
const enCurso = new Map<string, Promise<[number, number] | null>>();
let fila: Promise<unknown> = Promise.resolve();

function puntosGuardados(): Record<string, [number, number]> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DE_PUNTOS) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * El punto de una zona escrita como texto, cuando no hay coordenadas guardadas. El buscador es un servicio público que pide uso razonable: cada texto se pregunta
 * UNA vez (queda en este navegador) y las consultas van de a una, nunca en tanda.
 */
export function puntoDeUnaZona(texto: string): Promise<[number, number] | null> {
  const clave = texto.toLowerCase().trim();
  const sabido = enMemoria.get(clave) || puntosGuardados()[clave];
  if (sabido) return Promise.resolve(sabido);
  const pendiente = enCurso.get(clave);
  if (pendiente) return pendiente;
  const consulta = /argentina/i.test(texto) ? texto : `${texto}, Argentina`;
  const pedido = fila.then(async (): Promise<[number, number] | null> => {
    const [lugar] = await buscarLugares(consulta);
    if (!lugar) return null;
    const punto: [number, number] = [lugar.lat, lugar.lon];
    enMemoria.set(clave, punto);
    try {
      const todos = Object.entries({ ...puntosGuardados(), [clave]: punto }).slice(-MAXIMO_DE_PUNTOS);
      localStorage.setItem(CLAVE_DE_PUNTOS, JSON.stringify(Object.fromEntries(todos)));
    } catch { /* sin almacenamiento: queda en memoria */ }
    return punto;
  }).finally(() => enCurso.delete(clave));
  enCurso.set(clave, pedido);
  fila = pedido.catch(() => undefined);
  return pedido;
}

/**
 * Una coordenada válida, venga como número o como texto («-34.60370000»); null si no hay.
 *
 * Postgres entrega los DECIMAL como texto. Un chequeo `typeof x === 'number'` descartaba las coordenadas exactas guardadas del trabajo y el
 * mapa terminaba centrado en el centro de la ciudad en vez de en la dirección.
 */
export function aCoordenada(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : parseFloat(String(valor));
  return Number.isFinite(n) ? n : null;
}
