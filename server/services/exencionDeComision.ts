import { QueryTypes, Op, literal, type Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
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
 *  - `pro`: `CONTRATOS_LIBRES_POR_MES` contrato libre por mes calendario de quien tiene la membresía PRO vigente (T&C 8.1), mientras la tenga. NO existe durante el
 *    mes de PRO SIN COSTO del beneficio de lanzamiento (regla del dueño, 2026-11-09, opción B): ese mes la persona tiene UN solo contrato libre, el del lanzamiento. El mes que no se usa se
 *    pierde (no hay cron que lo reponga: se calcula con la fecha del último uso, `users.free_monthly_pro_used_at`). Va primero porque vence a fin de mes.
 *  - `bono`: el contador `users.free_contracts_remaining`. No vence. Lo suman el contrato libre de LANZAMIENTO (abajo) y los premios de referidos.
 *
 * EL BENEFICIO DE LANZAMIENTO (regla del dueño, 2026-11-06; reemplaza al «1 contrato libre por mes durante 12 meses para las primeras 1.000 cuentas»):
 * las primeras `PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES` PERSONAS VERIFICADAS tienen UN contrato libre de comisión (una sola vez: después pagan comisión) y
 * `MESES_DE_PRO_DE_LANZAMIENTO` mes de PRO gratis. Las siguientes no tienen ninguno de los dos. «Verificada» es el registro completo con el documento aprobado por Didit:
 * un administrador no puede aprobar una identidad a mano (ver `routes/admin/users.ts`), así que no hay otro camino. Se otorga UNA vez por persona: si otra cuenta con la
 * misma clave de persona ya lo recibió (`shared/identidad/clavePersona.ts`), no se da otra vez; la unión de cuentas anula lo que tuviera la secundaria.
 *
 * En los demás contratos de PRO la comisión no es cero: es la de PRO (`COMMISSION_RATES.pro`), que calcula `calculateCommission`.
 *
 * Donde la comisión ya es cero por otra razón (la beta, el plan familia, una invitación) no se gasta ningún cupo: no habría nada que eximir.
 */
export type CupoDeExencion = 'pro' | 'bono';

/** Lo que hace falta saber de una cuenta para decidir si le queda el contrato libre del mes. */
export interface CuentaParaExencion {
  id: unknown;
  freeContractsRemaining?: number | null;
  isEarlyUser?: boolean | null;
  createdAt?: Date | string | null;
  /** Cuándo gastó el contrato libre del mes de la membresía PRO. */
  freeMonthlyProUsedAt?: Date | string | null;
  /** Cuándo recibió el beneficio de lanzamiento (para saber si está en su mes de PRO sin costo). */
  launchBenefitGrantedAt?: Date | string | null;
  /** Para saber si tiene la membresía PRO vigente. */
  membershipTier?: string | null;
  hasMembership?: boolean | null;
  membershipExpiresAt?: Date | string | null;
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

/** ¿Tiene la membresía PRO (o la SUPER PRO heredada) vigente? (`has_membership` y no vencida). */
export function tieneProVigente(cuenta: CuentaParaExencion, ahora: Date = new Date()): boolean {
  if (!['pro', 'super_pro'].includes(String(cuenta.membershipTier))) return false;
  if (cuenta.hasMembership !== true) return false;
  return !cuenta.membershipExpiresAt || new Date(cuenta.membershipExpiresAt).getTime() > ahora.getTime();
}

/**
 * ¿Está en el mes de PRO SIN COSTO que da el beneficio de lanzamiento (y no pagó una membresía)? Lo es si recibió el beneficio y su PRO vence cuando termina ese mes. Una
 * membresía pagada vence más tarde (y no se puede comprar otra mientras hay una vigente), así que no se confunde. Se deja un margen de unos días porque el mes de la base y
 * el de JavaScript no miden igual (31 de enero + 1 mes).
 */
export function enElPeriodoSinCostoDelLanzamiento(cuenta: CuentaParaExencion): boolean {
  if (!cuenta.launchBenefitGrantedAt || !cuenta.membershipExpiresAt) return false;
  const fin = new Date(cuenta.launchBenefitGrantedAt);
  fin.setMonth(fin.getMonth() + POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO);
  return new Date(cuenta.membershipExpiresAt).getTime() <= fin.getTime() + MARGEN_DEL_MES_DE_LANZAMIENTO_MS;
}
const MARGEN_DEL_MES_DE_LANZAMIENTO_MS = 4 * 86_400_000;

const noGastadoEsteMes = (usadoEn: Date | string | null | undefined, ahora: Date): boolean => {
  const usado = usadoEn ? new Date(usadoEn) : null;
  return !usado || usado.getTime() < inicioDelMes(ahora).getTime();
};

/** ¿Le queda el contrato libre de este mes de la membresía PRO? (Solo mira; gastarlo es `reclamarCupoDeLaMembresia`.) */
export function cupoDeLaMembresiaDisponible(cuenta: CuentaParaExencion, ahora: Date = new Date()): boolean {
  // En el mes de PRO sin costo del lanzamiento no hay contrato libre mensual: la persona tiene UNO solo, el del lanzamiento (opción B del dueño, 2026-11-09).
  return tieneProVigente(cuenta, ahora) && !enElPeriodoSinCostoDelLanzamiento(cuenta) && noGastadoEsteMes(cuenta.freeMonthlyProUsedAt, ahora);
}

export interface ContratosLibresDisponibles {
  /** El del mes de la membresía PRO: 1 si tiene PRO vigente y todavía no lo usó este mes. */
  membresia: number;
  /** Los del contador: el contrato libre de lanzamiento (si todavía no lo usó) y los premios de referidos. */
  bono: number;
  total: number;
}

/** Lo que se le muestra a la persona: cuántos contratos libres de comisión puede usar ahora. */
export function contratosLibresDisponibles(cuenta: CuentaParaExencion, ahora: Date = new Date()): ContratosLibresDisponibles {
  const membresia = cupoDeLaMembresiaDisponible(cuenta, ahora) ? POLITICAS.CONTRATOS_LIBRES_POR_MES : 0;
  const bono = Math.max(0, Number(cuenta.freeContractsRemaining) || 0);
  return { membresia, bono, total: membresia + bono };
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

  // El contrato libre del mes de la membresía va primero (se pierde a fin de mes); el contador (lanzamiento y premios) no vence.
  if (cupoDeLaMembresiaDisponible(user)) {
    return { comision: await calculateCommission(userId, precio, { isFreeContract: true }), gastar: 'pro' };
  }

  // Contador: calculateCommission ya lo aplica (comisión 0, isFreeContract).
  if (normal.isFreeContract) return { comision: normal, gastar: 'bono' };

  return { comision: normal, gastar: null };
}

/**
 * Gasta el contrato libre del mes de la membresía PRO de UNA vez y de forma atómica (un UPDATE condicional: dos pagos simultáneos no gastan el mismo). Devuelve false si
 * ya no estaba disponible (se usó un instante antes, o la cuenta ya no tiene PRO vigente).
 */
export async function reclamarCupoDeLaMembresia(userId: string, ahora: Date = new Date(), transaction?: Transaction): Promise<boolean> {
  const filas = (await sequelize.query(
    `UPDATE users
        SET free_monthly_pro_used_at = CAST(:ahora AS timestamptz)
      WHERE id = :id
        AND membership_tier IN ('pro', 'super_pro') AND has_membership = true
        AND (membership_expires_at IS NULL OR membership_expires_at > CAST(:ahora AS timestamptz))
        AND (free_monthly_pro_used_at IS NULL OR free_monthly_pro_used_at < CAST(:inicioDelMes AS timestamptz))
        -- el mismo criterio que enElPeriodoSinCostoDelLanzamiento: en el mes de PRO sin costo del lanzamiento no hay contrato libre mensual
        AND NOT (
          launch_benefit_granted_at IS NOT NULL AND membership_expires_at IS NOT NULL
          AND membership_expires_at <= launch_benefit_granted_at + make_interval(months => :mesesDePro) + interval '4 days'
        )
    RETURNING id`,
    {
      replacements: { id: userId, ahora: ahora.toISOString(), inicioDelMes: inicioDelMes(ahora).toISOString(), mesesDePro: POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ id: string }>;
  return filas.length > 0;
}

/** Devuelve el contrato libre del mes de la membresía (si el pago no llegó a hacerse). Solo deshace el gasto de ESTE mes. */
export async function devolverCupoDeLaMembresia(userId: string, ahora: Date = new Date()): Promise<void> {
  await sequelize.query(
    'UPDATE users SET free_monthly_pro_used_at = NULL WHERE id = :id AND free_monthly_pro_used_at >= CAST(:inicioDelMes AS timestamptz)',
    { replacements: { id: userId, inicioDelMes: inicioDelMes(ahora).toISOString() } },
  );
}

/**
 * Gasta el cupo y lo anota en el trabajo. Llamar una sola vez por trabajo (`comisionDePublicacion` ya devuelve null si se gastó). Devuelve false si
 * el contrato libre del mes se usó un instante antes en otro pago: quien llama no debe seguir con la comisión en cero.
 */
export async function gastarCupoDeExencion(user: any, job: any, cupo: CupoDeExencion): Promise<boolean> {
  if (cupo === 'pro') {
    if (!(await reclamarCupoDeLaMembresia(String(user.id)))) return false;
    user.set('freeMonthlyProUsedAt', new Date(), { raw: true });
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
  if (cupo === 'pro') {
    await devolverCupoDeLaMembresia(String(user.id));
    user.set('freeMonthlyProUsedAt', null, { raw: true });
  } else {
    user.freeContractsRemaining = (user.freeContractsRemaining || 0) + 1;
    await user.save();
  }
  job.commissionFreeApplied = false;
  await job.save();
}

/**
 * Reclama un contrato libre para crear un contrato (rutas viejas con `useFreeContract`): el del mes de la membresía primero y, si no, uno del contador. Atómico.
 * Devuelve qué cupo se gastó, o null si no había.
 */
export async function reclamarContratoLibre(userId: string): Promise<CupoDeExencion | null> {
  if (await reclamarCupoDeLaMembresia(userId)) return 'pro';
  const [reclamados] = await User.update(
    { freeContractsRemaining: literal('"free_contracts_remaining" - 1') } as never,
    { where: { id: userId, freeContractsRemaining: { [Op.gt]: 0 } } },
  );
  return reclamados > 0 ? 'bono' : null;
}

/** Devuelve lo que gastó `reclamarContratoLibre` si el contrato no llegó a crearse. */
export async function devolverContratoLibre(userId: string, cupo: CupoDeExencion): Promise<void> {
  if (cupo === 'pro') {
    await devolverCupoDeLaMembresia(userId);
    return;
  }
  await User.update({ freeContractsRemaining: literal('"free_contracts_remaining" + 1') } as never, { where: { id: userId } });
}

/**
 * Le da a una cuenta el BENEFICIO DE LANZAMIENTO si todavía hay lugar: un contrato libre de comisión (una sola vez) y un mes de PRO. Cuenta recién cuando la persona está
 * VERIFICADA (`dni_verified`: el registro completo con el documento aprobado por Didit): una cuenta que se creó en el paso 1 y se abandonó, o que no verificó, no ocupa uno de
 * los lugares.
 *
 * Idempotente (una cuenta que ya lo recibió no lo recibe dos veces) y exacta bajo verificaciones simultáneas: un candado de la base serializa el conteo. No se da si
 * OTRA cuenta con la misma clave de persona ya lo recibió (una persona, un beneficio: la misma persona con dos documentos no cobra dos veces). Si la cuenta ya tiene PRO
 * pago, no se le toca la membresía. NUNCA tira error: si falla, la cuenta queda como estaba y se avisa en el log (una verificación no se frena por esto).
 *
 * (El nombre se conserva: lo llaman los lugares donde antes se marcaba a las primeras cuentas.)
 */
export async function otorgarContratosLibres(userId: string, ahora: Date = new Date()): Promise<{ otorgado: boolean; numero?: number }> {
  try {
    const resultado = await sequelize.transaction(async (t) => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', { replacements: { clave: 'contratos-libres-de-comision' }, transaction: t });
      const proVigente = `(membership_tier IN ('pro', 'super_pro') AND has_membership = true AND (membership_expires_at IS NULL OR membership_expires_at > CAST(:ahora AS timestamptz)))`;
      const filas = (await sequelize.query(
        `UPDATE users
            SET is_early_user = true,
                early_user_number = (SELECT COALESCE(MAX(early_user_number), 0) + 1 FROM users),
                launch_benefit_granted_at = CAST(:ahora AS timestamptz),
                free_contracts_remaining = COALESCE(free_contracts_remaining, 0) + :contratos,
                membership_tier = CASE WHEN ${proVigente} THEN membership_tier ELSE 'pro' END,
                has_membership = CASE WHEN ${proVigente} THEN has_membership ELSE true END,
                membership_expires_at = CASE WHEN ${proVigente} THEN membership_expires_at ELSE CAST(:ahora AS timestamptz) + make_interval(months => :mesesDePro) END
          WHERE id = :id
            AND launch_benefit_granted_at IS NULL
            AND registration_pending = false
            AND dni_verified = true
            AND merged_into_id IS NULL
            -- El lugar lo ocupa quien RECIBIÓ el beneficio (no quien quedó marcado «primera» por la regla anterior al registrarse sin verificar).
            AND (SELECT COUNT(*) FROM users WHERE launch_benefit_granted_at IS NOT NULL AND merged_into_id IS NULL) < :tope
            AND NOT EXISTS (
              SELECT 1 FROM users otra
               WHERE users.identity_key IS NOT NULL AND otra.identity_key = users.identity_key
                 AND otra.id <> users.id AND otra.merged_into_id IS NULL AND otra.launch_benefit_granted_at IS NOT NULL
            )
        RETURNING early_user_number`,
        {
          replacements: {
            id: userId,
            ahora: ahora.toISOString(),
            contratos: POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO,
            mesesDePro: POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO,
            tope: POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES,
          },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      )) as Array<{ early_user_number: number }>;
      return filas.length > 0 ? { otorgado: true, numero: Number(filas[0].early_user_number) } : { otorgado: false };
    });

    if (resultado.otorgado) {
      // El aviso es secundario: el beneficio ya quedó guardado.
      try {
        await Notification.create({
          recipientId: userId,
          type: 'success',
          category: 'user',
          title: `¡Sos una de las primeras ${POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES} cuentas verificadas!`,
          message: `Tenés ${POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO} contrato libre de comisión (se usa una sola vez; después pagás la comisión de siempre) y la membresía PRO gratis por ${POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO} mes.`,
          relatedModel: 'User',
          relatedId: userId,
          read: false,
        } as never);
      } catch (e) {
        console.error('[beneficio de lanzamiento] no se pudo avisar a la persona:', (e as Error).message);
      }
    }
    return resultado;
  } catch (e) {
    console.error('[beneficio de lanzamiento] no se pudo otorgar a', userId, (e as Error).message);
    return { otorgado: false };
  }
}

export interface ResultadoDeLaAsignacion {
  /** Cuentas verificadas que reciben el beneficio ahora (hasta completar el tope). */
  cuentas: number;
  /** Cuentas que estaban marcadas como «primeras» por la regla anterior (al registrarse) pero NO están verificadas: pierden la marca hasta que se verifiquen. */
  desmarcadas: number;
  aplicado: boolean;
}

/**
 * Pone al día a las cuentas que YA existían con la regla del 2026-11-06 (beneficio de lanzamiento para las primeras personas VERIFICADAS):
 *  - las marcadas como «primeras» por la regla anterior (al registrarse) que NO están verificadas pierden la marca (la reciben al verificarse);
 *  - las verificadas que todavía no recibieron el beneficio lo reciben, de la más antigua a la más nueva, hasta completar `PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES`.
 * Las marcadas por la regla anterior que SÍ están verificadas reciben ahora el contrato único y el mes de PRO (el cupo mensual de 12 meses ya no existe).
 *
 * Por defecto solo muestra qué haría (vista previa / dry-run). Con `aplicar` lo escribe, cuenta por cuenta con las mismas reglas y el mismo candado que
 * `otorgarContratosLibres` (una persona con dos cuentas no cobra dos veces), así que es seguro correrlo mientras hay altas. Correrlo de nuevo no hace nada.
 */
export async function asignarContratosLibresAExistentes(
  opciones: { aplicar: boolean },
  escribir: (t: string) => void = console.log,
): Promise<ResultadoDeLaAsignacion> {
  const tope = POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES;

  const [{ conBeneficio }] = (await sequelize.query(`SELECT COUNT(*)::int AS "conBeneficio" FROM users WHERE launch_benefit_granted_at IS NOT NULL`, { type: QueryTypes.SELECT })) as Array<{ conBeneficio: number }>;
  const [{ marcadasSinVerificar }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS "marcadasSinVerificar" FROM users WHERE is_early_user = true AND launch_benefit_granted_at IS NULL AND dni_verified = false`,
    { type: QueryTypes.SELECT },
  )) as Array<{ marcadasSinVerificar: number }>;

  const candidatas = (await sequelize.query(
    `SELECT u.id, u.created_at AS "creadaEl"
       FROM users u
      WHERE u.launch_benefit_granted_at IS NULL AND u.dni_verified = true AND u.registration_pending = false AND u.merged_into_id IS NULL
      ORDER BY u.created_at ASC, u.id ASC
      LIMIT :lugares`,
    { replacements: { lugares: Math.max(0, tope - conBeneficio) }, type: QueryTypes.SELECT },
  )) as Array<{ id: string; creadaEl: Date }>;

  escribir(`Ya con el beneficio de lanzamiento: ${conBeneficio} de ${tope}. Lugares libres: ${Math.max(0, tope - conBeneficio)}.`);
  escribir(`Beneficio: ${POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO} contrato libre de comisión (una sola vez) y ${POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO} mes de PRO.`);
  escribir(`Marcadas como «primeras» por la regla anterior pero sin verificar (pierden la marca hasta verificarse): ${marcadasSinVerificar}.`);
  escribir(`Cuentas verificadas que entran ahora: ${candidatas.length}.`);

  if (!opciones.aplicar) {
    escribir('\n(solo vista previa: falta --aplicar)');
    return { cuentas: candidatas.length, desmarcadas: marcadasSinVerificar, aplicado: false };
  }

  await sequelize.query(
    `UPDATE users SET is_early_user = false, early_user_number = NULL
      WHERE is_early_user = true AND launch_benefit_granted_at IS NULL AND dni_verified = false`,
  );
  let otorgadas = 0;
  for (const c of candidatas) {
    // La misma regla que al verificarse: una persona con dos cuentas no recibe dos veces y el tope se respeta aunque haya altas a la vez.
    if ((await otorgarContratosLibres(c.id)).otorgado) otorgadas += 1;
  }
  escribir(`\nHecho: ${otorgadas} cuenta(s) con el beneficio.`);
  return { cuentas: otorgadas, desmarcadas: marcadasSinVerificar, aplicado: true };
}
