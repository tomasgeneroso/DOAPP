import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { User } from '../models/sql/User.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import BalanceTransaction from '../models/sql/BalanceTransaction.model.js';
import { quienConfirmoElPago } from './controlesDeDinero.js';
import { esDevolucionDeLaPublicacion } from './creditoDePublicacion.js';

/**
 * El EXPEDIENTE de una publicación: todo lo que administración necesita para entender qué pasó con ella y con su plata, en un solo lugar.
 *
 * Reúne lo que antes había que buscar a mano en la base: la publicación (quién la creó, la revisó, la pausó, la canceló), el pago que la
 * respalda (y quién lo confirmó), los movimientos de saldo que generó (con quién los hizo), los contratos, las postulaciones y el rastro
 * de auditoría; los ordena en una cronología y marca con alertas lo que no cierra (por ejemplo, plata devuelta de una publicación que nunca
 * se cobró). Solo LEE.
 */

export interface Persona {
  id: string;
  nombre: string;
  email: string | null;
  rol: string | null;
}

export interface Alerta {
  nivel: 'alta' | 'media' | 'info';
  titulo: string;
  detalle: string;
  /** Qué hacer al respecto. */
  queHacer?: string;
}

export interface MovimientoDeSaldo {
  id: string;
  fecha: string;
  tipo: string;
  monto: number;
  estado: string;
  descripcion: string;
  usuario: Persona | null;
  origen: string | null;
  hechoPor: { tipo: string | null; persona: Persona | null } | null;
  saldoAntes: number;
  saldoDespues: number;
  pagoId: string | null;
  /** Es una devolución por cancelación y no tiene pago anotado. */
  sinPago: boolean;
  /** La publicación a la que se refiere el movimiento (si el asiento la nombra). */
  publicacionId: string | null;
}

export interface EventoDeLaLinea {
  fecha: string;
  tipo: 'publicacion' | 'pago' | 'saldo' | 'contrato' | 'postulacion' | 'auditoria';
  titulo: string;
  detalle?: string;
  quien?: string | null;
  monto?: number | null;
}

export interface ExpedienteDePublicacion {
  publicacion: {
    id: string;
    titulo: string;
    estado: string;
    precio: number;
    modoDePrecio: string | null;
    trabajadoresPedidos: number;
    trabajadoresElegidos: number;
    puedeEmpezarConMenos: boolean;
    inicio: string | null;
    fin: string | null;
    creadaEl: string | null;
    dueno: Persona | null;
    figuraPagada: boolean;
    pagadaEl: string | null;
    pagoId: string | null;
    pagadaConSaldo: boolean;
    creditoVinculado: number;
    revisadaPor: Persona | null;
    revisadaEl: string | null;
    motivoDeRechazo: string | null;
    pausadaPorAdmin: boolean;
    reprogramadaDesde: { inicio: string | null; fin: string | null; el: string | null } | null;
    canceladaPor: Persona | null;
    canceladaComo: string | null;
    canceladaEl: string | null;
    motivoDeCancelacion: string | null;
    cancelacionDefinitiva: boolean;
  };
  pago: {
    id: string;
    monto: number;
    moneda: string;
    estado: string;
    medio: string;
    mercadoPago: { id: string | null; estado: string | null };
    confirmadoPor: string | null;
    pagador: Persona | null;
    aprobadoPor: Persona | null;
    aprobadoEl: string | null;
    /** La misma cuenta que pagó fue la que lo aprobó. */
    aprobadoPorElPagador: boolean;
    /** Lo confirmó una persona (transferencia, comprobante), no una pasarela: nadie más comprobó que el dinero entró. */
    esManual: boolean;
    comision: number;
    devuelto: number;
    creadoEl: string | null;
    pagadoEl: string | null;
  } | null;
  pagosDeContratos: Array<{ id: string; contratoId: string | null; monto: number; moneda: string; estado: string; tipo: string; creadoEl: string | null }>;
  movimientos: MovimientoDeSaldo[];
  contratos: Array<{
    id: string;
    estado: string;
    trabajador: Persona | null;
    precio: number;
    comision: number;
    total: number;
    pago: string;
    garantia: string;
    confirmoElDueno: boolean;
    confirmoElTrabajador: boolean;
    inicio: string | null;
    fin: string | null;
    creadoEl: string | null;
    canceladoPor: Persona | null;
    motivoDeCancelacion: string | null;
  }>;
  postulaciones: { total: number; porEstado: Record<string, number> };
  auditoria: Array<{ fecha: string; accion: string; descripcion: string; gravedad: string; quien: string | null; sobre: string }>;
  linea: EventoDeLaLinea[];
  alertas: Alerta[];
  /** Listas que no se pudieron leer (la página sigue con lo demás). */
  avisos: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const pesos = (n: number) => `$${r2(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADOS_CON_DINERO = new Set(['completed', 'held_escrow', 'awaiting_confirmation', 'confirmed_for_payout', 'verified', 'approved']);

export interface DatosParaLasAlertas {
  estado: string;
  precio: number;
  figuraPagada: boolean;
  /** El pago registrado de la publicación (el que figura en la publicación, no el que anotó un asiento). */
  pagoId: string | null;
  pagadaConSaldo: boolean;
  creditoVinculado: number;
  pausadaPorAdmin: boolean;
  reprogramada: boolean;
  duenoNombre: string | null;
  pago: { monto: number; moneda: string; estado: string; medio?: string; aprobadoPorElPagador?: boolean; esManual?: boolean } | null;
  /** Devoluciones por cancelación de esta publicación. `pagoId` es el pago que anotó el asiento (los viejos no lo anotan). */
  devoluciones: Array<{ monto: number; pagoId: string | null }>;
  /** Lo que ya se descontó con ajustes manuales atados a esta publicación (scripts/ajustarSaldo --publicacion). */
  corregidoAMano?: number;
  /** Plata a favor del dueño que todavía NO está en su saldo (el pago original sigue en Mercado Pago), con la fecha en que pasa a ser saldo. */
  pendientes?: Array<{ monto: number; disponibleDesde: string | null }>;
}

/** Lo que no cierra de una publicación, en palabras y con qué hacer. Pura: se prueba sin base de datos. */
export function alertasDeLaPublicacion(d: DatosParaLasAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const totalDevuelto = r2(d.devoluciones.reduce((s, x) => s + x.monto, 0));
  const corregido = d.corregidoAMano ?? 0;
  const pagoVigente = d.pago && d.pago.estado !== 'cancelled' && d.pago.estado !== 'failed' && d.pago.estado !== 'rejected';

  // La publicación NO tiene ningún pago detrás (ni registro de pago ni descuento de saldo) y aun así se devolvió plata.
  if (d.devoluciones.length > 0 && !d.pagoId && !d.pagadaConSaldo) {
    if (corregido >= totalDevuelto - 0.01) {
      alertas.push({
        nivel: 'info',
        titulo: 'Se devolvió plata sin cobro, y ya se corrigió',
        detalle: `Se habían acreditado ${pesos(totalDevuelto)} sin pago detrás; se descontaron con un ajuste manual (queda en el historial del usuario).`,
      });
    } else {
      alertas.push({
        nivel: 'alta',
        titulo: 'Se devolvió plata de una publicación que nunca se cobró',
        detalle: `Se acreditaron ${pesos(totalDevuelto)} al saldo de ${d.duenoNombre || 'el dueño'} por cancelar esta publicación, pero no tiene ningún pago registrado ni un descuento de saldo detrás: esa plata no entró.`,
        queHacer: 'Confirmá en Pagos que no hubo un cobro real. Si no lo hubo, descontalo con el script ajustarSaldo (queda como asiento de ajuste en el historial del usuario).',
      });
    }
  } else if (d.figuraPagada && !d.pagoId && !d.pagadaConSaldo && !['draft', 'pending_payment'].includes(d.estado)) {
    alertas.push({
      nivel: 'media',
      titulo: 'Figura pagada pero no tiene pago registrado',
      detalle: 'La publicación está marcada como pagada, pero no hay un pago ni un descuento de saldo del dueño que lo respalde (puede ser un contrato libre de comisión, de prueba, o una cotización pagada por otro camino).',
      queHacer: 'Si se cancela, no se devuelve nada (no hay plata que devolver). Revisá si hubo un cobro real antes de dar por buena la publicación.',
    });
  }

  if (d.pago && pagoVigente) {
    if (d.figuraPagada && !ESTADOS_CON_DINERO.has(d.pago.estado)) {
      alertas.push({
        nivel: 'alta',
        titulo: `La publicación figura pagada pero su pago está «${d.pago.estado}»`,
        detalle: `El pago de ${pesos(d.pago.monto)} no está en un estado de dinero recibido, y aun así la publicación se dio por pagada.`,
        queHacer: 'Revisá el pago (comprobante, Mercado Pago). Si el dinero no llegó, la publicación no debería estar publicada.',
      });
    }

    // Un pago que NADIE más verificó: lo confirmó a mano la misma cuenta que pagó. Es lo que dejó pasar el caso «try» ($431.956,80).
    if (d.pago.esManual && d.pago.aprobadoPorElPagador && ESTADOS_CON_DINERO.has(d.pago.estado)) {
      alertas.push({
        nivel: 'media',
        titulo: 'Pago aprobado a mano por la misma persona que pagó',
        detalle: `El pago de ${pesos(d.pago.monto)}${d.pago.medio ? ` (${d.pago.medio})` : ''} lo confirmó a mano la misma cuenta que lo hizo, sin que una pasarela lo confirmara. Nadie más comprobó que el dinero haya entrado.`,
        queHacer: 'Confirmá en el banco que el dinero entró. Si no entró, anulá el pago (script anularPago) y, si se devolvió algo al saldo, descontalo con ajustarSaldo --publicacion.',
      });
    } else if (d.pago.esManual && ESTADOS_CON_DINERO.has(d.pago.estado)) {
      alertas.push({ nivel: 'info', titulo: 'Pago confirmado a mano (sin pasarela)', detalle: 'Lo confirmó una persona (transferencia o comprobante), no una pasarela de pago.' });
    }

    if (totalDevuelto > d.pago.monto + 0.01) {
      alertas.push({
        nivel: 'alta',
        titulo: 'Se devolvió más de lo que se pagó',
        detalle: `Pagó ${pesos(d.pago.monto)} y se devolvieron ${pesos(totalDevuelto)}.`,
        queHacer: 'Corregí la diferencia con ajustarSaldo y revisá por qué se acreditó de más.',
      });
    }
    // El mismo pago devuelto más de una vez. Los asientos viejos no anotan el pago: se cuenta el de la publicación.
    const porPago = new Map<string, number>();
    for (const x of d.devoluciones) {
      const clave = x.pagoId ?? d.pagoId;
      if (clave) porPago.set(clave, (porPago.get(clave) || 0) + 1);
    }
    if ([...porPago.values()].some((n) => n > 1)) {
      alertas.push({
        nivel: 'alta',
        titulo: 'El mismo pago se devolvió más de una vez',
        detalle: 'Hay más de una devolución por cancelación apuntando al mismo pago.',
        queHacer: 'Corré corregirDobleDevolucion (muestra qué haría antes de tocar nada).',
      });
    }
    if (d.pago.moneda.toUpperCase() === 'ARS' && d.pago.monto + 1 < d.precio) {
      alertas.push({
        nivel: 'media',
        titulo: 'El pago es menor que el precio de la publicación',
        detalle: `Pagó ${pesos(d.pago.monto)} y el precio es ${pesos(d.precio)}. Puede ser un precio que cambió después, pero conviene mirarlo.`,
      });
    }
  }

  if (d.pago && !pagoVigente) {
    alertas.push({ nivel: 'info', titulo: `El pago está ${d.pago.estado === 'cancelled' ? 'anulado' : d.pago.estado}`, detalle: 'Ya no cuenta como dinero recibido.' });
  }
  // Un asiento viejo que no anota el pago, de una publicación que sí lo tiene: no es «sin cobro», es un dato que falta en el asiento.
  if (d.pagoId && d.devoluciones.some((x) => !x.pagoId)) {
    alertas.push({ nivel: 'info', titulo: 'La devolución no anota de qué pago salió', detalle: 'Es un asiento anterior a que se anotara el pago; se respalda con el pago registrado de la publicación.' });
  }
  if (corregido > 0 && d.devoluciones.length > 0 && !(d.devoluciones.length > 0 && !d.pagoId && !d.pagadaConSaldo)) {
    alertas.push({ nivel: 'info', titulo: 'Hay ajustes manuales por esta publicación', detalle: `Se descontaron ${pesos(corregido)} con ajustes manuales (queda en el historial del usuario).` });
  }

  if (d.pausadaPorAdmin) {
    alertas.push({ nivel: 'info', titulo: 'La pausó un administrador', detalle: 'El dueño la tiene que editar y volver a publicar; vuelve a pasar por revisión.' });
  }
  if (d.reprogramada) {
    alertas.push({ nivel: 'info', titulo: 'Fue reprogramada', detalle: 'Las fechas anteriores figuran abajo, en «Publicación».' });
  }
  const pendientes = d.pendientes ?? [];
  if (pendientes.length > 0) {
    const total = r2(pendientes.reduce((s, x) => s + x.monto, 0));
    const primera = pendientes.map((x) => x.disponibleDesde).filter((x): x is string => !!x).sort()[0];
    alertas.push({
      nivel: 'info',
      titulo: 'Hay plata a favor del dueño pendiente de liquidar',
      detalle: `${pesos(total)} que todavía NO están en el saldo de ${d.duenoNombre || 'el dueño'}: el pago original sigue en Mercado Pago${primera ? ` y pasan a su saldo el ${new Date(primera).toLocaleDateString('es-AR')}` : ''}. Hasta entonces no los puede usar ni retirar.`,
    });
  }
  if (d.creditoVinculado > 0) {
    alertas.push({
      nivel: 'info',
      titulo: 'Tiene saldo vinculado',
      detalle: `${pesos(d.creditoVinculado)} del saldo del dueño están vinculados a esta publicación (sirven para volver a publicarla; si los retira, hay que pagarla de nuevo).`,
    });
  }
  const orden = { alta: 0, media: 1, info: 2 } as const;
  return alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

export async function expedienteDePublicacion(jobId: string): Promise<ExpedienteDePublicacion | null> {
  const job: any = await Job.findByPk(jobId);
  if (!job) return null;

  // Cada lista se pide por separado: si una falla, la página sigue con lo demás y lo dice en `avisos`.
  const avisos: string[] = [];
  const seguro = async <T,>(nombre: string, f: () => Promise<T>, vacio: T): Promise<T> => {
    try {
      return await f();
    } catch (e: any) {
      avisos.push(`${nombre}: ${e?.message}`);
      return vacio;
    }
  };

  const pagoRegistrado: any = job.publicationPaymentId ? await seguro('pago', () => Payment.findByPk(job.publicationPaymentId), null as any) : null;

  const contratos: any[] = await seguro('contratos', () => Contract.findAll({ where: { jobId }, order: [['createdAt', 'ASC']] }), [] as any[]);
  const idsDeContratos = contratos.map((c) => String(c.id));

  const [movimientosCrudos, postulaciones, pagosDeContratos]: [any[], any[], any[]] = await Promise.all([
    seguro(
      'movimientos de saldo',
      () =>
        BalanceTransaction.findAll({
          where: {
            [Op.or]: [
              { metadata: { jobId: String(jobId) } },
              { metadata: { relatedModel: 'Job', relatedId: String(jobId) } },
              { metadata: { corrigeLaPublicacion: String(jobId) } },
              ...(idsDeContratos.length > 0 ? [{ relatedContractId: { [Op.in]: idsDeContratos } }] : []),
            ],
          } as any,
          order: [['createdAt', 'ASC']],
          limit: 200,
        }),
      [] as any[],
    ),
    seguro('postulaciones', () => Proposal.findAll({ where: { jobId }, attributes: ['id', 'status', 'freelancerId', 'createdAt'] }), [] as any[]),
    idsDeContratos.length > 0
      ? seguro('pagos de los contratos', () => Payment.findAll({ where: { contractId: { [Op.in]: idsDeContratos } } as any, order: [['createdAt', 'ASC']], limit: 100 }), [] as any[])
      : Promise.resolve([] as any[]),
  ]);

  // El registro de acciones apunta a lo que se tocó: la publicación, SU PAGO (quién lo aprobó) y sus contratos. Antes solo se miraba la publicación.
  const idsAuditados = [String(jobId), ...(pagoRegistrado ? [String(pagoRegistrado.id)] : []), ...idsDeContratos, ...pagosDeContratos.map((p) => String(p.id))];
  const auditoriaCruda: any[] = await seguro('auditoría', () => AuditLog.findAll({ where: { targetId: { [Op.in]: idsAuditados } } as any, order: [['createdAt', 'ASC']], limit: 150 }), [] as any[]);

  // Las personas que aparecen, en una sola consulta.
  const ids = new Set<string>();
  const sumar = (v: unknown) => {
    if (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) ids.add(v);
  };
  [job.clientId, job.cancelledById, job.reviewedBy, pagoRegistrado?.payerId, pagoRegistrado?.approvedBy, pagoRegistrado?.escrowVerifiedBy].forEach(sumar);
  for (const c of contratos) [c.doerId, c.cancelledBy].forEach(sumar);
  for (const m of movimientosCrudos) {
    sumar(m.userId);
    sumar(m.metadata?.actor?.id);
  }
  for (const a of auditoriaCruda) sumar(a.performedBy);
  const usuarios: any[] = await seguro('personas', () => User.findAll({ where: { id: { [Op.in]: [...ids] } } as any, attributes: ['id', 'name', 'email', 'role'] }), [] as any[]);
  const porId = new Map<string, Persona>(usuarios.map((u) => [String(u.id), { id: String(u.id), nombre: String(u.name || u.email || u.id), email: u.email ?? null, rol: u.role ?? null }]));
  const persona = (id: unknown): Persona | null => (id ? porId.get(String(id)) ?? { id: String(id), nombre: `usuario ${String(id).slice(0, 8)}… (ya no existe)`, email: null, rol: null } : null);

  const movimientos: MovimientoDeSaldo[] = movimientosCrudos.map((m) => {
    const meta = m.metadata || {};
    const origen = meta.origen ?? null;
    return {
      id: String(m.id),
      fecha: iso(m.createdAt) || '',
      tipo: String(m.type),
      monto: Number(m.amount) || 0,
      estado: String(m.status),
      descripcion: String(m.description || ''),
      usuario: persona(m.userId),
      origen,
      hechoPor: meta.actor ? { tipo: meta.actor.tipo ?? null, persona: persona(meta.actor.id) } : null,
      saldoAntes: Number(m.balanceBefore) || 0,
      saldoDespues: Number(m.balanceAfter) || 0,
      pagoId: meta.pagoId ?? null,
      // «Sin pago detrás» = la publicación no tiene ningún pago registrado (el asiento viejo puede no anotarlo aunque exista).
      sinPago: m.type === 'refund' && esDevolucionDeLaPublicacion(meta) && !meta.pagoId && !job.publicationPaymentId,
      publicacionId: meta.jobId ?? (meta.relatedModel === 'Job' ? meta.relatedId ?? null : null) ?? meta.corrigeLaPublicacion ?? null,
    };
  });

  // Un descuento de saldo por esta publicación = se pagó con saldo.
  // Un ajuste manual (corrección) no es un pago con saldo.
  const pagadaConSaldo = movimientos.some((m) => m.tipo === 'adjustment' && m.estado === 'completed' && m.origen !== 'ajuste_manual' && m.publicacionId === String(jobId));
  const corregidoAMano = r2(movimientos.filter((m) => m.origen === 'ajuste_manual' && m.estado === 'completed' && m.monto < 0).reduce((s, m) => s + Math.abs(m.monto), 0));
  // Solo la devolución de la publicación cancelada: otras (un trabajador que no está disponible, un contrato cancelado) se respaldan con el pago del contrato.
  const devoluciones = movimientos.filter((m, i) => m.tipo === 'refund' && m.estado === 'completed' && esDevolucionDeLaPublicacion(movimientosCrudos[i]?.metadata));
  // Lo que se le devolvió a este dueño por esta publicación pero todavía no es saldo (a favor pendiente): no cuenta como devuelto hasta liquidarse.
  const pendientes = movimientos
    .map((m, i) => ({ m, meta: (movimientosCrudos[i]?.metadata || {}) as Record<string, any> }))
    .filter(({ m, meta }) => m.tipo === 'refund' && m.estado === 'pending' && meta.pendienteDeLiquidacion === true && m.publicacionId === String(jobId))
    .map(({ m, meta }) => ({ monto: m.monto, disponibleDesde: meta.disponibleDesde ? String(meta.disponibleDesde) : null }));

  const dueno = persona(job.clientId);
  const elegidos = Array.isArray(job.selectedWorkers) ? job.selectedWorkers.length : 0;
  const reprogramada = job.rescheduledFrom && (job.rescheduledFrom.startDate || job.rescheduledFrom.endDate) ? job.rescheduledFrom : null;

  const pago = pagoRegistrado
    ? {
        id: String(pagoRegistrado.id),
        monto: Number(pagoRegistrado.amount) || 0,
        moneda: String(pagoRegistrado.currency || 'ARS'),
        estado: String(pagoRegistrado.status),
        medio: String(pagoRegistrado.paymentMethod || ''),
        mercadoPago: { id: pagoRegistrado.mercadopagoPaymentId ?? null, estado: pagoRegistrado.mercadopagoStatus ?? null },
        confirmadoPor: quienConfirmoElPago(pagoRegistrado),
        pagador: persona(pagoRegistrado.payerId),
        aprobadoPor: persona(pagoRegistrado.approvedBy ?? pagoRegistrado.escrowVerifiedBy),
        aprobadoPorElPagador: !!(pagoRegistrado.approvedBy ?? pagoRegistrado.escrowVerifiedBy) && String(pagoRegistrado.approvedBy ?? pagoRegistrado.escrowVerifiedBy) === String(pagoRegistrado.payerId),
        esManual: (quienConfirmoElPago(pagoRegistrado) ?? '').startsWith('por un administrador'),
        aprobadoEl: iso(pagoRegistrado.approvedAt ?? pagoRegistrado.escrowVerifiedAt),
        comision: Number(pagoRegistrado.platformFee) || 0,
        devuelto: Number(pagoRegistrado.refundedAmount) || 0,
        creadoEl: iso(pagoRegistrado.createdAt),
        pagadoEl: iso(pagoRegistrado.paidAt),
      }
    : null;

  const publicacion: ExpedienteDePublicacion['publicacion'] = {
    id: String(job.id),
    titulo: String(job.title),
    estado: String(job.status),
    precio: Number(job.price) || 0,
    modoDePrecio: job.pricingMode ?? null,
    trabajadoresPedidos: Number(job.maxWorkers) || 1,
    trabajadoresElegidos: elegidos,
    puedeEmpezarConMenos: job.partialStartAllowed !== false,
    inicio: iso(job.startDate),
    fin: iso(job.endDate),
    creadaEl: iso(job.createdAt),
    dueno,
    figuraPagada: job.publicationPaid === true,
    pagadaEl: iso(job.publicationPaidAt),
    pagoId: job.publicationPaymentId ? String(job.publicationPaymentId) : null,
    pagadaConSaldo,
    creditoVinculado: Number(job.publicationCredit) || 0,
    revisadaPor: persona(job.reviewedBy),
    revisadaEl: iso(job.reviewedAt),
    motivoDeRechazo: job.rejectedReason ?? null,
    pausadaPorAdmin: job.pausedByAdmin === true,
    reprogramadaDesde: reprogramada ? { inicio: iso(reprogramada.startDate), fin: iso(reprogramada.endDate), el: reprogramada.at ?? null } : null,
    canceladaPor: persona(job.cancelledById),
    canceladaComo: job.cancelledByRole ?? null,
    canceladaEl: iso(job.cancelledAt),
    motivoDeCancelacion: job.cancellationReason ?? null,
    cancelacionDefinitiva: job.permanentlyCancelled === true,
  };

  const alertas = alertasDeLaPublicacion({
    estado: publicacion.estado,
    precio: publicacion.precio,
    figuraPagada: publicacion.figuraPagada,
    pagoId: publicacion.pagoId,
    pagadaConSaldo,
    creditoVinculado: publicacion.creditoVinculado,
    pausadaPorAdmin: publicacion.pausadaPorAdmin,
    reprogramada: !!reprogramada,
    duenoNombre: dueno?.nombre ?? null,
    pago: pago ? { monto: pago.monto, moneda: pago.moneda, estado: pago.estado, medio: pago.medio, aprobadoPorElPagador: pago.aprobadoPorElPagador, esManual: pago.esManual } : null,
    devoluciones: devoluciones.map((d) => ({ monto: d.monto, pagoId: d.pagoId })),
    corregidoAMano,
    pendientes,
  });

  const contratosSalida = contratos.map((c) => ({
    id: String(c.id),
    estado: String(c.status),
    trabajador: persona(c.doerId),
    precio: Number(c.price) || 0,
    comision: Number(c.commission) || 0,
    total: Number(c.totalPrice) || 0,
    pago: String(c.paymentStatus || ''),
    garantia: String(c.escrowStatus || ''),
    confirmoElDueno: c.clientConfirmed === true,
    confirmoElTrabajador: c.doerConfirmed === true,
    inicio: iso(c.startDate),
    fin: iso(c.endDate),
    creadoEl: iso(c.createdAt),
    canceladoPor: persona(c.cancelledBy),
    motivoDeCancelacion: c.cancellationReason ?? null,
  }));

  const porEstado: Record<string, number> = {};
  for (const p of postulaciones) porEstado[String(p.status)] = (porEstado[String(p.status)] || 0) + 1;

  const auditoria = auditoriaCruda.map((a) => ({
    fecha: iso(a.createdAt) || '',
    accion: String(a.action),
    descripcion: String(a.description || ''),
    gravedad: String(a.severity || 'low'),
    quien: a.performedBy ? persona(a.performedBy)?.nombre ?? null : a.actor ?? null,
    sobre: a.targetModel === 'Payment' ? 'Pago' : a.targetModel === 'Contract' ? 'Contrato' : 'Publicación',
  }));

  // La cronología: todo en orden de fecha, con quién lo hizo.
  const linea: EventoDeLaLinea[] = [];
  const evento = (fecha: string | null, e: Omit<EventoDeLaLinea, 'fecha'>) => {
    if (fecha) linea.push({ fecha, ...e });
  };
  evento(publicacion.creadaEl, { tipo: 'publicacion', titulo: 'Publicación creada', quien: dueno?.nombre ?? null, monto: publicacion.precio });
  evento(publicacion.pagadaEl, { tipo: 'publicacion', titulo: 'Quedó marcada como pagada', detalle: publicacion.pagoId ? `pago ${publicacion.pagoId.slice(0, 8)}…` : 'sin pago registrado' });
  evento(publicacion.revisadaEl, { tipo: 'publicacion', titulo: 'Revisada por un administrador', quien: publicacion.revisadaPor?.nombre ?? null });
  evento(publicacion.reprogramadaDesde?.el ?? null, { tipo: 'publicacion', titulo: 'Reprogramada', detalle: 'cambiaron las fechas' });
  evento(publicacion.canceladaEl, {
    tipo: 'publicacion',
    titulo: 'Cancelada',
    quien: publicacion.canceladaPor?.nombre ?? (publicacion.canceladaComo ? `(${publicacion.canceladaComo})` : null),
    detalle: publicacion.motivoDeCancelacion ?? undefined,
  });
  if (pago) {
    evento(pago.creadoEl, { tipo: 'pago', titulo: `Pago registrado (${pago.estado})`, monto: pago.monto, detalle: pago.medio });
    evento(pago.aprobadoEl, { tipo: 'pago', titulo: 'Pago aprobado', quien: pago.aprobadoPor?.nombre ?? null });
  }
  for (const m of movimientos) {
    evento(m.fecha, {
      tipo: 'saldo',
      titulo: `${m.tipo === 'refund' ? 'Devolución' : m.origen === 'ajuste_manual' ? 'Ajuste manual (corrección)' : m.tipo === 'adjustment' ? 'Descuento de saldo' : m.tipo === 'payment' ? 'Pago al trabajador' : m.tipo === 'withdrawal' ? 'Retiro' : 'Movimiento de saldo'}${m.sinPago ? ' (sin pago detrás)' : ''}`,
      detalle: m.descripcion,
      quien: m.hechoPor?.persona?.nombre ?? m.hechoPor?.tipo ?? null,
      monto: m.monto,
    });
  }
  for (const c of contratosSalida) evento(c.creadoEl, { tipo: 'contrato', titulo: `Contrato creado (${c.estado})`, quien: c.trabajador?.nombre ?? null, monto: c.precio });
  for (const a of auditoria) evento(a.fecha, { tipo: 'auditoria', titulo: a.accion, detalle: a.descripcion, quien: a.quien });
  linea.sort((x, y) => x.fecha.localeCompare(y.fecha));

  return {
    publicacion,
    pago,
    pagosDeContratos: pagosDeContratos.map((p) => ({
      id: String(p.id),
      contratoId: p.contractId ? String(p.contractId) : null,
      monto: Number(p.amount) || 0,
      moneda: String(p.currency || 'ARS'),
      estado: String(p.status),
      tipo: String(p.paymentType),
      creadoEl: iso(p.createdAt),
    })),
    movimientos,
    contratos: contratosSalida,
    postulaciones: { total: postulaciones.length, porEstado },
    auditoria,
    linea,
    alertas,
    avisos,
  };
}
