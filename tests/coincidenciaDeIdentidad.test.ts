import { describe, it, expect } from '@jest/globals';
import { compararDni, compararIdentidad, compararNombre, palabrasDelNombre } from '../shared/identidad/coincidencia.js';

describe('coincidencia de identidad (registro vs documento de Didit)', () => {
  describe('nombre', () => {
    it('no importan mayúsculas, tildes ni el orden: «Tomás Generoso» es «GENEROSO TOMAS»', () => {
      expect(compararNombre('Tomás Generoso', 'TOMAS', 'GENEROSO')).toBe('coincide');
      expect(compararNombre('generoso tomas', 'Tomás', 'Generoso')).toBe('coincide');
    });

    it('el documento puede tener nombres de más, o el registro: alcanza con que estén todas las palabras de la versión corta', () => {
      expect(compararNombre('Tomás Generoso', 'TOMAS ANDRES', 'GENEROSO')).toBe('coincide');
      expect(compararNombre('Tomás Andrés Generoso', 'TOMAS', 'GENEROSO')).toBe('coincide');
      expect(compararNombre('María de los Ángeles Pérez', 'MARIA ANGELES', 'PEREZ')).toBe('coincide');
    });

    it('una persona distinta no coincide', () => {
      expect(compararNombre('Tomás Generoso', 'JUAN', 'PEREZ')).toBe('no_coincide');
      expect(compararNombre('Tomás Generoso', 'TOMAS', 'PEREZ')).toBe('no_coincide'); // mismo nombre, otro apellido
      expect(compararNombre('Ana Pérez', 'ANA', 'GOMEZ')).toBe('no_coincide');
    });

    it('una sola palabra no alcanza (solo el nombre o solo el apellido)', () => {
      expect(compararNombre('Tomás', 'TOMAS', 'GENEROSO')).toBe('no_coincide');
      expect(compararNombre('Generoso', 'TOMAS', 'GENEROSO')).toBe('no_coincide');
    });

    it('tolera una letra de diferencia en palabras largas (6 o más letras, tipeo) pero no en las cortas', () => {
      expect(compararNombre('Tomas Generozo', 'TOMAS', 'GENEROSO')).toBe('coincide');
      expect(compararNombre('Ana Gomes', 'ANA', 'GOMEZ')).toBe('no_coincide'); // «gomes»/«gomez»: corta
      expect(compararNombre('Tomas Generoso', 'TOMAS', 'GENERESA')).toBe('no_coincide'); // dos letras
    });

    it('lo que falta se dice: sin dato, nunca «coincide»', () => {
      expect(compararNombre('', 'TOMAS', 'GENEROSO')).toBe('sin_dato');
      expect(compararNombre('Tomás Generoso', '', '')).toBe('sin_dato');
      expect(compararNombre(null, undefined, undefined)).toBe('sin_dato');
    });

    it('palabrasDelNombre descarta las partículas y los signos', () => {
      expect(palabrasDelNombre("María del Carmen O'Brien")).toEqual(['maria', 'carmen', 'o', 'brien']);
    });
  });

  describe('dni', () => {
    it('compara solo los dígitos', () => {
      expect(compararDni('30.111.222', '30111222')).toBe('coincide');
      expect(compararDni(30111222, '30111222')).toBe('coincide');
      expect(compararDni('30111222', '30111223')).toBe('no_coincide');
      expect(compararDni('', '30111222')).toBe('sin_dato');
      expect(compararDni('30111222', null)).toBe('sin_dato');
    });
  });

  describe('identidad completa', () => {
    const doc = { nombres: 'TOMAS ANDRES', apellidos: 'GENEROSO', dni: '30111222' };

    it('coincide solo si coinciden el nombre Y el DNI', () => {
      expect(compararIdentidad({ nombre: 'Tomás Generoso', dni: '30111222' }, doc)).toMatchObject({ coincide: true, nombre: 'coincide', dni: 'coincide', motivos: [] });
    });

    it('si falla uno, no coincide y dice cuál', () => {
      const a = compararIdentidad({ nombre: 'Tomás Generoso', dni: '99999999' }, doc);
      expect(a.coincide).toBe(false);
      expect(a.motivos.join(' ')).toMatch(/DNI/);
      const b = compararIdentidad({ nombre: 'Juan Pérez', dni: '30111222' }, doc);
      expect(b.coincide).toBe(false);
      expect(b.motivos.join(' ')).toMatch(/nombre/);
    });

    it('falla cerrada: lo que no se puede comparar no se aprueba', () => {
      expect(compararIdentidad({ nombre: 'Tomás Generoso', dni: '30111222' }, { nombres: '', apellidos: '', dni: '30111222' }).coincide).toBe(false);
      expect(compararIdentidad({ nombre: 'Tomás Generoso', dni: '30111222' }, { nombres: 'TOMAS', apellidos: 'GENEROSO', dni: null }).coincide).toBe(false);
      expect(compararIdentidad({ nombre: 'Tomás Generoso', dni: null }, doc).coincide).toBe(false);
    });
  });
});
