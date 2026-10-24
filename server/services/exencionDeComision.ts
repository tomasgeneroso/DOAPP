import { QueryTypes, Op, literal, type Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { User } from '../models/sql/User.model.js';
import * as fase from './platformPhase.js';
import { calculateCommission, type CommissionResult } from './commissionService.js';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos).
 *
 * Un contrato libre de comisión se paga igual: el cliente abona el costo del trabajo y el del medio de pago (el procesamiento, con su
 * IVA); lo único que se exime es la COMISIÓN de DOAPP. Antes, con uno de estos contratos el servidor publicaba el trabajo sin cobrar
 * nada y lo marcaba como pagado: el costo del trabajo no se cobraba nunca.
 *
 * Hay DOS cupos, y se gasta UNO por trabajo (queda anotado en `job.commissionFreeApplied`, no cada vez que se abre la pantalla de pago):
 *
 *  - `mensual`: las primeras `POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES` cuentas que completaron su registro (`users.is_early_user`) tienen
 *    `CONTRATOS_LIBRES_POR_MES` contrato libre por mes calendario durante `MESES_DE_CONTRATOS_LIBRES` meses, con cualquier plan. El mes que no se
 *    usa se pierde. Se gasta con `users.free_monthly_used_at`. Va primero porque vence a fin de mes.
 *  - `bono`: el contador `users.free_contracts_remaining`, que suman los premios de referidos. No vence.
 *
 * La membresía NO tiene cupo propio: no modifica la comisión (T&C 7.3 y 8.1); antes PRO daba 1 por mes, SUPER PRO 2 y un bonus.
 *
 * Donde la comisión ya es cero por otra razón (la beta, el plan familia, una invitación) no se gasta ningún cupo: no habría nada que eximir.
 */
export type CupoDeExencion = 'mensual' | 'bono';

/** Lo que hace falta saber de una cuenta para decidir si le queda el contrato libre del mes. */
export interface CuentaParaExencion {
  id: unknown;
  freeContractsRemaining?: number | null;
  isEarlyUser?: boolean | null;
  createdAt?: Date | string | null;
  freeMonthlyUsedAt?: Date | string | null;
}

export interface ComisionDePublicacion {
  comision: CommissionResult;
  /** Qué cupo hay que gastar con este pago (null si no corresponde o ya se gastó para este trabajo). */
  gastar: CupoDeExencion | null;
}

const HORAS_ARGENTINA = -3;

/** Primer instante del mes calendario (hora de Argentina) que contiene `ahora`. */
export function inicioDelMes(ahora: Date = new Date()): Date {
  const local = new Date(ahora.getTime() + HORAS_ARGENTINA * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - HORAS_ARGENTINA * 3_600_000);
}

/**
 * Desde cuándo se cobra comisión en la plataforma (el fin de la beta). Si no se puede leer, el año cuenta desde el alta: es el error que no le quita
 * nada a nadie.
 */
function inicioDelCobro(): Date {
  try {
    return fase.fechasDeFase().liveStartsAt;
  } catch {
    return new Date(0);
  }
}

/**
 * El año del beneficio: arranca al empezar a cobrarse comisión (fin de la beta) o, si la cuenta se creó después, el día del alta; dura
 * `MESES_DE_CONTRATOS_LIBRES` meses. Durante la beta la comisión es cero y no se gastaría nada, así que no corre el reloj.
 */
export function ventanaDelBeneficio(
  cuenta: Pick<CuentaParaExencion, 'createdAt'>,
  cobroDesde: Date = inicioDelCobro(),
): { desde: Date; hasta: Date } | null {
  const alta = cuenta.createdAt ? new Date(cuenta.createdAt) : null;
  if (!alta || Number.isNaN(alta.getTime())) return null;
  const desde = new Date(Math.max(alta.getTime(), cobroDesde.getTime()));
  const hasta = new Date(desde.getTime());
  hasta.setUTCMonth(hasta.getUTCMonth() + POLITICAS.MESES_DE_CONTRATOS_LIBRES);
  return { desde, hasta };
}

/** ¿Le queda a la cuenta el contrato libre de este mes? (Solo mira; gastarlo es `reclamarCupoMensual`.) */
export function cupoMensualDisponible(cuenta: CuentaParaExencion, ahora: Date = new Date(), cobroDesde: Date = inicioDelCobro()): boolean {
  if (!cuenta.isEarlyUser) return false;
  const ventana = ventanaDelBeneficio(cuenta, cobroDesde);
  if (!ventana || ahora.getTime() < ventana.desde.getTime() || ahora.getTime() >= ventana.hasta.getTime()) return false;
  const usado = cuenta.freeMonthlyUsedAt ? new Date(cuenta.freeMonthlyUsedAt) : null;
  return !usado || usado.getTime() < inicioDelMes(ahora).getTime();
}

export interface ContratosLibresDisponibles {
  /** El del mes: 1 si todavía no lo usó este mes y está dentro del año del beneficio. */
  mensual: number;
  /** Los del contador (premios de referidos). */
  bono: number;
  total: number;
  /** Cuándo termina el año del beneficio (ISO), o null si la cuenta no está entre las primeras. */
  hasta: string | null;
}

/** Lo que se le muestra a la persona: cuántos contratos libres de comisión puede usar ahora y hasta cuándo dura el beneficio mensual. */
export function contratosLibresDisponibles(cuenta: CuentaParaExencion, ahora: Date = new Date()): ContratosLibresDisponibles {
  const mensual = cupoMensualDisponible(cuenta, ahora) ? POLITICAS.CONTRATOS_LIBRES_POR_MES : 0;
  const bono = Math.max(0, Number(cuenta.freeContractsRemaining) || 0);
  const ventana = cuenta.isEarlyUser ? ventanaDelBeneficio(cuenta) : null;
  return { mensual, bono, total: mensual + bono, hasta: ventana ? ventana.hasta.toISOString() : null };
}

export async function comisionDePublicacion(
  user: CuentaParaExencion,
  job: { commissionFreeApplied?: boolean | null } | null,
  precio: number,
): Promise<ComisionDePublicacion> {
  const userId = String(user.id);
  const normal = await calculateCommission(userId, precio);

  // Ya se gastó un cupo para ESTE trabajo: sigue libre de comisión, sin gastar otro.
  if (job?.commissionFreeApplied) {
    return { comision: await calculateCommission(userId, precio, { isFreeContract: true }), gastar: null };
  }

  // Beta, plan familia o invitación: la comisión ya es cero y no hay nada que eximir.
  if (normal.commission === 0 && !normal.isFreeContract) return { comision: normal, gastar: null };

  // El contrato libre del mes va primero: se pierde a fin de mes, el contador de premios no.
  if (cupoMensualDisponible(user)) {
    return { comision: await calculateCommission(userId, precio, { isFreeContract: true }), gastar: 'mensual' };
  }

  // Contador de premios: calculateCommission ya lo aplica (comisión 0, isFreeContract).
  if (normal.isFreeContract) return { comision: normal, gastar: 'bono' };

  return { comision: normal, gastar: null };
}

/**
 * Gasta el contrato libre del mes de UNA vez y de forma atómica (un UPDATE condicional: dos pagos simultáneos no gastan el mismo). Devuelve false si
 * ya no estaba disponible (se usó un instante antes, o la cuenta no está entre las primeras / fuera del año del beneficio).
 */
export async function reclamarCupoMensual(userId: string, ahora: Date = new Date(), transaction?: Transaction): Promise<boolean> {
  const filas = (await sequelize.query(
    `UPDATE users
        SET free_monthly_used_at = CAST(:ahora AS timestamptz)
      WHERE id = :id AND is_early_user = true
        AND GREATEST(created_at, CAST(:cobro AS timestamptz)) <= CAST(:ahora AS timestamptz)
        AND CAST(:ahora AS timestamptz) < GREATEST(created_at, CAST(:cobro AS timestamptz)) + make_interval(months => :meses)
        AND (free_monthly_used_at IS NULL OR free_monthly_used_at < CAST(:inicioDelMes AS timestamptz))
    RETURNING id`,
    {
      replacements: {
        id: userId,
        ahora: ahora.toISOString(),
        cobro: inicioDelCobro().toISOString(),
        meses: POLITICAS.MESES_DE_CONTRATOS_LIBRES,
        inicioDelMes: inicioDelMes(ahora).toISOString(),
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ id: string }>;
  return filas.length > 0;
}

/** Devuelve el contrato libre del mes (si el pago no llegó a hacerse). Solo deshace el gasto de ESTE mes. */
export async function devolverCupoMensual(userId: string, ahora: Date = new Date()): Promise<void> {
  await sequelize.query(
    'UPDATE users SET free_monthly_used_at = NULL WHERE id = :id AND free_monthly_used_at >= CAST(:inicioDelMes AS timestamptz)',
    { replacements: { id: userId, inicioDelMes: inicioDelMes(ahora).toISOString() } },
  );
}

/**
 * Gasta el cupo y lo anota en el trabajo. Llamar una sola vez por trabajo (`comisionDePublicacion` ya devuelve null si se gastó). Devuelve false si
 * el contrato libre del mes se usó un instante antes en otro pago: quien llama no debe seguir con la comisión en cero.
 */
export async function gastarCupoDeExencion(user: any, job: any, cupo: CupoDeExencion): Promise<boolean> {
  if (cupo === 'mensual') {
    if (!(await reclamarCupoMensual(String(user.id)))) return false;
    // Para que este mismo objeto no lo vea libre otra vez, sin marcarlo como cambiado (ya está escrito).
    user.set('freeMonthlyUsedAt', new Date(), { raw: true });
  } else {
    user.freeContractsRemaining = Math.max(0, (user.freeContractsRemaining || 0) - 1);
    await user.save();
  }
  job.commissionFreeApplied = true;
  await job.save();
  return true;
}

/** Deshace `gastarCupoDeExencion` cuando el pago que lo motivó no se completó. */
export async function devolverCupoDeExencion(user: any, job: any, cupo: CupoDeExencion): Promise<void> {
  if (cupo === 'mensual') {
    await devolverCupoMensual(String(user.id));
    user.set('freeMonthlyUsedAt', null, { raw: true });
  } else {
    user.freeContractsRemaining = (user.freeContractsRemaining || 0) + 1;
    await user.save();
  }
  job.commissionFreeApplied = false;
  await job.save();
}

/**
 * Reclama un contrato libre para crear un contrato (rutas viejas con `useFreeContract`): el del mes primero y, si no, uno del contador. Atómico.
 * Devuelve qué cupo se gastó, o null si no había.
 */
export async function reclamarContratoLibre(userId: string): Promise<CupoDeExencion | null> {
  if (await reclamarCupoMensual(userId)) return 'mensual';
  const [reclamados] = await User.update(
    { freeContractsRemaining: literal('"free_contracts_remaining" - 1') } as never,
    { where: { id: userId, freeContractsRemaining: { [Op.gt]: 0 } } },
  );
  return reclamados > 0 ? 'bono' : null;
}

/** Devuelve lo que gastó `reclamarContratoLibre` si el contrato no llegó a crearse. */
export async function devolverContratoLibre(userId: string, cupo: CupoDeExencion): Promise<void> {
  if (cupo === 'mensual') {
    await devolverCupoMensual(userId);
    return;
  }
  await User.update({ freeContractsRemaining: literal('"free_contracts_remaining" + 1') } as never, { where: { id: userId } });
}

/**
 * Marca a una cuenta como una de las primeras `PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES` si todavía hay lugar. Cuenta recién cuando el registro está COMPLETO
 * (`registration_pending = false`): una cuenta que se creó en el paso 1 y se abandonó no ocupa uno de los lugares. Idempotente (una cuenta ya marcada
 * no se marca dos veces) y exacta bajo registros simultáneos: un candado de la base serializa el conteo. NUNCA tira error: si falla, la cuenta queda
 * creada sin el beneficio y se avisa en el log (un alta no se frena por esto).
 */
export async function otorgarContratosLibres(userId: string): Promise<{ otorgado: boolean; numero?: number }> {
  try {
    return await sequelize.transaction(async (t) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', { replacements: { clave: 'contratos-libres-de-comision' }, transaction: t });
      const filas = (await sequelize.query(
        `UPDATE users
            SET is_early_user = true,
                early_user_number = (SELECT COALESCE(MAX(early_user_number), 0) + 1 FROM users)
          WHERE id = :id AND is_early_user = false AND registration_pending = false
            AND (SELECT COUNT(*) FROM users WHERE is_early_user = true) < :tope
        RETURNING early_user_number`,
        {
          replacements: { id: userId, tope: POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      )) as Array<{ early_user_number: number }>;
      return filas.length > 0 ? { otorgado: true, numero: Number(filas[0].early_user_number) } : { otorgado: false };
    });
  } catch (e) {
    console.error('[contratos libres] no se pudieron otorgar a', userId, (e as Error).message);
    return { otorgado: false };
  }
}

export interface ResultadoDeLaAsignacion {
  /** Cuentas que entran en el reparto (las más antiguas con el registro completo que todavía no estaban marcadas, hasta completar el tope). */
  cuentas: number;
  /** Cuentas ya marcadas que conservan el cupo de 6 de la regla anterior (no se tocan). */
  conCupoDeLaReglaAnterior: number;
  aplicado: boolean;
}

/**
 * Marca como «primeras cuentas» a las que YA existían cuando se fijó la regla: las más antiguas con el registro completo que todavía no están marcadas,
 * hasta completar `PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES`. Quedan con el contrato libre del mes (la regla no entrega contratos sueltos); no toca el
 * contador de premios ni lo que cada cuenta ya tenía.
 *
 * Por defecto solo muestra qué haría (vista previa / dry-run). Con `aplicar` lo escribe, en una sola transacción y con el mismo candado que
 * `otorgarContratosLibres`, así que es seguro correrlo mientras hay altas. Correrlo de nuevo no hace nada: las cuentas ya marcadas no se tocan.
 */
export async function asignarContratosLibresAExistentes(
  opciones: { aplicar: boolean },
  escribir: (t: string) => void = console.log,
): Promise<ResultadoDeLaAsignacion> {
  const tope = POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES;

  const trabajo = async (t: Transaction | undefined): Promise<ResultadoDeLaAsignacion> => {
    const [{ marcadas, ultimo, conCupoViejo }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS marcadas,
              COALESCE(MAX(early_user_number), 0)::int AS ultimo,
              COUNT(*) FILTER (WHERE free_contracts_remaining >= 6)::int AS "conCupoViejo"
         FROM users WHERE is_early_user = true`,
      { type: QueryTypes.SELECT, transaction: t },
    )) as Array<{ marcadas: number; ultimo: number; conCupoViejo: number }>;
    const lugares = Math.max(0, tope - marcadas);
    escribir(`Ya marcadas: ${marcadas} de ${tope}. Lugares libres: ${lugares}. Beneficio: ${POLITICAS.CONTRATOS_LIBRES_POR_MES} contrato libre por mes durante ${POLITICAS.MESES_DE_CONTRATOS_LIBRES} meses.`);
    if (conCupoViejo > 0) {
      escribir(`Atención: ${conCupoViejo} cuenta(s) ya marcada(s) tienen 6 o más contratos en el contador (el cupo de la regla anterior, «6 para las primeras 2000»). No se tocan.`);
    }

    const candidatas = (await sequelize.query(
      `SELECT u.id, u.email, u.created_at AS "creadaEl"
         FROM users u
        WHERE u.is_early_user = false AND u.registration_pending = false
        ORDER BY u.created_at ASC, u.id ASC
        LIMIT :lugares`,
      { replacements: { lugares }, type: QueryTypes.SELECT, transaction: t },
    )) as Array<{ id: string; email: string | null; creadaEl: Date }>;

    const filas = candidatas.map((c, i) => ({ ...c, numero: ultimo + i + 1 }));
    escribir(`Entran ${filas.length} cuentas.`);
    for (const f of filas.slice(0, 10)) {
      const correo = f.email ? `${f.email.slice(0, 3)}***` : '(sin correo)';
      escribir(`   #${f.numero} ${correo} · creada el ${new Date(f.creadaEl).toLocaleDateString('es-AR')}`);
    }
    if (filas.length > 10) escribir(`   … y ${filas.length - 10} más`);

    if (opciones.aplicar) {
      for (const f of filas) {
        await sequelize.query('UPDATE users SET is_early_user = true, early_user_number = :numero WHERE id = :id AND is_early_user = false', {
          replacements: { id: f.id, numero: f.numero },
          transaction: t,
        });
      }
    }
    return { cuentas: filas.length, conCupoDeLaReglaAnterior: conCupoViejo, aplicado: opciones.aplicar };
  };

  if (!opciones.aplicar) {
    const r = await trabajo(undefined);
    escribir('\n(solo vista previa: falta --aplicar)');
    return r;
  }
  const r = await sequelize.transaction(async (t) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', { replacements: { clave: 'contratos-libres-de-comision' }, transaction: t });
    return trabajo(t);
  });
  escribir('\nHecho.');
  return r;
}
