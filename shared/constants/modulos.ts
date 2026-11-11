/**
 * Identificadores de módulos (interruptores que el owner enciende y apaga desde el panel de Módulos).
 *
 * Viven en `shared/` para que el servidor, el panel y las pruebas digan lo mismo. El de pago al terminar tiene su
 * propio archivo (`shared/pagos/modoDePago.ts`) porque agrega reglas de responsabilidad y cláusulas legales.
 */

/**
 * Aprobación de las publicaciones pagadas.
 *
 * Encendido (por defecto): cuando el cliente paga la publicación, el trabajo queda «pendiente de aprobación» y un
 * administrador tiene que aprobarlo antes de que se vea. Apagado: se publica apenas se confirma el pago. Es una regla
 * de esta etapa (la beta): el owner la apaga desde el panel de Módulos cuando ya no haga falta. Si la fila no existe
 * (nadie abrió el panel todavía) se considera ENCENDIDO: ante la duda, un administrador mira antes de publicar.
 */
export const MODULO_APROBACION_DE_PUBLICACIONES = 'feature:aprobacion_de_publicaciones';

/**
 * Verificación de identidad con Didit (documento y selfie) en el registro.
 *
 * Apagado (el valor de partida, regla del dueño 2026-11-11): el registro pide solo el número de DNI; quien lo completa puede publicar, postularse y cobrar, pero no queda
 * «verificado» (no recibe el beneficio de lanzamiento ni la insignia). Encendido: vuelve el registro con documento y selfie. Lo cambia SOLO el dueño desde el panel de Módulos
 * y queda anotado; no se puede encender si Didit no tiene sus claves en el servidor. Ver `services/didit.ts` (`verificacionConDiditActiva`).
 */
export const MODULO_VERIFICACION_DIDIT = 'identity:didit';
