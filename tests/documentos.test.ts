import { describe, it, expect } from '@jest/globals';
import { explicarCuilInvalido, cuilCoincideConDni, cuilValido, digitoVerificador, dniValido, formatearCuil, normalizarDni, primerCuilValido } from '../shared/identidad/documentos.js';

describe('DNI', () => {
  it('7 a 9 dígitos; acepta puntos y espacios al escribir y guarda solo el número', () => {
    for (const ok of ['1234567', '12345678', '123456789', '12.345.678', ' 12345678 ']) expect(dniValido(ok)).toBe(true);
    for (const mal of ['', '123456', '1234567890', '1234567a', 'abcdefgh', '12-345-678', null, undefined]) expect(dniValido(mal)).toBe(false);
    expect(normalizarDni('12.345.678')).toBe('12345678');
  });
});

describe('CUIL / CUIT', () => {
  it('con dígito verificador correcto y prefijo conocido', () => {
    for (const ok of ['20123456786', '27123456780', '23123456785', '20-12345678-6', '20 12345678 6', '30500010912']) expect(cuilValido(ok)).toBe(true);
  });

  it('el dígito, el largo o el prefijo mal es inválido', () => {
    for (const mal of ['20123456787', '20123456780', '2012345678', '201234567860', '99123456786', '', 'abc', null, undefined]) expect(cuilValido(mal)).toBe(false);
  });

  it('el dígito verificador cuando no existe (resto 10) no inventa uno', () => {
    expect(digitoVerificador('2012345678')).toBe(6);
    expect(digitoVerificador('abc')).toBeNull();
    expect(digitoVerificador('27000000001')).toBeNull(); // 11 dígitos: no son los 10 del cálculo
  });

  it('un CUIL de persona lleva el DNI adentro; el de una empresa no se compara', () => {
    expect(cuilCoincideConDni('20-12345678-6', '12345678')).toBe(true);
    expect(cuilCoincideConDni('20-12345678-6', '12.345.678')).toBe(true);
    expect(cuilCoincideConDni('20301112220', '12345678')).toBe(false); // el CUIL es de otro DNI
    expect(cuilCoincideConDni('20-01234567-0', '1234567')).toBe(true); // DNI de 7 dígitos: cero a la izquierda
    expect(cuilCoincideConDni('30500010912', '12345678')).toBe(true); // empresa
    expect(cuilCoincideConDni('20123456786', '')).toBe(true); // sin DNI no hay con qué comparar
  });

  it('formatear', () => {
    expect(formatearCuil('20123456786')).toBe('20-12345678-6');
    expect(formatearCuil('raro')).toBe('raro');
  });

  it('primerCuilValido: el primero que sirve y coincide, formateado', () => {
    expect(primerCuilValido([null, '', 'x', '20301112220', '20123456786'], '12345678')).toBe('20-12345678-6');
    expect(primerCuilValido(['12345678', undefined], '12345678')).toBeNull();
    expect(primerCuilValido([], '12345678')).toBeNull();
  });
});

describe('explicarCuilInvalido', () => {
  it('dice cuál debería ser el dígito verificador (el CUIL de prueba 20-11111111-1)', () => {
    expect(explicarCuilInvalido('20-11111111-1')).toBe('El último número (el verificador) debería ser 2, no 1: revisá los números.');
  });

  it('largo, prefijo y combinaciones imposibles', () => {
    expect(explicarCuilInvalido('201234')).toBe('El CUIL/CUIT tiene 11 números y escribiste 6.');
    expect(explicarCuilInvalido('99123456786')).toMatch(/empezar con 20, 23, 24 o 27/);
    // 27 + 00000000 + ?: la suma da resto 10, no hay dígito posible
    expect(explicarCuilInvalido('20000000011')).toMatch(/verificador|no existe/);
  });

  it('un CUIL válido o un campo vacío no tienen nada que explicar', () => {
    expect(explicarCuilInvalido('20-12345678-6')).toBeNull();
    for (const v of ['', '   ', null, undefined]) expect(explicarCuilInvalido(v)).toBeNull();
  });
});
