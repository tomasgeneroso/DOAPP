import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { ContractChangeRequest } from '../models/sql/ContractChangeRequest.model.js';
import { ContractCancellationRequest } from '../models/sql/ContractCancellationRequest.model.js';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * El ciclo del contrato que corre solo (regla del dueño, 2026-10-24):
 *
 *  - EMPIEZA cuando llega la hora de inicio. No hace falta que un administrador lo apruebe ni escribir el código de emparejamiento (el código sigue
 *    sirviendo para dejar anotada la presencia de las dos partes en el lugar, pero ya no es una puerta).
 *  - TERMINA cuando las dos partes tocan «terminó el trabajo» (`POST /contracts/:id/confirm`) o, si nadie lo hizo, al llegar la hora de fin: el contrato
 *    deja de estar «en progreso» y pasa a «esperando confirmación». Desde ahí corre el plazo de `AUTO_CONFIRMACION_HORAS` (24 h): si las partes no confirman,
 *    se da por terminado solo y se libera el pago (T&C 7.6; jobs/autoConfirmContracts.ts). Es decir, 24 h después de la hora de fin, sin hora extra de gracia.
 *
 * Antes un contrato que nadie empezaba a mano se quedaba «pendiente» para siempre aunque el trabajo ya hubiera pasado, y la pantalla mostraba a la vez
 * «¡Trabajo finalizado!» y «el contrato todavía está pendiente: un administrador tiene que aprobarlo».
 *
 * Qué NO empieza solo: un contrato sin la plata asegurada (ni el pago de la publicación acreditado ni la custodia de este contrato), uno cuyo trabajo ya
 * no está activo, o uno con un pedido de cambio, de cancelación o un reclamo abierto. Esos esperan a que se resuelva.
 */

/** Estados anteriores al inicio: de cualquiera de ellos el contrato puede empezar solo. */
export const ESTADOS_SIN_EMPEZAR = ['pending', 'ready', 'accepted'] as const;

/** ¿La plata de este trabajo está asegurada? El pago de la publicación está acreditado, o la custodia del contrato ya está tomada. */
export function hayPlataAsegurada(
  contrato: { escrowStatus?: unknown; paymentStatus?: unknown },
  trabajo: { publicationPaid?: unknown } | null | undefined,
): boolean {
  if (trabajo?.publicationPaid === true) return true;
  return String(contrato.escrowStatus) === 'held_escrow' || ['escrow', 'held'].includes(String(contrato.paymentStatus));
}

/** ¿Hay algo abierto sobre el contrato que tiene que resolverse antes de que empiece o termine solo? */
async function tieneAlgoSinResolver(contractId: string): Promise<boolean> {
  const [cambios, cancelaciones] = await Promise.all([
    ContractChangeRequest.count({ where: { contractId, status: 'pending' } as never }),
    ContractCancellationRequest.count({ where: { contractId, status: 'pending' } as never }),
  ]);
  return cambios > 0 || cancelaciones > 0;
}

const avisar = (recipientId: string, contractId: string, title: string, message: string, actionText = 'Ver contrato') =>
  Notification.create({
    recipientId,
    type: 'info',
    category: 'contracts',
    title,
    message,
    relatedModel: 'Contract',
    relatedId: contractId,
    actionText,
    data: { contractId, automatico: true },
    read: false,
  } as never).catch((e: unknown) => console.error('[ciclo del contrato] no se pudo avisar:', (e as Error).message));

/**
 * Empieza los contratos a los que les llegó la hora de inicio. Devuelve cuántos empezaron.
 * El UPDATE es condicional al estado: si alguien lo empezó a mano un instante antes, no se pisa.
 */
export async function iniciarContratosQueLlegaronASuHora(ahora: Date = new Date()): Promise<number> {
  const candidatos = (await Contract.findAll({
    where: { status: { [Op.in]: [...ESTADOS_SIN_EMPEZAR] }, startDate: { [Op.lte]: ahora } } as never,
    include: [{ model: Job, as: 'job', attributes: ['id', 'title', 'status', 'publicationPaid'] }],
    order: [['startDate', 'ASC']],
    limit: 200,
  })) as unknown as Array<Contract & { job?: { title?: string; status?: string; publicationPaid?: boolean } }>;

  let empezaron = 0;
  for (const contrato of candidatos) {
    try {
      const trabajo = contrato.job;
      if (!trabajo || !['open', 'in_progress'].includes(String(trabajo.status))) continue;
      if (!hayPlataAsegurada(contrato, trabajo)) continue;
      if (await tieneAlgoSinResolver(String(contrato.id))) continue;

      // Si se creó después de la hora de inicio, empezó cuando se creó.
      const creado = (contrato as unknown as { createdAt?: Date }).createdAt;
      const empezoEl = creado && new Date(creado) > new Date(contrato.startDate) ? new Date(creado) : new Date(contrato.startDate);
      const [filas] = await Contract.update(
        {
          status: 'in_progress',
          actualStartDate: empezoEl,
          // Sin código de emparejamiento no hubo verificación de presencia: queda anotado, no «pendiente».
          locationVerificationStatus: contrato.locationVerificationStatus === 'pending' || !contrato.locationVerificationStatus ? 'skipped' : contrato.locationVerificationStatus,
        } as never,
        { where: { id: contrato.id, status: { [Op.in]: [...ESTADOS_SIN_EMPEZAR] } } as never },
      );
      if (filas === 0) continue;
      empezaron += 1;

      const titulo = trabajo.title || 'el trabajo';
      await avisar(String(contrato.clientId), String(contrato.id), 'Empezó el trabajo', `Llegó la hora de inicio de "${titulo}": el contrato está en progreso.`);
      await avisar(String(contrato.doerId), String(contrato.id), 'Empezó el trabajo', `Llegó la hora de inicio de "${titulo}": el contrato está en progreso.`);
    } catch (e) {
      console.error(`[ciclo del contrato] no se pudo iniciar el contrato ${contrato.id}:`, (e as Error).message);
    }
  }
  return empezaron;
}

/**
 * Pasa a «esperando confirmación» los contratos en progreso a los que ya les llegó la hora de fin sin que nadie confirmara. Ahí empiezan a correr las
 * `AUTO_CONFIRMACION_HORAS` (24 h) para responder; vencidas, `autoConfirmContracts` los da por terminados y libera el pago. `awaitingConfirmationAt` es el
 * momento en que se avisa (no la hora de fin): un contrato que se descubre tarde (por ejemplo uno que nadie empezó) también tiene sus 24 h para responder. Un trabajo de fin flexible que todavía no tiene fecha de fin no termina solo: la fecha del
 * contrato es solo una estimación (inicio + duración estimada). Devuelve cuántos.
 */
export async function cerrarContratosQueTerminaron(ahora: Date = new Date()): Promise<number> {
  const candidatos = (await Contract.findAll({
    where: { status: 'in_progress', endDate: { [Op.ne]: null, [Op.lte]: ahora } } as never,
    include: [{ model: Job, as: 'job', attributes: ['id', 'title', 'endDate', 'endDateFlexible'] }],
    order: [['endDate', 'ASC']],
    limit: 200,
  })) as unknown as Array<Contract & { job?: { title?: string; endDate?: Date | null; endDateFlexible?: boolean } }>;

  let terminaron = 0;
  for (const contrato of candidatos) {
    try {
      // Fin flexible y sin fecha de fin: la fecha del contrato es una estimación, no una hora de fin.
      if (contrato.job?.endDateFlexible && !contrato.job.endDate) continue;
      // Una ampliación pedida y sin responder mueve la hora de fin: se espera a que se resuelva.
      if (contrato.extensionRequestedBy && !contrato.extensionApprovedBy) continue;
      if (await tieneAlgoSinResolver(String(contrato.id))) continue;

      const [filas] = await Contract.update(
        { status: 'awaiting_confirmation', awaitingConfirmationAt: ahora } as never,
        { where: { id: contrato.id, status: 'in_progress' } as never },
      );
      if (filas === 0) continue;
      terminaron += 1;

      const titulo = contrato.job?.title || 'el trabajo';
      const aviso = `Pasó la hora de fin de "${titulo}". Confirmá que el trabajo se completó; si nadie responde en ${POLITICAS.AUTO_CONFIRMACION_HORAS} horas, se confirma solo y se libera el pago.`;
      await avisar(String(contrato.clientId), String(contrato.id), 'Terminó el trabajo: falta confirmar', aviso, 'Confirmar');
      await avisar(String(contrato.doerId), String(contrato.id), 'Terminó el trabajo: falta confirmar', aviso, 'Confirmar');
    } catch (e) {
      console.error(`[ciclo del contrato] no se pudo cerrar el contrato ${contrato.id}:`, (e as Error).message);
    }
  }
  return terminaron;
}
