import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { logEvento } from '../utils/auditLog.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { DONDE_ES_ADMIN } from '../utils/admins.js';
import { compararIdentidad, type IdentidadDelDocumento } from '../../shared/identidad/coincidencia.js';
import { avisarConflictoDeDni, yaSeRegistroElConflicto } from './identidadAReviser.js';
import { cuilCoincideConDni, cuilValido, dniValido, formatearCuil, normalizarDni, primerCuilValido, soloDigitos } from '../../shared/identidad/documentos.js';

/**
 * Completar el DNI y el CUIL de la cuenta con lo que Didit leyó del documento.
 *
 * El DNI es la clave de la cuenta y no se repite; lo que Didit verificó (el documento de la persona) es más confiable que lo que se
 * tipeó al registrarse. Reglas, todas de falla cerrada (lo que no se puede asegurar, no se toca):
 *  - el número de documento de Didit solo se usa si tiene forma de DNI (7 a 9 dígitos);
 *  - si la cuenta no tenía DNI, o tenía otro, se completa/corrige con el de Didit SOLO si ninguna otra cuenta lo usa; si ya lo usa
 *    otra cuenta no se cambia nada y queda un evento de severidad alta para que lo mire un administrador;
 *  - el CUIL solo se completa si algún campo del documento tiene un CUIL con dígito verificador correcto Y que lleva ese DNI
 *    adentro; nunca pisa uno ya cargado y válido;
 *  - todo cambio queda anotado (quién, qué valía antes, por qué).
 */

export interface IdentidadLeida {
  dni: string | null;
  cuil: string | null;
}

/** Lee el DNI y el CUIL de la decisión de Didit. Lo que falte o venga raro da null: nunca inventa un dato. */
export function extraerIdentidad(decision: any): IdentidadLeida {
  const idv = decision?.id_verifications?.[0] || decision?.id_verification || {};
  const crudo = idv?.document_number;
  const dni = dniValido(crudo) ? normalizarDni(crudo) : null;

  // El CUIL puede venir en distintos campos según el documento: se miran los campos de texto del documento y se acepta solo
  // un número que sea un CUIL de verdad (11 dígitos con dígito verificador) y que lleve el DNI leído.
  const candidatos: unknown[] = [idv?.personal_number, idv?.tax_number, idv?.cuil, idv?.cuit, idv?.fiscal_number];
  for (const v of Object.values(idv || {})) {
    if (typeof v === 'string') for (const m of v.match(/\d{2}[-\s]?\d{8}[-\s]?\d/g) || []) candidatos.push(m);
  }
  const cuil = primerCuilValido(candidatos, dni ?? undefined);
  return { dni, cuil };
}

/** Lo que dice el documento: nombres, apellidos y número. Lo que falte da null. */
export function leerDocumento(decision: any): IdentidadDelDocumento {
  const idv = decision?.id_verifications?.[0] || decision?.id_verification || {};
  const crudo = idv?.document_number;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const nombres = texto(idv?.first_name) ?? texto(idv?.full_name);
  return { nombres, apellidos: texto(idv?.last_name), dni: dniValido(crudo) ? normalizarDni(crudo) : null };
}

export const ACCION_IDENTIDAD_NO_COINCIDE = 'KYC_NO_COINCIDE';

const enmascarar = (dni: unknown) => {
  const d = String(dni ?? '').replace(/\D/g, '');
  return d ? `***${d.slice(-3)}` : null;
};

/**
 * Antes de dar por buena una verificación de Didit: ¿el documento es de la persona que se registró?
 *
 * Didit aprueba un documento auténtico, pero no sabe quién se registró en DOAPP. Si el nombre o el DNI del documento no coinciden con
 * los del registro (o no se pueden comparar), la verificación NO se aprueba sola: queda «En revisión», sin tocar el DNI de la cuenta, y
 * se le avisa a administración para que lo mire. Quien ya está verificado (por ejemplo, aprobado a mano por un administrador) no se
 * vuelve a evaluar. Modifica `updates` (lo que se va a guardar) y devuelve si la verificación queda aprobada.
 */
export async function controlarCoincidencia(user: any, updates: Record<string, any>, decision: any): Promise<boolean> {
  if (updates.kycStatus !== 'Approved') return false;
  if (user.dniVerified) return true;
  // Cuenta en registro en pasos: todavía no hay nombre ni DNI cargados por la persona (salen del documento). La comparación se hace
  // al terminar el registro, con lo que la persona corrigió (services/registroEnPasos.ts).
  if (user.registrationPending) return true;

  const documento = leerDocumento(decision);
  // Una cuenta sin DNI todavía (ingresó con Google y no lo cargó) lo toma del documento: se compara solo el nombre.
  const resultado = compararIdentidad({ nombre: user.name, dni: user.dni || documento.dni }, documento);
  if (resultado.coincide) return true;

  updates.kycStatus = 'In Review';
  delete updates.dniVerified;
  delete updates.kycVerifiedAt;

  const sesion = updates.diditSessionId || user.diditSessionId || null;
  const previos = await AuditLog.findAll({ where: { action: ACCION_IDENTIDAD_NO_COINCIDE, targetId: String(user.id) }, order: [['createdAt', 'DESC']], limit: 20 });
  const yaRegistrado = previos.some((p: any) => (p.metadata?.sesion ?? null) === sesion);
  if (!yaRegistrado) {
    await logEvento({
      action: ACCION_IDENTIDAD_NO_COINCIDE,
      actor: 'system:didit',
      category: 'user',
      severity: 'high',
      description: `La verificación de Didit no coincide con el registro de la cuenta ${user.id}: no se aprobó, queda en revisión. ${resultado.motivos.join(' ')}`,
      targetModel: 'User',
      targetId: String(user.id),
      metadata: {
        sesion,
        nombreRegistrado: user.name,
        nombreDelDocumento: [documento.nombres, documento.apellidos].filter(Boolean).join(' ') || null,
        dniRegistrado: enmascarar(user.dni),
        dniDelDocumento: enmascarar(documento.dni),
        nombre: resultado.nombre,
        dni: resultado.dni,
      },
    });
    try {
      const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN }, attributes: ['id'] });
      for (const a of admins) {
        await Notification.create({
          recipientId: a.id,
          type: 'warning',
          category: 'admin',
          title: 'Verificación de identidad que no coincide',
          message: `${user.name || 'Una cuenta'} verificó un documento cuyo nombre o DNI no coincide con su registro. No se aprobó: hay que revisarlo.`,
          relatedModel: 'User',
          relatedId: String(user.id),
          actionText: 'Revisar',
          actionUrl: '/admin/users',
          sentVia: ['in_app'],
        } as any);
      }
    } catch (e: any) {
      console.error('No se pudo avisar a administración la identidad que no coincide:', e?.message);
    }
  }
  return false;
}

export interface ResultadoDeAplicar {
  dniCompletado: boolean;
  dniCorregido: boolean;
  cuilCompletado: boolean;
  dniEnUsoPorOtraCuenta: boolean;
}

/** Aplica lo leído a la cuenta. Idempotente: llamarlo de nuevo con lo mismo no cambia nada. */
export async function aplicarIdentidadDeDidit(user: any, decision: any): Promise<ResultadoDeAplicar> {
  const r: ResultadoDeAplicar = { dniCompletado: false, dniCorregido: false, cuilCompletado: false, dniEnUsoPorOtraCuenta: false };
  const { dni, cuil } = extraerIdentidad(decision);
  if (!dni && !cuil) return r;

  const cambios: Record<string, unknown> = {};
  const dniAnterior: string | null = user.dni ? String(user.dni) : null;
  let dniFinal = dniAnterior;

  if (dni && dni !== dniAnterior) {
    const otra = await User.findOne({ where: { dni, id: { [Op.ne]: user.id } }, attributes: ['id'] });
    if (otra) {
      r.dniEnUsoPorOtraCuenta = true;
      // El estado de Didit se pregunta seguido: el mismo choque se registra y se avisa UNA vez (la lista de revisión no se llena de repetidos).
      if (!(await yaSeRegistroElConflicto(String(user.id), dni))) {
        await logEvento({
          action: 'KYC_DNI_EN_USO',
          actor: 'system:didit',
          category: 'user',
          severity: 'high',
          description: `Didit leyó un DNI que ya usa otra cuenta: no se cambió el de la cuenta ${user.id}. Hay que revisarlo a mano (Administración → Identidad a revisar).`,
          targetModel: 'User',
          targetId: String(user.id),
          metadata: { dniDeDidit: dni, dniDeLaCuenta: dniAnterior, otraCuenta: String(otra.id) },
        });
        await avisarConflictoDeDni(String(user.id), user.name);
      }
    } else {
      cambios.dni = dni;
      dniFinal = dni;
      if (dniAnterior) r.dniCorregido = true;
      else r.dniCompletado = true;
      await logEvento({
        action: dniAnterior ? 'KYC_DNI_CORREGIDO' : 'KYC_DNI_COMPLETADO',
        actor: 'system:didit',
        category: 'user',
        severity: 'medium',
        description: dniAnterior
          ? `El DNI de la cuenta se corrigió con el del documento verificado por Didit (antes: ${dniAnterior}).`
          : 'El DNI de la cuenta se completó con el del documento verificado por Didit.',
        targetModel: 'User',
        targetId: String(user.id),
        changes: [{ field: 'dni', oldValue: dniAnterior, newValue: dni }],
      });
    }
  }

  // Información legal: DNI y CUIL. El número de documento se guarda cifrado por el modelo; solo se reescribe si cambió.
  const legal: any = { ...(user.legalInfo || {}) };
  let legalCambio = false;
  if (legal.idType !== 'dni') { legal.idType = 'dni'; legalCambio = true; }
  const descifrado = typeof user.getDecryptedIdNumber === 'function' ? user.getDecryptedIdNumber() : legal.idNumber;
  if (dniFinal && soloDigitos(descifrado) !== dniFinal) { legal.idNumber = dniFinal; legalCambio = true; }

  if (cuil && cuilCoincideConDni(cuil, dniFinal) && !(legal.taxId && cuilValido(legal.taxId))) {
    legal.taxId = formatearCuil(cuil);
    r.cuilCompletado = true;
    legalCambio = true;
    await logEvento({
      action: 'KYC_CUIL_COMPLETADO',
      actor: 'system:didit',
      category: 'user',
      severity: 'low',
      description: 'El CUIL de la cuenta se completó con el del documento verificado por Didit.',
      targetModel: 'User',
      targetId: String(user.id),
    });
  }
  if (legalCambio && (dniFinal || r.cuilCompletado)) cambios.legalInfo = legal;

  if (Object.keys(cambios).length) await user.update(cambios);
  return r;
}
