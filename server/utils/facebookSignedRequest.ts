import crypto from 'crypto';

/**
 * Verifica y decodifica el `signed_request` que manda Facebook (callbacks de "desautorizar" y de
 * "eliminar mis datos").
 *
 * Formato (doc de Facebook): `<firma>.<payload>`, ambos en base64url. La firma es HMAC-SHA256 del texto del
 * payload (tal cual viene, en base64url) con el secreto de la app, y el payload es un JSON con
 * `algorithm: "HMAC-SHA256"` y `user_id`.
 *
 * Antes los dos handlers hacían `[encodedSig, payload] = signed_request.split('.')` y JAMÁS usaban la
 * firma: cualquiera que conociera el `facebookId` de alguien podía desvincularle la cuenta de Facebook (y
 * dejar sin acceso a quien entra sólo por Facebook) con un POST anónimo. Y dispararle el mail de "eliminación".
 *
 * Devuelve `null` ante CUALQUIER duda (sin secreto configurado, formato raro, firma que no coincide,
 * algoritmo distinto, JSON roto). Nunca lanza.
 */
export interface DatosFirmadosDeFacebook {
  algorithm: string;
  user_id?: string;
  [clave: string]: unknown;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const desdeBase64Url = (texto: string): Buffer => Buffer.from(texto.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function leerSignedRequestDeFacebook(signedRequest: unknown, secretoDeLaApp: string | undefined): DatosFirmadosDeFacebook | null {
  try {
    if (!secretoDeLaApp) return null; // sin secreto no hay forma de verificar: se rechaza
    if (typeof signedRequest !== 'string' || signedRequest.length > 4096) return null;

    const partes = signedRequest.split('.');
    if (partes.length !== 2) return null;
    const [firma, payload] = partes;
    if (!firma || !payload || !BASE64URL.test(firma) || !BASE64URL.test(payload)) return null;

    const esperada = crypto.createHmac('sha256', secretoDeLaApp).update(payload).digest();
    const recibida = desdeBase64Url(firma);
    if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) return null;

    const datos = JSON.parse(desdeBase64Url(payload).toString('utf-8'));
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
    if (String(datos.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return null;
    if (datos.user_id !== undefined && typeof datos.user_id !== 'string' && typeof datos.user_id !== 'number') return null;
    if (datos.user_id !== undefined) datos.user_id = String(datos.user_id);
    return datos as DatosFirmadosDeFacebook;
  } catch {
    return null;
  }
}
