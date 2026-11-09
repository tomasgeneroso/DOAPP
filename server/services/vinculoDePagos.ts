import { Op, literal } from 'sequelize';
import { Payment } from '../models/sql/Payment.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';

/**
 * Qué contrato respalda un pago, y a la inversa.
 *
 * Un contrato puede estar pagado de TRES maneras y la base solo guarda un vínculo directo en una de ellas:
 *  - `via: 'contractId'`: el pago lleva `contract_id` (pago de contrato, garantía, ampliación): vínculo directo.
 *  - `via: 'publicacion'`: el trabajo se pagó al publicarlo (`jobs.publication_payment_id`) y el contrato sale de ese trabajo: no hay un pago con el
 *    `contract_id` del contrato, el dinero es el de la publicación.
 *  - `via: 'propuesta'`: una cotización pagada ANTES de que exista el contrato. El pago queda con `contract_id` vacío y solo recuerda la propuesta
 *    (`metadata.proposalId`); se vincula al aprobar el contrato SI el pago sigue «pendiente de verificación» (`verificarPagoDeCotizacionAlAprobar`).
 *    Si un administrador aprueba el pago ANTES de aprobar el contrato (lo permite «Pagos»), ese vínculo no se hacía nunca: el contrato queda sin pago
 *    «propio», no aparece al buscar por el pago y el cobro del trabajador no tiene de dónde salir.
 *
 * Este servicio encuentra los tres casos (buscar un contrato por un pago), y deja vincular a mano un pago que quedó suelto, con rastro.
 */

export type ViaDelVinculo = 'contractId' | 'publicacion' | 'propuesta';

export interface ContratoDeUnPago {
  contratoId: string;
  via: ViaDelVinculo;
}

const ESTADOS_DE_CONTRATO_QUE_NO_RECIBEN_PAGO = ['cancelled', 'rejected'];
const ESTADOS_DE_PAGO_MUERTOS = ['rejected', 'cancelled', 'failed', 'refunded'];
export const TIPOS_DE_PAGO_DE_CONTRATO = ['contract_payment', 'escrow_deposit'];

/** ¿Parece un pedazo de id (hexadecimal y guiones, 4 o más)? Lo único que se le pasa a una consulta de texto. */
export const pareceUnIdParcial = (texto: unknown): texto is string => typeof texto === 'string' && /^[0-9a-f-]{4,36}$/i.test(texto.trim());

/** Los contratos que respalda un pago, por las tres vías. Sin repetir. */
export async function contratosDeUnPago(pago: { id: unknown; contractId?: unknown; metadata?: any; payerId?: unknown }): Promise<ContratoDeUnPago[]> {
  const encontrados = new Map<string, ViaDelVinculo>();
  if (pago.contractId) encontrados.set(String(pago.contractId), 'contractId');

  // Vía la publicación: el trabajo cuyo pago de publicación es este.
  const trabajos: any[] = await Job.findAll({ where: { publicationPaymentId: String(pago.id) } as any, attributes: ['id'] });
  if (trabajos.length) {
    const delTrabajo: any[] = await Contract.findAll({ where: { jobId: { [Op.in]: trabajos.map((t) => String(t.id)) } } as any, attributes: ['id'] });
    for (const c of delTrabajo) if (!encontrados.has(String(c.id))) encontrados.set(String(c.id), 'publicacion');
  }

  // Vía la propuesta: una cotización pagada que todavía no se vinculó.
  const propuestaId = pago.metadata?.proposalId;
  if (propuestaId) {
    const propuesta: any = await Proposal.findByPk(String(propuestaId), { attributes: ['id', 'jobId', 'freelancerId'] }).catch(() => null);
    if (propuesta?.jobId) {
      const where: any = { jobId: propuesta.jobId, doerId: propuesta.freelancerId };
      if (pago.payerId) where.clientId = pago.payerId;
      const delaPropuesta: any[] = await Contract.findAll({ where, attributes: ['id'] });
      for (const c of delaPropuesta) if (!encontrados.has(String(c.id))) encontrados.set(String(c.id), 'propuesta');
    }
  }
  return [...encontrados].map(([contratoId, via]) => ({ contratoId, via }));
}

/**
 * Los ids de los contratos que tienen algo que ver con un pago cuyo id (o un pedazo) es `texto`. Para buscar un contrato por un pago en
 * «Gestión de contratos». Máximo 25 pagos por búsqueda: un pedazo muy corto no debe traer media base.
 */
export async function idsDeContratosPorPago(texto: string): Promise<string[]> {
  if (!pareceUnIdParcial(texto)) return [];
  // `pareceUnIdParcial` ya dejó pasar solo hexadecimales y guiones: nada que escapar ni que inyectar.
  const limpio = texto.trim();
  const pagos: any[] = await Payment.findAll({
    where: { [Op.and]: [literal(`CAST("Payment"."id" AS TEXT) ILIKE '%${limpio}%'`)] } as any,
    attributes: ['id', 'contractId', 'payerId', 'metadata'],
    limit: 25,
  });
  const ids = new Set<string>();
  for (const p of pagos) for (const c of await contratosDeUnPago(p)) ids.add(c.contratoId);
  return [...ids];
}

export interface PagoSinVincular {
  id: string;
  status: string;
  amount: number;
  paymentType: string;
  createdAt: string | null;
}

/**
 * Para una página de contratos: los pagos de contrato que parecen suyos y NO tienen `contract_id` (cotizaciones pagadas que quedaron sueltas), por el id del
 * contrato. Dos consultas para toda la página.
 */
export async function pagosSinVincularPorContrato(
  contratos: Array<{ id: unknown; jobId?: unknown; doerId?: unknown; clientId?: unknown; status?: unknown }>,
): Promise<Map<string, PagoSinVincular[]>> {
  const resultado = new Map<string, PagoSinVincular[]>();
  const vivos = contratos.filter((c) => c.jobId && c.doerId && !ESTADOS_DE_CONTRATO_QUE_NO_RECIBEN_PAGO.includes(String(c.status)));
  if (!vivos.length) return resultado;

  const propuestas: any[] = await Proposal.findAll({
    where: { jobId: { [Op.in]: [...new Set(vivos.map((c) => String(c.jobId)))] } } as any,
    attributes: ['id', 'jobId', 'freelancerId'],
  });
  if (!propuestas.length) return resultado;
  const propuestaDe = new Map<string, any>(propuestas.map((p) => [String(p.id), p]));

  const pagos: any[] = await Payment.findAll({
    where: {
      contractId: { [Op.is]: null },
      paymentType: { [Op.in]: TIPOS_DE_PAGO_DE_CONTRATO },
      status: { [Op.notIn]: ESTADOS_DE_PAGO_MUERTOS },
      payerId: { [Op.in]: [...new Set(vivos.map((c) => String(c.clientId)))] },
    } as any,
    attributes: ['id', 'status', 'amount', 'paymentType', 'createdAt', 'metadata', 'payerId'],
    order: [['createdAt', 'DESC']],
    limit: 500,
  });

  for (const pago of pagos) {
    const propuesta = propuestaDe.get(String(pago.metadata?.proposalId ?? ''));
    if (!propuesta) continue;
    for (const c of vivos) {
      if (String(c.jobId) === String(propuesta.jobId) && String(c.doerId) === String(propuesta.freelancerId) && String(c.clientId) === String(pago.payerId)) {
        const lista = resultado.get(String(c.id)) ?? [];
        lista.push({
          id: String(pago.id),
          status: String(pago.status),
          amount: Number(pago.amount) || 0,
          paymentType: String(pago.paymentType),
          createdAt: pago.createdAt ? new Date(pago.createdAt).toISOString() : null,
        });
        resultado.set(String(c.id), lista);
      }
    }
  }
  return resultado;
}

export type ResultadoDeVincular =
  | { ok: true; pagoId: string; contratoId: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Vincula un pago suelto a un contrato (le pone `contract_id`). No mueve dinero ni cambia estados: solo deja que el resto del circuito (verificar la
 * garantía, confirmar para pagar al trabajador, el listado «Pagos a trabajadores») vea ese pago como el del contrato.
 *
 * Reglas, todas de falla cerrada:
 *  - solo un pago de contrato o de garantía, que todavía no tenga contrato y no esté rechazado, fallido, devuelto ni cancelado;
 *  - lo pagó el cliente del contrato (el que figura como `client_id`);
 *  - el contrato no está cancelado ni rechazado;
 *  - el contrato todavía no tiene OTRO pago de contrato vigente (no se financia dos veces);
 *  - el UPDATE es condicional (`contract_id IS NULL`): dos administradores a la vez vinculan una sola vez.
 */
export async function vincularPagoAlContrato(pagoId: string, contratoId: string): Promise<ResultadoDeVincular> {
  const pago: any = await Payment.findByPk(pagoId);
  if (!pago) return { ok: false, status: 404, code: 'VINCULO_PAGO_NO_ENCONTRADO', message: 'No existe ese pago.' };
  const contrato: any = await Contract.findByPk(contratoId, { attributes: ['id', 'clientId', 'status'] });
  if (!contrato) return { ok: false, status: 404, code: 'VINCULO_CONTRATO_NO_ENCONTRADO', message: 'No existe ese contrato.' };

  if (pago.contractId) {
    return {
      ok: false,
      status: 409,
      code: 'VINCULO_PAGO_YA_VINCULADO',
      message: String(pago.contractId) === String(contrato.id) ? 'Ese pago ya está vinculado a este contrato.' : 'Ese pago ya está vinculado a otro contrato.',
    };
  }
  if (!TIPOS_DE_PAGO_DE_CONTRATO.includes(String(pago.paymentType))) {
    return { ok: false, status: 409, code: 'VINCULO_TIPO_DE_PAGO', message: `Un pago de tipo «${pago.paymentType}» no se vincula a un contrato: solo los pagos de contrato o de garantía.` };
  }
  if (ESTADOS_DE_PAGO_MUERTOS.includes(String(pago.status))) {
    return { ok: false, status: 409, code: 'VINCULO_PAGO_NO_VIGENTE', message: `Ese pago está «${pago.status}»: no se vincula.` };
  }
  if (String(pago.payerId) !== String(contrato.clientId)) {
    return { ok: false, status: 409, code: 'VINCULO_OTRO_PAGADOR', message: 'Ese pago lo hizo otra persona que no es el cliente de este contrato.' };
  }
  if (ESTADOS_DE_CONTRATO_QUE_NO_RECIBEN_PAGO.includes(String(contrato.status))) {
    return { ok: false, status: 409, code: 'VINCULO_CONTRATO_NO_VIGENTE', message: `Un contrato «${contrato.status}» no recibe un pago.` };
  }
  const otro = await Payment.findOne({
    where: { contractId: contrato.id, paymentType: { [Op.in]: TIPOS_DE_PAGO_DE_CONTRATO }, status: { [Op.notIn]: ESTADOS_DE_PAGO_MUERTOS } } as any,
    attributes: ['id'],
  });
  if (otro) {
    return { ok: false, status: 409, code: 'VINCULO_CONTRATO_YA_TIENE_PAGO', message: `Este contrato ya tiene otro pago vigente (${String(otro.id).slice(0, 8)}): no se financia dos veces.` };
  }

  const [filas] = await Payment.update({ contractId: contrato.id } as any, { where: { id: pago.id, contractId: { [Op.is]: null } } as any });
  if (filas === 0) return { ok: false, status: 409, code: 'VINCULO_PAGO_YA_VINCULADO', message: 'Otra persona vinculó ese pago mientras tanto. Actualizá la pantalla.' };
  return { ok: true, pagoId: String(pago.id), contratoId: String(contrato.id) };
}
