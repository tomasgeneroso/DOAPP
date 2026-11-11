import { describe, it, expect } from '@jest/globals';
import { capitalizarNombre, claveDeNombre, MAXIMO_DE_NOMBRES_POR_TANDA, separarNombres } from '../shared/familia/nombresEnMasa.js';

/**
 * Códigos de familia en masa: los nombres se pegan separados por comas. Una sola lectura (la pantalla y el servidor usan esta misma) que separa, ordena las mayúsculas, junta los
 * repetidos y dice qué nombre no se puede usar y por qué. Los nombres de acá son inventados.
 */
describe('separarNombres', () => {
  it('separa por coma, punto y coma o salto de línea, y ordena mayúsculas y espacios', () => {
    const r = separarNombres('ana pérez,  LUIS de la TORRE ; maría paz ríos gómez\nzoe   d\'angelo');
    expect(r.validos.map((n) => n.completo)).toEqual(['Ana Pérez', 'Luis de la Torre', 'María Paz Ríos Gómez', "Zoe D'Angelo"]);
    expect(r.invalidos).toEqual([]);
  });

  it('la primera palabra es el nombre y el resto el apellido', () => {
    const [ana, maria] = separarNombres('Ana Pérez, María Paz Ríos Gómez').validos;
    expect([ana.nombre, ana.apellido]).toEqual(['Ana', 'Pérez']);
    expect([maria.nombre, maria.apellido]).toEqual(['María', 'Paz Ríos Gómez']);
  });

  it('los conectores van en minúscula salvo al principio, y los guiones mantienen las mayúsculas', () => {
    expect(capitalizarNombre('mauricio DE LOS reyes')).toBe('Mauricio de los Reyes');
    expect(capitalizarNombre('pérez-gómez')).toBe('Pérez-Gómez');
    expect(capitalizarNombre('de la fuente')).toBe('De la Fuente');
  });

  it('un nombre sin apellido, con números o con símbolos no se usa y dice por qué', () => {
    const r = separarNombres('Ana, Luis Pérez, Beto 2 Gómez, Carla @ Ríos, Diana Torres');
    expect(r.validos.map((n) => n.completo)).toEqual(['Luis Pérez', 'Diana Torres']);
    expect(r.invalidos.map((i) => i.texto)).toEqual(['Ana', 'Beto 2 Gómez', 'Carla @ Ríos']);
    expect(r.invalidos[0].motivo).toMatch(/apellido/i);
    expect(r.invalidos[1].motivo).toMatch(/números o símbolos/i);
  });

  it('el mismo nombre escrito dos veces (con otras mayúsculas o sin tildes) cuenta una sola vez', () => {
    const r = separarNombres('José Pérez, jose perez, JOSÉ  PÉREZ, Otra Persona');
    expect(r.validos.map((n) => n.completo)).toEqual(['José Pérez', 'Otra Persona']);
    expect(r.repetidos).toHaveLength(2);
  });

  it('lo vacío no da nada, y las comas de más no inventan nombres', () => {
    expect(separarNombres('')).toMatchObject({ validos: [], invalidos: [], repetidos: [], excedentes: 0 });
    expect(separarNombres('  ,, ;\n , ').validos).toEqual([]);
    expect(separarNombres(null as unknown as string).validos).toEqual([]);
  });

  it(`hasta ${MAXIMO_DE_NOMBRES_POR_TANDA} por tanda: el resto se cuenta como excedente`, () => {
    const lista = Array.from({ length: MAXIMO_DE_NOMBRES_POR_TANDA + 5 }, (_, i) => `Persona${String.fromCharCode(97 + (i % 26))}${'x'.repeat(Math.floor(i / 26))} Apellido${String.fromCharCode(97 + (i % 26))}${'y'.repeat(Math.floor(i / 26))}`).join(', ');
    const r = separarNombres(lista);
    expect(r.validos).toHaveLength(MAXIMO_DE_NOMBRES_POR_TANDA);
    expect(r.excedentes).toBe(5);
  });

  it('un nombre o un apellido de más de 100 letras no se usa', () => {
    const r = separarNombres(`${'a'.repeat(101)} Pérez, Ana ${'b'.repeat(101)}`);
    expect(r.validos).toEqual([]);
    expect(r.invalidos).toHaveLength(2);
  });
});

describe('claveDeNombre', () => {
  it('no distingue mayúsculas, tildes ni espacios de más', () => {
    expect(claveDeNombre('  JOSÉ   Pérez ')).toBe('jose perez');
    expect(claveDeNombre('Ñandú Gómez')).toBe('nandu gomez');
  });
});
