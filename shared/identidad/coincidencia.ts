/**
 * ¿La persona que verificó su identidad con Didit es la que se registró?
 *
 * Didit lee el documento (nombre, apellido, número). Si lo que se escribió al registrarse no coincide con lo que dice el documento, la
 * verificación no puede darse por buena sola: hay que mirarla (alguien pudo usar el documento de otra persona). Falla cerrada: lo que
 * no se puede comparar tampoco se aprueba.
 *
 * El nombre se compara por PALABRAS, sin importar mayúsculas, tildes, orden ni nombres de más: el documento dice «GENEROSO TOMAS
 * ANDRES» y la persona se registró como «Tomás Generoso». Alcanza con que todas las palabras de la versión más corta estén en la más
 * larga (y sean al menos dos: nombre y apellido), tolerando una letra de diferencia en palabras largas (errores de tipeo).
 */
export interface IdentidadRegistrada {
  nombre: string | null | undefined;
  dni: string | number | null | undefined;
}

export interface IdentidadDelDocumento {
  nombres: string | null | undefined;
  apellidos: string | null | undefined;
  dni: string | number | null | undefined;
}

export type Veredicto = 'coincide' | 'no_coincide' | 'sin_dato';

export interface ResultadoDeCoincidencia {
  /** Solo es true si el nombre Y el DNI se pudieron comparar y coinciden. */
  coincide: boolean;
  nombre: Veredicto;
  dni: Veredicto;
  motivos: string[];
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'do', 'di', 'van', 'von']);

/** Minúsculas, sin tildes ni signos; solo letras y espacios. */
export function normalizarTexto(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function palabrasDelNombre(v: unknown): string[] {
  return normalizarTexto(v)
    .split(' ')
    .filter((p) => p.length > 0 && !PARTICULAS.has(p));
}

/** Distancia de edición (inserciones, borrados y cambios), con corte: solo importa si es 0, 1 o más. */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = previa[0];
    previa[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardada = previa[j];
      previa[j] = Math.min(previa[j] + 1, previa[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardada;
    }
  }
  return previa[b.length];
}

const mismaPalabra = (a: string, b: string): boolean => a === b || (a.length >= 6 && b.length >= 6 && distancia(a, b) <= 1);

/** ¿Todas las palabras de `chicas` están en `grandes`? Cada palabra de `grandes` se usa una sola vez. */
function contenidas(chicas: string[], grandes: string[]): boolean {
  const libres = [...grandes];
  for (const p of chicas) {
    const i = libres.findIndex((g) => mismaPalabra(p, g));
    if (i < 0) return false;
    libres.splice(i, 1);
  }
  return true;
}

export function compararNombre(registrado: unknown, nombres: unknown, apellidos: unknown): Veredicto {
  const mias = palabrasDelNombre(registrado);
  const delDocumento = [...palabrasDelNombre(nombres), ...palabrasDelNombre(apellidos)];
  if (mias.length === 0 || delDocumento.length === 0) return 'sin_dato';
  const [chicas, grandes] = mias.length <= delDocumento.length ? [mias, delDocumento] : [delDocumento, mias];
  // Una sola palabra no alcanza para decir que es la misma persona (solo «Ana», solo un apellido…).
  if (chicas.length < 2) return 'no_coincide';
  return contenidas(chicas, grandes) ? 'coincide' : 'no_coincide';
}

const soloDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

export function compararDni(registrado: unknown, delDocumento: unknown): Veredicto {
  const a = soloDigitos(registrado);
  const b = soloDigitos(delDocumento);
  if (!a || !b) return 'sin_dato';
  return a === b ? 'coincide' : 'no_coincide';
}

export function compararIdentidad(registrada: IdentidadRegistrada, documento: IdentidadDelDocumento): ResultadoDeCoincidencia {
  const nombre = compararNombre(registrada.nombre, documento.nombres, documento.apellidos);
  const dni = compararDni(registrada.dni, documento.dni);
  const motivos: string[] = [];
  if (nombre === 'no_coincide') motivos.push('El nombre del documento no coincide con el del registro.');
  if (nombre === 'sin_dato') motivos.push('No se pudo comparar el nombre (falta en el registro o en el documento).');
  if (dni === 'no_coincide') motivos.push('El DNI del documento no coincide con el del registro.');
  if (dni === 'sin_dato') motivos.push('No se pudo comparar el DNI (falta en el registro o en el documento).');
  return { coincide: nombre === 'coincide' && dni === 'coincide', nombre, dni, motivos };
}
