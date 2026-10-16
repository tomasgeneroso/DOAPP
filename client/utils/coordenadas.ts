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
