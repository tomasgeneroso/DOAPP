import { Router, Response } from "express";
import { Op } from "sequelize";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { RefundRequest } from "../../models/sql/RefundRequest.model.js";
import { isValidUUID } from "../../utils/sanitizer.js";
import { bloqueoPorAprobacionPropia, esAprobacionPropiaDelDueno } from "../../services/aprobacionDePagos.js";
import {
  aprobarPedidoDeReembolso,
  bloqueoDelReembolso,
  controlesDelEquipoParaReembolsar,
  rechazarPedidoDeReembolso,
  restanteReembolsable,
  type DestinoDeReembolso,
} from "../../services/reembolsoPorTransferencia.js";

/**
 * Pedidos de reembolso de pagos por transferencia (lado del equipo). El cliente los crea en `/api/refund-requests`; acá se aprueban (al saldo o al banco, con el
 * comprobante) o se rechazan con un motivo que lee el cliente. Reglas y porqués: `services/reembolsoPorTransferencia.ts`.
 */
const router = Router();
const ROLES = ["admin", "super_admin", "owner"] as const;

const INCLUIR = [
  { association: "requester", attributes: ["id", "name", "email"], required: false },
  { association: "resolver", attributes: ["id", "name"], required: false },
  { association: "payment", attributes: ["id", "amount", "currency", "status", "paymentType", "paymentMethod", "refundedAmount", "contractId", "jobId", "payerId", "recipientId", "mercadopagoPaymentId", "paypalCaptureId", "createdAt"], required: false },
];

async function serializar(p: any) {
  const pago = p.payment;
  const [restante, bloqueo] = pago && p.status === "pending" ? await Promise.all([restanteReembolsable(pago), bloqueoDelReembolso(pago)]) : [null, null];
  return {
    id: String(p.id),
    status: p.status,
    amount: p.amount === null || p.amount === undefined ? null : Number(p.amount),
    reason: p.reason,
    destination: p.destination ?? null,
    resolvedAmount: p.resolvedAmount === null || p.resolvedAmount === undefined ? null : Number(p.resolvedAmount),
    resolvedAt: p.resolvedAt ?? null,
    resolutionNote: p.resolutionNote ?? null,
    proofUrl: p.proofUrl ?? null,
    createdAt: p.createdAt,
    requester: p.requester ? { id: String(p.requester.id), name: p.requester.name, email: p.requester.email } : null,
    resolver: p.resolver ? { id: String(p.resolver.id), name: p.resolver.name } : null,
    payment: pago
      ? {
          id: String(pago.id),
          amount: Number(pago.amount) || 0,
          currency: pago.currency || "ARS",
          status: pago.status,
          paymentType: pago.paymentType,
          refundedAmount: Number(pago.refundedAmount) || 0,
          contractId: pago.contractId ?? null,
          jobId: pago.jobId ?? null,
          createdAt: pago.createdAt,
        }
      : null,
    /** Cuánto se puede devolver hoy y, si no se puede, por qué (solo en los pendientes). */
    restante,
    bloqueo: bloqueo ? { code: bloqueo.code, message: bloqueo.message } : null,
  };
}

/** GET /api/admin/refund-requests?status=pending|approved|rejected|cancelled|all */
router.get("/", protect, requireRole(...ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = String(req.query.status || "pending");
    const where: any = status === "all" ? {} : { status: { [Op.in]: status.split(",").slice(0, 4) } };
    const filas = await RefundRequest.findAll({ where, include: INCLUIR as any, order: [["createdAt", status === "pending" ? "ASC" : "DESC"]], limit: 200 });
    const pedidos = await Promise.all(filas.map((f) => serializar(f)));
    const pendientes = await RefundRequest.count({ where: { status: "pending" } as any });
    res.json({ success: true, data: { pedidos, pendientes } });
  } catch (error: any) {
    console.error("Error listando pedidos de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/** POST /api/admin/refund-requests/:id/approve  { destino: 'saldo'|'banco', monto?, nota?, comprobanteUrl? } */
router.post("/:id/approve", protect, requireRole(...ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ success: false, message: "Pedido inválido" });
      return;
    }
    const { destino, monto, nota, comprobanteUrl } = req.body || {};
    const pedido: any = await RefundRequest.findByPk(req.params.id);
    if (!pedido) {
      res.status(404).json({ success: false, message: "No existe ese pedido." });
      return;
    }
    const pago: any = await Payment.findByPk(pedido.paymentId);
    if (!pago) {
      res.status(404).json({ success: false, message: "El pago de este pedido ya no existe." });
      return;
    }
    const bloqueoPropio = bloqueoPorAprobacionPropia(pago, req.user);
    if (bloqueoPropio) {
      res.status(bloqueoPropio.status).json(bloqueoPropio.body);
      return;
    }
    const pedidoMonto = monto === undefined || monto === null || monto === "" ? (pedido.amount === null ? null : Number(pedido.amount)) : Number(monto);
    const importe = pedidoMonto === null ? await restanteReembolsable(pago) : pedidoMonto;
    const controles = await controlesDelEquipoParaReembolsar({
      adminId: String(req.user.id),
      rol: String((req.user as any).adminRole || req.user.role || ""),
      importe: Number.isFinite(importe) ? importe : 0,
      passwordVerified: Boolean((req as any).passwordVerified),
    });
    if (controles) {
      res.status(controles.status).json(controles.body);
      return;
    }
    const r = await aprobarPedidoDeReembolso({
      id: String(pedido.id),
      quien: String(req.user.id),
      destino: destino as DestinoDeReembolso,
      monto: monto === undefined || monto === null || monto === "" ? null : Number(monto),
      nota: typeof nota === "string" ? nota : null,
      comprobanteUrl: typeof comprobanteUrl === "string" ? comprobanteUrl : null,
      aprobacionPropiaDelDueno: esAprobacionPropiaDelDueno(pago, req.user),
    });
    if (r.ok === false) {
      res.status(r.status).json({ success: false, code: r.code, message: r.message });
      return;
    }
    res.json({
      success: true,
      message: r.reembolso.destino === "saldo" ? "Aprobado: se acreditó al saldo del cliente." : "Aprobado: quedó registrada la transferencia al banco del cliente.",
      data: { monto: r.reembolso.monto, destino: r.reembolso.destino, completo: r.reembolso.completo },
    });
  } catch (error: any) {
    console.error("Error aprobando un pedido de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/** POST /api/admin/refund-requests/:id/reject  { nota } — el motivo lo lee el cliente. */
router.post("/:id/reject", protect, requireRole(...ROLES), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ success: false, message: "Pedido inválido" });
      return;
    }
    const r = await rechazarPedidoDeReembolso({ id: req.params.id, quien: String(req.user.id), nota: String(req.body?.nota ?? "") });
    if (r.ok === false) {
      res.status(r.status).json({ success: false, code: r.code, message: r.message });
      return;
    }
    res.json({ success: true, message: "Pedido rechazado: el cliente ya lo sabe." });
  } catch (error: any) {
    console.error("Error rechazando un pedido de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
