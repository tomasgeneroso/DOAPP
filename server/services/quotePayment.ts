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
  /** Costo de procesamiento del pago que falta (sin IVA) y su IVA. Lo paga el cliente; no vuelve. */
  procesamiento: number;
  procesamientoIva: number;
  /** El total a cobrar: diferencia + comision + procesamiento + IVA de los dos. */
  totalACobrar: number;
  /** Lo que va a recibir el trabajador: el precio acordado, entero. */
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
    return {
      yaPagado,
      acordado,
      aPagar: 0,
      aFavor: Math.round(-diferencia * 100) / 100,
      comision: 0,
      iva: 0,
      procesamiento: 0,
      procesamientoIva: 0,
      totalACobrar: 0,
      trabajadorRecibe: acordado,
      listoParaContratar: true,
    };
  }

  // La comisión se calcula sobre la diferencia, no sobre el total: la parte ya
  // pagada ya pagó su comisión al publicarse. El procesamiento tambien: es
  // sobre lo que pasa por la pasarela ahora.
  const c = await calculateCommission((job as any).clientId, diferencia);
  const s = splitFees(diferencia, c.commission, c.vat);

  return {
    yaPagado,
    acordado,
    aPagar: Math.round(diferencia * 100) / 100,
    aFavor: 0,
    comision: c.commission,
    iva: c.vat,
    procesamiento: s.processingCharge,
    procesamientoIva: s.processingVat,
    totalACobrar: s.clientPays,
    trabajadorRecibe: acordado,
    listoParaContratar: false,
  };
}

export interface AumentoSettlement {
  precioActual: number;
  precioNuevo: number;
  diferencia: number;
  /** Comision e IVA sobre la diferencia. */
  comision: number;
  comisionRate: number;
  iva: number;
  /** Lo que se debe por el aumento: diferencia + comision + IVA. */
  totalRequerido: number;
  saldoDisponible: number;
  /** Cuanto del total se cubre con saldo a favor (no pasa por la pasarela: sin procesamiento). */
  saldoAUsar: number;
  /** Lo que queda por cobrar por la pasarela, antes del procesamiento. */
  restante: number;
  /** Procesamiento sobre lo que pasa por la pasarela, y su IVA. */
  procesamiento: number;
  procesamientoIva: number;
  /** Lo que el cliente paga por la pasarela: restante + procesamiento + su IVA. Cero si el saldo cubre todo. */
  aPagar: number;
}

/**
 * Cuanto cuesta subir el precio de una publicacion ya pagada, y como se paga.
 *
 * Una sola cuenta para los tres lugares que la necesitan: la ruta que recibe
 * el pedido (y decide si alcanza con el saldo), la que crea la orden de pago
 * (y tiene que cobrar exactamente eso) y la pantalla que lo muestra. Antes
 * cada una hacia la suya: una sin IVA, otra con la comision calculada sobre
 * el total en vez de sobre la diferencia.
 *
 * El procesamiento se cobra solo sobre lo que pasa por la pasarela. Lo que se
 * cubre con saldo a favor no la toca, asi que no lo paga.
 */
export async function liquidarAumento(
  job: { clientId: string; price: number | string },
  precioNuevo: number,
  saldoDisponible: number,
): Promise<AumentoSettlement> {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const precioActual = Number(job.price) || 0;
  const nuevo = Math.max(0, Number(precioNuevo) || 0);
  const diferencia = r2(Math.max(0, nuevo - precioActual));
  const saldo = Math.max(0, Number(saldoDisponible) || 0);

  const c = diferencia > 0 ? await calculateCommission(String(job.clientId), diferencia) : { commission: 0, rate: 0, vat: 0 };
  const totalRequerido = r2(diferencia + c.commission + c.vat);
  const saldoAUsar = r2(Math.min(saldo, totalRequerido));
  const restante = r2(totalRequerido - saldoAUsar);

  // splitFees despeja el procesamiento sobre la base que pasa por la pasarela.
  // Se le pasa el restante como "precio" y cero de comision e IVA porque esos
  // ya estan adentro del restante: lo que importa es la base, no su desglose.
  const s = restante > 0 ? splitFees(restante, 0, 0) : null;

  return {
    precioActual,
    precioNuevo: nuevo,
    diferencia,
    comision: c.commission,
    comisionRate: c.rate,
    iva: c.vat,
    totalRequerido,
    saldoDisponible: saldo,
    saldoAUsar,
    restante,
    procesamiento: s?.processingCharge ?? 0,
    procesamientoIva: s?.processingVat ?? 0,
    aPagar: s?.clientPays ?? 0,
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
  ref: {
    relatedModel?: string;
    relatedId?: string;
    metadata?: Record<string, any>;
    /** 'refund' (plata que vuelve al cliente) o 'payment' (plata que cobra el trabajador). */
    tipo?: 'refund' | 'payment' | 'bonus';
  } = {},
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
        type: ref.tipo || 'refund',
        amount: monto,
        balanceBefore: antes,
        balanceAfter: despues,
        description: descripcion,
        status: 'completed',
        // El modelo no tiene relatedModel/relatedId: van a relatedContractId
        // cuando corresponde y siempre a la metadata, donde la auditoria y el
        // retiro los leen.
        relatedContractId: ref.relatedModel === 'Contract' ? ref.relatedId : undefined,
        metadata: { ...(ref.metadata || {}), relatedModel: ref.relatedModel, relatedId: ref.relatedId },
      } as any,
      { transaction: t },
    );

    (user as any).balanceArs = despues;
    await user.save({ transaction: t });
  });
}

/**
 * Debita saldo de un usuario para pagar algo dentro de la app (una publicacion,
 * un aumento de precio). Mismo bloqueo de fila que acreditarSaldo, y siempre
 * con asiento: un saldo que baja sin asiento es plata que despues nadie puede
 * explicar, y es como se rompio la conciliacion de saldos mas de una vez.
 *
 * Falla si no alcanza: quien llama tiene que haber verificado antes y cobrar
 * la diferencia por la pasarela.
 */
export async function debitarSaldo(
  userId: string,
  monto: number,
  descripcion: string,
  ref: {
    relatedModel?: string;
    relatedId?: string;
    metadata?: Record<string, any>;
    /**
     * Qué tipo de salida es. Por defecto 'adjustment' (pago con saldo dentro
     * de la app). Un retiro a un CBU tiene que decir 'withdrawal': es lo que
     * mira el resumen del usuario y la auditoría para distinguir la plata que
     * se usó adentro de la que se fue de la plataforma.
     */
    tipo?: 'adjustment' | 'withdrawal' | 'payment';
  } = {},
): Promise<void> {
  if (!(monto > 0)) return;

  const { sequelize } = await import('../config/database.js');
  const { User } = await import('../models/sql/User.model.js');
  const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;

  await sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
    if (!user) throw new Error(`Usuario ${userId} no encontrado al debitar saldo`);

    const antes = parseFloat(String((user as any).balanceArs)) || 0;
    if (antes + 0.005 < monto) throw new Error(`Saldo insuficiente: tiene ${antes}, se necesitan ${monto}`);
    const despues = Math.round((antes - monto) * 100) / 100;

    await BalanceTransaction.create(
      {
        userId,
        type: ref.tipo || 'adjustment',
        amount: -monto,
        balanceBefore: antes,
        balanceAfter: despues,
        description: descripcion,
        status: 'completed',
        relatedContractId: ref.relatedModel === 'Contract' ? ref.relatedId : undefined,
        metadata: {
          origen: ref.tipo === 'withdrawal' ? 'retiro' : 'pago_con_saldo',
          ...(ref.metadata || {}),
          relatedModel: ref.relatedModel,
          relatedId: ref.relatedId,
        },
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

  // Un trabajo ya ENTREGADO no se resuelve por acá: hay trabajo hecho que
  // valorar y eso es una disputa, no un trámite. Un trabajo en curso que el
  // trabajador abandona sí: el que se baja a mitad de camino renuncia a lo
  // hecho (le corre la escalera) y el cliente decide qué hacer con su plata,
  // igual que si se hubiera bajado antes de empezar.
  const yaEntregado = ['awaiting_confirmation', 'completed'].includes(String(contract.status));
  if (yaEntregado) {
    return { ok: false, motivo: 'el trabajo ya fue entregado: si hay un problema, corresponde un reclamo' };
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
    // Lo que vuelve es el precio (o la diferencia), sin retencion al retirar:
    // la comision ya se retuvo en el acto porque hubo un trabajador
    // seleccionado (T&C 7.5), y el procesamiento lo pago el cliente al pagar.
    // Transferir a un CBU no tiene costo.
    //
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
          metadata: { origen: 'cancelacion', jobId: job.id, motivo: 'trabajador_no_disponible', alRetirar: { comision: 0 } },
        },
      );
    } catch (e: any) {
      return { ok: false, motivo: `contrato cancelado pero el saldo no se acredito: ${e.message}` };
    }
  }

  const mensajePorOpcion = {
    liberar: `"${job.title}" volvió a estar publicado con el precio que ya abonaste. Otro trabajador puede tomarlo por ese mismo monto sin que pagues nada más.`,
    parcial: `"${job.title}" volvió a estar publicado a $${precioNuevo.toLocaleString('es-AR')} y se acreditaron $${aFavor.toLocaleString('es-AR')} a tu saldo.`,
    saldo: `Se acreditaron $${aFavor.toLocaleString('es-AR')} a tu saldo. Podés usarlos en la app o pedir su transferencia al banco; ninguna de las dos tiene costo.`,
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
