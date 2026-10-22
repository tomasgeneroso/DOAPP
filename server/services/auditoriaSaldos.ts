import { Op, literal } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { esDevolucionDeLaPublicacion } from './creditoDePublicacion.js';
import { quienConfirmoElPago } from './controlesDeDinero.js';

/**
 * Auditoría de saldos: las cosas que tienen que ser verdad siempre, y que
 * estuvieron rotas más de una vez sin que nadie lo viera.
 *
 * No arregla nada. Lista, con el número y el id, cada lugar donde la plata
 * no cierra, para que una persona lo mire. Correr esto es lo primero que hay
 * que hacer cuando alguien dice "me falta plata" y lo último antes de un
 * deploy que toque dinero.
 *
 * Los invariantes:
 *
 *   1. SALDO = LIBRO. El saldo de cada usuario es la suma de sus asientos
 *      completados. Si difieren, alguien tocó balanceArs sin asiento (o al
 *      revés). Hubo tres lugares que lo hacían.
 *
 *   2. NADA QUEDA 'pending' PARA SIEMPRE. Un asiento de devolución pendiente
 *      con más de un día es una promesa que no se cumplió.
 *
 *   3. PLATA SIN DUEÑO. Una publicación cancelada cuyo pago sigue retenido y
 *      no tiene ningún asiento de devolución: el cliente pagó, no hay
 *      trabajo, y nadie le devolvió nada.
 *
 *   4. NO SE PAGA DOS VECES. Un contrato con más de un asiento de pago al
 *      trabajador, o pagado y devuelto a la vez.
 *
 *   5. RETIROS QUE VACÍAN MÁS DE LO QUE HAY. Un retiro pendiente mayor que el
 *      saldo actual.
 *
 *   6. PLATA ACREDITADA SIN COBRO. Una devolución de una publicación que NO
 *      tiene ningún pago registrado ni descuento de saldo detrás (plata que
 *      nunca entró), o una publicación que figura pagada sin pago ni
 *      descuento de saldo (se devolvería al cancelarla).
 *
 *   7. PAGOS CONFIRMADOS A MANO POR QUIEN PAGÓ. Una transferencia que aprobó
 *      la misma cuenta que la hizo, sin pasarela: nadie más comprobó que el
 *      dinero entró. Es como un pago de prueba (caso «try», $431.956,80:
 *      transferencia aprobada por la propia cuenta, sin dinero real) llegó a
 *      devolverse al saldo.
 */

export interface Hallazgo {
  invariante: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  gravedad: 'alta' | 'media';
  titulo: string;
  detalle: string;
  /** Diferencia en pesos, si aplica. */
  monto?: number;
  userId?: string;
  jobId?: string;
  contractId?: string;
}

export interface ResultadoAuditoria {
  corridaEl: string;
  usuariosRevisados: number;
  hallazgos: Hallazgo[];
  resumen: Record<string, number>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function auditarSaldos(): Promise<ResultadoAuditoria> {
  const hallazgos: Hallazgo[] = [];

  // 1. Saldo = libro, por usuario con movimientos o con saldo.
  const asientos = await BalanceTransaction.findAll({
    attributes: ['userId', 'amount', 'status', 'type', 'createdAt', 'relatedContractId', 'metadata'],
    limit: 200_000,
  });
  const porUsuario = new Map<string, number>();
  const pendientes: any[] = [];
  const pagosPorContrato = new Map<string, number>();
  const devolucionesPorContrato = new Map<string, number>();
  const conAsientoDeDevolucion = new Set<string>();
  // Invariante 6: publicaciones pagadas con saldo (hay un descuento por ellas) y devoluciones por cancelación sin pago anotado
  const pagadasConSaldo = new Set<string>();
  const devolucionesSinPago: any[] = [];
  // Publicaciones cuya devolución sin cobro ya se corrigió con un ajuste manual (scripts/ajustarSaldo --publicacion=...)
  const corregidasAMano = new Set<string>();

  for (const a of asientos as any[]) {
    const uid = String(a.userId);
    if (a.status === 'completed') {
      porUsuario.set(uid, r2((porUsuario.get(uid) || 0) + (Number(a.amount) || 0)));
    } else if (a.status === 'pending' && a.type === 'refund') {
      pendientes.push(a);
    }
    const meta = a.metadata || {};
    const cid = a.relatedContractId ? String(a.relatedContractId) : (meta.relatedModel === 'Contract' && meta.relatedId ? String(meta.relatedId) : null);
    if (cid && a.status === 'completed') {
      if (a.type === 'payment') pagosPorContrato.set(cid, (pagosPorContrato.get(cid) || 0) + 1);
      if (a.type === 'refund') devolucionesPorContrato.set(cid, (devolucionesPorContrato.get(cid) || 0) + 1);
    }
    if (a.status === 'completed' && meta.origen === 'ajuste_manual' && meta.corrigeLaPublicacion) corregidasAMano.add(String(meta.corrigeLaPublicacion));
    if (a.type === 'adjustment' && meta.relatedModel === 'Job' && meta.relatedId && a.status === 'completed') pagadasConSaldo.add(String(meta.relatedId));
    if (a.type === 'refund' && a.status === 'completed' && esDevolucionDeLaPublicacion(meta) && !meta.pagoId) devolucionesSinPago.push(a);
    if (a.type === 'refund') {
      if (meta.relatedModel === 'Job' && meta.relatedId) conAsientoDeDevolucion.add(String(meta.relatedId));
      if (meta.jobId) conAsientoDeDevolucion.add(String(meta.jobId));
    }
  }

  const usuarios = await User.findAll({
    where: { [Op.or]: [{ id: { [Op.in]: [...porUsuario.keys()] } }, { balanceArs: { [Op.ne]: 0 } }] } as any,
    attributes: ['id', 'name', 'email', 'balanceArs'],
  });
  for (const u of usuarios as any[]) {
    const saldo = r2(Number(u.balanceArs) || 0);
    const libro = porUsuario.get(String(u.id)) || 0;
    if (Math.abs(saldo - libro) >= 0.01) {
      hallazgos.push({
        invariante: 1,
        gravedad: 'alta',
        titulo: 'El saldo no coincide con el libro',
        detalle: `${u.name} (${u.email}): saldo $${saldo.toLocaleString('es-AR')}, asientos $${libro.toLocaleString('es-AR')}.`,
        monto: r2(saldo - libro),
        userId: String(u.id),
      });
    }
  }

  // 2. Devoluciones 'pending' de más de un día.
  const hace1d = Date.now() - 86_400_000;
  for (const a of pendientes) {
    if (new Date(a.createdAt).getTime() < hace1d) {
      hallazgos.push({
        invariante: 2,
        gravedad: 'media',
        titulo: 'Devolución pendiente que nunca se completó',
        detalle: `Asiento de $${Number(a.amount).toLocaleString('es-AR')} del ${new Date(a.createdAt).toLocaleDateString('es-AR')} sigue en pending.`,
        monto: Number(a.amount),
        userId: String(a.userId),
      });
    }
  }

  // 3. Publicaciones canceladas con el pago retenido y sin devolución.
  const canceladas = await Job.findAll({
    where: { status: 'cancelled', publicationPaid: true } as any,
    attributes: ['id', 'title', 'clientId', 'price', 'publicationPaymentId', 'cancelledAt'],
    limit: 5000,
  });
  for (const j of canceladas as any[]) {
    if (conAsientoDeDevolucion.has(String(j.id))) continue;
    const pago = j.publicationPaymentId ? await Payment.findByPk(j.publicationPaymentId, { attributes: ['status', 'refundedAmount', 'amount'] }) : null;
    const devueltoPorMp = Number((pago as any)?.refundedAmount) || 0;
    if (pago && ['held_escrow', 'completed', 'awaiting_confirmation'].includes(String((pago as any).status)) && devueltoPorMp <= 0) {
      hallazgos.push({
        invariante: 3,
        gravedad: 'alta',
        titulo: 'Publicación cancelada con la plata trabada',
        detalle: `"${j.title}": pago de $${Number((pago as any).amount).toLocaleString('es-AR')} sigue ${(pago as any).status} y no hay asiento de devolución ni reembolso por MP.`,
        monto: Number((pago as any).amount),
        userId: String(j.clientId),
        jobId: String(j.id),
      });
    }
  }

  // 6. Plata acreditada sin cobro. Se juzga contra el pago REGISTRADO DE LA PUBLICACIÓN: los asientos viejos no anotan el pago aunque exista.
  const idsDeLasDevueltas = [...new Set(devolucionesSinPago.map((a) => String((a.metadata || {}).jobId || '')).filter(Boolean))];
  const conPagoRegistrado = new Set<string>(
    (idsDeLasDevueltas.length === 0
      ? []
      : ((await Job.findAll({ where: { id: { [Op.in]: idsDeLasDevueltas }, publicationPaymentId: { [Op.ne]: null } } as any, attributes: ['id'] })) as any[])
    ).map((j) => String(j.id)),
  );
  for (const a of devolucionesSinPago) {
    const jobId = String((a.metadata || {}).jobId || '');
    if (jobId && conPagoRegistrado.has(jobId)) continue; // la publicación sí tiene un pago registrado (se mira en el invariante 7)
    if (jobId && pagadasConSaldo.has(jobId)) continue; // pagada con saldo: es legítima
    if (jobId && corregidasAMano.has(jobId)) continue; // ya se descontó con un ajuste manual
    hallazgos.push({
      invariante: 6,
      gravedad: 'alta',
      titulo: 'Devolución sin pago registrado detrás',
      detalle: `Se acreditaron $${Number(a.amount).toLocaleString('es-AR')} por cancelar una publicación que no tiene pago registrado ni descuento de saldo: esa plata no entró. Revisá el asiento ${a.id || ''} y, si corresponde, descontalo con scripts/ajustarSaldo.`,
      monto: Number(a.amount),
      userId: String(a.userId),
      jobId: jobId || undefined,
    });
  }
  const pagadasSinRespaldo = await Job.findAll({
    where: { publicationPaid: true, publicationPaymentId: null, status: { [Op.notIn]: ['draft', 'pending_payment'] } } as any,
    attributes: ['id', 'title', 'clientId', 'price', 'status', 'pricingMode'],
    limit: 5000,
  });
  for (const j of pagadasSinRespaldo as any[]) {
    if (pagadasConSaldo.has(String(j.id)) || corregidasAMano.has(String(j.id))) continue;
    hallazgos.push({
      invariante: 6,
      gravedad: 'media',
      titulo: 'Publicación que figura pagada sin pago registrado',
      detalle: `"${j.title}" (${j.status}, $${Number(j.price).toLocaleString('es-AR')}) figura pagada pero no tiene pago ni descuento de saldo. Si se cancela no se devuelve nada (no hay plata que devolver). Puede ser una cotización pagada: revisá el pago.`,
      monto: Number(j.price) || 0,
      userId: String(j.clientId),
      jobId: String(j.id),
    });
  }

  // 7. Pagos confirmados a mano por la misma cuenta que pagó (sin pasarela que los verifique).
  const ESTADOS_CON_DINERO = ['completed', 'held_escrow', 'awaiting_confirmation', 'confirmed_for_payout', 'verified', 'approved'];
  const autoaprobados: any[] = await Payment.findAll({
    where: { [Op.and]: [{ approvedBy: { [Op.ne]: null } }, { status: { [Op.in]: ESTADOS_CON_DINERO } }, literal('"approved_by" = "payer_id"')] } as any,
    attributes: ['id', 'payerId', 'amount', 'currency', 'paymentType', 'paymentMethod', 'status', 'approvedBy', 'approvedAt', 'mercadopagoStatus', 'astropayStatus', 'paypalCaptureId', 'escrowVerifiedBy', 'escrowVerifiedAt'],
    order: [['approvedAt', 'DESC']],
    limit: 500,
  });
  const manuales = autoaprobados.filter((p) => (quienConfirmoElPago(p) ?? '').startsWith('por un administrador'));
  const publicacionesDeEsosPagos: any[] = manuales.length === 0 ? [] : await Job.findAll({ where: { publicationPaymentId: { [Op.in]: manuales.map((p) => String(p.id)) } } as any, attributes: ['id', 'title', 'publicationPaymentId'] });
  const trabajoDelPago = new Map<string, any>(publicacionesDeEsosPagos.map((j) => [String(j.publicationPaymentId), j]));
  for (const p of manuales) {
    const j = trabajoDelPago.get(String(p.id));
    hallazgos.push({
      invariante: 7,
      gravedad: 'media',
      titulo: 'Pago confirmado a mano por la misma persona que pagó',
      detalle: `${p.paymentType} de $${Number(p.amount).toLocaleString('es-AR')} ${p.currency} (${p.paymentMethod})${j ? ` de la publicación "${j.title}"` : ''}, aprobado el ${p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('es-AR') : 'sin fecha'} por la misma cuenta que lo hizo, sin pasarela. Confirmá en el banco que el dinero entró; si no, anulá el pago (scripts/anularPago).`,
      monto: Number(p.amount),
      userId: String(p.payerId),
      jobId: j ? String(j.id) : undefined,
    });
  }

  // 4. Contratos pagados dos veces, o pagados y devueltos.
  for (const [cid, n] of pagosPorContrato) {
    if (n > 1) {
      hallazgos.push({ invariante: 4, gravedad: 'alta', titulo: 'Contrato con más de un pago al trabajador', detalle: `${n} asientos de pago sobre el mismo contrato.`, contractId: cid });
    }
    if (devolucionesPorContrato.get(cid)) {
      const c = await Contract.findByPk(cid, { attributes: ['status', 'paymentStatus'] });
      // Una cancelacion tardia paga al trabajador Y devuelve al cliente: es la
      // unica combinacion legitima, y queda con paymentStatus refunded.
      if (c && String((c as any).paymentStatus) !== 'refunded' && String((c as any).paymentStatus) !== 'partially_refunded') {
        hallazgos.push({ invariante: 4, gravedad: 'alta', titulo: 'Contrato pagado y devuelto a la vez', detalle: `Hay pago al trabajador y devolución al cliente, y el contrato está ${(c as any).paymentStatus}.`, contractId: cid });
      }
    }
  }

  // 5. Retiros pendientes por más que el saldo.
  const retiros = await WithdrawalRequest.findAll({
    where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } } as any,
    attributes: ['id', 'userId', 'amount', 'balanceBeforeWithdrawal'],
  });
  for (const w of retiros as any[]) {
    const u = usuarios.find((x: any) => String(x.id) === String(w.userId)) as any;
    const saldo = u ? Number(u.balanceArs) || 0 : 0;
    if (Number(w.amount) > saldo + 0.01 && Number(w.balanceBeforeWithdrawal || 0) <= 0) {
      hallazgos.push({
        invariante: 5,
        gravedad: 'media',
        titulo: 'Retiro pendiente mayor que el saldo',
        detalle: `Retiro de $${Number(w.amount).toLocaleString('es-AR')} con saldo actual $${saldo.toLocaleString('es-AR')}.`,
        monto: Number(w.amount) - saldo,
        userId: String(w.userId),
      });
    }
  }

  const resumen: Record<string, number> = {};
  for (const h of hallazgos) resumen[`inv${h.invariante}`] = (resumen[`inv${h.invariante}`] || 0) + 1;

  return { corridaEl: new Date().toISOString(), usuariosRevisados: usuarios.length, hallazgos, resumen };
}
