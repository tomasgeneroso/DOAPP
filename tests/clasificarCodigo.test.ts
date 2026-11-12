import { describe, it, expect } from '@jest/globals';
import { clasificarCodigo, candidatosDeCodigo } from '../client/utils/clasificarCodigo';

describe('clasificarCodigo (el campo «Tengo un código»)', () => {
  it('invitación de un creador: el código, en minúsculas, sin guion, o el enlace entero', () => {
    const esperado = { tipo: 'invitacion', codigo: 'INF-ABCD2345WXYZ' };
    expect(clasificarCodigo('INF-ABCD2345WXYZ')).toEqual(esperado);
    expect(clasificarCodigo('  inf-abcd2345wxyz ')).toEqual(esperado);
    expect(clasificarCodigo('https://doapparg.com/invitacion/INF-ABCD2345WXYZ?x=1')).toEqual(esperado);
  });

  it('invitación sin el «INF-» o con espacios y guiones de más', () => {
    const esperado = { tipo: 'invitacion', codigo: 'INF-ABCD2345WXYZ' };
    expect(clasificarCodigo('ABCD2345WXYZ')).toEqual(esperado);
    expect(clasificarCodigo('inf abcd 2345 wxyz')).toEqual(esperado);
    expect(clasificarCodigo('INFABCD2345WXYZ')).toEqual(esperado);
    expect(clasificarCodigo('INF-ABCD-2345-WXYZ')).toEqual(esperado);
  });

  it('un código de 8 sin prefijo puede ser de un referido o de familia: se devuelven los dos, referido primero', () => {
    expect(candidatosDeCodigo('yg83bjjv')).toEqual([{ tipo: 'referido', codigo: 'YG83BJJV' }, { tipo: 'familia', codigo: 'FAM-YG83BJJV' }]);
    // con «FAM» es de familia y nada más
    expect(candidatosDeCodigo('FAM-YG83BJJV')).toEqual([{ tipo: 'familia', codigo: 'FAM-YG83BJJV' }]);
    // un código con caracteres que el de familia no usa (0, 1, I, O) solo puede ser de un referido
    expect(candidatosDeCodigo('AB01IO99')).toEqual([{ tipo: 'referido', codigo: 'AB01IO99' }]);
  });

  it('código de familia, con o sin el prefijo FAM-', () => {
    expect(clasificarCodigo('FAM-YG83BJJV')).toEqual({ tipo: 'familia', codigo: 'FAM-YG83BJJV' });
    expect(clasificarCodigo('fam yg83bjjv')).toEqual({ tipo: 'familia', codigo: 'FAM-YG83BJJV' });
  });

  it('8 letras y números sin prefijo es el código de un referido', () => {
    expect(clasificarCodigo('abc12345')).toEqual({ tipo: 'referido', codigo: 'ABC12345' });
  });

  it('lo que no tiene la forma de ningún código da null', () => {
    for (const x of ['', '   ', 'hola', 'INF-123', 'ABC1234', 'ABC123456', null, undefined]) expect(clasificarCodigo(x)).toBeNull();
  });
});

import { normalizarCodigoDeInvitacion } from '../server/services/invitacionesInfluencer';
import { normalizarCodigoDeFamilia } from '../server/services/codigoDeFamilia';

describe('los códigos valen con o sin prefijo también en el servidor', () => {
  it('invitación: con o sin INF-, en minúsculas, con espacios o guiones; lo que no es un código da null', () => {
    for (const x of ['INF-ABCD2345WXYZ', 'inf-abcd2345wxyz', 'ABCD2345WXYZ', ' inf abcd 2345 wxyz ', 'INFABCD2345WXYZ']) {
      expect(normalizarCodigoDeInvitacion(x)).toBe('INF-ABCD2345WXYZ');
    }
    for (const x of ['', 'INF-', 'ABCD2345', 'INF-ABCD2345WXY0', null, undefined]) expect(normalizarCodigoDeInvitacion(x)).toBeNull();
  });

  it('familia: con o sin FAM-, en minúsculas o con espacios', () => {
    for (const x of ['FAM-YG83BJJV', 'fam-yg83bjjv', 'YG83BJJV', ' yg83 bjjv ']) expect(normalizarCodigoDeFamilia(x)).toBe('FAM-YG83BJJV');
    expect(normalizarCodigoDeFamilia('YG83BJJ')).toBeNull();
  });
});
