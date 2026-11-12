import { describe, it, expect } from '@jest/globals';
import { clasificarCodigo } from '../client/utils/clasificarCodigo';

describe('clasificarCodigo (el campo «Tengo un código»)', () => {
  it('invitación de un creador: el código, en minúsculas, sin guion, o el enlace entero', () => {
    const esperado = { tipo: 'invitacion', codigo: 'INF-ABCD2345WXYZ' };
    expect(clasificarCodigo('INF-ABCD2345WXYZ')).toEqual(esperado);
    expect(clasificarCodigo('  inf-abcd2345wxyz ')).toEqual(esperado);
    expect(clasificarCodigo('https://doapparg.com/invitacion/INF-ABCD2345WXYZ?x=1')).toEqual(esperado);
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
