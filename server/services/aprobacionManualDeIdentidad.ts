import { diditEnUso, getKycMaxAttempts } from './didit.js';

/**
 * Aprobar una identidad a mano: solo cuando Didit falla o hay un problema.
 *
 * Regla del dueño (2026-11-07): la identidad la verifica Didit; un administrador PUEDE aprobarla a mano, pero únicamente si Didit falla o hay problemas.
 * Antes la ruta rechazaba siempre («no se aprueba manualmente») y quedaban sin salida las cuentas que Didit no podía resolver: las que quedaron
 * «En revisión» porque el documento no coincide con el registro, las que agotaron los intentos y las de un despliegue sin Didit configurado.
 *
 * Cuándo se permite (lo decide el SERVIDOR; el botón de la pantalla solo lo refleja):
 *  - `didit_sin_configurar`: Didit no está en uso en este servidor (sin claves o apagado con `VERIFICACION_CON_DIDIT`), nadie podría verificarse;
 *  - `intentos_agotados`: la persona agotó los intentos con Didit (los mismos que habilitan la carga manual de documentos);
 *  - `en_revision`: Didit aprobó el documento pero no coincide con el registro (o quedó para revisión) y alguien tiene que decidir.
 * No se permite si la cuenta ya está verificada, si no terminó el registro, si fue unida a otra, o si Didit anda y la persona todavía puede verificarse sola.
 *
 * Una aprobación manual SIEMPRE lleva un motivo escrito (mínimo `RAZON_MINIMA_DE_APROBACION` caracteres) y queda anotada con severidad alta.
 * Cuenta como persona verificada para el beneficio de lanzamiento, pero no deja «clave de persona» (esa sale del documento que lee Didit): por eso quien
 * aprueba tiene que mirar el documento y confirmar que no es una persona que ya tiene otra cuenta.
 */

export const RAZON_MINIMA_DE_APROBACION = 15;

export type MotivoDeAprobacionManual = 'didit_sin_configurar' | 'intentos_agotados' | 'en_revision';

export type PermisoDeAprobacionManual =
  | { permitido: true; motivo: MotivoDeAprobacionManual; descripcion: string }
  | { permitido: false; motivo: null; descripcion: string };

export interface CuentaParaAprobar {
  dniVerified?: boolean | null;
  registrationPending?: boolean | null;
  mergedIntoId?: string | null;
  kycStatus?: string | null;
  kycAttempts?: number | null;
}

export function permisoParaAprobarAMano(cuenta: CuentaParaAprobar, diditConfigurado: boolean = diditEnUso()): PermisoDeAprobacionManual {
  const no = (descripcion: string): PermisoDeAprobacionManual => ({ permitido: false, motivo: null, descripcion });
  if (cuenta.dniVerified) return no('La identidad de esta cuenta ya está verificada.');
  if (cuenta.mergedIntoId) return no('Esta cuenta fue unida a otra: la identidad se resuelve en la cuenta principal.');
  if (cuenta.registrationPending) return no('Esta cuenta no terminó el registro: todavía no hay datos que aprobar.');

  if (!diditConfigurado) {
    return { permitido: true, motivo: 'didit_sin_configurar', descripcion: 'Didit no está en uso en este servidor (apagado o sin configurar): no hay otra forma de verificar a esta persona.' };
  }
  if ((cuenta.kycAttempts ?? 0) >= getKycMaxAttempts()) {
    return { permitido: true, motivo: 'intentos_agotados', descripcion: 'La persona agotó los intentos con Didit.' };
  }
  if (cuenta.kycStatus === 'In Review') {
    return { permitido: true, motivo: 'en_revision', descripcion: 'La verificación quedó en revisión (el documento no coincide con el registro o Didit no pudo resolverla).' };
  }
  return no('Didit está funcionando y esta persona todavía puede verificarse sola. La aprobación manual es solo si Didit falla o hay un problema (intentos agotados o verificación en revisión).');
}
