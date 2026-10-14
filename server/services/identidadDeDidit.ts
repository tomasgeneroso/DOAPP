import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { logEvento } from '../utils/auditLog.js';
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
      await logEvento({
        action: 'KYC_DNI_EN_USO',
        actor: 'system:didit',
        category: 'user',
        severity: 'high',
        description: `Didit leyó un DNI que ya usa otra cuenta: no se cambió el de la cuenta ${user.id}. Hay que revisarlo a mano.`,
        targetModel: 'User',
        targetId: String(user.id),
        metadata: { dniDeDidit: dni, dniDeLaCuenta: dniAnterior, otraCuenta: String(otra.id) },
      });
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
