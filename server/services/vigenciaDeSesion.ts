/**
 * ¿Este token sirve como SESIÓN? (auditoría de seguridad, 2026-11-24)
 *
 * Dos problemas que tenía `protect`:
 *  1. El token de acceso dura 7 días y no se podía cerrar: «cerrar todas las sesiones» y «restablecer contraseña» revocaban solo los refresh tokens, así que quien
 *     hubiera robado un token seguía entrando hasta una semana después de que la persona cambiara la clave.
 *  2. Los tokens de vincular una cuenta social (`proposito: 'vincular-cuenta'`) se firman con el MISMO secreto y llevan `id`: `protect` los aceptaba como sesión
 *     completa. Ese token viaja en una dirección de retorno (queda en registros y en el historial).
 *
 * `users.tokens_valid_after` es la hora desde la que valen los tokens: «cerrar todas», restablecer o cambiar la contraseña la ponen en «ahora» y todo token emitido
 * antes deja de servir. Se compara en segundos (el `iat` del token viene en segundos): uno emitido en el mismo segundo del cierre vale, así que entrar justo después
 * de cambiar la clave no se rechaza.
 */
export interface DatosDelToken {
  iat?: number;
  proposito?: unknown;
  typ?: unknown;
}

export function sesionVigente(decodificado: DatosDelToken | null | undefined, usuario: { tokensValidAfter?: Date | string | null } | null | undefined): boolean {
  if (!decodificado || !usuario) return false;
  // Un token con propósito (vincular cuenta, descargar factura...) no es una sesión.
  if (decodificado.proposito || decodificado.typ) return false;
  const desde = usuario.tokensValidAfter ? new Date(usuario.tokensValidAfter).getTime() : 0;
  if (!desde || Number.isNaN(desde)) return true;
  const emitido = typeof decodificado.iat === 'number' ? decodificado.iat : 0;
  return emitido >= Math.floor(desde / 1000);
}
