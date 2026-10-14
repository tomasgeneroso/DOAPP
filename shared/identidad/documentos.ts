/**
 * DNI y CUIL/CUIT: el formato, el dígito verificador y cómo se relacionan.
 *
 * El DNI es la clave de la cuenta (no se repite). El CUIL de una persona física lleva el DNI adentro: prefijo de 2 dígitos
 * (20, 23, 24 o 27), los 8 dígitos del DNI (con ceros a la izquierda) y un dígito verificador. Por eso un CUIL que no coincide
 * con el DNI de la cuenta es un dato mal cargado, y se rechaza en vez de guardarlo.
 */

export const soloDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

/** DNI: 7 a 9 dígitos (los mismos límites del registro). */
export const dniValido = (v: unknown): boolean => /^\d{7,9}$/.test(soloDigitos(v)) && soloDigitos(v) === String(v ?? '').replace(/[.\s]/g, '');

/** Los puntos y espacios se aceptan al escribir (12.345.678); se guarda solo el número. */
export const normalizarDni = (v: unknown): string => soloDigitos(v);

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador de los 10 primeros dígitos de un CUIL/CUIT, o null si ese número no tiene dígito válido. */
export function digitoVerificador(diezDigitos: string): number | null {
  if (!/^\d{10}$/.test(diezDigitos)) return null;
  const suma = PESOS.reduce((acc, p, i) => acc + p * Number(diezDigitos[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return null; // sin dígito posible: ese prefijo+DNI no existe como CUIL
  return resto;
}

const PREFIJOS_DE_PERSONAS = new Set(['20', '23', '24', '27']);
const PREFIJOS_DE_EMPRESAS = new Set(['30', '33', '34']);

/** CUIL/CUIT: 11 dígitos, prefijo conocido y dígito verificador correcto. Acepta guiones y espacios. */
export function cuilValido(v: unknown): boolean {
  const d = soloDigitos(v);
  if (d.length !== 11) return false;
  const prefijo = d.slice(0, 2);
  if (!PREFIJOS_DE_PERSONAS.has(prefijo) && !PREFIJOS_DE_EMPRESAS.has(prefijo)) return false;
  return digitoVerificador(d.slice(0, 10)) === Number(d[10]);
}

export const esDePersona = (v: unknown): boolean => PREFIJOS_DE_PERSONAS.has(soloDigitos(v).slice(0, 2));

/** Un CUIL de persona tiene que llevar el DNI adentro. Un CUIT de empresa no se compara. */
export function cuilCoincideConDni(cuil: unknown, dni: unknown): boolean {
  const c = soloDigitos(cuil);
  const d = soloDigitos(dni);
  if (!esDePersona(c)) return true;
  if (!d) return true; // sin DNI no hay con qué comparar
  return c.slice(2, 10) === d.padStart(8, '0');
}

/** 20123456786 → 20-12345678-6 */
export function formatearCuil(v: unknown): string {
  const d = soloDigitos(v);
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v ?? '');
}

/** El primer CUIL/CUIT válido que aparezca entre los candidatos (por ejemplo, los campos que devuelve Didit), ya formateado. */
export function primerCuilValido(candidatos: unknown[], dni?: unknown): string | null {
  for (const c of candidatos) {
    if (c === undefined || c === null || c === '') continue;
    if (cuilValido(c) && cuilCoincideConDni(c, dni)) return formatearCuil(c);
  }
  return null;
}
