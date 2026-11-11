import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth.js";
import { RefundRequest } from "../models/sql/RefundRequest.model.js";
import { isValidUUID } from "../utils/sanitizer.js";
import { cancelarPedidoDeReembolso, crearPedidoDeReembolso } from "../services/reembolsoPorTransferencia.js";

/**
 * Pedidos de reembolso de pagos por transferencia (lado del cliente). Un cliente pide que le devuelvan un pago suyo; una persona del equipo lo resuelve en
 * `/api/admin/refund-requests`. Reglas y porqués: `services/reembolsoPorTransferencia.ts`. La lista de pagos (`GET /api/payments/my/list`) ya trae, en cada pago por
 * transferencia, si se puede pedir y cómo va el pedido (`reembolso`).
 */
const router = Router();

const publico = (p: any) => ({
  id: String(p.id),
  paymentId: String(p.paymentId),
  status: p.status,
  amount: p.amount === null || p.amount === undefined ? null : Number(p.amount),
  reason: p.reason,
  destination: p.destination ?? null,
  resolvedAmount: p.resolvedAmount === null || p.resolvedAmount === undefined ? null : Number(p.resolvedAmount),
  resolvedAt: p.resolvedAt ?? null,
  resolutionNote: p.resolutionNote ?? null,
  createdAt: p.createdAt,
});

/** POST /api/refund-requests  { paymentId, amount?, reason } */
router.post("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, amount, reason } = req.body || {};
    if (!isValidUUID(String(paymentId ?? ""))) {
      res.status(400).json({ success: false, message: "Elegí el pago que querés que te devolvamos." });
      return;
    }
    const r = await crearPedidoDeReembolso({
      pagoId: String(paymentId),
      userId: String(req.user.id),
      monto: amount === undefined || amount === null || amount === "" ? null : Number(amount),
      motivo: String(reason ?? ""),
    });
    if (r.ok === false) {
      res.status(r.status).json({ success: false, code: r.code, message: r.message });
      return;
    }
    res.status(201).json({ success: true, message: "Recibimos tu pedido. Lo revisa una persona del equipo y te avisamos acá.", data: publico(r.pedido) });
  } catch (error: any) {
    console.error("Error creando un pedido de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/** GET /api/refund-requests/mine */
router.get("/mine", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filas = await RefundRequest.findAll({ where: { requestedBy: req.user.id } as any, order: [["createdAt", "DESC"]], limit: 100 });
    res.json({ success: true, data: filas.map(publico) });
  } catch (error: any) {
    console.error("Error listando mis pedidos de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/** POST /api/refund-requests/:id/cancel — retirar un pedido que nadie resolvió todavía. */
router.post("/:id/cancel", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ success: false, message: "Pedido inválido" });
      return;
    }
    const r = await cancelarPedidoDeReembolso({ id: req.params.id, userId: String(req.user.id) });
    if (r.ok === false) {
      res.status(r.status).json({ success: false, code: r.code, message: r.message });
      return;
    }
    res.json({ success: true, message: "Retiraste tu pedido.", data: publico(r.pedido) });
  } catch (error: any) {
    console.error("Error retirando un pedido de reembolso:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
