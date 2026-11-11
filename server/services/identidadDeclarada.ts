import { dniValido } from '../../shared/identidad/documentos.js';
import { verificacionConDiditActiva } from './didit.js';

/**
 * Identidad «declarada» (regla del dueño, 2026-11-11: «sacar lo de Didit por el momento, que solo pida número de DNI»).
 *
 * Con la verificación de Didit apagada (`VERIFICACION_CON_DIDIT`, ver `services/didit.ts`) el registro pide el número de DNI y nada más. Esa persona NO queda «verificada»
 * (`dniVerified` solo lo escribe una verificación de verdad: Didit o un administrador), pero tampoco puede quedar fuera de la plataforma: publicar, postularse y cobrar piden
 * «identidad suficiente», que es o la verificada o —mientras Didit está apagado— haber terminado el registro con un DNI válido. El DNI no se repite entre cuentas y se
 * controla contra las identidades suspendidas al completar el registro (`registroEnPasos.completarRegistro`), así que es una declaración con control de duplicados.
 *
 * Lo que NO hace: no da el beneficio de lanzamiento (primeras 2.000 PERSONAS VERIFICADAS), no pone la insignia de verificado ni sube el escalón «Identidad comprobada» de la credibilidad.
 */

export interface CuentaConDni {
  dniVerified?: boolean | null;
  registrationPending?: boolean | null;
  dni?: string | number | null;
}

/** Terminó el registro y tiene un DNI con formato válido. */
export function identidadDeclarada(cuenta: CuentaConDni | null | undefined): boolean {
  return !!cuenta && !cuenta.registrationPending && dniValido(cuenta.dni);
}

/** ¿Puede hacer lo que exige identidad (publicar, postularse, cobrar)? La verificada siempre; la declarada solo con Didit apagado. */
export function identidadSuficiente(cuenta: CuentaConDni | null | undefined): boolean {
  if (!cuenta) return false;
  if (cuenta.dniVerified) return true;
  return !verificacionConDiditActiva() && identidadDeclarada(cuenta);
}
