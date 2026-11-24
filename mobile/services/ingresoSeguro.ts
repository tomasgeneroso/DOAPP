import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * El código del ingreso con Google/X vuelve a la app por `doapp://auth-callback?codigo=…`, y cualquier otra app del teléfono puede registrar el mismo esquema `doapp://`
 * y quedarse con ese enlace (auditoría de seguridad, 2026-11-24). Para que el código solo sirva en la app que empezó el ingreso:
 *  1. al empezar, la app genera un SECRETO al azar que no sale del teléfono y manda su hash (el DESAFÍO) en la dirección de ingreso;
 *  2. al canjear el código, manda el secreto (el VERIFICADOR): el servidor comprueba que su hash es el desafío (el mismo mecanismo que PKCE de OAuth).
 * Quien intercepte el enlace tiene el código pero no el secreto, y el código se gasta al primer intento.
 */
const CLAVE = 'ingreso_verificador';

const guardar = async (valor: string): Promise<void> => {
  if (Platform.OS === 'web') {
    try { sessionStorage.setItem(CLAVE, valor); } catch { /* sin almacenamiento */ }
    return;
  }
  await SecureStore.setItemAsync(CLAVE, valor);
};

/** Genera el secreto, lo guarda y devuelve el desafío (su hash SHA-256 en hexadecimal) para mandarlo al servidor. */
export async function prepararIngresoSeguro(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verificador = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await guardar(verificador);
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verificador, { encoding: Crypto.CryptoEncoding.HEX });
}

/** El secreto guardado, que se borra al leerlo (un solo uso). `undefined` si no hay (por ejemplo, un ingreso empezado con una versión vieja de la app). */
export async function tomarVerificador(): Promise<string | undefined> {
  try {
    let valor: string | null;
    if (Platform.OS === 'web') {
      valor = sessionStorage.getItem(CLAVE);
      sessionStorage.removeItem(CLAVE);
    } else {
      valor = await SecureStore.getItemAsync(CLAVE);
      await SecureStore.deleteItemAsync(CLAVE);
    }
    return valor || undefined;
  } catch {
    return undefined;
  }
}
