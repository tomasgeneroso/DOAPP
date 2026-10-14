import { urlDeIngresoSocial, esCodigoDeIngreso, NOMBRE_DEL_PROVEEDOR } from '../services/ingresoSocial';

describe('ingreso con Google / X desde la app', () => {
  it('la dirección que se abre pide el código con origen=app', () => {
    expect(urlDeIngresoSocial('google', 'https://doapparg.com/api')).toBe('https://doapparg.com/api/auth/google?origen=app');
    expect(urlDeIngresoSocial('twitter', 'https://doapparg.com/api/')).toBe('https://doapparg.com/api/auth/twitter?origen=app');
    expect(urlDeIngresoSocial('google', 'http://172.20.10.3:3001/api///')).toBe('http://172.20.10.3:3001/api/auth/google?origen=app');
  });

  it('solo un código de 64 caracteres hexadecimales se manda al servidor', () => {
    expect(esCodigoDeIngreso('a'.repeat(64))).toBe(true);
    expect(esCodigoDeIngreso('0123456789abcdef'.repeat(4))).toBe(true);
    for (const malo of [undefined, null, '', 'abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 12, {}, ['a'.repeat(64)]]) {
      expect(esCodigoDeIngreso(malo)).toBe(false);
    }
  });

  it('los nombres que ve la persona', () => {
    expect(NOMBRE_DEL_PROVEEDOR).toEqual({ google: 'Google', twitter: 'X' });
  });
});
