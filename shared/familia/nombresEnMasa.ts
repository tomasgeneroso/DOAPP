/**
 * Nombres pegados en masa para emitir códigos de familia (regla del dueño, 2026-11-11: «poder crear códigos en masa agregando nombres separados por comas»).
 *
 * Lo usan la pantalla (para mostrar cuántos nombres entendió y cuáles no, antes de crear nada) y el servidor (para crear de verdad): una sola lectura, para que las dos
 * vean lo mismo. Los nombres se separan por coma, punto y coma o salto de línea. La primera palabra es el nombre y el resto el apellido (se puede corregir después, editando
 * el código); cada código necesita las dos cosas.
 */

export const MAXIMO_DE_NOMBRES_POR_TANDA = 200;
const MAXIMO_DE_LARGO = 100;

/** Palabras que van en minúscula dentro de un nombre («Mauricio de los Reyes»), salvo al principio. */
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'le']);

export interface NombreSeparado {
  /** Como lo escribió la persona. */
  texto: string;
  nombre: string;
  apellido: string;
  completo: string;
  /** Para comparar: sin mayúsculas, sin tildes y con un solo espacio. Dos escrituras del mismo nombre tienen la misma clave. */
  clave: string;
}

export interface NombreInvalido {
  texto: string;
  motivo: string;
}

export interface NombresSeparados {
  validos: NombreSeparado[];
  invalidos: NombreInvalido[];
  /** Los que venían repetidos en la misma lista (se cuentan una sola vez). */
  repetidos: string[];
  /** Pasaban el tope por tanda y no se tomaron. */
  excedentes: number;
}

/** Sin mayúsculas, sin tildes, un solo espacio: «  JOSÉ  Pérez » y «jose perez» son el mismo nombre. */
export function claveDeNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** «mauricio DE LOS reyes» → «Mauricio de los Reyes». */
export function capitalizarNombre(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((palabra, i) => {
      const minuscula = palabra.toLocaleLowerCase('es-AR');
      if (i > 0 && CONECTORES.has(minuscula)) return minuscula;
      // Cada tramo de una palabra con guion o apóstrofe empieza con mayúscula («Pérez-Gómez», «D'Angelo»).
      return minuscula.replace(/(^|[-'’])(\p{L})/gu, (_t, previo: string, letra: string) => previo + letra.toLocaleUpperCase('es-AR'));
    })
    .join(' ');
}

const SOLO_LETRAS = /^[\p{L}][\p{L}'’.\- ]*$/u;

export function separarNombres(texto: string): NombresSeparados {
  const crudos = String(texto ?? '')
    .split(/[,;\n\r]+/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const validos: NombreSeparado[] = [];
  const invalidos: NombreInvalido[] = [];
  const repetidos: string[] = [];
  const vistos = new Set<string>();
  let excedentes = 0;

  for (const original of crudos) {
    if (!SOLO_LETRAS.test(original)) {
      invalidos.push({ texto: original, motivo: 'Tiene números o símbolos: solo letras, espacios, guion, apóstrofe y punto.' });
      continue;
    }
    const completo = capitalizarNombre(original);
    const [nombre, ...resto] = completo.split(' ');
    const apellido = resto.join(' ');
    if (!apellido) {
      invalidos.push({ texto: original, motivo: 'Falta el apellido: escribí nombre y apellido.' });
      continue;
    }
    if (nombre.length > MAXIMO_DE_LARGO || apellido.length > MAXIMO_DE_LARGO) {
      invalidos.push({ texto: original, motivo: `Es demasiado largo (hasta ${MAXIMO_DE_LARGO} letras por parte).` });
      continue;
    }
    const clave = claveDeNombre(completo);
    if (vistos.has(clave)) {
      repetidos.push(completo);
      continue;
    }
    if (validos.length >= MAXIMO_DE_NOMBRES_POR_TANDA) {
      excedentes++;
      continue;
    }
    vistos.add(clave);
    validos.push({ texto: original, nombre, apellido, completo, clave });
  }
  return { validos, invalidos, repetidos, excedentes };
}
