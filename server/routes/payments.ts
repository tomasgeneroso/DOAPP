import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import Payment from "../models/Payment";
import Contract from "../models/Contract";
import User from "../models/User";
import Notification from "../models/Notification";
import paypalService from "../services/paypal";
import { config } from "../config/env";

const router = Router();

/**
 * Create a payment order
 * POST /api/payments/create-order
 */
router.post("/create-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId, amount, description } = req.body;
    const userId = req.user._id;

    // Validate contract
    const contract = await Contract.findById(contractId);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is part of the contract
    if (contract.client.toString() !== userId.toString() && contract.doer.toString() !== userId.toString()) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Determine payer and recipient
    let payerId = userId;
    let recipientId = contract.client.toString() === userId.toString()
      ? contract.doer
      : contract.client;

    // Calculate platform fee
    const platformFee = paypalService.calculatePlatformFee(parseFloat(amount));
    const totalAmount = parseFloat(amount) + platformFee;

    // Create PayPal order
    const paypalOrder = await paypalService.createOrder({
      amount: totalAmount.toFixed(2),
      currency: "USD",
      description: description || `Payment for contract ${contract.title}`,
      contractId: contractId,
    });

    // Create payment record
    const payment = await Payment.create({
      contractId,
      payerId,
      recipientId,
      amount: parseFloat(amount),
      currency: "USD",
      status: "pending",
      paymentType: "contract_payment",
      paypalOrderId: paypalOrder.orderId,
      description,
      platformFee,
      platformFeePercentage: config.paypalPlatformFeePercentage,
      isEscrow: contract.escrowEnabled || false,
    });

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        orderId: paypalOrder.orderId,
        approvalUrl: paypalOrder.links?.find((link: any) => link.rel === "approve")?.href,
        amount: totalAmount,
        platformFee,
      },
    });
  } catch (error: any) {
    console.error("Create payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Capture a payment after approval
 * POST /api/payments/capture-order
 */
router.post("/capture-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.body;
    const userId = req.user._id;

    // Find payment by order ID
    const payment = await Payment.findOne({ paypalOrderId: orderId });
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is the payer
    if (payment.payerId.toString() !== userId.toString()) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Capture the PayPal order
    const captureResult = await paypalService.captureOrder(orderId);

    // Update payment record
    payment.status = captureResult.status === "COMPLETED" ? "completed" : "processing";
    payment.paypalCaptureId = captureResult.captureId;
    payment.paypalPayerId = captureResult.payerId;
    payment.paypalPayerEmail = captureResult.payerEmail;

    if (payment.isEscrow) {
      payment.status = "held_escrow";
    }

    await payment.save();

    // Update contract payment status
    const contract = await Contract.findById(payment.contractId);
    if (contract) {
      contract.paymentStatus = payment.isEscrow ? "escrow" : "completed";
      await contract.save();
    }

    // Create notifications
    const payer = await User.findById(payment.payerId);
    const recipient = await User.findById(payment.recipientId);

    await Notification.create({
      userId: payment.recipientId,
      type: "payment_received",
      title: "Pago recibido",
      message: payment.isEscrow
        ? `${payer?.name} ha depositado $${payment.amount} en escrow para el contrato`
        : `Has recibido un pago de $${payment.amount} de ${payer?.name}`,
      metadata: { paymentId: payment._id, contractId: payment.contractId },
    });

    await Notification.create({
      userId: payment.payerId,
      type: "payment_sent",
      title: "Pago enviado",
      message: payment.isEscrow
        ? `Tu pago de $${payment.amount} está en escrow hasta que se complete el trabajo`
        : `Has enviado $${payment.amount} a ${recipient?.name}`,
      metadata: { paymentId: payment._id, contractId: payment.contractId },
    });

    res.json({
      success: true,
      data: {
        paymentId: payment._id,
        captureId: captureResult.captureId,
        status: payment.status,
      },
    });
  } catch (error: any) {
    console.error("Capture payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Release escrow payment (for completed work)
 * POST /api/payments/:paymentId/release-escrow
 */
router.post("/:paymentId/release-escrow", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user._id;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is the payer (client releasing payment)
    if (payment.payerId.toString() !== userId.toString()) {
      res.status(403).json({ success: false, message: "Only the payer can release escrow" });
      return;
    }

    if (!payment.isEscrow || payment.status !== "held_escrow") {
      res.status(400).json({ success: false, message: "Payment is not in escrow" });
      return;
    }

    // Release escrow
    payment.status = "completed";
    payment.escrowReleasedAt = new Date();
    payment.escrowReleasedBy = userId;
    await payment.save();

    // Update contract
    const contract = await Contract.findById(payment.contractId);
    if (contract) {
      contract.paymentStatus = "completed";
      await contract.save();
    }

    // Notify recipient
    const recipient = await User.findById(payment.recipientId);
    await Notification.create({
      userId: payment.recipientId,
      type: "escrow_released",
      title: "Pago liberado",
      message: `El escrow de $${payment.amount} ha sido liberado. El pago está disponible.`,
      metadata: { paymentId: payment._id, contractId: payment.contractId },
    });

    res.json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Release escrow error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Refund a payment
 * POST /api/payments/:paymentId/refund
 */
router.post("/:paymentId/refund", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Only allow refund if user is recipient or admin
    const user = await User.findById(userId);
    if (payment.recipientId.toString() !== userId.toString() && !user?.adminRole) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (payment.status === "refunded") {
      res.status(400).json({ success: false, message: "Payment already refunded" });
      return;
    }

    if (!payment.paypalCaptureId) {
      res.status(400).json({ success: false, message: "Payment cannot be refunded" });
      return;
    }

    // Process refund through PayPal
    const refundResult = await paypalService.refundPayment(
      payment.paypalCaptureId,
      payment.amount.toString(),
      payment.currency
    );

    // Update payment
    payment.status = "refunded";
    payment.refundReason = reason;
    payment.refundedAt = new Date();
    payment.refundedBy = userId;
    await payment.save();

    // Update contract
    const contract = await Contract.findById(payment.contractId);
    if (contract) {
      contract.paymentStatus = "refunded";
      await contract.save();
    }

    // Notify payer
    await Notification.create({
      userId: payment.payerId,
      type: "payment_refunded",
      title: "Pago reembolsado",
      message: `Tu pago de $${payment.amount} ha sido reembolsado. Razón: ${reason}`,
      metadata: { paymentId: payment._id, contractId: payment.contractId },
    });

    res.json({ success: true, data: { payment, refundId: refundResult.refundId } });
  } catch (error: any) {
    console.error("Refund payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get payment details
 * GET /api/payments/:paymentId
 */
router.get("/:paymentId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user._id;

    const payment = await Payment.findById(paymentId)
      .populate("payerId", "name email avatar")
      .populate("recipientId", "name email avatar")
      .populate("contractId", "title description");

    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is part of the payment
    if (
      payment.payerId.toString() !== userId.toString() &&
      payment.recipientId.toString() !== userId.toString()
    ) {
      const user = await User.findById(userId);
      if (!user?.adminRole) {
        res.status(403).json({ success: false, message: "Unauthorized" });
        return;
      }
    }

    res.json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Get payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get user payments (sent and received)
 * GET /api/payments/my/list
 */
router.get("/my/list", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const { type = "all", page = 1, limit = 20 } = req.query;

    const query: any = {};
    if (type === "sent") {
      query.payerId = userId;
    } else if (type === "received") {
      query.recipientId = userId;
    } else {
      query.$or = [{ payerId: userId }, { recipientId: userId }];
    }

    const payments = await Payment.find(query)
      .populate("payerId", "name email avatar")
      .populate("recipientId", "name email avatar")
      .populate("contractId", "title")
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("Get payments error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get contract payments
 * GET /api/payments/contract/:contractId
 */
router.get("/contract/:contractId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user._id;

    const contract = await Contract.findById(contractId);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is part of the contract
    if (
      contract.client.toString() !== userId.toString() &&
      contract.doer.toString() !== userId.toString()
    ) {
      const user = await User.findById(userId);
      if (!user?.adminRole) {
        res.status(403).json({ success: false, message: "Unauthorized" });
        return;
      }
    }

    const payments = await Payment.find({ contractId })
      .populate("payerId", "name email avatar")
      .populate("recipientId", "name email avatar")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: payments });
  } catch (error: any) {
    console.error("Get contract payments error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PayPal webhook handler
 * POST /api/payments/webhook
 */
router.post("/webhook", async (req, res): Promise<void> => {
  try {
    const webhookEvent = req.body;

    // TODO: Verify webhook signature for security
    // const isValid = await paypalService.verifyWebhookSignature(req.headers, req.body, WEBHOOK_ID);
    // if (!isValid) {
    //   res.status(400).json({ success: false, message: "Invalid webhook signature" });
    //   return;
    // }

    // Handle different event types
    switch (webhookEvent.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED":
        // Payment captured successfully
        console.log("Payment captured:", webhookEvent.resource.id);
        break;

      case "PAYMENT.CAPTURE.DENIED":
        // Payment denied
        console.log("Payment denied:", webhookEvent.resource.id);
        break;

      case "PAYMENT.CAPTURE.REFUNDED":
        // Payment refunded
        console.log("Payment refunded:", webhookEvent.resource.id);
        break;

      default:
        console.log("Unhandled webhook event:", webhookEvent.event_type);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
