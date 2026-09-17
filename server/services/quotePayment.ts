import { Job } from '../models/sql/Job.model.js';
import { calculateCommission } from './commissionService.js';
import { splitFees } from '../../shared/pricing/processingCost.js';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * Cuanto falta pagar para aceptar una cotizacion.
 *
 * El precio publicado es indicativo: el cliente puede publicar "a cotizar" o
 * poner un monto, y el trabajador responde con el suyo. Recien cuando se acepta
 * una cotizacion se sabe el precio real, y ahi hay que emparejar lo pagado con
 * lo acordado.
 *
 * Tres casos, y ninguno se puede resolver con la misma cuenta:
 *
 *   a cotizar          no se pago nada al publicar: se paga todo ahora.
 *   cotiza mas         se pago por menos: se paga la diferencia.
 *   cotiza menos       se pago de mas: la diferencia queda a favor del cliente.
 *
 * El ultimo caso no se devuelve a la tarjeta a proposito. Un reembolso parcial
 * cuesta una operacion en la pasarela y puede fallar segun el medio de pago;
 * un saldo a favor es inmediato, no falla, y el cliente lo usa en la proxima
 * publicacion. Si quiere la plata de vuelta, la retira como cualquier saldo.
 */

export interface QuoteSettlement {
  /** Lo que ya se pago al publicar, sin comision ni IVA. */
  yaPagado: number;
  /** El precio que se acordo con el trabajador. */
  acordado: number;
  /** Lo que falta cobrarle al cliente para poder contratar. */
  aPagar: number;
  /** Lo que le queda a favor si ya habia pagado de mas. */
  aFavor: number;
  /** Comision e IVA sobre lo que falta pagar. */
  comision: number;
  iva: number;
  /** El total a cobrar: diferencia + comision + IVA. */
  totalACobrar: number;
  /** Lo que va a recibir el trabajador, ya descontada la pasarela. */
  trabajadorRecibe: number;
  /** Si se puede contratar sin pagar nada mas. */
  listoParaContratar: boolean;
}

export async function settleQuote(job: Job, precioCotizado: number): Promise<QuoteSettlement> {
  const acordado = Math.max(0, Number(precioCotizado) || 0);

  // Sólo cuenta como pagado lo que efectivamente se cobró. Un trabajo 'quote'
  // o uno publicado y no pagado todavía valen cero acá, no su precio publicado.
  const yaPagado =
    (job as any).publicationPaid && (job as any).pricingMode === 'fixed'
      ? Number(job.price) || 0
      : 0;

  const diferencia = acordado - yaPagado;

  if (diferencia <= 0) {
    // Cotizó por menos: no se cobra nada y la diferencia queda a favor.
    const s = splitFees(acordado, 0, 0);
    return {
      yaPagado,
      acordado,
      aPagar: 0,
      aFavor: Math.round(-diferencia * 100) / 100,
      comision: 0,
      iva: 0,
      totalACobrar: 0,
      trabajadorRecibe: s.workerReceives,
      listoParaContratar: true,
    };
  }

  // La comisión se calcula sobre la diferencia, no sobre el total: la parte ya
  // pagada ya pagó su comisión al publicarse.
  const c = await calculateCommission((job as any).clientId, diferencia);
  const s = splitFees(diferencia, c.commission, c.vat);

  return {
    yaPagado,
    acordado,
    aPagar: Math.round(diferencia * 100) / 100,
    aFavor: 0,
    comision: c.commission,
    iva: c.vat,
    totalACobrar: s.clientPays,
    // Lo que recibe el trabajador es sobre el precio acordado completo.
    trabajadorRecibe: splitFees(acordado, c.commission, c.vat).workerReceives,
    listoParaContratar: false,
  };
}

/**
 * Acredita saldo a favor de un usuario.
 *
 * Lee el saldo con `FOR UPDATE` y escribe dentro de la misma transaccion. El
 * patron sin bloqueo -- leer el saldo, sumarle, guardarlo -- pierde plata si dos
 * procesos corren a la vez: los dos leen el mismo saldo previo y el segundo
 * pisa al primero. Con un solo acreditamiento por cotizacion es improbable,
 * pero es exactamente el tipo de error que no se detecta hasta que le pasa a
 * alguien y no hay forma de reconstruir cuanto se perdio.
 */
export async function acreditarSaldo(
  userId: string,
  monto: number,
  descripcion: string,
  ref: { relatedModel?: string; relatedId?: string; metadata?: Record<string, any> } = {},
): Promise<void> {
  if (!(monto > 0)) return;

  const { sequelize } = await import('../config/database.js');
  const { User } = await import('../models/sql/User.model.js');
  const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;

  await sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new Error(`Usuario ${userId} no encontrado al acreditar saldo`);

    const antes = parseFloat(String((user as any).balanceArs)) || 0;
    const despues = Math.round((antes + monto) * 100) / 100;

    await BalanceTransaction.create(
      {
        userId,
        type: 'refund',
        amount: monto,
        balanceBefore: antes,
        balanceAfter: despues,
        description: descripcion,
        status: 'completed',
        relatedModel: ref.relatedModel,
        relatedId: ref.relatedId,
        metadata: ref.metadata,
      } as any,
      { transaction: t },
    );

    (user as any).balanceArs = despues;
    await user.save({ transaction: t });
  });
}

/**
 * Confirma el pago de una cotizacion y recien ahi selecciona al trabajador.
 *
 * El orden es deliberado y es lo unico que hace que el sistema sea honesto: el
 * trabajador queda comprometido cuando la plata esta, no cuando el cliente dice
 * que la va a poner. Antes de esto, aceptar era gratis y el trabajador podia
 * quedar seleccionado en un contrato que nunca se pagaba.
 *
 * Es idempotente: la pasarela reintenta los webhooks, y aprobar dos veces la
 * misma cotizacion crearia dos contratos. La aprobacion en si ya devuelve el
 * contrato existente si la propuesta esta aprobada, y acá se corta antes.
 */
export async function confirmarPagoDeCotizacion(
  proposalId: string,
  montoAcordado: number,
): Promise<{ ok: boolean; contractId?: string; motivo?: string }> {
  const { Proposal } = await import('../models/sql/Proposal.model.js');
  const { approveProposalHandler } = await import('../routes/proposals.js');

  const proposal = await Proposal.findByPk(proposalId);
  if (!proposal) return { ok: false, motivo: 'propuesta inexistente' };
  if ((proposal as any).status === 'approved') {
    return { ok: true, motivo: 'ya estaba aprobada' };
  }

  const job = await Job.findByPk((proposal as any).jobId);
  if (!job) return { ok: false, motivo: 'trabajo inexistente' };

  // El precio acordado pasa a ser el precio del trabajo y queda pagado. Sin
  // esto, settleQuote volveria a pedir la misma diferencia que se acaba de
  // cobrar y la aprobacion rebotaria con un 402 eterno.
  job.price = montoAcordado;
  (job as any).pricingMode = 'fixed';
  (job as any).publicationPaid = true;
  (job as any).publicationPaidAt = new Date();
  await job.save();

  // Se reusa el handler de la ruta en vez de repetir la creacion del contrato.
  // El res falso captura la respuesta: el webhook no tiene a quien contestarle,
  // pero si necesita saber si salio bien.
  let captura: { status: number; body: any } = { status: 0, body: null };
  const resFalso: any = {
    status(n: number) { captura.status = n; return this; },
    json(b: any) { captura.body = b; if (!captura.status) captura.status = 200; return this; },
  };

  await approveProposalHandler(
    { params: { id: proposalId }, body: {}, user: { id: (job as any).clientId } } as any,
    resFalso,
  );

  if (captura.status >= 400) {
    return { ok: false, motivo: captura.body?.message || `error ${captura.status}` };
  }
  return { ok: true, contractId: captura.body?.contractId };
}

/**
 * El cliente pago pero el trabajador no puede hacerlo.
 *
 * Pasa, y no es culpa de nadie: se enfermo, le salio otra cosa, se le rompio la
 * camioneta. Lo importante es que la plata ya esta cobrada, asi que no alcanza
 * con cancelar y listo -- hay que decidir que se hace con ella.
 *
 * Dos salidas, y las elige el cliente porque es su plata:
 *
 *   'liberar'  se libera el puesto y el trabajo vuelve al muro con el precio ya
 *              acordado y pagado. Otro trabajador puede tomarlo por ese mismo
 *              monto sin que el cliente pague nada mas ni vuelva a pasar por la
 *              pasarela. Es la salida barata para los dos: la plata no se mueve.
 *
 *   'parcial'  igual que 'liberar' pero republicando por menos. El cliente
 *              aprendio algo mientras cotizaba -- que el trabajo se consigue por
 *              80.000 y no por 100.000 -- y no tiene por que dejar los 20.000
 *              inmovilizados esperando a que aparezca alguien que cobre de mas.
 *              La diferencia le queda a favor y el trabajo sigue publicado.
 *
 *   'saldo'    la plata vuelve entera al saldo del cliente. Usarla dentro de la
 *              app no cuesta nada; si la quiere en el banco, paga el costo de
 *              pasarela como cualquier devolucion, porque DOAPP tampoco lo
 *              recupera.
 *
 * El trabajador que no pudo no se penaliza acá: eso lo decide la reputacion y,
 * si hubo mala fe, una disputa. Un sistema que castiga automaticamente al que
 * avisa consigue que la proxima vez no avise.
 */
export async function trabajadorNoDisponible(
  contractId: string,
  opcion: 'liberar' | 'parcial' | 'saldo',
  motivo: string,
  nuevoPrecio?: number,
): Promise<{ ok: boolean; motivo?: string; aFavor?: number; precioPublicado?: number }> {
  const { sequelize } = await import('../config/database.js');
  const { Contract } = await import('../models/sql/Contract.model.js');
  const { Proposal } = await import('../models/sql/Proposal.model.js');
  const { Notification } = await import('../models/sql/Notification.model.js');

  const contract = await Contract.findByPk(contractId);
  if (!contract) return { ok: false, motivo: 'contrato inexistente' };

  const yaEmpezo = ['in_progress', 'awaiting_confirmation', 'completed'].includes(
    String(contract.status),
  );
  if (yaEmpezo) {
    // Un trabajo empezado no se resuelve por acá: hay trabajo hecho que valorar
    // y eso es una disputa, no un tramite.
    return { ok: false, motivo: 'el contrato ya esta en curso: corresponde una disputa' };
  }

  const job = await Job.findByPk(contract.jobId);
  if (!job) return { ok: false, motivo: 'trabajo inexistente' };

  const doerId = String(contract.doerId);
  const montoPagado = Number(contract.price) || 0;

  // Cuanto se republica y cuanto vuelve al cliente. Sólo 'parcial' los separa.
  let precioNuevo = montoPagado;
  let aFavor = 0;

  if (opcion === 'parcial') {
    precioNuevo = Number(nuevoPrecio) || 0;
    if (precioNuevo <= 0 || precioNuevo >= montoPagado) {
      return {
        ok: false,
        motivo: `El nuevo precio tiene que ser mayor a cero y menor a $${montoPagado.toLocaleString('es-AR')}. Si no querés bajarlo, elegí dejarlo publicado como está.`,
      };
    }
    aFavor = Math.round((montoPagado - precioNuevo) * 100) / 100;
  } else if (opcion === 'saldo') {
    aFavor = montoPagado;
  }

  // El contrato se cierra en los dos casos; lo que cambia es que pasa con la
  // publicacion y con la plata. Va en una transaccion porque dejar el contrato
  // cancelado y el trabajo sin reabrir seria perder el puesto y la plata a la vez.
  await sequelize.transaction(async (t) => {
    contract.status = 'cancelled';
    (contract as any).cancellationReason = `Trabajador no disponible: ${motivo}`;
    // Quien cancela queda registrado: es lo que alimenta la escalera de
    // penalidades. Sin esto la cancelacion no le cuenta a nadie.
    (contract as any).cancelledBy = doerId;
    await contract.save({ transaction: t });

    // La propuesta vuelve a estar disponible o queda rechazada segun la salida.
    await Proposal.update(
      { status: opcion === 'liberar' ? 'pending' : 'rejected' } as any,
      { where: { jobId: job.id, freelancerId: doerId }, transaction: t },
    );

    // El trabajador sale de la lista de seleccionados en ambos casos.
    const seleccionados: string[] = ((job as any).selectedWorkers || []).filter(
      (w: string) => String(w) !== doerId,
    );
    (job as any).selectedWorkers = seleccionados;
    job.changed('selectedWorkers', true);
    if (String((job as any).doerId) === doerId) (job as any).doerId = seleccionados[0] || null;

    if (opcion === 'saldo') {
      job.status = 'cancelled';
    } else {
      // El trabajo vuelve al muro con el precio ya pagado. publicationPaid queda
      // en true a proposito: eso es lo que hace que el proximo trabajador entre
      // sin que el cliente vuelva a pagar.
      job.status = 'open';
      (job as any).pausedForInactivityAt = null;
      // En 'parcial' se republica por menos: el precio del trabajo baja y la
      // diferencia sale del escrow hacia el saldo. Sigue estando pago, porque
      // lo que queda retenido alcanza y sobra para el precio nuevo.
      job.price = precioNuevo;
    }
    await job.save({ transaction: t });
  });

  if (aFavor > 0) {
    // Fuera de la transaccion porque acreditarSaldo abre la suya con su propio
    // bloqueo de fila. Si fallara acá, el contrato ya quedo cancelado y el
    // saldo no se acredito: por eso se avisa a administracion y no se traga.
    try {
      await acreditarSaldo(
        String(contract.clientId),
        aFavor,
        opcion === 'parcial'
          ? `Diferencia por republicar "${job.title}" a $${precioNuevo.toLocaleString('es-AR')}`
          : `Devolución por trabajador no disponible: ${job.title}`,
        {
          relatedModel: 'Contract',
          relatedId: contract.id,
          metadata: { origen: 'cotizacion_menor', jobId: job.id, motivo: 'trabajador_no_disponible' },
        },
      );
    } catch (e: any) {
      return { ok: false, motivo: `contrato cancelado pero el saldo no se acredito: ${e.message}` };
    }
  }

  const mensajePorOpcion = {
    liberar: `"${job.title}" volvió a estar publicado con el precio que ya abonaste. Otro trabajador puede tomarlo por ese mismo monto sin que pagues nada más.`,
    parcial: `"${job.title}" volvió a estar publicado a $${precioNuevo.toLocaleString('es-AR')} y se acreditaron $${aFavor.toLocaleString('es-AR')} a tu saldo.`,
    saldo: `Se acreditaron $${aFavor.toLocaleString('es-AR')} a tu saldo. Podés usarlos sin costo en la app o pedir su transferencia al banco, en cuyo caso se descuenta el costo de la pasarela.`,
  };

  await Notification.create({
    recipientId: contract.clientId,
    type: opcion === 'saldo' ? 'info' : 'warning',
    category: 'contracts',
    title: 'El trabajador no puede realizar el trabajo',
    message: mensajePorOpcion[opcion],
    relatedModel: 'Job',
    relatedId: job.id,
    sentVia: ['in_app'],
  } as any);

  // La escalera de penalidades corre despues de que todo lo demas quedo
  // resuelto: si fallara, el cliente ya tiene su trabajo republicado o su
  // saldo, que es lo que importa. Un error en la penalidad no puede dejar al
  // cliente sin salida.
  try {
    const { aplicarEscalera } = await import('./cancellationLadder.js');
    await aplicarEscalera(doerId, String(contract.id));
  } catch (e: any) {
    console.error('No se pudo aplicar la escalera de cancelaciones:', e.message);
  }

  return { ok: true, aFavor, precioPublicado: opcion === 'saldo' ? 0 : precioNuevo };
}

/**
 * Dias habiles entre dos fechas, sin contar feriados.
 *
 * No se contemplan los feriados argentinos a proposito: mantener ese calendario
 * al dia es trabajo permanente, y para pausar una publicacion la diferencia de
 * uno o dos dias no cambia nada. Si alguna vez importa, se agrega acá y el
 * resto del sistema no se entera.
 */
export function diasHabilesDesde(desde: Date, hasta: Date = new Date()): number {
  const a = new Date(desde);
  a.setHours(0, 0, 0, 0);
  const b = new Date(hasta);
  b.setHours(0, 0, 0, 0);
  if (b <= a) return 0;

  let dias = 0;
  const cursor = new Date(a);
  while (cursor < b) {
    cursor.setDate(cursor.getDate() + 1);
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) dias++;
  }
  return dias;
}

/**
 * A los cuantos dias habiles sin cotizacion aceptada se pausa una publicacion.
 * El numero vive en shared/constants/policies.ts, junto con los terminos (6.6).
 */
export const DIAS_HABILES_ANTES_DE_PAUSAR = POLITICAS.COTIZAR_DIAS_HABILES_ANTES_DE_PAUSAR;
