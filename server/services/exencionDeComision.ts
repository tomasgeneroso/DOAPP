import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { calculateCommission, type CommissionResult } from './commissionService.js';

/**
 * Contratos LIBRES DE COMISIÓN (no gratuitos).
 *
 * Un contrato libre de comisión se paga igual: el cliente abona el costo del trabajo y el del medio de pago (el procesamiento, con su
 * IVA); lo único que se exime es la COMISIÓN de DOAPP. Antes, con uno de estos contratos el servidor publicaba el trabajo sin cobrar
 * nada y lo marcaba como pagado: el costo del trabajo no se cobraba nunca.
 *
 * Hay UN solo cupo: los contratos libres de lanzamiento (`freeContractsRemaining`). Las primeras
 * `POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES` cuentas reciben `POLITICAS.CONTRATOS_LIBRES_DE_COMISION` al crearse
 * (`otorgarContratosLibres`), con cualquier plan. La membresía NO tiene cupo propio: no modifica la comisión (T&C 7.3 y 8.1); antes PRO daba 1
 * por mes, SUPER PRO 2 y un bonus. Un cupo se gasta UNA vez por trabajo (queda anotado en `job.commissionFreeApplied`), no cada vez que se
 * abre la pantalla de pago.
 *
 * Donde la comisión ya es cero por otra razón (la beta, el plan familia, una invitación) no se gasta ningún cupo: no habría nada que eximir.
 */
export type CupoDeExencion = 'inicial';

export interface ComisionDePublicacion {
  comision: CommissionResult;
  /** Qué cupo hay que gastar con este pago (null si no corresponde o ya se gastó para este trabajo). */
  gastar: CupoDeExencion | null;
}

export async function comisionDePublicacion(
  user: { id: unknown; freeContractsRemaining?: number | null },
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

  // Cupo de lanzamiento: calculateCommission ya lo aplica (comisión 0, isFreeContract).
  if (normal.isFreeContract) return { comision: normal, gastar: 'inicial' };

  return { comision: normal, gastar: null };
}

/** Gasta el cupo y lo anota en el trabajo. Llamar una sola vez por trabajo (la función de arriba ya devuelve null si se gastó). */
export async function gastarCupoDeExencion(user: any, job: any, _cupo: CupoDeExencion): Promise<void> {
  user.freeContractsRemaining = Math.max(0, (user.freeContractsRemaining || 0) - 1);
  job.commissionFreeApplied = true;
  await user.save();
  await job.save();
}

/**
 * Le da a una cuenta recién creada los contratos libres de comisión de lanzamiento, si todavía hay lugar entre las primeras
 * `PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES`. Idempotente (una cuenta ya marcada no recibe dos veces) y exacta bajo registros simultáneos: un candado de
 * la base serializa el conteo. NUNCA tira error: si falla, la cuenta queda creada sin cupo y se avisa en el log (un alta no se frena por esto).
 */
export async function otorgarContratosLibres(userId: string): Promise<{ otorgado: boolean; numero?: number }> {
  try {
    return await sequelize.transaction(async (t) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', { replacements: { clave: 'contratos-libres-de-comision' }, transaction: t });
      const filas = (await sequelize.query(
        `UPDATE users
            SET is_early_user = true,
                early_user_number = (SELECT COALESCE(MAX(early_user_number), 0) + 1 FROM users),
                free_contracts_remaining = free_contracts_remaining + :contratos
          WHERE id = :id AND is_early_user = false
            AND (SELECT COUNT(*) FROM users WHERE is_early_user = true) < :tope
        RETURNING early_user_number`,
        {
          replacements: { id: userId, contratos: POLITICAS.CONTRATOS_LIBRES_DE_COMISION, tope: POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES },
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
  /** Cuentas que entran en el reparto (las más antiguas que todavía no estaban marcadas, hasta completar el tope). */
  cuentas: number;
  /** De esas, a cuántas les cambia el número de contratos libres. */
  conCambio: number;
  /** Contratos libres que se suman en total. */
  contratosSumados: number;
  aplicado: boolean;
}

/**
 * Reparte los contratos libres de comisión de lanzamiento entre las cuentas que YA existían cuando se fijó la regla: las más antiguas que todavía no
 * están marcadas, hasta completar `PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES`. A cada una le deja `CONTRATOS_LIBRES_DE_COMISION` menos los que ya gastó
 * (trabajos con `commission_free_applied`), sin bajarle lo que ya tenía de más (por ejemplo un premio de referidos).
 *
 * Por defecto solo muestra qué haría (vista previa / dry-run). Con `aplicar` lo escribe, en una sola transacción y con el mismo candado que
 * `otorgarContratosLibres`, así que es seguro correrlo mientras hay altas. Correrlo de nuevo no hace nada: las cuentas ya marcadas no se tocan.
 */
export async function asignarContratosLibresAExistentes(
  opciones: { aplicar: boolean },
  escribir: (t: string) => void = console.log,
): Promise<ResultadoDeLaAsignacion> {
  const tope = POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES;
  const cupo = POLITICAS.CONTRATOS_LIBRES_DE_COMISION;

  const trabajo = async (t: import('sequelize').Transaction | undefined): Promise<ResultadoDeLaAsignacion> => {
    const [{ marcadas, ultimo }] = (await sequelize.query(
      'SELECT COUNT(*)::int AS marcadas, COALESCE(MAX(early_user_number), 0)::int AS ultimo FROM users WHERE is_early_user = true',
      { type: QueryTypes.SELECT, transaction: t },
    )) as Array<{ marcadas: number; ultimo: number }>;
    const lugares = Math.max(0, tope - marcadas);
    escribir(`Ya marcadas: ${marcadas} de ${tope}. Lugares libres: ${lugares}. Contratos libres por cuenta: ${cupo}.`);

    const candidatas = (await sequelize.query(
      `SELECT u.id, u.email, u.created_at AS "creadaEl", u.free_contracts_remaining AS tiene,
              (SELECT COUNT(*)::int FROM jobs j WHERE j.client_id = u.id AND j.commission_free_applied = true) AS gastados
         FROM users u
        WHERE u.is_early_user = false
        ORDER BY u.created_at ASC, u.id ASC
        LIMIT :lugares`,
      { replacements: { lugares }, type: QueryTypes.SELECT, transaction: t },
    )) as Array<{ id: string; email: string | null; creadaEl: Date; tiene: number; gastados: number }>;

    let conCambio = 0;
    let contratosSumados = 0;
    const filas = candidatas.map((c, i) => {
      const nuevo = Math.max(Number(c.tiene) || 0, cupo - (Number(c.gastados) || 0));
      const suma = nuevo - (Number(c.tiene) || 0);
      if (suma !== 0) conCambio += 1;
      contratosSumados += suma;
      return { ...c, numero: ultimo + i + 1, nuevo };
    });

    escribir(`Entran ${filas.length} cuentas; a ${conCambio} les cambia el número de contratos libres (${contratosSumados >= 0 ? '+' : ''}${contratosSumados} en total).`);
    for (const f of filas.slice(0, 10)) {
      const correo = f.email ? `${f.email.slice(0, 3)}***` : '(sin correo)';
      escribir(`   #${f.numero} ${correo} · tenía ${f.tiene}, gastó ${f.gastados} → queda con ${f.nuevo}`);
    }
    if (filas.length > 10) escribir(`   … y ${filas.length - 10} más`);

    if (opciones.aplicar) {
      for (const f of filas) {
        await sequelize.query(
          'UPDATE users SET is_early_user = true, early_user_number = :numero, free_contracts_remaining = :nuevo WHERE id = :id AND is_early_user = false',
          { replacements: { id: f.id, numero: f.numero, nuevo: f.nuevo }, transaction: t },
        );
      }
    }
    return { cuentas: filas.length, conCambio, contratosSumados, aplicado: opciones.aplicar };
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
