/**
 * El cambio de presupuesto, de punta a punta: analizar los saldos, pedirlo, aceptarlo y aplicarlo. Las reglas (cuándo y cómo) están en `shared/jobs/cambioDePresupuesto.ts`.
 *
 * ES LA ÚNICA PUERTA que cambia el precio de una publicación: `PATCH /jobs/:id/budget` y las rutas de al lado. Cambiarlo desde el contrato, desde la edición, desde
 * las asignaciones o desde la negociación está cerrado (pedido del dueño, 2026-11-27).
 *
 * Con la plata: nada se acredita sin comprobar que ese dinero ENTRÓ (pagos confirmados de este trabajo menos lo que ya volvió) y que el saldo del cliente cierre con
 * su libro. La comisión ya cobrada y los gastos de transferencia no vuelven. Lo que queda a favor por una baja se retira recién cuando el trabajo termina y la
 * pasarela liberó el pago (`shared/pagos/retiroPorContrato.ts`).
 */
import { randomUUID } from 'node:crypto';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { User } from '../models/sql/User.model.js';
import { conSistema } from '../db/contextoRls.js';
import cacheService from './cacheService.js';
import logger from './logger.js';
import { presupuestoDevuelto } from './presupuestoDelTrabajo.js';
import { acreditarDevolucion, debitarSaldo, fraseDelAFavor, liquidarAumento } from './quotePayment.js';
import { comprobarSaldoContraLibro, detalleDeSaldoContraLibro, ErrorDeDinero } from './controlesDeDinero.js';
import { disponibleDesdeDeUnaDevolucion } from './liberacionDeSaldo.js';
import {
  bloqueoDelPresupuesto,
  modoDelCambio,
  POSTULACION_QUITADA_POR_PRESUPUESTO,
  type AnalisisDelCambio,
  type BloqueoDelPresupuesto,
  type DatosDelPresupuesto,
  type RepartoDelCambio,
} from '../../shared/jobs/cambioDePresupuesto.js';

const SIN_PLAZA = ['cancelled', 'rejected'];
const CERRANDOSE = ['awaiting_confirmation', 'completed', 'disputed', 'in_review'];
const RECLAMOS_ABIERTOS = ['negotiation', 'open', 'in_review', 'awaiting_info'];
const PAGOS_CON_DINERO = ['completed', 'held_escrow', 'awaiting_confirmation', 'confirmed_for_payout', 'verified', 'approved'];
const PAGOS_DEL_PRESUPUESTO = ['job_publication', 'budget_increase'];

const r2 = (n: number) => Math.round(n * 100) / 100;
const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

export interface ElegidoEnElPedido extends RepartoDelCambio {
  respuesta: 'pendiente' | 'acepta' | 'rechaza';
  respondidoEl?: string;
}

export interface PedidoDeCambio {
  id: string;
  estado: 'esperando_respuesta' | 'esperando_pago';
  precioAnterior: number;
  precioNuevo: number;
  motivo: string;
  pedidoPor: string;
  pedidoEl: string;
  elegidos: ElegidoEnElPedido[];
}

/** Un problema del cambio que se le explica a la persona (con código para la pantalla). */
export class CambioFrenado extends Error {
  constructor(readonly codigo: string, mensaje: string, readonly estado = 409) {
    super(mensaje);
    this.name = 'CambioFrenado';
  }
}

export const contratosVigentesDelTrabajo = (jobId: string): Promise<number> =>
  conSistema(() => Contract.count({ where: { jobId, status: { [Op.notIn]: SIN_PLAZA } } as any }));

const contratosElegidos = (jobId: string): Promise<any[]> =>
  conSistema(() => Contract.findAll({ where: { jobId, status: { [Op.notIn]: SIN_PLAZA } } as any, order: [['createdAt', 'ASC']] }));

export async function hayAlguienElegido(job: { id: string; selectedWorkers?: unknown; doerId?: unknown }, soloContratos = false): Promise<boolean> {
  if ((await contratosVigentesDelTrabajo(String(job.id))) > 0) return true;
  if (soloContratos) return false;
  // Si el trabajo tuvo contratos y todos se cayeron, la lista de elegidos puede haber quedado vieja: mandan los contratos.
  const alguna = await conSistema(() => Contract.count({ where: { jobId: job.id } as any, paranoid: false }));
  if (alguna > 0) return false;
  return (Array.isArray(job.selectedWorkers) && job.selectedWorkers.length > 0) || Boolean(job.doerId);
}

async function elTrabajoSeEstaCerrando(contratos: any[]): Promise<boolean> {
  if (contratos.some((c) => CERRANDOSE.includes(String(c.status)))) return true;
  if (contratos.length === 0) return false;
  const ids = contratos.map((c) => String(c.id));
  const [filas] = await conSistema(() =>
    sequelize.query(
      `SELECT (SELECT COUNT(*) FROM disputes WHERE contract_id IN (:ids) AND status::text IN (:reclamos))
            + (SELECT COUNT(*) FROM contract_cancellation_requests WHERE contract_id IN (:ids) AND status::text = 'pending') AS total`,
      { replacements: { ids, reclamos: RECLAMOS_ABIERTOS } },
    ),
  );
  return Number((filas as any[])[0]?.total) > 0;
}

/** Todos los pagos del presupuesto de ESTE trabajo (la publicación y sus aumentos). */
const pagosDelTrabajo = (job: any): Promise<any[]> =>
  conSistema(() =>
    Payment.findAll({
      where: {
        [Op.or]: [{ jobId: job.id }, ...(job.publicationPaymentId ? [{ id: job.publicationPaymentId }] : [])],
        paymentType: { [Op.in]: PAGOS_DEL_PRESUPUESTO },
      } as any,
      order: [['createdAt', 'ASC']],
    }),
  );

export async function datosDelPresupuesto(
  job: any,
  como: { status?: string; startDate?: Date | string | null; soloContratos?: boolean; sinElPedido?: boolean } = {},
): Promise<DatosDelPresupuesto & { contratos: any[] }> {
  const contratos = await contratosElegidos(String(job.id));
  const elegido = await hayAlguienElegido(job, como.soloContratos);
  const pagos = await pagosDelTrabajo(job);
  return {
    status: como.status ?? String(job.status),
    publicationPaid: job.publicationPaid,
    startDate: como.startDate ?? job.startDate,
    hayAlguienElegido: elegido,
    elTrabajoSeEstaCerrando: await elTrabajoSeEstaCerrando(contratos),
    // Con un comprobante esperando revisión (una transferencia sin aprobar), ese pago es por el precio actual: se espera a que se resuelva.
    pagoEnRevision: pagos.some((p) => p.status === 'pending_verification'),
    hayCambioPendiente: !como.sinElPedido && Boolean(job.budgetChangeRequest),
    contratos,
  };
}

export async function bloqueoParaCambiarElPrecio(job: any, como: { status?: string; startDate?: Date | string | null; soloContratos?: boolean } = {}): Promise<BloqueoDelPresupuesto | null> {
  return bloqueoDelPresupuesto(await datosDelPresupuesto(job, como));
}

/** El presupuesto que respalda lo que está en marcha: lo publicado menos lo que ya volvió por no haberse usado. */
async function presupuestoVigente(job: any): Promise<number> {
  const devuelto = job.publicationPaid ? await presupuestoDevuelto(String(job.id)) : 0;
  return r2(Math.max(0, Number(job.price) - devuelto));
}

/** Lo que le toca a cada elegido con el presupuesto nuevo: en la misma proporción que tiene hoy. */
export async function repartirEntreLosElegidos(contratos: any[], base: number, nuevo: number): Promise<RepartoDelCambio[]> {
  if (contratos.length === 0 || base <= 0) return [];
  const nombres = new Map<string, string>(
    ((await conSistema(() => User.findAll({ where: { id: contratos.map((c) => c.doerId) } as any, attributes: ['id', 'name'] }))) as any[]).map((u) => [String(u.id), String(u.name)]),
  );
  return contratos.map((c) => {
    const actual = r2(Number(c.price) || 0);
    const todoElPresupuesto = contratos.length === 1 && Math.abs(actual - base) < 0.01;
    return {
      contratoId: String(c.id),
      trabajadorId: String(c.doerId),
      nombre: nombres.get(String(c.doerId)) || 'La persona elegida',
      montoActual: actual,
      montoNuevo: todoElPresupuesto ? nuevo : Math.floor((actual * nuevo * 100) / base) / 100,
    };
  });
}

interface DineroDelTrabajo {
  /** Pagos confirmados de este trabajo. */
  pagos: any[];
  /** Cuándo queda liberada toda la plata en la pasarela (undefined: ya está). */
  disponibleDesde?: string;
  comisionYaCobrada: number;
  gastosDeTransferenciaYaCobrados: number;
}

/**
 * Antes de dejar plata a favor por una baja: ¿el dinero que respalda el presupuesto vigente ENTRÓ de verdad? Pagos confirmados de este trabajo (menos lo reembolsado)
 * más lo pagado con saldo, menos lo que ya volvió al cliente, tiene que alcanzar para el presupuesto vigente; y el saldo del cliente tiene que cerrar con su libro.
 */
async function comprobarElDineroDelTrabajo(job: any, base: number): Promise<DineroDelTrabajo> {
  const pagos = await pagosDelTrabajo(job);
  if (pagos.some((p) => p.disputeId || p.status === 'disputed')) {
    throw new ErrorDeDinero('BAJA-SIN-DINERO-CONFIRMADO', `El trabajo ${job.id} tiene un pago en disputa.`);
  }
  const confirmados = pagos.filter((p) => PAGOS_CON_DINERO.includes(String(p.status)) && String(p.payerId) === String(job.clientId));
  // Lo pagado con saldo se cuenta por su descuento en el libro (si no, se sumaría dos veces).
  const porPasarela = confirmados.filter((p) => p.paymentMethod !== 'balance');
  const ingresado = porPasarela.reduce((s, p) => s + (Number(p.amount) || 0) - (Number(p.refundedAmount) || 0), 0);

  const [libro] = (await conSistema(() =>
    sequelize.query(
      // Un ajuste que corrige una devolución de esta publicación (`corrigeLaPublicacion`) resta de lo devuelto: no es un pago.
      `SELECT COALESCE(SUM(CASE WHEN amount < 0 AND status = 'completed' AND NOT (metadata ? 'corrigeLaPublicacion') THEN -amount ELSE 0 END), 0) AS pagado,
              COALESCE(SUM(CASE WHEN amount > 0 AND type = 'refund' AND status IN ('completed', 'pending') THEN amount ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN amount < 0 AND status = 'completed' AND metadata->>'corrigeLaPublicacion' = :trabajo THEN -amount ELSE 0 END), 0) AS devuelto
         FROM balance_transactions
        WHERE user_id = :usuario AND (metadata->>'jobId' = :trabajo OR metadata->>'corrigeLaPublicacion' = :trabajo OR (metadata->>'relatedModel' = 'Job' AND metadata->>'relatedId' = :trabajo))`,
      { replacements: { usuario: String(job.clientId), trabajo: String(job.id) }, type: QueryTypes.SELECT },
    ),
  )) as Array<{ pagado: string | number; devuelto: string | number }>;

  const respaldo = r2(ingresado + Number(libro.pagado) - Number(libro.devuelto));
  if (respaldo + 0.01 < base) {
    throw new ErrorDeDinero('BAJA-SIN-DINERO-CONFIRMADO', `El trabajo ${job.id} tiene un presupuesto vigente de ${base} y solo ${respaldo} de dinero confirmado (pagos ${r2(ingresado)}, pagado con saldo ${Number(libro.pagado)}, ya devuelto ${Number(libro.devuelto)}).`);
  }

  const cliente: any = await conSistema(() => User.findByPk(job.clientId, { attributes: ['id', 'balanceArs'] }));
  const cuadre = await comprobarSaldoContraLibro(String(job.clientId), Number(cliente?.balanceArs) || 0);
  if (!cuadre.cierra) throw new ErrorDeDinero('SALDO-NO-CIERRA-LIBRO', detalleDeSaldoContraLibro(String(job.clientId), cuadre));

  const esperas = confirmados.map((p) => disponibleDesdeDeUnaDevolucion(p)).filter((x): x is string => !!x).sort();
  return {
    pagos: confirmados,
    disponibleDesde: esperas.length ? esperas[esperas.length - 1] : undefined,
    comisionYaCobrada: r2(confirmados.reduce((s, p) => s + (Number(p.platformFee) || 0), 0)),
    gastosDeTransferenciaYaCobrados: r2(confirmados.reduce((s, p) => s + (Number(p.processingCharge) || 0), 0)),
  };
}

const contarPostulantes = (jobId: string): Promise<number> => conSistema(() => Proposal.count({ where: { jobId, status: 'pending' } as any }));

const saldoParaPagar = async (userId: string): Promise<number> => (await import('./creditoDePublicacion.js')).saldoLiberadoUsable(userId);

/** El análisis de los saldos que ve quien publicó antes de aceptar. No cambia nada. */
export async function analizarCambio(job: any, precioNuevo: number): Promise<AnalisisDelCambio> {
  const datos = await datosDelPresupuesto(job);
  const bloqueo = bloqueoDelPresupuesto(datos);
  const modo = modoDelCambio(datos);
  const base = await presupuestoVigente(job);
  const nuevo = r2(Number(precioNuevo) || 0);
  const diferencia = r2(nuevo - base);

  const analisis: AnalisisDelCambio = {
    puede: !bloqueo,
    bloqueo: bloqueo ?? undefined,
    modo,
    precioActual: base,
    precioNuevo: nuevo,
    diferencia,
    aFavor: 0,
    aPagar: null,
    comisionYaCobrada: 0,
    gastosDeTransferenciaYaCobrados: 0,
    postulantesQueSeQuitan: diferencia === 0 ? 0 : await contarPostulantes(String(job.id)),
    elegidos: modo === 'con_aceptacion' ? await repartirEntreLosElegidos(datos.contratos, base, nuevo) : [],
  };
  if (bloqueo || modo === 'libre' || diferencia === 0) return analisis;

  if (modo === 'con_aceptacion' && (analisis.elegidos.length === 0 || analisis.elegidos.some((e) => e.montoNuevo <= 0))) {
    return { ...analisis, puede: false, bloqueo: { codigo: 'SIN_CONTRATO', mensaje: 'No encontramos el contrato de la persona elegida. Escribinos desde el Centro de ayuda.' } };
  }

  try {
    if (diferencia < 0) {
      const dinero = await comprobarElDineroDelTrabajo(job, base);
      analisis.aFavor = r2(-diferencia);
      analisis.comisionYaCobrada = dinero.comisionYaCobrada;
      analisis.gastosDeTransferenciaYaCobrados = dinero.gastosDeTransferenciaYaCobrados;
    } else {
      const cuenta = await liquidarAumento({ clientId: job.clientId, price: base }, nuevo, await saldoParaPagar(String(job.clientId)));
      analisis.aPagar = {
        diferencia: cuenta.diferencia,
        comision: cuenta.comision,
        iva: r2(cuenta.iva + cuenta.procesamientoIva),
        saldoAUsar: cuenta.saldoAUsar,
        gastosDeTransferencia: cuenta.procesamiento,
        porLaPasarela: cuenta.aPagar,
      };
      const pagos = await pagosDelTrabajo(job);
      analisis.comisionYaCobrada = r2(pagos.filter((p) => PAGOS_CON_DINERO.includes(String(p.status))).reduce((s, p) => s + (Number(p.platformFee) || 0), 0));
      analisis.gastosDeTransferenciaYaCobrados = r2(pagos.filter((p) => PAGOS_CON_DINERO.includes(String(p.status))).reduce((s, p) => s + (Number(p.processingCharge) || 0), 0));
    }
  } catch (e) {
    if (!(e instanceof ErrorDeDinero)) throw e;
    const { CATALOGO_DE_PROBLEMAS } = await import('../../shared/errores/catalogoDeProblemas.js');
    logger.warn('payments', `Cambio de presupuesto frenado: ${e.message}`, { data: { jobId: String(job.id) } });
    return { ...analisis, puede: false, bloqueo: { codigo: e.codigo, mensaje: `${CATALOGO_DE_PROBLEMAS[e.codigo].paraElUsuario} (${e.codigo})` } };
  }
  return analisis;
}

/** Avisa dentro de DOAPP y por correo, con el mismo texto. */
async function avisar(userId: string, titulo: string, mensaje: string, ruta: string, jobId: string, tipo: 'info' | 'success' | 'warning' = 'info'): Promise<void> {
  try {
    const { avisarPorTodosLados } = await import('./avisarPorTodosLados.js');
    await avisarPorTodosLados({ userId, titulo, mensaje, ruta, tipo, categoria: 'jobs', relatedModel: 'Job', relatedId: jobId });
  } catch (e: any) {
    logger.silentError('payments', `No se pudo avisar: ${titulo}`, e, { userId, jobId });
  }
}

/** Quita las postulaciones que esperaban respuesta (eran por otro presupuesto) y le avisa a cada persona que tiene que postularse de nuevo. */
export async function quitarPostuladosPorCambioDePrecio(job: any, antes: number, despues: number): Promise<number> {
  const pendientes: any[] = await conSistema(() => Proposal.findAll({ where: { jobId: job.id, status: 'pending' } as any }));
  for (const p of pendientes) {
    const [tocadas] = await conSistema(() =>
      Proposal.update({ status: 'cancelled', cancellationReason: POSTULACION_QUITADA_POR_PRESUPUESTO } as any, { where: { id: p.id, status: 'pending' } as any, individualHooks: true }),
    );
    if (!tocadas) continue;
    await avisar(
      String(p.freelancerId),
      'Cambió el presupuesto: postulate de nuevo',
      `El presupuesto de "${job.title}" cambió de ${pesos(antes)} a ${pesos(despues)}. Por eso se quitó tu postulación: si te sigue interesando, postulate de nuevo.`,
      `/jobs/${job.id}`,
      String(job.id),
      'warning',
    );
  }
  return pendientes.length;
}

async function avisarCambiosEnVivo(job: any): Promise<void> {
  cacheService.delPattern('jobs:*');
  try {
    const { socketService } = await import('../index.js');
    socketService.notifyJobStatusChanged(job.toJSON(), job.status);
  } catch (e: any) {
    logger.silentError('payments', 'No se pudo avisar por socket el cambio de presupuesto', e, { jobId: String(job.id) });
  }
}

/**
 * Escribe el precio nuevo: el del trabajo, el de cada contrato de las personas elegidas (la comisión cobrada no se toca) y las asignaciones; después quita las
 * postulaciones sin elegir. La plata (a favor o cobro) la resuelve quien llama, ANTES o DESPUÉS según el sentido del cambio.
 */
export async function escribirElPrecioNuevo(p: {
  job: any;
  precioAnterior: number;
  precioNuevo: number;
  motivo: string;
  repartos?: RepartoDelCambio[];
  historial?: Record<string, unknown>;
  otrosCambios?: Record<string, unknown>;
}): Promise<{ quitados: number }> {
  const { job } = p;
  const publicadoAntes = r2(Number(job.price));
  const publicadoDespues = r2(publicadoAntes - p.precioAnterior + p.precioNuevo);
  const repartos = p.repartos ?? [];

  await job.update({
    ...(p.otrosCambios ?? {}),
    price: publicadoDespues,
    originalPrice: job.originalPrice || publicadoAntes,
    priceChangeReason: p.motivo,
    priceChangedAt: new Date(),
    // Arreglo NUEVO: Sequelize compara el jsonb por valor y un push sobre el mismo arreglo no se ve como cambio.
    priceHistory: [...(job.priceHistory || []), { oldPrice: publicadoAntes, newPrice: publicadoDespues, reason: p.motivo, changedAt: new Date(), ...(p.historial ?? {}) }],
    budgetChangeRequest: null,
  } as any);

  const quitados = await aplicarEfectosDelPrecioNuevo(job, { precioAnterior: p.precioAnterior, precioNuevo: p.precioNuevo, publicado: publicadoDespues, motivo: p.motivo, repartos });
  return { quitados };
}

/**
 * Lo que acompaña a un precio que ya cambió: cada contrato de las personas elegidas pasa a su monto nuevo (la comisión cobrada no se toca) y las postulaciones que
 * esperaban respuesta se quitan. Lo usan el cambio directo, el aceptado y el aumento que se aplica al aprobarse su pago.
 */
export async function aplicarEfectosDelPrecioNuevo(
  job: any,
  p: { precioAnterior: number; precioNuevo: number; publicado: number; motivo: string; repartos?: RepartoDelCambio[] },
): Promise<number> {
  for (const r of p.repartos ?? []) {
    const contrato: any = await conSistema(() => Contract.findByPk(r.contratoId));
    if (!contrato) continue;
    const comision = Number(contrato.commission) || 0;
    await conSistema(() =>
      contrato.update({
        price: r.montoNuevo,
        totalPrice: r2(r.montoNuevo + comision),
        originalPrice: contrato.originalPrice || r.montoActual,
        ...(contrato.allocatedAmount != null ? { allocatedAmount: r.montoNuevo, percentageOfBudget: (r.montoNuevo / p.publicado) * 100 } : {}),
        priceModificationHistory: [
          ...(contrato.priceModificationHistory || []),
          { previousPrice: r.montoActual, newPrice: r.montoNuevo, modifiedBy: String(job.clientId), modifiedAt: new Date(), reason: p.motivo },
        ],
      }),
    );
  }
  if (p.repartos?.length && Array.isArray(job.workerAllocations) && job.workerAllocations.length) {
    const montoDe = new Map(p.repartos.map((r) => [r.trabajadorId, r.montoNuevo]));
    await job.update({
      workerAllocations: job.workerAllocations.map((a: any) =>
        montoDe.has(String(a.workerId)) ? { ...a, allocatedAmount: montoDe.get(String(a.workerId)), percentage: (montoDe.get(String(a.workerId))! / p.publicado) * 100 } : a,
      ),
    } as any);
  }
  const quitados = await quitarPostuladosPorCambioDePrecio(job, p.precioAnterior, p.precioNuevo);
  await avisarCambiosEnVivo(job);
  return quitados;
}

/** Un cambio a la vez por trabajo: dos pedidos juntos leerían el mismo presupuesto y acreditarían dos veces. Es el mismo candado que usa la devolución de lo no usado. */
export async function conElTrabajoBloqueado<T>(jobId: string, tarea: (job: any) => Promise<T>): Promise<T> {
  // Es una operación de sistema: quien responde puede ser la persona elegida y lo que se escribe (el trabajo, la plata) es de quien publicó. Quién puede pedir qué
  // se comprueba antes, en la ruta y en cada función.
  return conSistema(() => sequelize.transaction(async (t) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:clave))', { replacements: { clave: `presupuesto:${jobId}` }, transaction: t });
    const job = await Job.findByPk(jobId);
    if (!job) throw new CambioFrenado('NO_ENCONTRADO', 'Trabajo no encontrado', 404);
    return tarea(job);
  }));
}

/** Baja de precio pagada: primero se baja el precio y recién después se anota lo a favor; si anotarlo falla, el precio vuelve. */
async function aplicarBaja(job: any, base: number, nuevo: number, motivo: string, repartos: RepartoDelCambio[]) {
  const dinero = await comprobarElDineroDelTrabajo(job, base);
  const aFavor = r2(base - nuevo);
  const pagoOriginal = dinero.pagos.find((p) => p.paymentType === 'job_publication') ?? dinero.pagos[0];
  const anterior = { price: job.price, priceHistory: job.priceHistory };
  const { quitados } = await escribirElPrecioNuevo({ job, precioAnterior: base, precioNuevo: nuevo, motivo, repartos, historial: { refundedToBalance: aFavor } });
  try {
    const baja = await acreditarDevolucion(String(job.clientId), aFavor, `Saldo a favor por bajar el precio de "${job.title}"`, {
      relatedModel: 'Job',
      relatedId: String(job.id),
      metadata: {
        origen: 'baja_de_precio',
        reason: 'price_decrease',
        jobId: String(job.id),
        pagoId: pagoOriginal ? String(pagoOriginal.id) : undefined,
        // Hasta cuándo espera a la pasarela. Además, para RETIRARLO tiene que haber terminado el trabajo (shared/pagos/retiroPorContrato.ts).
        disponibleDesde: dinero.disponibleDesde,
        oldPrice: base,
        newPrice: nuevo,
        alRetirar: { comision: 0 },
      },
    });
    return { quitados, aFavor, baja, frase: `${fraseDelAFavor(aFavor, baja)} Vas a poder retirarlos cuando el trabajo termine y la pasarela haya liberado el pago.` };
  } catch (e) {
    await job.update(anterior as any);
    throw e;
  }
}

export type ResultadoDelPedido =
  | { tipo: 'aplicado'; mensaje: string; postulantesQuitados: number; aFavor?: number; pendiente?: boolean; disponibleDesde?: string }
  | { tipo: 'esperando_respuesta'; mensaje: string; pedido: PedidoDeCambio }
  | { tipo: 'falta_pagar'; mensaje: string; aPagar: number; saldoAUsar: number; desglose: NonNullable<AnalisisDelCambio['aPagar']> };

/** Sube el precio de un trabajo pagado: con saldo si alcanza; si no, queda esperando el pago de la diferencia. */
async function aplicarOPedirElPagoDelAumento(job: any, base: number, nuevo: number, motivo: string, repartos: RepartoDelCambio[], pedido: PedidoDeCambio | null): Promise<ResultadoDelPedido> {
  const cuenta = await liquidarAumento({ clientId: job.clientId, price: base }, nuevo, await saldoParaPagar(String(job.clientId)));
  if (cuenta.restante <= 0) {
    await debitarSaldo(String(job.clientId), cuenta.totalRequerido, `Aumento de precio de "${job.title}" pagado con saldo`, {
      relatedModel: 'Job',
      relatedId: String(job.id),
      metadata: { jobId: String(job.id), origen: 'aumento_de_precio', oldPrice: base, newPrice: nuevo, comision: cuenta.comision, iva: cuenta.iva },
    });
    const { quitados } = await escribirElPrecioNuevo({ job, precioAnterior: base, precioNuevo: nuevo, motivo, repartos, historial: { paidFromBalance: cuenta.totalRequerido } });
    return { tipo: 'aplicado', mensaje: `Presupuesto aumentado. Se descontaron ${pesos(cuenta.totalRequerido)} de tu saldo.`, postulantesQuitados: quitados };
  }

  // Sin nadie elegido, la publicación se pausa hasta que se pague. Con alguien elegido NO se pausa (el contrato sigue su curso con el precio de ahora).
  const conElegidos = repartos.length > 0;
  const pedidoNuevo: PedidoDeCambio | null = conElegidos && pedido ? { ...pedido, estado: 'esperando_pago' } : null;
  await job.update({
    pendingNewPrice: r2(Number(job.price) - base + nuevo),
    pendingPaymentAmount: cuenta.aPagar,
    pendingBalanceDeduction: cuenta.saldoAUsar,
    priceChangeReason: motivo,
    previousStatus: job.status,
    ...(conElegidos ? {} : { status: 'paused' }),
    budgetChangeRequest: pedidoNuevo,
  } as any);
  await avisarCambiosEnVivo(job);
  return {
    tipo: 'falta_pagar',
    mensaje: cuenta.saldoAUsar > 0 ? `Se usarán ${pesos(cuenta.saldoAUsar)} de tu saldo. Falta pagar ${pesos(cuenta.aPagar)}.` : `Falta pagar ${pesos(cuenta.aPagar)}: el precio cambia cuando el pago quede aprobado.`,
    aPagar: cuenta.aPagar,
    saldoAUsar: cuenta.saldoAUsar,
    desglose: {
      diferencia: cuenta.diferencia,
      comision: cuenta.comision,
      iva: r2(cuenta.iva + cuenta.procesamientoIva),
      saldoAUsar: cuenta.saldoAUsar,
      gastosDeTransferencia: cuenta.procesamiento,
      porLaPasarela: cuenta.aPagar,
    },
  };
}

/**
 * Quien publicó cambia el presupuesto. `aceptaEfectos` es obligatorio cuando el cambio tiene consecuencias (mueve plata, quita postulaciones o necesita la
 * aceptación de alguien): la pantalla se las muestra antes.
 */
export async function cambiarElPresupuesto(jobId: string, p: { precioNuevo: number; motivo: string; aceptaEfectos: boolean; por: string }): Promise<ResultadoDelPedido> {
  return conElTrabajoBloqueado(jobId, async (job) => {
    const analisis = await analizarCambio(job, p.precioNuevo);
    if (!analisis.puede) throw new CambioFrenado(analisis.bloqueo!.codigo, analisis.bloqueo!.mensaje);
    if (analisis.diferencia === 0) return { tipo: 'aplicado', mensaje: 'El presupuesto no cambió.', postulantesQuitados: 0 };

    const hayEfectos = analisis.modo !== 'libre' || analisis.postulantesQueSeQuitan > 0;
    if (hayEfectos && !p.aceptaEfectos) {
      throw new CambioFrenado('CONFIRMAR_EFECTOS', 'Antes de cambiar el presupuesto tenés que ver y aceptar lo que va a pasar.');
    }
    const motivo = p.motivo.trim();
    const base = analisis.precioActual;
    const nuevo = analisis.precioNuevo;

    if (analisis.modo === 'libre') {
      const { quitados } = await escribirElPrecioNuevo({ job, precioAnterior: base, precioNuevo: nuevo, motivo });
      return { tipo: 'aplicado', mensaje: 'Presupuesto actualizado. Lo pagás al publicar.', postulantesQuitados: quitados };
    }

    if (analisis.modo === 'con_aceptacion') {
      const pedido: PedidoDeCambio = {
        id: randomUUID(),
        estado: 'esperando_respuesta',
        precioAnterior: base,
        precioNuevo: nuevo,
        motivo,
        pedidoPor: p.por,
        pedidoEl: new Date().toISOString(),
        elegidos: analisis.elegidos.map((e) => ({ ...e, respuesta: 'pendiente' as const })),
      };
      // Un aumento anterior sin pagar queda sin efecto.
      await job.update({ budgetChangeRequest: pedido, pendingNewPrice: null, pendingPaymentAmount: 0, pendingBalanceDeduction: 0 } as any);
      for (const e of pedido.elegidos) {
        await avisar(
          e.trabajadorId,
          'Te piden cambiar el presupuesto: respondé',
          `En "${job.title}" quieren cambiar tu pago de ${pesos(e.montoActual)} a ${pesos(e.montoNuevo)}. Motivo: ${motivo}. Se cambia solo si lo aceptás; mientras tanto sigue todo como está.`,
          `/jobs/${job.id}`,
          String(job.id),
          'warning',
        );
      }
      await avisarCambiosEnVivo(job);
      return {
        tipo: 'esperando_respuesta',
        mensaje: pedido.elegidos.length === 1 ? `Le pedimos a ${pedido.elegidos[0].nombre} que acepte el cambio. El precio cambia cuando lo acepte.` : 'Les pedimos a las personas elegidas que acepten el cambio. El precio cambia cuando acepten todas.',
        pedido,
      };
    }

    if (analisis.diferencia < 0) {
      const r = await aplicarBaja(job, base, nuevo, motivo, []);
      return { tipo: 'aplicado', mensaje: `Presupuesto reducido. ${r.frase}`, postulantesQuitados: r.quitados, aFavor: r.aFavor, pendiente: r.baja.pendiente, disponibleDesde: r.baja.pendiente ? r.baja.disponibleDesde : undefined };
    }
    return aplicarOPedirElPagoDelAumento(job, base, nuevo, motivo, [], null);
  });
}

/** Cierra un pedido sin aplicarlo: queda en el historial del trabajo qué se pidió y por qué no se hizo. */
async function cerrarPedidoSinAplicar(job: any, pedido: PedidoDeCambio, resultado: 'rechazado' | 'cancelado' | 'vencido'): Promise<void> {
  await job.update({
    budgetChangeRequest: null,
    ...(pedido.estado === 'esperando_pago' ? { pendingNewPrice: null, pendingPaymentAmount: 0, pendingBalanceDeduction: 0, previousStatus: null, priceChangeReason: null } : {}),
    priceHistory: [...(job.priceHistory || []), { oldPrice: pedido.precioAnterior, newPrice: pedido.precioNuevo, reason: pedido.motivo, changedAt: new Date(), resultado }],
  } as any);
  await avisarCambiosEnVivo(job);
}

/** ¿El pedido sigue siendo sobre las mismas personas y en un trabajo que todavía admite el cambio? */
async function motivoDeVencimiento(job: any, pedido: PedidoDeCambio): Promise<string | null> {
  const datos = await datosDelPresupuesto(job, { sinElPedido: true });
  const bloqueo = bloqueoDelPresupuesto(datos);
  if (bloqueo) return bloqueo.mensaje;
  const ahora = datos.contratos.map((c) => `${c.id}:${r2(Number(c.price))}`).sort().join('|');
  const entonces = pedido.elegidos.map((e) => `${e.contratoId}:${r2(e.montoActual)}`).sort().join('|');
  return ahora === entonces ? null : 'Cambiaron las personas elegidas o sus montos desde que se pidió.';
}

/** Si el pedido en curso ya no se puede aplicar, lo cierra, avisa a quien publicó y devuelve el motivo. */
export async function vencerElPedidoSiCorresponde(job: any): Promise<string | null> {
  const pedido = job.budgetChangeRequest as PedidoDeCambio | null;
  if (!pedido) return null;
  const motivo = await motivoDeVencimiento(job, pedido);
  if (!motivo) return null;
  await cerrarPedidoSinAplicar(job, pedido, 'vencido');
  await avisar(String(job.clientId), 'El cambio de presupuesto quedó sin efecto', `El cambio que pediste en "${job.title}" ya no se puede aplicar. ${motivo}`, `/jobs/${job.id}`, String(job.id), 'warning');
  for (const e of pedido.elegidos) {
    await avisar(e.trabajadorId, 'El cambio de presupuesto quedó sin efecto', `En "${job.title}" el presupuesto sigue como estaba.`, `/jobs/${job.id}`, String(job.id));
  }
  return motivo;
}

/** La pasada programada: ningún pedido queda abierto sobre un trabajo que ya se está cerrando. */
export async function vencerPedidosDeCambio(): Promise<number> {
  const trabajos: any[] = await conSistema(() => Job.findAll({ where: { budgetChangeRequest: { [Op.ne]: null } } as any, limit: 100 }));
  let vencidos = 0;
  for (const t of trabajos) {
    await conElTrabajoBloqueado(String(t.id), async (job) => {
      if (await vencerElPedidoSiCorresponde(job)) vencidos++;
    }).catch((e: any) => logger.silentError('payments', 'No se pudo revisar un pedido de cambio de presupuesto', e, { jobId: String(t.id) }));
  }
  return vencidos;
}

export async function responderElCambio(jobId: string, trabajadorId: string, acepta: boolean): Promise<ResultadoDelPedido | { tipo: 'rechazado'; mensaje: string }> {
  return conElTrabajoBloqueado(jobId, async (job) => {
    const pedido = job.budgetChangeRequest as PedidoDeCambio | null;
    if (!pedido || pedido.estado !== 'esperando_respuesta') throw new CambioFrenado('SIN_PEDIDO', 'No hay un cambio de presupuesto esperando tu respuesta.');
    const mio = pedido.elegidos.find((e) => e.trabajadorId === String(trabajadorId));
    if (!mio) throw new CambioFrenado('NO_ES_PARA_VOS', 'Este cambio de presupuesto no es para vos.', 403);
    if (mio.respuesta !== 'pendiente') throw new CambioFrenado('YA_RESPONDISTE', 'Ya respondiste este cambio.');

    const vencido = await vencerElPedidoSiCorresponde(job);
    if (vencido) {
      throw new CambioFrenado('PEDIDO_VENCIDO', `Este cambio ya no se puede aplicar. ${vencido}`);
    }

    const nuevoPedido: PedidoDeCambio = {
      ...pedido,
      elegidos: pedido.elegidos.map((e) => (e.trabajadorId === String(trabajadorId) ? { ...e, respuesta: acepta ? 'acepta' : 'rechaza', respondidoEl: new Date().toISOString() } : e)),
    };

    if (!acepta) {
      await cerrarPedidoSinAplicar(job, nuevoPedido, 'rechazado');
      await avisar(String(job.clientId), 'No aceptaron el cambio de presupuesto', `${mio.nombre} no aceptó el cambio de presupuesto de "${job.title}". El precio sigue como estaba.`, `/jobs/${job.id}`, String(job.id), 'warning');
      for (const e of nuevoPedido.elegidos.filter((x) => x.trabajadorId !== String(trabajadorId))) {
        await avisar(e.trabajadorId, 'El cambio de presupuesto quedó sin efecto', `En "${job.title}" el presupuesto sigue como estaba.`, `/jobs/${job.id}`, String(job.id));
      }
      return { tipo: 'rechazado', mensaje: 'No aceptaste el cambio: el presupuesto sigue como estaba.' };
    }

    if (nuevoPedido.elegidos.some((e) => e.respuesta !== 'acepta')) {
      await job.update({ budgetChangeRequest: nuevoPedido } as any);
      await avisar(String(job.clientId), 'Una persona aceptó el cambio de presupuesto', `${mio.nombre} aceptó el cambio en "${job.title}". Falta que respondan las demás.`, `/jobs/${job.id}`, String(job.id));
      await avisarCambiosEnVivo(job);
      return { tipo: 'esperando_respuesta', mensaje: 'Aceptaste. El precio cambia cuando acepten todas las personas elegidas.', pedido: nuevoPedido };
    }

    await job.update({ budgetChangeRequest: nuevoPedido } as any);
    const base = pedido.precioAnterior;
    const nuevo = pedido.precioNuevo;
    const repartos: RepartoDelCambio[] = nuevoPedido.elegidos.map(({ respuesta: _r, respondidoEl: _e, ...r }) => r);
    let resultado: ResultadoDelPedido;
    if (nuevo < base) {
      const r = await aplicarBaja(job, base, nuevo, pedido.motivo, repartos);
      resultado = { tipo: 'aplicado', mensaje: 'Aceptaste: el presupuesto ya quedó con el monto nuevo.', postulantesQuitados: r.quitados };
      await avisar(String(job.clientId), 'Aceptaron el cambio de presupuesto', `El presupuesto de "${job.title}" quedó en ${pesos(nuevo)}. ${r.frase}`, `/jobs/${job.id}`, String(job.id), 'success');
    } else {
      resultado = await aplicarOPedirElPagoDelAumento(job, base, nuevo, pedido.motivo, repartos, nuevoPedido);
      await avisar(
        String(job.clientId),
        resultado.tipo === 'falta_pagar' ? 'Aceptaron el cambio: falta pagar la diferencia' : 'Aceptaron el cambio de presupuesto',
        resultado.tipo === 'falta_pagar' ? `Aceptaron el cambio en "${job.title}". ${resultado.mensaje}` : `El presupuesto de "${job.title}" quedó en ${pesos(nuevo)}.`,
        resultado.tipo === 'falta_pagar' ? `/jobs/${job.id}/payment?reason=budget_increase` : `/jobs/${job.id}`,
        String(job.id),
        resultado.tipo === 'falta_pagar' ? 'warning' : 'success',
      );
      if (resultado.tipo === 'falta_pagar') resultado = { ...resultado, mensaje: 'Aceptaste. El presupuesto cambia cuando se pague la diferencia.' };
    }
    return resultado;
  });
}

/** Quien publicó retira el pedido (mientras no haya un pago del aumento en revisión). */
export async function cancelarElPedido(jobId: string): Promise<void> {
  await conElTrabajoBloqueado(jobId, async (job) => {
    const pedido = job.budgetChangeRequest as PedidoDeCambio | null;
    if (!pedido) throw new CambioFrenado('SIN_PEDIDO', 'No hay un cambio de presupuesto en curso.');
    const pagos = await pagosDelTrabajo(job);
    if (pagos.some((x) => x.paymentType === 'budget_increase' && x.status === 'pending_verification')) {
      throw new CambioFrenado('AUMENTO_PAGADO_EN_REVISION', 'Ya pagaste este aumento y está en revisión: no se puede cancelar.');
    }
    await cerrarPedidoSinAplicar(job, pedido, 'cancelado');
    for (const e of pedido.elegidos) {
      await avisar(e.trabajadorId, 'Retiraron el pedido de cambio de presupuesto', `En "${job.title}" el presupuesto sigue como estaba.`, `/jobs/${job.id}`, String(job.id));
    }
  });
}

/** El pedido en curso, como lo ve quien lo mira: quien publicó ve todo; una persona elegida, solo su parte. null para el resto. */
export async function pedidoParaQuienMira(job: any, userId: string): Promise<null | (Omit<PedidoDeCambio, 'elegidos'> & { soy: 'cliente' | 'elegido'; elegidos: ElegidoEnElPedido[] })> {
  const pedido = job.budgetChangeRequest as PedidoDeCambio | null;
  if (!pedido) return null;
  if (String(job.clientId) === String(userId)) return { ...pedido, soy: 'cliente' };
  const mio = pedido.elegidos.find((e) => e.trabajadorId === String(userId));
  if (!mio) return null;
  return { ...pedido, precioAnterior: mio.montoActual, precioNuevo: mio.montoNuevo, elegidos: [mio], soy: 'elegido' };
}
