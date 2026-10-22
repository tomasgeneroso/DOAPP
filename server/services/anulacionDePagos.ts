import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Invoice } from '../models/sql/Invoice.model.js';
import BalanceTransaction from '../models/sql/BalanceTransaction.model.js';
import { quienConfirmoElPago } from './controlesDeDinero.js';
import { logMoneyEvent } from '../utils/auditLog.js';

/**
 * Anular un pago que figura como recibido pero cuyo dinero NUNCA entró (una transferencia aprobada a mano sin comprobar el banco, un pago de
 * prueba). Deja de contar como ingreso y como dinero recibido; sus facturas pasan a «void». Es la contracara de `ajustarSaldo`.
 *
 * No toca saldos: si ese pago ya había generado saldo a favor (una devolución al cancelar la publicación), lo avisa para que se descuente
 * antes con `ajustarSaldo --publicacion=...`. Lo que todavía es a favor PENDIENTE de liquidar (no llegó a ser saldo) sí se cancela junto con el pago:
 * esa plata nunca va a existir. No sirve para un pago confirmado por una pasarela (Mercado Pago, AstroPay, PayPal): ahí el
 * dinero entró de verdad y corresponde un reembolso (se rechaza, salvo `forzar`).
 */

const pesos = (n: unknown) => `$${(Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ResultadoDeLaAnulacion {
  pagoId: string;
  estadoAnterior: string;
  anulado: boolean;
  facturas: string[];
  /** Plata que esa publicación devolvió al saldo y todavía no se descontó con un ajuste manual. */
  faltaDescontar: number;
  /** Plata a favor PENDIENTE de liquidar que apuntaba a este pago y se cancela con él (o se cancelaría, en la vista previa). */
  aFavorPendienteCancelado: number;
  publicaciones: string[];
}

const persona = async (id?: string | null) => {
  if (!id) return '(nadie)';
  const u: any = await User.findByPk(id, { attributes: ['name', 'email'] });
  return u ? `${u.name} <${u.email}>` : `usuario ${id}`;
};

export async function anularPagoSinDinero(
  idDelPago: string,
  motivo: string,
  opciones: { aplicar: boolean; forzar?: boolean },
  escribir: (t: string) => void = console.log,
): Promise<ResultadoDeLaAnulacion> {
  if (!motivo || motivo.trim().length < 8) throw new Error('El motivo tiene que tener al menos 8 caracteres.');
  const pago: any = await Payment.findByPk(idDelPago);
  if (!pago) throw new Error(`No existe el pago ${idDelPago}`);

  escribir(`Pago ${pago.id}: ${pesos(pago.amount)} ${pago.currency} · ${pago.paymentType} · medio ${pago.paymentMethod} · estado ${pago.status}`);
  escribir(`   pagó: ${await persona(pago.payerId)}`);
  escribir(`   confirmación: ${quienConfirmoElPago(pago) ?? 'nadie'}${pago.approvedBy ? ` (aprobó ${await persona(pago.approvedBy)})` : ''}`);

  if ((quienConfirmoElPago(pago) ?? '').startsWith('automáticamente') && !opciones.forzar) {
    throw new Error('Este pago lo confirmó una pasarela: el dinero entró de verdad y corresponde un reembolso, no anularlo. (Con --forzar se anula igual.)');
  }
  if (['cancelled', 'failed', 'rejected'].includes(String(pago.status))) throw new Error(`El pago ya está ${pago.status}: no hay nada que anular.`);
  if (Number(pago.refundedAmount) > 0) throw new Error(`El pago ya tiene ${pesos(pago.refundedAmount)} reembolsados: resolvelo como reembolso.`);

  const trabajos: any[] = await Job.findAll({ where: { publicationPaymentId: String(pago.id) } as any, attributes: ['id', 'title', 'status', 'price'] });
  for (const j of trabajos) escribir(`   publicación: "${j.title}" (${j.status}, ${pesos(j.price)}) — ${j.id}`);

  // Si ya generó saldo a favor, hay que descontarlo antes: esto no toca saldos.
  const devueltas: any[] = await BalanceTransaction.findAll({
    where: { type: 'refund', status: 'completed', [Op.or]: [{ metadata: { pagoId: String(pago.id) } }, ...trabajos.map((j) => ({ metadata: { jobId: String(j.id) } }))] } as any,
    order: [['createdAt', 'ASC']],
  });
  const ajustes: any[] =
    trabajos.length === 0
      ? []
      : await BalanceTransaction.findAll({
          where: { type: 'adjustment', status: 'completed', [Op.or]: trabajos.map((j) => ({ metadata: { origen: 'ajuste_manual', corrigeLaPublicacion: String(j.id) } })) } as any,
        });
  const devuelto = devueltas.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const descontado = ajustes.reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);
  const faltaDescontar = Math.max(0, Math.round((devuelto - descontado) * 100) / 100);
  if (devuelto > 0) {
    escribir(`   saldo devuelto por esta publicación: ${pesos(devuelto)} · ya descontado con ajustes manuales: ${pesos(descontado)}`);
    if (faltaDescontar > 0.01) escribir(`   ⚠ Falta descontar ${pesos(faltaDescontar)}: usá ajustarSaldo --publicacion=<id> antes de anular el pago.`);
  }

  // A favor PENDIENTE que apunta a este pago o a sus publicaciones: todavía no es saldo, así que no hay nada que descontar; se cancela con el pago.
  const pendientes: any[] = await BalanceTransaction.findAll({
    where: {
      type: 'refund',
      status: 'pending',
      [Op.or]: [{ metadata: { pagoId: String(pago.id) } }, { metadata: { pagoOrigenId: String(pago.id) } }, ...trabajos.map((j) => ({ metadata: { jobId: String(j.id) } }))],
    } as any,
  });
  const aFavorPendienteCancelado = Math.round(pendientes.reduce((acc, m) => acc + (Number(m.amount) || 0), 0) * 100) / 100;
  if (aFavorPendienteCancelado > 0) escribir(`   a favor pendiente de liquidar que apunta a este pago: ${pesos(aFavorPendienteCancelado)} (se cancela junto con el pago: esa plata no llegó a ser saldo)`);

  const facturas: any[] = await Invoice.findAll({ where: { paymentId: String(pago.id) } as any, attributes: ['id', 'invoiceNumber', 'status', 'total'] });
  for (const f of facturas) escribir(`   factura ${f.invoiceNumber}: ${pesos(f.total)} (${f.status})`);

  escribir(`\nMotivo: ${motivo}`);
  escribir(`Se haría: el pago pasa a «cancelled»${facturas.length > 0 ? ` y ${facturas.length} factura(s) a «void»` : ''}${pendientes.length > 0 ? `, y ${pendientes.length} a favor pendiente(s) a «failed»` : ''}.`);
  if (facturas.some((f) => f.status !== 'void')) escribir('Ojo con las facturas: si ya se informaron a ARCA, consultá a tu contador por la nota de crédito.');

  const resultado: ResultadoDeLaAnulacion = {
    pagoId: String(pago.id),
    estadoAnterior: String(pago.status),
    anulado: false,
    facturas: facturas.map((f) => String(f.invoiceNumber)),
    faltaDescontar,
    aFavorPendienteCancelado,
    publicaciones: trabajos.map((j) => String(j.id)),
  };
  if (!opciones.aplicar) {
    escribir('\n(solo vista previa: falta --aplicar)');
    return resultado;
  }

  // Todo o nada: si una factura no se puede anular (por ejemplo, la base no deja escribir en `invoices`), el pago tampoco queda anulado. Sin
  // esto un error a mitad de camino dejaba el pago «cancelled» y la factura vigente.
  await sequelize.transaction(async (t) => {
    pago.status = 'cancelled';
    pago.adminNotes = [pago.adminNotes, `Anulado (sin dinero real): ${motivo}`].filter(Boolean).join(' | ');
    await pago.save({ transaction: t });
    for (const m of pendientes) {
      await m.update(
        { status: 'failed', metadata: { ...(m.metadata || {}), pendienteDeLiquidacion: false, cancelada: { motivo: `se anuló el pago ${pago.id}: ${motivo}`, el: new Date().toISOString() } } },
        { transaction: t },
      );
    }
    for (const f of facturas) {
      if (f.status !== 'void') {
        f.status = 'void';
        await f.save({ transaction: t });
      }
    }
  });
  await logMoneyEvent({
    action: 'PAYMENT_VOIDED',
    actor: 'script:anularPago',
    description: `Pago ${pago.id} anulado: ${motivo}`,
    severity: 'high',
    paymentId: String(pago.id),
    userId: String(pago.payerId),
    monto: Number(pago.amount),
    moneda: String(pago.currency),
    metadata: { motivo, facturasAnuladas: resultado.facturas, publicaciones: resultado.publicaciones, estadoAnterior: resultado.estadoAnterior },
  });
  escribir('\nHecho: pago anulado.');
  return { ...resultado, anulado: true };
}
