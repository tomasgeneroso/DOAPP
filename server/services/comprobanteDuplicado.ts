import { Op, fn, col, where as donde } from 'sequelize';
import { PaymentProof } from '../models/sql/PaymentProof.model.js';
import { Payment } from '../models/sql/Payment.model.js';

/**
 * «Comprobante duplicado»: el mismo número de operación en pagos DISTINTOS.
 *
 * Regla del dueño (2026-11-07): si un administrador carga un comprobante cuyo número de operación ya figura en otro pago, el sistema lo
 * DEJA pasar (a veces es un error de tipeo, o una transferencia que cubre dos pagos) pero lo MARCA, para que quede a la vista de quien
 * revisa después. Antes no pasaba nada: ni se frenaba ni se marcaba, y la repetición solo se veía si el administrador se acordaba de
 * buscar el número.
 *
 * La marca NO se guarda aparte: se calcula al leer, comparando contra los pagos de hoy. Así nunca queda vieja (si el otro pago se rechaza
 * o se anula, la marca desaparece sola) y no hace falta una columna nueva. Lo que sí queda fijo es el rastro: la auditoría del pago y la
 * nota del comprobante dicen que, al aprobarlo, el número ya figuraba en otro pago.
 *
 * Qué cuenta: otro pago (nunca el mismo), un comprobante que no sea una nota ni esté rechazado, mismo número sin importar mayúsculas ni
 * espacios sobrantes.
 */

export interface OtroPagoConLaMismaReferencia {
  paymentId: string;
  estado: string | null;
  monto: number | null;
  fecha: string | null;
}

export interface ReferenciaRepetida {
  referencia: string;
  otrosPagos: OtroPagoConLaMismaReferencia[];
}

/** El número de operación como se compara: sin espacios de más y sin distinguir mayúsculas. */
export function normalizarReferencia(valor: unknown): string {
  return String(valor ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Texto corto para mostrarle a una persona (avisos, notas, auditoría). */
export function describirReferenciaRepetida(r: ReferenciaRepetida): string {
  const lista = r.otrosPagos
    .slice(0, 3)
    .map((p) => `${p.paymentId.slice(0, 8)}${p.estado ? ` (${p.estado})` : ''}`)
    .join(', ');
  const resto = r.otrosPagos.length > 3 ? ` y ${r.otrosPagos.length - 3} más` : '';
  return `Comprobante duplicado: el número de operación «${r.referencia}» ya figura en ${r.otrosPagos.length === 1 ? 'otro pago' : `${r.otrosPagos.length} pagos más`}: ${lista}${resto}.`;
}

/**
 * Para cada pago de la lista, qué otros pagos usan alguno de sus números de operación. Un pago sin repetición no aparece en el resultado.
 * Una sola consulta, sin importar cuántos pagos se miren.
 */
export async function referenciasRepetidas(
  proofs: Array<{ paymentId: string; bankReference?: string | null }>,
): Promise<Map<string, ReferenciaRepetida>> {
  const resultado = new Map<string, ReferenciaRepetida>();
  const buscadas = new Map<string, string>(); // normalizada → como la escribieron
  for (const p of proofs) {
    const n = normalizarReferencia(p.bankReference);
    if (n.length >= 3 && !buscadas.has(n)) buscadas.set(n, String(p.bankReference).trim());
  }
  if (buscadas.size === 0) return resultado;

  const iguales: any[] = await PaymentProof.findAll({
    where: {
      [Op.and]: [
        donde(fn('lower', fn('btrim', col('PaymentProof.bank_reference'))), { [Op.in]: [...buscadas.keys()] }),
        { status: { [Op.ne]: 'rejected' } },
        { kind: { [Op.ne]: 'note' } },
      ],
    } as any,
    include: [{ model: Payment, as: 'payment', attributes: ['id', 'status', 'amount'], required: true }],
    attributes: ['id', 'paymentId', 'bankReference', 'uploadedAt'],
    order: [['uploadedAt', 'DESC']],
    limit: 500,
  });

  for (const mia of proofs) {
    const n = normalizarReferencia(mia.bankReference);
    if (!buscadas.has(n)) continue;
    const otros = iguales.filter((i) => normalizarReferencia(i.bankReference) === n && String(i.paymentId) !== String(mia.paymentId));
    if (otros.length === 0) continue;
    const yaVistos = new Set<string>();
    const otrosPagos: OtroPagoConLaMismaReferencia[] = [];
    for (const o of otros) {
      const id = String(o.paymentId);
      if (yaVistos.has(id)) continue;
      yaVistos.add(id);
      otrosPagos.push({
        paymentId: id,
        estado: o.payment?.status ?? null,
        monto: o.payment?.amount != null ? Number(o.payment.amount) : null,
        fecha: o.uploadedAt ? new Date(o.uploadedAt).toISOString() : null,
      });
    }
    const previo = resultado.get(String(mia.paymentId));
    // Un pago con dos comprobantes repetidos junta los otros pagos en una sola marca.
    if (previo) {
      for (const o of otrosPagos) if (!previo.otrosPagos.some((x) => x.paymentId === o.paymentId)) previo.otrosPagos.push(o);
    } else {
      resultado.set(String(mia.paymentId), { referencia: buscadas.get(n) ?? String(mia.bankReference).trim(), otrosPagos });
    }
  }
  return resultado;
}
