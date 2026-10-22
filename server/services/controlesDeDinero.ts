import { CATALOGO_DE_PROBLEMAS, problemaDelCatalogo, rutaDeLaGuia, type CodigoDeProblema, type ProblemaDeDinero } from '../../shared/errores/catalogoDeProblemas.js';
import { componentesDelPago } from './payoutAmount.js';
import { DEVOLUCION_QUE_PIDE_DUENO_ARS } from '../../shared/constants/topesDeDinero.js';

/**
 * Controles de dinero: lo que se comprueba ANTES de mover plata, y no después.
 *
 * Dos clases de comprobación:
 *
 *  1. `controlarPagoOriginal` — antes de acreditar saldo o devolver por la pasarela por una cancelación, que el pago que lo justifica
 *     exista, sea del cliente y de ESA publicación, haya sido confirmado (solo o por un administrador), cierre en monto, moneda y fecha, no
 *     esté en disputa ni ya devuelto, y —si sale por Mercado Pago— que Mercado Pago lo confirme ahora mismo. Una devolución es plata que sale
 *     de la plataforma: «me dijeron que pagué» no alcanza.
 *
 *  2. `comprobarSaldoContraLibro` — antes de mover el saldo de un usuario, que su saldo sea la suma de sus asientos. Si alguien lo tocó sin
 *     asiento, mover plata encima agranda un problema que después nadie puede reconstruir.
 *
 * Todo vuelve con los números exactos (esperado / encontrado) y con un código del catálogo (`shared/errores/catalogoDeProblemas.ts`) que
 * lleva a la guía del admin.
 */

/** Mercado Pago solo permite devolver dentro de los 180 días del pago. */
export const DIAS_MAXIMOS_PARA_DEVOLVER = 180;
/** Un cliente con tantas devoluciones en 30 días pasa a revisión de una persona: es el patrón de «publicar y cancelar». */
export const DEVOLUCIONES_QUE_PIDEN_REVISION = 3;
const TOLERANCIA = 0.01;

const r2 = (n: number) => Math.round(n * 100) / 100;
const $ = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Un error de dinero con código: lleva a la guía y trae los números del caso. */
export class ErrorDeDinero extends Error {
  readonly codigo: CodigoDeProblema;
  readonly detalle: string;
  constructor(codigo: CodigoDeProblema, detalle: string) {
    super(`[${codigo}] ${detalle}`);
    this.name = 'ErrorDeDinero';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export interface Control {
  id: string;
  titulo: string;
  ok: boolean;
  /** Si falla, frena el movimiento. Los que no son bloqueantes quedan anotados como advertencia. */
  bloqueante: boolean;
  /** 'recepcion': ¿llegó el dinero? 'devolucion': ¿se puede devolver por el medio de pago? */
  grupo: 'recepcion' | 'devolucion';
  esperado?: string;
  encontrado?: string;
}

export interface PagoParaControlar {
  id?: string;
  payerId?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  paymentType?: string | null;
  paymentMethod?: string | null;
  platformFee?: number | string | null;
  processingCharge?: number | string | null;
  mercadopagoPaymentId?: string | null;
  mercadopagoStatus?: string | null;
  mercadopagoVerifiedAt?: Date | string | null;
  astropayStatus?: string | null;
  paypalCaptureId?: string | null;
  approvedBy?: string | null;
  approvedAt?: Date | string | null;
  escrowVerifiedBy?: string | null;
  escrowVerifiedAt?: Date | string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
  refundedAmount?: number | string | null;
  disputeId?: string | null;
}

export interface MercadoPagoEnVivo {
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  transaction_amount_refunded?: number;
}

export interface DatosParaControlar {
  job: { id: string; clientId: string; price: number | string; publicationPaymentId?: string | null; publicationPaid?: boolean | null };
  pago: PagoParaControlar | null;
  /** Lo que se va a acreditar como saldo o devolver (el monto del cliente en la liquidación). */
  monto: number;
  destino: 'saldo' | 'medio';
  ahora?: Date;
  canceladoEl?: Date | null;
  /** Lo que respondió Mercado Pago al consultarlo ahora. undefined = no se consultó; null = se consultó y falló. */
  mpEnVivo?: MercadoPagoEnVivo | null;
  devolucionesRecientesDelCliente?: number;
  /**
   * Hay un descuento de saldo del cliente por ESTA publicación (se pagó con saldo). Una publicación «pagada» sin registro de pago NI descuento
   * de saldo no se cobró (contrato libre de comisión, de prueba, cargada a mano): no hay plata que devolver.
   */
  pagadaConSaldo?: boolean;
}

export interface ResultadoDeControles {
  /** Ningún control bloqueante falló. */
  aprobado: boolean;
  /** El dinero está confirmado como recibido: se puede acreditar como saldo aunque falle algo de la devolución. */
  recibioElDinero: boolean;
  controles: Control[];
  fallidos: Control[];
}

const ESTADOS_CON_DINERO_RECIBIDO = new Set([
  'completed', 'held_escrow', 'awaiting_confirmation', 'confirmed_for_payout', 'verified', 'approved',
]);

function fechaDe(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Quién confirmó el pago, en palabras. null si nadie. */
export function quienConfirmoElPago(p: PagoParaControlar): string | null {
  if (p.mercadopagoStatus === 'approved') return 'automáticamente por Mercado Pago';
  if (String(p.astropayStatus || '').toLowerCase() === 'approved') return 'automáticamente por AstroPay';
  if (p.paypalCaptureId) return 'automáticamente por PayPal';
  if (p.approvedBy) return `por un administrador (${p.approvedBy}) el ${fechaDe(p.approvedAt)?.toLocaleDateString('es-AR') || 'sin fecha'}`;
  if (p.escrowVerifiedBy) return `por un administrador (${p.escrowVerifiedBy}) el ${fechaDe(p.escrowVerifiedAt)?.toLocaleDateString('es-AR') || 'sin fecha'}`;
  return null;
}

export function controlarPagoOriginal(d: DatosParaControlar): ResultadoDeControles {
  const ahora = d.ahora ?? new Date();
  const controles: Control[] = [];
  const add = (c: Control) => controles.push(c);
  const { job, pago, monto, destino } = d;

  // Pagos que no pasaron por un registro de pago: publicadas con saldo o sin cobro. No hay a quién devolver por el medio de pago, y el
  // saldo solo se acredita si el trabajo figura como pagado.
  if (!pago) {
    add({
      id: 'pago_registrado',
      titulo: 'La publicación tiene un pago registrado',
      grupo: 'recepcion',
      // Sin registro de pago solo se devuelve si el libro muestra que el cliente la pagó con su saldo: «pagada» a secas no es plata recibida.
      ok: !job.publicationPaymentId && job.publicationPaid === true && d.pagadaConSaldo === true,
      bloqueante: true,
      esperado: job.publicationPaymentId ? 'el pago de la publicación' : 'un descuento de saldo del cliente por esta publicación',
      encontrado: job.publicationPaymentId ? 'no se encontró el pago' : job.publicationPaid ? (d.pagadaConSaldo ? 'pagada con saldo' : 'figura pagada pero no hay pago ni descuento de saldo: no se cobró') : 'la publicación no figura como pagada',
    });
    return resumir(controles);
  }

  const total = r2(Number(pago.amount) || 0);
  const devuelto = r2(Number(pago.refundedAmount) || 0);

  add({
    id: 'pago_de_esta_publicacion',
    titulo: 'El pago es de esta publicación',
    grupo: 'recepcion',
    ok: !!pago.id && String(job.publicationPaymentId || '') === String(pago.id) && (pago.paymentType ?? 'job_publication') === 'job_publication',
    bloqueante: true,
    esperado: `pago ${job.publicationPaymentId || '(ninguno)'} de tipo job_publication`,
    encontrado: `pago ${pago.id || '(sin id)'} de tipo ${pago.paymentType || 'sin tipo'}`,
  });

  add({
    id: 'pago_del_cliente',
    titulo: 'El pago lo hizo el mismo cliente que cancela',
    grupo: 'recepcion',
    ok: String(pago.payerId || '') === String(job.clientId),
    bloqueante: true,
    esperado: `cliente ${job.clientId}`,
    encontrado: `pagador ${pago.payerId || '(ninguno)'}`,
  });

  const estado = String(pago.status || '');
  add({
    id: 'pago_con_dinero_recibido',
    titulo: 'El pago está en un estado de dinero recibido',
    grupo: 'recepcion',
    ok: ESTADOS_CON_DINERO_RECIBIDO.has(estado) || (estado === 'refunded' && devuelto <= 0),
    bloqueante: true,
    esperado: [...ESTADOS_CON_DINERO_RECIBIDO].join(' / '),
    encontrado: estado || 'sin estado',
  });

  const quien = quienConfirmoElPago(pago);
  add({
    id: 'pago_confirmado',
    titulo: 'Alguien confirmó el pago (solo, o un administrador)',
    grupo: 'recepcion',
    ok: quien !== null,
    bloqueante: true,
    esperado: 'confirmación automática o de un administrador',
    encontrado: quien ?? 'nadie lo confirmó',
  });

  add({
    id: 'moneda',
    titulo: 'El pago es en pesos',
    grupo: 'recepcion',
    ok: String(pago.currency || 'ARS').toUpperCase() === 'ARS',
    bloqueante: true,
    esperado: 'ARS',
    encontrado: String(pago.currency || 'sin moneda'),
  });

  add({
    id: 'no_supera_lo_pagado',
    titulo: 'Lo que se devuelve no supera lo que pagó el cliente',
    grupo: 'recepcion',
    ok: monto <= total - devuelto + TOLERANCIA,
    bloqueante: true,
    esperado: `hasta ${$(total - devuelto)} (pagó ${$(total)}${devuelto > 0 ? `, ya devuelto ${$(devuelto)}` : ''})`,
    encontrado: $(monto),
  });

  // Fecha: el pago no puede ser del futuro ni posterior a la cancelación.
  const fechaDelPago = fechaDe(pago.paidAt) ?? fechaDe(pago.approvedAt) ?? fechaDe(pago.createdAt);
  const cincoMin = 5 * 60 * 1000;
  const enElFuturo = fechaDelPago ? fechaDelPago.getTime() > ahora.getTime() + cincoMin : false;
  const despuesDeCancelar = fechaDelPago && d.canceladoEl ? fechaDelPago.getTime() > d.canceladoEl.getTime() + cincoMin : false;
  add({
    id: 'fecha_coherente',
    titulo: 'La fecha del pago es anterior a la cancelación',
    grupo: 'recepcion',
    ok: !!fechaDelPago && !enElFuturo && !despuesDeCancelar,
    bloqueante: true,
    esperado: 'una fecha pasada, anterior a la cancelación',
    encontrado: fechaDelPago ? fechaDelPago.toLocaleString('es-AR') : 'el pago no tiene fecha',
  });

  add({
    id: 'sin_disputa',
    titulo: 'El pago no está en disputa ni en contracargo',
    grupo: 'recepcion',
    ok: !pago.disputeId && estado !== 'disputed',
    bloqueante: true,
    esperado: 'sin disputa',
    encontrado: pago.disputeId ? `disputa ${pago.disputeId}` : estado === 'disputed' ? 'en disputa' : 'sin disputa',
  });

  // El monto tiene que cerrar con el desglose (precio + comisión + IVA + procesamiento). Solo advierte en saldo; frena la devolución
  // por el medio de pago, donde equivocarse cuesta plata real.
  const precio = Number(job.price) || 0;
  const { comision, procesamiento } = componentesDelPago(pago as any, precio);
  const ivaImplicito = r2(total - precio - comision - procesamiento);
  const ivaMaximo = r2((comision + procesamiento) * 0.21 + 1);
  add({
    id: 'monto_cierra_con_el_desglose',
    titulo: 'El monto pagado cierra con precio + comisión + IVA + procesamiento',
    grupo: 'recepcion',
    ok: ivaImplicito >= -1 && ivaImplicito <= ivaMaximo,
    bloqueante: destino === 'medio',
    esperado: `total entre ${$(precio + comision + procesamiento - 1)} y ${$(precio + comision + procesamiento + ivaMaximo)}`,
    encontrado: `total ${$(total)} (IVA implícito ${$(ivaImplicito)})`,
  });

  if (destino === 'medio') {
    const dias = fechaDelPago ? (ahora.getTime() - fechaDelPago.getTime()) / 86_400_000 : 0;
    add({
      id: 'dentro_del_plazo',
      titulo: `El pago tiene menos de ${DIAS_MAXIMOS_PARA_DEVOLVER} días`,
      grupo: 'devolucion',
      ok: dias <= DIAS_MAXIMOS_PARA_DEVOLVER,
      bloqueante: true,
      esperado: `hasta ${DIAS_MAXIMOS_PARA_DEVOLVER} días`,
      encontrado: `${Math.floor(dias)} días`,
    });

    add({
      id: 'medio_es_mercado_pago',
      titulo: 'El pago se hizo por Mercado Pago',
      grupo: 'devolucion',
      ok: String(pago.paymentMethod || '') === 'mercadopago' && !!pago.mercadopagoPaymentId,
      bloqueante: true,
      esperado: 'Mercado Pago con número de operación',
      encontrado: `${pago.paymentMethod || 'sin medio'}${pago.mercadopagoPaymentId ? '' : ' (sin número de operación)'}`,
    });

    if (d.mpEnVivo === null) {
      add({
        id: 'mercado_pago_confirma',
        titulo: 'Mercado Pago confirma el pago ahora mismo',
        grupo: 'devolucion',
        ok: false,
        bloqueante: false,
        esperado: 'estado approved con el mismo importe',
        encontrado: 'no se pudo consultar a Mercado Pago',
      });
    } else if (d.mpEnVivo) {
      const mp = d.mpEnVivo;
      const importeMp = r2(Number(mp.transaction_amount) || 0);
      const devueltoMp = r2(Number(mp.transaction_amount_refunded) || 0);
      add({
        id: 'mercado_pago_confirma',
        titulo: 'Mercado Pago confirma el pago ahora mismo',
        grupo: 'devolucion',
        ok:
          mp.status === 'approved' &&
          Math.abs(importeMp - total) <= TOLERANCIA &&
          String(mp.currency_id || 'ARS').toUpperCase() === 'ARS' &&
          devueltoMp <= TOLERANCIA,
        bloqueante: true,
        esperado: `approved, ${$(total)}, ARS, sin devoluciones`,
        encontrado: `${mp.status || 'sin estado'}, ${$(importeMp)}, ${mp.currency_id || 'sin moneda'}, devuelto ${$(devueltoMp)}`,
      });
    }

    add({
      id: 'monto_no_pide_al_dueno',
      titulo: `La devolución no supera ${$(DEVOLUCION_QUE_PIDE_DUENO_ARS)} (por encima, la aprueba el dueño)`,
      grupo: 'devolucion',
      ok: monto <= DEVOLUCION_QUE_PIDE_DUENO_ARS,
      bloqueante: true,
      esperado: `hasta ${$(DEVOLUCION_QUE_PIDE_DUENO_ARS)} sin aprobación del dueño`,
      encontrado: $(monto),
    });

    const recientes = d.devolucionesRecientesDelCliente ?? 0;
    add({
      id: 'ritmo_de_devoluciones',
      titulo: 'El cliente no viene pidiendo devoluciones seguidas',
      grupo: 'devolucion',
      ok: recientes < DEVOLUCIONES_QUE_PIDEN_REVISION,
      bloqueante: true,
      esperado: `menos de ${DEVOLUCIONES_QUE_PIDEN_REVISION} en 30 días`,
      encontrado: `${recientes} en los últimos 30 días`,
    });
  }

  return resumir(controles);
}

function resumir(controles: Control[]): ResultadoDeControles {
  const fallidos = controles.filter((c) => !c.ok);
  const recepcion = controles.filter((c) => c.grupo === 'recepcion' && c.bloqueante);
  return {
    aprobado: !fallidos.some((c) => c.bloqueante),
    recibioElDinero: recepcion.every((c) => c.ok),
    controles,
    fallidos,
  };
}

/** El texto de un control fallido, para el aviso a administración. */
export function describirControl(c: Control): string {
  return `${c.titulo}: esperaba ${c.esperado ?? '—'}, encontré ${c.encontrado ?? '—'}`;
}

export function problemaDesdeControles(codigo: CodigoDeProblema, r: ResultadoDeControles, prefijo?: string): ProblemaDeDinero {
  return {
    codigo,
    detalle: `${prefijo ? `${prefijo}. ` : ''}${r.fallidos.map(describirControl).join(' | ')}`,
    controles: r.controles.map(({ id, titulo, ok, bloqueante, esperado, encontrado }) => ({ id, titulo, ok, bloqueante, esperado, encontrado })),
  };
}

export const textoDelProblema = (p: ProblemaDeDinero): string => `[${p.codigo}] ${p.detalle}`;

/* ------------------------------------------------------------------------------------------------------------------------------ *
 * Saldo contra libro
 * ------------------------------------------------------------------------------------------------------------------------------ */

export interface SaldoContraLibro {
  cierra: boolean;
  saldo: number;
  libro: number;
  diferencia: number;
}

/** El saldo tiene que ser la suma de los asientos completados. Se llama dentro de la transacción que ya bloqueó al usuario. */
export async function comprobarSaldoContraLibro(userId: string, saldo: number, transaction?: any): Promise<SaldoContraLibro> {
  const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;
  // Los asientos `fueraDelSaldo` son historial de plata que se pagó por fuera (transferencia manual del administrador): no mueven el saldo.
  const { Op, literal } = await import('sequelize');
  const suma = await (BalanceTransaction as any).sum('amount', {
    where: { [Op.and]: [{ userId, status: 'completed' }, literal(`COALESCE(metadata->>'fueraDelSaldo', 'false') <> 'true'`)] },
    transaction,
  });
  const libro = r2(Number(suma) || 0);
  const s = r2(Number(saldo) || 0);
  const diferencia = r2(s - libro);
  return { cierra: Math.abs(diferencia) < TOLERANCIA, saldo: s, libro, diferencia };
}

export const detalleDeSaldoContraLibro = (userId: string, r: SaldoContraLibro): string =>
  `usuario ${userId}: saldo ${$(r.saldo)}, suma de movimientos ${$(r.libro)}, diferencia ${$(r.diferencia)}`;

/* ------------------------------------------------------------------------------------------------------------------------------ *
 * Aviso a administración
 * ------------------------------------------------------------------------------------------------------------------------------ */

/**
 * Avisa a los administradores de un problema de dinero, con el código que lleva a la guía y los números exactos. No lanza: avisar es
 * importante, pero no puede tumbar lo que ya se hizo.
 */
export async function avisarProblemasDeDinero(
  problemas: ProblemaDeDinero[],
  contexto: { titulo: string; relatedModel?: string; relatedId?: string; userId?: string; actor?: string },
): Promise<void> {
  if (problemas.length === 0) return;
  try {
    const { User } = await import('../models/sql/User.model.js');
    const { Notification } = await import('../models/sql/Notification.model.js');
    const { DONDE_ES_ADMIN } = await import('../utils/admins.js');
    const { logMoneyEvent } = await import('../utils/auditLog.js');

    const principal = problemas[0];
    const guia = rutaDeLaGuia(principal.codigo);
    const lineas = problemas.map((p) => `• ${problemaDelCatalogo(p.codigo)?.titulo ?? p.codigo} (${p.codigo}): ${p.detalle}`).join('\n');

    const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN }, attributes: ['id'] });
    for (const admin of admins) {
      await Notification.create({
        recipientId: admin.id,
        type: 'error',
        category: 'admin',
        title: contexto.titulo,
        message: `${lineas}\n\nQué hacer: abrí la guía de ${principal.codigo}.`,
        relatedModel: contexto.relatedModel,
        relatedId: contexto.relatedId,
        actionUrl: guia,
        actionText: 'Ver la guía',
        sentVia: ['in_app'],
      } as any).catch(() => { /* si una notificación falla, quedan las otras y el libro */ });
    }

    await logMoneyEvent({
      action: 'PROBLEMA_DE_DINERO',
      actor: contexto.actor ?? 'sistema',
      severity: problemas.some((p) => problemaDelCatalogo(p.codigo)?.gravedad === 'alta') ? 'high' : 'medium',
      description: `${contexto.titulo}. ${problemas.map(textoDelProblema).join(' | ')}`,
      userId: contexto.userId,
      metadata: { problemas, relatedModel: contexto.relatedModel, relatedId: contexto.relatedId, guia },
    });
  } catch (e: any) {
    console.error('[controlesDeDinero] no se pudo avisar a administración:', e?.message);
  }
}

/** Para los tests: todos los códigos que el servidor puede emitir tienen que estar en el catálogo. */
export const CODIGOS_DEL_CATALOGO = Object.keys(CATALOGO_DE_PROBLEMAS);

/**
 * Cómo se contesta un ErrorDeDinero. Al usuario: qué le pasó a SU plata, sin jerga y con el código para citarlo. Al admin: el título del
 * problema con los números exactos y el enlace a la guía. Devuelve null si el error es de otra cosa.
 */
export function respuestaDeErrorDeDinero(e: unknown, paraAdmin: boolean): { status: number; body: Record<string, unknown> } | null {
  if (!(e instanceof ErrorDeDinero)) return null;
  const p = problemaDelCatalogo(e.codigo);
  return {
    status: 409,
    body: {
      success: false,
      code: e.codigo,
      message: paraAdmin ? `${p?.titulo ?? e.codigo}. ${e.detalle}` : `${p?.paraElUsuario ?? 'No pudimos completar la operación.'} (código ${e.codigo})`,
      detalle: e.detalle,
      ...(paraAdmin ? { guia: rutaDeLaGuia(e.codigo) } : {}),
    },
  };
}

/**
 * Lo que se le dice al USUARIO de cada problema: el texto del catálogo pensado para él, sin números internos ni nombres de campos. El
 * detalle exacto va solo a administración.
 */
export interface AvisoParaElUsuario {
  codigo: string;
  mensaje: string;
  gravedad: 'alta' | 'media' | 'baja';
}

export function avisosParaElUsuario(problemas: ProblemaDeDinero[]): AvisoParaElUsuario[] {
  const vistos = new Set<string>();
  const avisos: AvisoParaElUsuario[] = [];
  for (const p of problemas) {
    if (vistos.has(p.codigo)) continue;
    vistos.add(p.codigo);
    const c = problemaDelCatalogo(p.codigo);
    if (c) avisos.push({ codigo: c.codigo, mensaje: c.paraElUsuario, gravedad: c.gravedad });
  }
  return avisos;
}
