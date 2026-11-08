import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User } from '../models/sql/User.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { Payment, RESOLVED_PAYMENT_STATUSES } from '../models/sql/Payment.model.js';
import { WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { RefreshToken } from '../models/sql/RefreshToken.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { conSistema } from '../db/contextoRls.js';
import { logEvento } from '../utils/auditLog.js';

/**
 * Unir dos cuentas de la MISMA persona (doble ciudadanía: una con el documento argentino y otra con el italiano; o una cuenta duplicada).
 *
 * Es lo que pidió el dueño (2026-11-06): ante la alerta de `identidadDePersona`, que administración pueda unirlas desde el panel. Se hace una unión SUAVE y
 * reversible a mano, no un traslado de datos:
 *  - La cuenta SECUNDARIA queda marcada como unificada con la PRINCIPAL (`mergedIntoId`): no inicia sesión (el servidor lo corta en el login y en cada pedido), sus
 *    sesiones se cierran y deja de contar como una de las «primeras cuentas». Su historial (contratos, pagos, reseñas) queda en ella: nada se mueve ni se borra.
 *  - Mover contratos y plata entre cuentas es la operación más riesgosa de la plataforma; por eso la unión SOLO se hace cuando la secundaria no tiene nada vivo.
 *    Si lo tiene, no se une y se dice qué falta resolver. Es más lento y mucho más seguro.
 *  - Los beneficios de la secundaria NO se suman a la principal (si no, unir cuatro cuentas concentraría cuatro contratos libres): se anulan y quedan anotados
 *    para que, si corresponde, un administrador compense a mano.
 *  - Todo queda en el registro de auditoría: quién, cuándo, por qué y qué valía lo que se vació.
 */

export class ErrorDeUnion extends Error {
  constructor(
    message: string,
    public estado: number,
    /** Lo que impide unirlas, uno por línea, para mostrarlo tal cual. */
    public motivos: string[] = [],
  ) {
    super(message);
  }
}

export const ACCION_CUENTAS_UNIFICADAS = 'CUENTAS_UNIFICADAS';

const CONTRATOS_VIVOS = ['pending', 'ready', 'accepted', 'in_progress', 'awaiting_confirmation', 'disputed', 'in_review'];
/** Un borrador no impide unir (no tiene plata ni gente); cualquier otro estado sí. */
const TRABAJOS_VIVOS = ['pending_payment', 'pending_approval', 'open', 'in_progress', 'paused'];
const ROLES_DE_ADMINISTRACION = ['owner', 'super_admin', 'admin', 'support', 'marketing', 'dpo', 'analista'];

export interface ResultadoDeLaUnion {
  principalId: string;
  secundariaId: string;
  /** Lo que valía en la secundaria y se anuló (queda en la auditoría). */
  anulado: { esDeLasPrimerasCuentas: boolean; contratosLibres: number };
}

/** Todo lo que tiene vivo la cuenta secundaria y obliga a resolverlo antes de unirla. Vacío = se puede unir. */
export async function motivosQueImpidenUnir(secundariaId: string): Promise<string[]> {
  const id = String(secundariaId);
  // Es una decisión del sistema sobre TODAS las filas de la cuenta (con la seguridad por filas, un administrador no vería los contratos de otra persona).
  return conSistema(async () => {
    const motivos: string[] = [];
    const [usuario, contratos, trabajos, propuestas, retiros, pagos, asientos] = await Promise.all([
      User.findByPk(id, { attributes: ['id', 'balanceArs'] }),
      Contract.count({ where: { [Op.or]: [{ clientId: id }, { doerId: id }], status: { [Op.in]: CONTRATOS_VIVOS } } as never }),
      Job.count({ where: { clientId: id, status: { [Op.in]: TRABAJOS_VIVOS } } as never }),
      Proposal.count({ where: { freelancerId: id, status: 'pending' } as never }).catch(() => 0),
      WithdrawalRequest.count({ where: { userId: id, status: { [Op.in]: ['pending', 'approved', 'processing'] } } as never }),
      Payment.count({ where: { payerId: id, status: { [Op.notIn]: RESOLVED_PAYMENT_STATUSES } } as never }),
      BalanceTransaction.count({ where: { userId: id, status: 'pending' } as never }),
    ]);

    const saldo = Number((usuario as any)?.balanceArs) || 0;
    if (saldo !== 0) motivos.push(`Tiene un saldo de $${saldo.toLocaleString('es-AR')}: que lo retire o que administración lo ajuste antes de unir.`);
    if (asientos > 0) motivos.push(`Tiene ${asientos} movimiento(s) de saldo a favor pendientes de liquidar.`);
    if (contratos > 0) motivos.push(`Tiene ${contratos} contrato(s) sin terminar (pendiente, en curso, esperando confirmación o en reclamo).`);
    if (trabajos > 0) motivos.push(`Tiene ${trabajos} trabajo(s) publicado(s) o en curso: hay que cerrarlos o cancelarlos primero.`);
    if (propuestas > 0) motivos.push(`Tiene ${propuestas} propuesta(s) pendiente(s): que las retire antes de unir.`);
    if (retiros > 0) motivos.push(`Tiene ${retiros} retiro(s) sin completar.`);
    if (pagos > 0) motivos.push(`Tiene ${pagos} pago(s) sin resolver.`);
    return motivos;
  });
}

export async function unirCuentas(opciones: {
  secundariaId: string;
  principalId: string;
  adminId: string;
  nota: unknown;
  /** El administrador confirma que son la misma persona aunque la clave de persona no coincida (por ejemplo, un nombre escrito distinto en cada documento). */
  confirmarMismaPersona?: boolean;
}): Promise<ResultadoDeLaUnion> {
  const nota = typeof opciones.nota === 'string' ? opciones.nota.trim() : '';
  if (nota.length < 10) throw new ErrorDeUnion('Escribí por qué se unen (al menos 10 caracteres): queda en el registro.', 400);
  if (nota.length > 1000) throw new ErrorDeUnion('La nota es demasiado larga (máximo 1000 caracteres).', 400);

  const secundariaId = String(opciones.secundariaId || '');
  const principalId = String(opciones.principalId || '');
  if (!secundariaId || !principalId) throw new ErrorDeUnion('Falta elegir las dos cuentas.', 400);
  if (secundariaId === principalId) throw new ErrorDeUnion('No se puede unir una cuenta consigo misma.', 400);

  const [secundaria, principal]: any[] = await conSistema(() => Promise.all([User.findByPk(secundariaId), User.findByPk(principalId)]));
  if (!secundaria || !principal) throw new ErrorDeUnion('Una de las cuentas no existe.', 404);
  if (secundaria.mergedIntoId || principal.mergedIntoId) throw new ErrorDeUnion('Una de las cuentas ya está unificada con otra.', 409);
  if (ROLES_DE_ADMINISTRACION.includes(String(secundaria.adminRole)) || ROLES_DE_ADMINISTRACION.includes(String(principal.adminRole))) {
    throw new ErrorDeUnion('No se pueden unir cuentas del equipo de administración.', 409);
  }
  if (secundaria.isBanned || principal.isBanned) throw new ErrorDeUnion('Una de las cuentas está baneada: resolvé el baneo antes de unirlas.', 409);

  const mismaClave = !!secundaria.identityKey && secundaria.identityKey === principal.identityKey;
  if (!mismaClave && opciones.confirmarMismaPersona !== true) {
    throw new ErrorDeUnion('Los documentos de las dos cuentas no dicen el mismo nombre y fecha de nacimiento. Si estás seguro de que son la misma persona, confirmalo.', 409, ['no_coincide_la_clave']);
  }

  const motivos = await motivosQueImpidenUnir(secundariaId);
  if (motivos.length > 0) throw new ErrorDeUnion('La cuenta a unir todavía tiene cosas sin resolver.', 409, motivos);

  const antes = {
    isEarlyUser: !!secundaria.isEarlyUser,
    earlyUserNumber: secundaria.earlyUserNumber ?? null,
    freeContractsRemaining: Number(secundaria.freeContractsRemaining) || 0,
    launchBenefitGrantedAt: secundaria.launchBenefitGrantedAt ?? null,
  };
  const ahora = new Date();

  await conSistema(() =>
    sequelize.transaction(async (t) => {
      // Condicional: si otra persona de administración la unió un instante antes, no se pisa.
      const [filas] = await User.update(
        {
          mergedIntoId: principalId,
          mergedAt: ahora,
          mergedBy: opciones.adminId,
          // Los beneficios no se suman a la principal (ver arriba): se anulan y quedan anotados.
          isEarlyUser: false,
          freeContractsRemaining: 0,
        } as never,
        { where: { id: secundariaId, mergedIntoId: { [Op.is]: null } } as never, transaction: t },
      );
      if (filas === 0) throw new ErrorDeUnion('La cuenta ya se había unificado.', 409);

      // La principal conserva la clave de persona si no la tenía (así una tercera cuenta de la misma persona se detecta contra ella).
      if (!principal.identityKey && secundaria.identityKey) {
        await User.update({ identityKey: secundaria.identityKey } as never, { where: { id: principalId, identityKey: { [Op.is]: null } } as never, transaction: t });
      }

      // Si el beneficio de lanzamiento lo había recibido la SECUNDARIA, la persona ya lo cobró: la principal queda anotada como que lo recibió (sin darle contratos: los de la
      // secundaria se anulan). Así la persona sigue ocupando UN lugar de las primeras cuentas y no puede recibirlo de nuevo.
      if (secundaria.launchBenefitGrantedAt && !principal.launchBenefitGrantedAt) {
        await User.update(
          { launchBenefitGrantedAt: secundaria.launchBenefitGrantedAt, isEarlyUser: true } as never,
          { where: { id: principalId, launchBenefitGrantedAt: { [Op.is]: null } } as never, transaction: t },
        );
      }

      // Las sesiones abiertas de la secundaria se cierran: no queda nada con lo que seguir operando.
      await RefreshToken.update({ isRevoked: true, revokedAt: ahora } as never, { where: { userId: secundariaId, isRevoked: false } as never, transaction: t });
    }),
  );

  await logEvento({
    action: ACCION_CUENTAS_UNIFICADAS,
    actor: `user:${opciones.adminId}`,
    performedBy: opciones.adminId,
    category: 'user',
    severity: 'high',
    description: `Un administrador unificó la cuenta ${secundariaId} con la cuenta ${principalId} (la misma persona con dos documentos).`,
    targetModel: 'User',
    targetId: secundariaId,
    changes: [
      { field: 'mergedIntoId', oldValue: null, newValue: principalId },
      { field: 'isEarlyUser', oldValue: antes.isEarlyUser, newValue: false },
      { field: 'freeContractsRemaining', oldValue: antes.freeContractsRemaining, newValue: 0 },
    ],
    // Solo ids y números: nada personal. Lo anulado queda acá por si hay que compensarlo a mano.
    metadata: { principalId, nota, confirmadaPorElAdministrador: !mismaClave, coincidiaLaClave: mismaClave, anulado: antes },
  });

  try {
    await Notification.create({
      recipientId: principalId,
      type: 'info',
      category: 'user',
      title: 'Unificamos tus cuentas',
      message: 'Detectamos que tenías dos cuentas con tus documentos y las unificamos: de ahora en más ingresás solo con esta. Tu historial se conserva.',
      relatedModel: 'User',
      relatedId: principalId,
      read: false,
    } as never);
  } catch (e) {
    console.error('[unión de cuentas] no se pudo avisar a la persona:', (e as Error).message);
  }

  return { principalId, secundariaId, anulado: { esDeLasPrimerasCuentas: antes.isEarlyUser, contratosLibres: antes.freeContractsRemaining } };
}
