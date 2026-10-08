import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';
import { leerSignedRequestDeFacebook } from '../server/utils/facebookSignedRequest.js';

/**
 * Los callbacks de Facebook (desautorizar y eliminar datos) ignoraban la firma del `signed_request`:
 * cualquiera que conociera un facebookId podía desvincularle la cuenta a alguien con un POST anónimo.
 */

const SECRETO = 'secreto-de-la-app-de-prueba';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function firmar(datos: Record<string, unknown>, secreto = SECRETO) {
  const payload = b64url(JSON.stringify(datos));
  const firma = b64url(crypto.createHmac('sha256', secreto).update(payload).digest());
  return `${firma}.${payload}`;
}

describe('leerSignedRequestDeFacebook', () => {
  it('acepta uno firmado con el secreto de la app y devuelve los datos', () => {
    const r = leerSignedRequestDeFacebook(firmar({ algorithm: 'HMAC-SHA256', user_id: '1234567890' }), SECRETO);
    expect(r).not.toBeNull();
    expect(r!.user_id).toBe('1234567890');
  });

  it('un user_id numérico se normaliza a texto (se compara con una columna de texto)', () => {
    const r = leerSignedRequestDeFacebook(firmar({ algorithm: 'HMAC-SHA256', user_id: 98765 }), SECRETO);
    expect(r!.user_id).toBe('98765');
  });

  it('el algoritmo se compara sin importar mayúsculas', () => {
    expect(leerSignedRequestDeFacebook(firmar({ algorithm: 'hmac-sha256', user_id: '1' }), SECRETO)).not.toBeNull();
  });

  it('SIN secreto configurado se rechaza todo (no hay con qué verificar)', () => {
    const valido = firmar({ algorithm: 'HMAC-SHA256', user_id: '1' });
    expect(leerSignedRequestDeFacebook(valido, undefined)).toBeNull();
    expect(leerSignedRequestDeFacebook(valido, '')).toBeNull();
  });

  it('firmado con otro secreto se rechaza', () => {
    expect(leerSignedRequestDeFacebook(firmar({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'otro'), SECRETO)).toBeNull();
  });

  it('un payload alterado después de firmar se rechaza (cambiar de víctima)', () => {
    const original = firmar({ algorithm: 'HMAC-SHA256', user_id: '111' });
    const [firma] = original.split('.');
    const otroPayload = b64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '999' }));
    expect(leerSignedRequestDeFacebook(`${firma}.${otroPayload}`, SECRETO)).toBeNull();
  });

  it('con la firma original sin cambios en el payload: el ataque anterior (firma inventada) falla', () => {
    const payload = b64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '111' }));
    expect(leerSignedRequestDeFacebook(`firmafalsa.${payload}`, SECRETO)).toBeNull();
    expect(leerSignedRequestDeFacebook(`.${payload}`, SECRETO)).toBeNull();
    expect(leerSignedRequestDeFacebook(`AAAA.${payload}`, SECRETO)).toBeNull();
  });

  it('un algoritmo distinto se rechaza aunque la firma sea correcta', () => {
    expect(leerSignedRequestDeFacebook(firmar({ algorithm: 'none', user_id: '1' }), SECRETO)).toBeNull();
    expect(leerSignedRequestDeFacebook(firmar({ user_id: '1' }), SECRETO)).toBeNull();
  });

  it.each([undefined, null, 42, {}, [], true, '', 'sinpunto', 'a.b.c', '.', 'a.', '.b', 'x'.repeat(5000)])(
    'una entrada rara (%p) se rechaza sin lanzar',
    (raro) => {
      expect(() => leerSignedRequestDeFacebook(raro as any, SECRETO)).not.toThrow();
      expect(leerSignedRequestDeFacebook(raro as any, SECRETO)).toBeNull();
    },
  );

  it('un payload que no es JSON, o es JSON que no es objeto, se rechaza', () => {
    const noJson = b64url('esto no es json');
    const firmaNoJson = b64url(crypto.createHmac('sha256', SECRETO).update(noJson).digest());
    expect(leerSignedRequestDeFacebook(`${firmaNoJson}.${noJson}`, SECRETO)).toBeNull();
    const lista = b64url('[1,2,3]');
    const firmaLista = b64url(crypto.createHmac('sha256', SECRETO).update(lista).digest());
    expect(leerSignedRequestDeFacebook(`${firmaLista}.${lista}`, SECRETO)).toBeNull();
  });

  it('un user_id que no es texto ni número se rechaza', () => {
    expect(leerSignedRequestDeFacebook(firmar({ algorithm: 'HMAC-SHA256', user_id: { $ne: null } }), SECRETO)).toBeNull();
    expect(leerSignedRequestDeFacebook(firmar({ algorithm: 'HMAC-SHA256', user_id: ['1'] }), SECRETO)).toBeNull();
  });

  it('caracteres fuera de base64url se rechazan', () => {
    expect(leerSignedRequestDeFacebook('abc+/=.def+/=', SECRETO)).toBeNull();
  });
});
