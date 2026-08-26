import { Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Contract } from '../models/sql/Contract.model.js';
import {
  PaymentAction,
  PaymentActionType,
  TERMINAL_ACTION_TYPES,
} from '../models/sql/PaymentAction.model.js';

/**
 * Ejecucion segura de movimientos de dinero irreversibles.
 *
 * El problema que resuelve: hoy no hay ni una transaccion ni un lock en todo el
 * flujo de plata de la app. Dos procesos que corren a la vez -- el cron de
 * vencimiento y un admin apretando "marcar pagado", un webhook que Mercado Pago
 * reintenta, dos clicks -- pueden pagarle al trabajador y devolverle al cliente
 * el mismo dinero, y ninguna de las dos operaciones se puede deshacer.
 *
 * La secuencia es deliberada:
 *
 *   1. BEGIN + SELECT ... FOR UPDATE sobre el contrato
 *   2. verificar el estado
 *   3. reservar la accion en payment_actions  <- el indice unico decide quien gana
 *   4. COMMIT                                 <- se suelta el lock
 *   5. recien ahora, llamar al proveedor      <- afuera de la transaccion
 *   6. registrar el resultado
 *
 * El paso 4 antes del 5 no es un detalle: mantener una transaccion abierta
 * mientras se espera a un servicio externo hace que un timeout de Mercado Pago
 * se convierta en filas bloqueadas y conexiones agotadas para todos los demas.
 *
 * A cambio, entre el 4 y el 6 existe una ventana donde la accion quedo
 * reservada sin resultado conocido. Eso es correcto y es el punto: el registro
 * en la base es lo que impide que otro proceso arranque una operacion distinta
 * mientras esta esta en el aire.
 */

export interface FinancialActionRequest {
  contractId: string;
  actionType: PaymentActionType;
  provider: string;
  amount: number;
  currency?: string;
  paymentId?: string;
  externalReference?: string;
  executedById?: string | null;
  requestPayload?: any;
  /**
   * Clave estable de la operacion. Un reintento de la MISMA operacion debe
   * traer la misma clave; una operacion distinta, una distinta. Si no se pasa
   * se deriva del contrato y el tipo, que es estable por definicion.
   */
  idempotencyKey?: string;
}

export interface FinancialActionResult {
  ok: boolean;
  action?: PaymentAction;
  /** Codigo estable para que el llamador decida, en vez de leer el mensaje. */
  reason?:
    | 'CONTRACT_NOT_FOUND'
    | 'ALREADY_SETTLED'
    | 'IN_FLIGHT'
    | 'STATE_NOT_ALLOWED'
    | 'PROVIDER_FAILED';
  message?: string;
}

/** Derivada del contrato y el tipo: estable entre reintentos sin coordinacion. */
export function defaultIdempotencyKey(contractId: string, actionType: PaymentActionType): string {
  return `${actionType.toLowerCase()}:${contractId}`;
}

/**
 * Reserva la accion. Devuelve la fila creada, o el motivo por el que no se
 * puede: ya hay una operacion terminal viva para ese contrato.
 *
 * Corre entera dentro de la transaccion del llamador, con el contrato tomado.
 */
async function reserve(
  req: FinancialActionRequest,
  tx: Transaction,
): Promise<
  | { action: PaymentAction; alreadyInFlight?: boolean }
  | { reason: FinancialActionResult['reason']; message: string }
> {
  const contract = await Contract.findByPk(req.contractId, {
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });

  if (!contract) {
    return { reason: 'CONTRACT_NOT_FOUND', message: 'El contrato no existe' };
  }

  // Lo que ya haya pasado con la plata de este contrato, bajo el lock.
  const existing = await PaymentAction.findAll({
    where: { contractId: req.contractId },
    transaction: tx,
  });

  const live = existing.filter(
    (a) => TERMINAL_ACTION_TYPES.includes(a.actionType) && a.status !== 'FAILED',
  );

  if (live.length > 0) {
    const prev = live[0];

    // La misma operacion otra vez. Que se haga depende de si la primera ya
    // termino:
    //
    //   SUCCEEDED  -> se devuelve el resultado, sin volver a llamar a nadie.
    //   CREATED/SENT -> hay otro proceso ejecutandola AHORA. No se la vuelve a
    //                   ejecutar: reintentar sobre una operacion en vuelo es
    //                   exactamente como se paga dos veces.
    //
    // Retomar una operacion que quedo colgada (el proceso murio entre el
    // COMMIT y la respuesta) es trabajo de una reconciliacion que le pregunte
    // al proveedor que paso, no de un reintento a ciegas.
    const key = req.idempotencyKey || defaultIdempotencyKey(req.contractId, req.actionType);
    if (prev.idempotencyKey === key) {
      return { action: prev, alreadyInFlight: prev.status !== 'SUCCEEDED' };
    }

    return prev.status === 'SUCCEEDED'
      ? {
          reason: 'ALREADY_SETTLED',
          message: `Este contrato ya se cerro con ${prev.actionType}. No se puede además hacer ${req.actionType}.`,
        }
      : {
          reason: 'IN_FLIGHT',
          message: `Hay un ${prev.actionType} en curso sobre este contrato. Hay que resolverlo antes de intentar otra cosa.`,
        };
  }

  const action = await PaymentAction.create(
    {
      contractId: req.contractId,
      paymentId: req.paymentId ?? null,
      provider: req.provider,
      actionType: req.actionType,
      status: 'CREATED',
      amount: req.amount,
      currency: req.currency || 'ARS',
      externalReference: req.externalReference ?? null,
      idempotencyKey:
        req.idempotencyKey || defaultIdempotencyKey(req.contractId, req.actionType),
      requestPayload: req.requestPayload || {},
      executedById: req.executedById ?? null,
    },
    { transaction: tx },
  );

  return { action };
}

/**
 * Ejecuta un movimiento de dinero.
 *
 * `callProvider` es la unica parte que habla con Mercado Pago (o con quien sea)
 * y se invoca fuera de la transaccion. Se recibe como parametro para que la
 * regla de exclusion y la de idempotencia se puedan probar sin llamar a nadie.
 */
export async function executeFinancialAction(
  req: FinancialActionRequest,
  callProvider: (action: PaymentAction) => Promise<{ ok: boolean; resourceId?: string; error?: string }>,
): Promise<FinancialActionResult> {
  let action: PaymentAction;

  try {
    const reserved = await sequelize.transaction(async (tx) => reserve(req, tx));
    if ('reason' in reserved) {
      return { ok: false, reason: reserved.reason, message: reserved.message };
    }
    action = reserved.action;

    // Otro proceso la esta ejecutando en este momento: no se la toca.
    if (reserved.alreadyInFlight) {
      return {
        ok: false,
        action,
        reason: 'IN_FLIGHT',
        message: 'La operacion ya esta en curso. No se ejecuto una segunda vez.',
      };
    }
  } catch (err: any) {
    // El indice unico parcial: dos procesos llegaron juntos y este perdio.
    // Perder la carrera es el resultado correcto, no un error que reportar.
    if (String(err?.name).includes('Unique') || String(err?.message).includes('unique')) {
      return {
        ok: false,
        reason: 'IN_FLIGHT',
        message: 'Otra operacion sobre el mismo contrato se adelanto. No se hizo nada.',
      };
    }
    throw err;
  }

  // Ya resuelta en un intento anterior: no se vuelve a llamar al proveedor.
  if (action.status === 'SUCCEEDED') {
    return { ok: true, action };
  }

  await action.update({ status: 'SENT' });

  let result: { ok: boolean; resourceId?: string; error?: string };
  try {
    result = await callProvider(action);
  } catch (err: any) {
    // Un throw acá puede ser un timeout: la operacion quizas SI ocurrio del
    // otro lado. Queda en SENT, no en FAILED, para que nadie la interprete como
    // "no paso nada" y dispare otra cosa sobre el mismo contrato.
    await action.update({ errorDetail: `Sin respuesta del proveedor: ${err?.message}` });
    return {
      ok: false,
      action,
      reason: 'PROVIDER_FAILED',
      message:
        'No hubo respuesta del proveedor. La operacion queda en curso hasta confirmar que paso.',
    };
  }

  await action.update({
    status: result.ok ? 'SUCCEEDED' : 'FAILED',
    providerResourceId: result.resourceId ?? null,
    errorDetail: result.ok ? null : result.error ?? 'El proveedor rechazo la operacion',
  });

  return result.ok
    ? { ok: true, action }
    : { ok: false, action, reason: 'PROVIDER_FAILED', message: result.error };
}

/** Como quedo la plata de un contrato, si es que ya se movio. */
export async function getSettlement(contractId: string): Promise<PaymentAction | null> {
  const actions = await PaymentAction.findAll({ where: { contractId } });
  return (
    actions.find((a) => TERMINAL_ACTION_TYPES.includes(a.actionType) && a.status !== 'FAILED') ||
    null
  );
}
