import { describe, it, expect } from '@jest/globals';
import { claveDePersona, datosDelDocumentoDeDidit, fechaDeNacimientoValida, primerApellido, primerNombre, soloLetras } from '../shared/identidad/clavePersona.js';

/**
 * La clave de persona: lo que comparten los documentos de una misma persona aunque cada uno tenga otro número.
 *
 * El caso que la motivó: DNI y pasaporte argentinos y DNI y pasaporte italianos de la MISMA persona. Los cuatro tienen que dar la misma clave;
 * dos personas distintas, no.
 */

describe('claveDePersona', () => {
  it('los cuatro documentos de la misma persona dan la misma clave (aunque el formato del nombre cambie)', () => {
    const dniArgentino = { apellidos: 'GENEROSO', nombres: 'TOMÁS', fechaDeNacimiento: '1990-05-15' };
    const pasaporteArgentino = { apellidos: 'Generoso', nombres: 'Tomas', fechaDeNacimiento: '1990-05-15' };
    const pasaporteItaliano = { apellidos: 'GENEROSO', nombres: 'TOMAS', fechaDeNacimiento: '1990-05-15' };
    const dniItaliano = { apellidos: 'Generoso', nombres: 'TOMAS ANDRES', fechaDeNacimiento: '1990-05-15' };
    const claves = [dniArgentino, pasaporteArgentino, pasaporteItaliano, dniItaliano].map((d) => claveDePersona(d));
    expect(new Set(claves).size).toBe(1);
    expect(claves[0]).toBe('GENEROSO|TOMAS|1990-05-15');
  });

  it('un documento con dos apellidos y otro con uno solo coinciden (se usa el primero)', () => {
    expect(claveDePersona({ apellidos: 'PÉREZ GARCÍA', nombres: 'María José', fechaDeNacimiento: '1985-12-01' }))
      .toBe(claveDePersona({ apellidos: 'PEREZ', nombres: 'MARIA', fechaDeNacimiento: '1985-12-01' }));
  });

  it('las partículas no cuentan como apellido: DE LA CRUZ, DI MARIA, DA SILVA', () => {
    expect(primerApellido('DE LA CRUZ')).toBe('CRUZ');
    expect(primerApellido('Di Maria')).toBe('MARIA');
    expect(primerApellido('da Silva Santos')).toBe('SILVA');
    expect(primerApellido("O'Brien")).toBe('O');
  });

  it('personas distintas dan claves distintas (otro nombre, otro apellido u otra fecha)', () => {
    const base = { apellidos: 'GENEROSO', nombres: 'TOMAS', fechaDeNacimiento: '1990-05-15' };
    const clave = claveDePersona(base);
    expect(claveDePersona({ ...base, nombres: 'MATIAS' })).not.toBe(clave);
    expect(claveDePersona({ ...base, apellidos: 'GENEROSA' })).not.toBe(clave);
    expect(claveDePersona({ ...base, fechaDeNacimiento: '1990-05-16' })).not.toBe(clave);
  });

  it('sin alguno de los tres datos no hay clave (mejor ninguna que una floja que junte a personas distintas)', () => {
    expect(claveDePersona({ apellidos: 'GENEROSO', nombres: 'TOMAS' })).toBeNull();
    expect(claveDePersona({ apellidos: 'GENEROSO', fechaDeNacimiento: '1990-05-15' })).toBeNull();
    expect(claveDePersona({ nombres: 'TOMAS', fechaDeNacimiento: '1990-05-15' })).toBeNull();
    expect(claveDePersona({})).toBeNull();
    expect(claveDePersona({ apellidos: 'DE LA', nombres: 'TOMAS', fechaDeNacimiento: '1990-05-15' })).toBeNull();
  });
});

describe('fechaDeNacimientoValida', () => {
  const hoy = new Date('2026-11-06T12:00:00Z');
  it('acepta AAAA-MM-DD razonables', () => {
    expect(fechaDeNacimientoValida('1990-05-15', hoy)).toBe('1990-05-15');
    expect(fechaDeNacimientoValida('2026-11-06', hoy)).toBe('2026-11-06');
  });
  it('rechaza lo que no sea una fecha de verdad', () => {
    for (const mala of ['1990-02-31', '15/05/1990', '1990-5-15', '1850-01-01', '2030-01-01', '', null, undefined, 'abc', 19900515]) {
      expect([mala, fechaDeNacimientoValida(mala, hoy)]).toEqual([mala, null]);
    }
  });
});

describe('soloLetras / primerNombre', () => {
  it('saca acentos, signos y mayúsculas', () => {
    expect(soloLetras('  María-José   Ñandú ')).toBe('MARIA JOSE NANDU');
    expect(primerNombre('María José')).toBe('MARIA');
    expect(primerNombre('')).toBeNull();
  });
});

describe('datosDelDocumentoDeDidit', () => {
  it('lee los campos que Didit documenta (first_name, last_name, date_of_birth) de id_verifications[0]', () => {
    const decision = { id_verifications: [{ first_name: 'Tomás', last_name: 'Generoso', date_of_birth: '1990-05-15', document_number: 'AB1234567' }] };
    expect(claveDePersona(datosDelDocumentoDeDidit(decision))).toBe('GENEROSO|TOMAS|1990-05-15');
  });
  it('tolera la forma vieja (id_verification) y la ausencia de datos', () => {
    expect(claveDePersona(datosDelDocumentoDeDidit({ id_verification: { first_name: 'Ana', last_name: 'Gómez', date_of_birth: '2000-01-02' } }))).toBe('GOMEZ|ANA|2000-01-02');
    expect(claveDePersona(datosDelDocumentoDeDidit(null))).toBeNull();
    expect(claveDePersona(datosDelDocumentoDeDidit({ id_verifications: [] }))).toBeNull();
  });
});
