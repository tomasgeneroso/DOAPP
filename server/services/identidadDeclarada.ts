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
  isVerified?: boolean | null;
  email?: string | null;
}

/**
 * Correo confirmado (regla del dueño, 2026-11-12: «para publicar o trabajar se debe confirmar el correo electrónico»): la persona abrió el enlace que se le mandó a su casilla y la
 * cuenta tiene un correo. Una cuenta de X nace «verificada» pero sin correo: no cuenta hasta que escribe uno y lo confirma.
 */
export function correoConfirmado(cuenta: CuentaConDni | null | undefined): boolean {
  return !!cuenta && !!cuenta.isVerified && String(cuenta.email ?? '').trim() !== '';
}

export const MENSAJE_CORREO_SIN_CONFIRMAR =
  'Confirmá tu correo electrónico para publicar o trabajar. Te mandamos un enlace a tu casilla: abrilo para confirmarlo, o pedí uno nuevo desde tu perfil.';

export interface BloqueoParaOperar {
  codigo: 'EMAIL_REQUIRED' | 'KYC_REQUIRED';
  mensaje: string;
}

/**
 * Por qué una cuenta todavía NO puede publicar ni trabajar, o null si puede. Primero el correo (siempre), después la identidad (verificada con Didit o, con Didit apagado, el DNI
 * declarado). Lo usan la puerta `requireKyc`, la publicación de trabajos y el pago de la publicación: una sola regla, un solo texto.
 */
export function bloqueoParaOperar(cuenta: CuentaConDni | null | undefined): BloqueoParaOperar | null {
  if (!correoConfirmado(cuenta)) return { codigo: 'EMAIL_REQUIRED', mensaje: MENSAJE_CORREO_SIN_CONFIRMAR };
  if (!identidadSuficiente(cuenta)) {
    return {
      codigo: 'KYC_REQUIRED',
      mensaje: verificacionConDiditActiva()
        ? 'Necesitás verificar tu identidad para hacer esto. Verificala desde tu perfil.'
        : 'Necesitás completar tu registro con tu número de DNI para hacer esto. Completalo desde tu perfil.',
    };
  }
  return null;
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
