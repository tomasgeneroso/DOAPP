import express, { Router, Response } from "express";
import { DONDE_ES_ADMIN } from '../utils/admins.js';
import { protect, AuthRequest } from "../middleware/auth.js";
import { splitFees, getProcessingFeeRate } from "../../shared/pricing/processingCost.js";
import { MEMBERSHIP_PRICES_EUR } from "../../shared/constants/membershipPricing.js";
import { requireRole } from "../middleware/permissions.js";
import { Payment } from "../models/sql/Payment.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { PaymentProof } from "../models/sql/PaymentProof.model.js";
import mercadopagoService from "../services/mercadopago.js";
import { datosDeLiberacionDeMp } from "../services/liberacionDeSaldo.js";
import { registrarCostoRealDeMp } from "../services/costoRealDeMp.js";
import { datosBancarios, TRANSFERENCIA_NO_DISPONIBLE } from "../services/datosBancarios.js";
import { validarDatosDeTransferencia, documentoNormalizado } from "../../shared/pagos/transferencia.js";
import astropayService from "../services/astropay.js";
import currencyExchange from "../services/currencyExchange.js";
import { config } from "../config/env.js";
import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Invoice } from '../models/sql/Invoice.model.js';
import { getUserInvoices, getInvoiceById } from '../services/invoiceService.js';
import logger from "../services/logger.js";
import { avisarPagoRecibido } from "../services/avisoDePago.js";
import { bloqueoPorAprobacionPropia } from "../services/aprobacionDePagos.js";
import { aplicarAumentoDePrecio, dejarAumentoEnRevision, aumentoPagadoEnRevision } from "../services/aumentoDePrecio.js";
import { urlsDeRetorno } from "../services/urlsDeRetorno.js";
import { firmarDescargaDeFactura, verificarDescargaDeFactura } from "../services/descargaDeFactura.js";
import { clasificarPagoExistente, anularPagoHuerfano, direccionDePagoGuardada } from "../services/pagoDeContrato.js";
import { POLITICAS } from "../../shared/constants/policies.js";
import { socketService } from "../index.js";
import { calculateCommission } from "../services/commissionService.js";
import { comisionDePublicacion, gastarCupoDeExencion } from "../services/exencionDeComision.js";
import { getPhaseInfo, getEffectiveTier } from "../services/platformPhase.js";
import { moduloActivo } from "../services/moduleFlags.js";
import { MODULO_APROBACION_DE_PUBLICACIONES } from "../../shared/constants/modulos.js";
import {
  evaluarPagoMercadoPago,
  esIdDePagoMp,
  ESTADOS_CAPTURABLES,
  TIPOS_QUE_CONFIRMA_EL_RETORNO,
  ESTADOS_YA_PROCESADOS,
  type VeredictoMp,
} from "../services/pagoMercadoPago.js";

// Ensure upload directory exists
const PAYMENT_PROOFS_DIR = path.join(process.cwd(), 'uploads', 'payment-proofs');
if (!fs.existsSync(PAYMENT_PROOFS_DIR)) {
  fs.mkdirSync(PAYMENT_PROOFS_DIR, { recursive: true });
}

// Configure multer for payment proof uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PAYMENT_PROOFS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (JPEG, PNG) o PDF'));
    }
  }
});

const router = Router();

/**
 * Create a payment order (supports multiple payment methods)
 * POST /api/payments/create-order
 * Supports: FormData with optional file upload
 */
router.post("/create-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId, jobId, paymentType, amount, description, paymentMethod } = req.body;
    const userId = req.user.id;
    const selectedPaymentMethod = paymentMethod || 'mercadopago'; // Default to MercadoPago

    // Handle job publication payment
    if (paymentType === "job_publication" && jobId) {
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Job not found" });
        return;
      }

      // Verify user owns the job (use clientId for PostgreSQL)
      if (job.clientId !== userId) {
        res.status(403).json({ success: false, message: "Unauthorized - You don't own this job" });
        return;
      }

      // Sólo se paga una publicación que está esperando el pago. Antes no se miraba el estado: se podía "pagar" un
      // trabajo ya publicado (MercadoPago cobraba y capture-order no hacía nada: un cobro por nada) y, con contratos
      // gratis, este mismo camino reabría como "open" un trabajo cancelado o terminado y gastaba un contrato gratis.
      if (!["draft", "pending_payment"].includes(String(job.status))) {
        res.status(409).json({
          success: false,
          code: "JOB_NOT_AWAITING_PAYMENT",
          message: "Este trabajo no está esperando el pago de la publicación (ya está publicado, en revisión o dado de baja).",
        });
        return;
      }

      // Get user's commission rate and free contracts
      const user = await User.findByPk(userId);
      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      // Contrato LIBRE DE COMISIÓN (no gratuito): se exime la comisión de DOAPP, pero el trabajo y el costo del medio de pago se pagan.
      // Antes este camino publicaba sin cobrar nada y marcaba el trabajo como pagado: el costo del trabajo no se cobraba nunca.
      const jobPrice = parseFloat(job.price as any) || 0;
      const { comision: commissionResult, gastar } = await comisionDePublicacion(user as any, job as any, jobPrice);
      // Con saldo el cupo se gasta recién cuando el pago salió bien (si el saldo no alcanza, no se pierde).
      if (gastar && selectedPaymentMethod !== 'balance') await gastarCupoDeExencion(user, job, gastar);
      const publicationCost = commissionResult.commission;
      const vat = commissionResult.vat;

      // Lo que paga el cliente: el trabajo, la comision de DOAPP, el costo de
      // procesamiento del pago, y el IVA de esos dos ultimos (la plataforma
      // factura su servicio, no el trabajo, que es un contrato entre cliente y
      // trabajador). El trabajador recibe el precio entero. La tasa de
      // procesamiento es una sola, igual con cualquier medio, tambien con
      // transferencia: cobrar distinto segun como se paga es lo que la ley de
      // tarjetas prohibe (ver shared/pricing/processingCost.ts).
      const split = splitFees(jobPrice, publicationCost, vat);
      const totalAmountARS = split.clientPays;

      console.log(`💵 Job publication payment: ${totalAmountARS.toFixed(2)} ARS (trabajo: ${jobPrice.toFixed(2)}, comision: ${publicationCost.toFixed(2)}, procesamiento ${(split.rate * 100).toFixed(2)}%: ${split.processingCharge.toFixed(2)}, IVA ${commissionResult.vatRate}%: ${split.totalVat.toFixed(2)} | el trabajador recibe ${split.workerReceives.toFixed(2)}) - ${selectedPaymentMethod}`);

      // Con saldo a favor: no pasa por una pasarela (sin costo de procesamiento). Se paga el precio + la comisión + su IVA.
      if (selectedPaymentMethod === 'balance') {
        try {
          const total = Math.round((jobPrice + publicationCost + vat) * 100) / 100;
          const { pagarPublicacionConSaldo, saldoDe } = await import('../services/creditoDePublicacion.js');
          // El saldo solo paga una REPROGRAMACIÓN: la publicación cuyo pago volvió al saldo. Para cualquier otra publicación se paga por la
          // pasarela o transferencia, así las cuentas quedan claras (el saldo ganado trabajando no se mezcla con publicar).
          const { creditosVinculados } = await import('../services/creditoDePublicacion.js');
          const saldoTotal = Number((await User.findByPk(userId, { attributes: ['id', 'balanceArs'] }) as any)?.balanceArs) || 0;
          // El crédito de la publicación, ya sin lo que está reservado para un retiro pendiente (esa plata no existe para gastarla).
          const credito = (await creditosVinculados(String(userId), saldoTotal)).find((c) => c.jobId === String(job.id))?.monto ?? 0;
          if (credito + 0.005 < total) {
            res.status(409).json({
              success: false,
              code: 'SALDO_SOLO_PARA_REPROGRAMAR',
              message: credito > 0
                ? `El saldo vinculado a esta publicación ($${credito.toLocaleString('es-AR')}) no cubre el total ($${total.toLocaleString('es-AR')}). Pagala por Mercado Pago o transferencia.`
                : 'El saldo solo sirve para volver a publicar una publicación cancelada que ya habías pagado. Elegí otro medio de pago.',
              creditoVinculado: credito,
              total,
            });
            return;
          }
          // Saldo que el usuario tiene pedido para retirar (todavía sin aprobar): se puede usar, pero antes se le avisa que ese retiro se cancela.
          const { pendienteEnRetiros } = await import('../services/saldoReservado.js');
          const pendiente = await pendienteEnRetiros(String(userId));
          if (pendiente > 0 && saldoTotal - total < pendiente - 0.005 && req.body?.confirmaRetiroPendiente !== true) {
            res.status(409).json({
              success: false,
              code: 'RETIRO_PENDIENTE_SE_CANCELA',
              message: `Tenés un retiro pendiente por $${pendiente.toLocaleString('es-AR')}. Si pagás con este saldo, ese retiro se cancela. ¿Seguimos?`,
              pendiente,
              total,
            });
            return;
          }
          const saldo = await saldoDe(String(userId));
          if (saldo + 0.005 < total) {
            res.status(402).json({ success: false, code: 'SALDO_INSUFICIENTE', message: `Tu saldo ($${saldo.toLocaleString('es-AR')}) no alcanza para pagar la publicación ($${total.toLocaleString('es-AR')}). Elegí otro medio de pago.`, saldo, total });
            return;
          }
          const r = await pagarPublicacionConSaldo(job, String(userId), total, { monto: publicationCost, porcentaje: commissionResult.rate });
          if (gastar) await gastarCupoDeExencion(user, job, gastar);
          res.json({ success: true, paidWithBalance: true, message: 'Publicación pagada con tu saldo.', paymentId: r.paymentId, amount: r.monto, jobStatus: r.estado });
        } catch (e: any) {
          res.status(500).json({ success: false, message: e?.message || 'No se pudo pagar con saldo.' });
        }
        return;
      }

      // Handle different payment methods
      if (selectedPaymentMethod === 'bank_transfer') {
        // Sin una cuenta real configurada (BANK_CBU / BANK_ALIAS) no se ofrece la transferencia: antes se mostraba una cuenta de ejemplo.
        const cuenta = datosBancarios();
        if (!cuenta) {
          res.status(503).json(TRANSFERENCIA_NO_DISPONIBLE);
          return;
        }
        // Bank Transfer - requires manual verification
        const payment = await Payment.create({
          contractId: null,
          payerId: userId,
          recipientId: null,
          amount: totalAmountARS,
          currency: "ARS",
          status: "pending_verification", // Special status for bank transfers
          paymentType: "job_publication",
          paymentMethod: "bank_transfer",
          description: `Publicación: ${job.title}`,
          platformFee: publicationCost,
          platformFeePercentage: commissionResult.rate,
          processingCharge: split.processingCharge,
          isEscrow: false,
        });

        // Update job with publication amount and payment reference
        job.publicationAmount = totalAmountARS;
        job.publicationPaymentId = payment.id;
        job.status = 'pending_payment'; // Job won't be published until payment is verified
        await job.save();

        res.json({
          success: true,
          message: "Transferencia bancaria iniciada. Sube el comprobante para verificación.",
          requiresPayment: true,
          paymentId: payment.id,
          amount: totalAmountARS,
          bankDetails: cuenta,
        });
        return;
      }

      // AstroPay redirect checkout
      if (selectedPaymentMethod === 'astropay') {
        // Guard: a stale client or a hand-crafted request must not reach the
        // service and surface as a 500. Fail with a clear 400 instead.
        if (!astropayService.isAvailable()) {
          res.status(400).json({
            success: false,
            message: "AstroPay no está disponible por el momento. Elegí otro medio de pago.",
            code: 'PAYMENT_METHOD_UNAVAILABLE',
          });
          return;
        }
        const apPayment = await astropayService.createPayment({
          amount: totalAmountARS,
          currency: 'ARS',
          description: `Publicación: ${job.title}`,
          metadata: { jobId, userId, paymentType: 'job_publication' },
          customerEmail: req.user.email,
          ...urlsDeRetorno(
            req.body.origen,
            { exito: `${process.env.CLIENT_URL}/payment/success?type=job_publication&jobId=${jobId}`, cancelado: `${process.env.CLIENT_URL}/jobs/${jobId}/payment` },
            { tipo: 'publicacion', ids: { jobId: String(jobId) } },
          ),
        });
        const payment = await Payment.create({
          contractId: null,
          payerId: userId,
          recipientId: null,
          amount: totalAmountARS,
          currency: "ARS",
          status: "pending",
          paymentType: "job_publication",
          paymentMethod: "astropay",
          astropayDepositId: apPayment.providerPaymentId,
          description: `Publicación: ${job.title}`,
          platformFee: publicationCost,
          platformFeePercentage: commissionResult.rate,
          processingCharge: split.processingCharge,
          isEscrow: false,
        });
        job.publicationAmount = totalAmountARS;
        job.publicationPaymentId = payment.id;
        await job.save();
        res.json({ success: true, approvalUrl: apPayment.checkoutUrl, paymentId: payment.id, amount: totalAmountARS });
        return;
      }

      // Default: MercadoPago direct integration
      const mpPayment = await mercadopagoService.createPayment({
        amount: totalAmountARS,
        currency: 'ARS',
        description: `Publicación: ${job.title}`,
        provider: 'mercadopago',
        metadata: {
          jobId: jobId,
          userId: userId,
          paymentType: 'job_publication',
        },
        customerEmail: req.user.email,
        ...urlsDeRetorno(
          req.body.origen,
          { exito: `${process.env.CLIENT_URL}/payment/success?type=job_publication&jobId=${jobId}`, cancelado: `${process.env.CLIENT_URL}/jobs/${jobId}/payment` },
          { tipo: 'publicacion', ids: { jobId: String(jobId) } },
        ),
      });

      if (!mpPayment.checkoutUrl) {
        throw new Error('No se pudo obtener el link de pago de MercadoPago');
      }

      // Create payment record in database
      const payment = await Payment.create({
        contractId: null,
        payerId: userId,
        recipientId: null,
        amount: totalAmountARS,
        currency: "ARS",
        status: "pending",
        paymentType: "job_publication",
        paymentMethod: "mercadopago",
        mercadopagoPreferenceId: mpPayment.paymentId,
        description: `Publicación: ${job.title}`,
        platformFee: publicationCost,
        platformFeePercentage: commissionResult.rate,
        processingCharge: split.processingCharge,
        isEscrow: false,
      });

      // Update job with publication amount in ARS and payment reference
      job.publicationAmount = totalAmountARS;
      job.publicationPaymentId = payment.id;
      await job.save();

      res.json({
        success: true,
        preferenceId: mpPayment.paymentId,
        approvalUrl: mpPayment.checkoutUrl,
        paymentId: payment.id,
        amount: totalAmountARS,
      });
      return;
    }

    // Handle budget increase payment
    if (paymentType === "budget_increase" && jobId) {
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({ success: false, message: "Job not found" });
        return;
      }

      // Verify user owns the job
      if (job.clientId !== userId) {
        res.status(403).json({ success: false, message: "Unauthorized - You don't own this job" });
        return;
      }

      // Verify the job has pending payment amount
      const pendingAmount = parseFloat(job.pendingPaymentAmount as any) || 0;
      if (pendingAmount <= 0 || !job.pendingNewPrice) {
        res.status(400).json({ success: false, message: "No pending payment amount for this job" });
        return;
      }

      // Un aumento ya pagado que espera al administrador no se paga de nuevo: quedaría cobrado dos veces.
      if (await aumentoPagadoEnRevision(job)) {
        res.status(409).json({
          success: false,
          code: 'AUMENTO_PAGADO_EN_REVISION',
          message: "Ya pagaste este aumento y está en revisión. No hace falta que pagues de nuevo: cuando se apruebe, el precio se aplica solo.",
        });
        return;
      }

      // La misma cuenta que fijo el monto pendiente (liquidarAumento): la
      // diferencia, su comision e IVA, menos el saldo reservado, mas el
      // procesamiento de lo que pasa por la pasarela. Se recalcula y se cobra
      // ESO, no lo que mande el cliente en `amount`: el monto lo decide el
      // servidor. Antes se aceptaba el del request y la comision se calculaba
      // sobre el total en vez de sobre la diferencia.
      const { liquidarAumento } = await import('../services/quotePayment.js');
      const aumento = await liquidarAumento(job as any, Number(job.pendingNewPrice), Number((job as any).pendingBalanceDeduction) || 0);
      const totalAmountARS = aumento.aPagar;
      if (totalAmountARS <= 0) {
        res.status(400).json({ success: false, message: "El saldo cubre el aumento: no hay nada que pagar por la pasarela." });
        return;
      }
      if (Math.abs(totalAmountARS - pendingAmount) > 0.05) {
        // El monto pendiente quedo viejo (cambio la comision o la tasa): se
        // actualiza para que la pantalla y el cobro digan lo mismo.
        job.pendingPaymentAmount = totalAmountARS;
        await job.save();
      }
      const aumentoComision = { commission: aumento.comision, rate: aumento.comisionRate };

      console.log(`💵 Budget increase payment: ${totalAmountARS.toFixed(2)} ARS for job ${jobId} (diferencia ${aumento.diferencia}, comision ${aumento.comision}, IVA ${aumento.iva}, saldo ${aumento.saldoAUsar}, procesamiento ${aumento.procesamiento}) - ${selectedPaymentMethod}`);

      // Handle different payment methods
      if (selectedPaymentMethod === 'bank_transfer' || selectedPaymentMethod === 'binance') {
        const cuenta = selectedPaymentMethod === 'bank_transfer' ? datosBancarios() : null;
        if (selectedPaymentMethod === 'bank_transfer' && !cuenta) {
          res.status(503).json(TRANSFERENCIA_NO_DISPONIBLE);
          return;
        }
        // Bank Transfer or Binance - requires manual verification
        const payment = await Payment.create({
          contractId: null,
          payerId: userId,
          recipientId: null,
          amount: totalAmountARS,
          currency: "ARS",
          status: "pending_verification",
          paymentType: "budget_increase",
          paymentMethod: selectedPaymentMethod,
          description: `Aumento de presupuesto: ${job.title}`,
          platformFee: aumentoComision.commission,
          platformFeePercentage: aumentoComision.rate,
          processingCharge: aumento.procesamiento,
          isEscrow: false,
        });

        // Update job with payment reference
        job.publicationPaymentId = payment.id;
        await job.save();

        res.json({
          success: true,
          message: selectedPaymentMethod === 'binance'
            ? "Pago con Binance iniciado. Sube el comprobante para verificación."
            : "Transferencia bancaria iniciada. Sube el comprobante para verificación.",
          requiresPayment: true,
          paymentId: payment.id,
          amount: totalAmountARS,
          bankDetails: cuenta ?? undefined,
        });
        return;
      }

      // AstroPay redirect checkout
      if (selectedPaymentMethod === 'astropay') {
        // Guard: a stale client or a hand-crafted request must not reach the
        // service and surface as a 500. Fail with a clear 400 instead.
        if (!astropayService.isAvailable()) {
          res.status(400).json({
            success: false,
            message: "AstroPay no está disponible por el momento. Elegí otro medio de pago.",
            code: 'PAYMENT_METHOD_UNAVAILABLE',
          });
          return;
        }
        const apPayment = await astropayService.createPayment({
          amount: totalAmountARS,
          currency: 'ARS',
          description: `Aumento de presupuesto: ${job.title}`,
          metadata: { jobId, userId, paymentType: 'budget_increase' },
          customerEmail: req.user.email,
          ...urlsDeRetorno(
            req.body.origen,
            { exito: `${process.env.CLIENT_URL}/payment/success?type=budget_increase&jobId=${jobId}`, cancelado: `${process.env.CLIENT_URL}/jobs/${jobId}/payment` },
            { tipo: 'aumento', ids: { jobId: String(jobId) } },
          ),
        });
        const payment = await Payment.create({
          contractId: null,
          payerId: userId,
          recipientId: null,
          amount: totalAmountARS,
          currency: "ARS",
          status: "pending",
          paymentType: "budget_increase",
          paymentMethod: "astropay",
          astropayDepositId: apPayment.providerPaymentId,
          description: `Aumento de presupuesto: ${job.title}`,
          platformFee: aumentoComision.commission,
          platformFeePercentage: aumentoComision.rate,
          processingCharge: aumento.procesamiento,
          isEscrow: false,
        });
        job.publicationPaymentId = payment.id;
        await job.save();
        res.json({ success: true, approvalUrl: apPayment.checkoutUrl, paymentId: payment.id, amount: totalAmountARS });
        return;
      }

      // Default: MercadoPago direct integration
      const mpPayment = await mercadopagoService.createPayment({
        amount: totalAmountARS,
        currency: 'ARS',
        description: `Aumento de presupuesto: ${job.title}`,
        provider: 'mercadopago',
        metadata: {
          jobId: jobId,
          userId: userId,
          paymentType: 'budget_increase',
        },
        customerEmail: req.user.email,
        ...urlsDeRetorno(
          req.body.origen,
          { exito: `${process.env.CLIENT_URL}/payment/success?type=budget_increase&jobId=${jobId}`, cancelado: `${process.env.CLIENT_URL}/jobs/${jobId}/payment` },
          { tipo: 'aumento', ids: { jobId: String(jobId) } },
        ),
      });

      if (!mpPayment.checkoutUrl) {
        throw new Error('No se pudo obtener el link de pago de MercadoPago');
      }

      // Create payment record in database
      const payment = await Payment.create({
        contractId: null,
        payerId: userId,
        recipientId: null,
        amount: totalAmountARS,
        currency: "ARS",
        status: "pending",
        paymentType: "budget_increase",
        paymentMethod: "mercadopago",
        mercadopagoPreferenceId: mpPayment.paymentId,
        description: `Aumento de presupuesto: ${job.title}`,
        platformFee: aumentoComision.commission,
        platformFeePercentage: aumentoComision.rate,
        processingCharge: aumento.procesamiento,
        isEscrow: false,
      });

      // Update job with payment reference
      job.publicationPaymentId = payment.id;
      await job.save();

      res.json({
        success: true,
        preferenceId: mpPayment.paymentId,
        approvalUrl: mpPayment.checkoutUrl,
        paymentId: payment.id,
        amount: totalAmountARS,
      });
      return;
    }

    // Handle contract payment (existing logic)
    if (!contractId) {
      res.status(400).json({ success: false, message: "Contract ID is required" });
      return;
    }

    // Validate contract
    const contract = await Contract.findByPk(contractId, {
      include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }],
    });
    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is part of the contract
    if (contract.clientId !== userId && contract.doerId !== userId) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Determine payer and recipient
    const payerId = userId;
    const recipientId = contract.clientId === userId
      ? contract.doerId
      : contract.clientId;

    const contractAmount = parseFloat(amount);
    const contractDescription = description || `Pago de contrato ${(contract as any).job?.title || contract.id}`;

    // AstroPay redirect checkout (ARS)
    if (selectedPaymentMethod === 'astropay') {
      const apPayment = await astropayService.createPayment({
        amount: contractAmount,
        currency: 'ARS',
        description: contractDescription,
        metadata: { contractId, userId, paymentType: 'contract_payment' },
        customerEmail: req.user.email,
        successUrl: `${process.env.CLIENT_URL}/payment/success?type=contract&contractId=${contractId}`,
        cancelUrl: `${process.env.CLIENT_URL}/contracts/${contractId}`,
      });
      const payment = await Payment.create({
        contractId, payerId, recipientId,
        amount: contractAmount, currency: "ARS", status: "pending",
        paymentType: "contract_payment", paymentMethod: "astropay",
        astropayDepositId: apPayment.providerPaymentId,
        description: contractDescription, platformFee: 0, platformFeePercentage: 0,
        isEscrow: contract.escrowEnabled || false,
      });
      res.json({ success: true, data: { paymentId: payment.id, approvalUrl: apPayment.checkoutUrl, amount: contractAmount } });
      return;
    }

    // PayPal (legacy, disabled by default — only if explicitly re-enabled via PAYPAL_ENABLED=true)
    if (selectedPaymentMethod === 'paypal') {
      if (!config.paypalEnabled) {
        res.status(400).json({ success: false, message: "PayPal no está disponible. Usá MercadoPago o AstroPay." });
        return;
      }
      const paypalService = (await import('../services/paypalService.js').catch(() => ({ default: null }))).default;
      if (!paypalService) { res.status(503).json({ success: false, message: 'PayPal no disponible' }); return; }
      const platformFee = (paypalService as any).calculatePlatformFee(contractAmount);
      const totalAmount = contractAmount + platformFee;
      const paypalOrder = await (paypalService as any).createOrder({
        amount: totalAmount.toFixed(2), currency: "USD",
        description: contractDescription, contractId,
      });
      const payment = await Payment.create({
        contractId, payerId, recipientId,
        amount: contractAmount, currency: "USD", status: "pending",
        paymentType: "contract_payment", paymentMethod: "paypal",
        paypalOrderId: paypalOrder.orderId, description,
        platformFee, platformFeePercentage: config.paypalPlatformFeePercentage,
        isEscrow: contract.escrowEnabled || false,
      });
      res.json({
        success: true,
        data: {
          paymentId: payment.id, orderId: paypalOrder.orderId,
          approvalUrl: paypalOrder.links?.find((link: any) => link.rel === "approve")?.href,
          amount: totalAmount, platformFee,
        },
      });
      return;
    }

    // Default: MercadoPago direct integration (ARS)
    const mpPayment = await mercadopagoService.createPayment({
      amount: contractAmount,
      currency: 'ARS',
      description: contractDescription,
      provider: 'mercadopago',
      metadata: { contractId, userId, paymentType: 'contract_payment' },
      customerEmail: req.user.email,
      successUrl: `${process.env.CLIENT_URL}/payment/success?type=contract&contractId=${contractId}`,
      cancelUrl: `${process.env.CLIENT_URL}/contracts/${contractId}`,
    });
    if (!mpPayment.checkoutUrl) {
      throw new Error('No se pudo obtener el link de pago de MercadoPago');
    }
    const payment = await Payment.create({
      contractId, payerId, recipientId,
      amount: contractAmount, currency: "ARS", status: "pending",
      paymentType: "contract_payment", paymentMethod: "mercadopago",
      mercadopagoPreferenceId: mpPayment.paymentId,
      description: contractDescription, platformFee: 0, platformFeePercentage: 0,
      isEscrow: contract.escrowEnabled || false,
    });
    res.json({
      success: true,
      data: { paymentId: payment.id, approvalUrl: mpPayment.checkoutUrl, amount: contractAmount },
    });
  } catch (error: any) {
    console.error("Create payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Respuesta para un pago que YA se procesó bien (por esta ruta, por el webhook o por un admin).
 * Repetir la confirmación (recargar la página de éxito, doble clic, reintento del navegador) no rehace
 * nada: no vuelve a publicar, no vuelve a activar, no manda otra notificación. Devuelve lo mismo que la
 * primera vez para que la pantalla se vea igual.
 */
async function responderPagoYaProcesado(res: Response, payment: any): Promise<void> {
  const data: Record<string, unknown> = {
    paymentId: payment.id,
    status: payment.status,
    amount: payment.amount,
    contractId: payment.contractId,
    alreadyProcessed: true,
  };
  if (payment.paymentType === 'membership') data.membershipActivated = true;
  if (payment.paymentType === 'job_publication' || payment.paymentType === 'budget_increase') {
    const job = await Job.findOne({ where: { publicationPaymentId: payment.id }, attributes: ['id', 'status', 'pendingNewPrice'] });
    if (job) {
      data.jobId = job.id;
      if (payment.paymentType === 'job_publication') {
        data.jobPublished = job.status === 'open';
        data.jobPendingApproval = job.status === 'pending_approval';
      }
      if (payment.paymentType === 'budget_increase') {
        // Esperando al administrador: el pago está confirmado, el precio todavía no cambió.
        data.budgetPendingApproval = payment.status === 'pending_verification' && Boolean((job as any).pendingNewPrice);
        data.budgetUpdated = !data.budgetPendingApproval && payment.status === 'completed';
        data.approvalHours = POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS;
      }
    }
  }
  res.json({ success: true, data });
}

/**
 * Qué se hace cuando MercadoPago NO confirma el pago que se está reclamando. En ningún caso se ejecuta
 * lo que el pago compra: el pago sigue donde estaba (o pasa a revisión) y quien volvió de MercadoPago
 * recibe el motivo real, no un "listo".
 */
async function manejarCapturaNoAprobada(
  res: Response,
  payment: any,
  mpPaymentId: string,
  mpData: any,
  veredicto: Extract<VeredictoMp, { ok: false }>,
  userId: string,
): Promise<void> {
  logger.payment('ERROR', `Captura no aprobada (${veredicto.motivo}): ${veredicto.detalle}`, {
    paymentId: String(payment.id),
    data: { motivo: veredicto.motivo, detalle: veredicto.detalle, mpPaymentId, estadoMp: mpData?.status },
    userId,
  });

  switch (veredicto.motivo) {
    case 'pendiente': {
      // Se guarda el id de MercadoPago: es lo que deja volver a confirmar el pago cuando se acredite (y lo que
      // le permite a la conciliación ver un pago cobrado que quedó pendiente en la base).
      await Payment.update(
        { status: 'processing', mercadopagoPaymentId: mpPaymentId, mercadopagoStatus: String(mpData?.status ?? '') } as any,
        { where: { id: payment.id, status: { [Op.in]: [...ESTADOS_CAPTURABLES] } } },
      ).catch((e: unknown) => logger.error('payments', 'No se pudo guardar el id de MercadoPago de un pago pendiente: la conciliación no lo va a ver', {
        data: { paymentId: String(payment.id), mpPaymentId, error: (e as Error)?.message },
      }));
      // Sólo se promete que se acredita solo si el webhook procesa pagos. Con la llave apagada no es cierto: la
      // confirmación depende de que la persona vuelva a esta página cuando MercadoPago apruebe.
      const seAcreditaSolo = process.env.MP_WEBHOOK_PROCESA_PAGOS === 'true' && !TIPOS_QUE_CONFIRMA_EL_RETORNO.includes(String(payment.paymentType));
      res.status(409).json({
        success: false,
        code: 'PAYMENT_PENDING',
        message: seAcreditaSolo
          ? 'MercadoPago todavía no confirmó tu pago. Si ya pagaste, no pagues de nuevo: se va a acreditar solo en unos minutos.'
          : 'MercadoPago todavía no confirmó tu pago. Si ya pagaste, no pagues de nuevo: cuando MercadoPago lo apruebe, volvé a abrir o recargá esta página y se confirma.',
      });
      return;
    }
    case 'rechazado':
      res.status(409).json({
        success: false,
        code: 'PAYMENT_REJECTED',
        message: 'MercadoPago rechazó o canceló el pago. No se cobró nada: podés intentar de nuevo.',
      });
      return;
    case 'monto':
    case 'moneda':
    case 'cuotas':
    case 'cupon': {
      // El pago existe y está aprobado, pero no es lo que esperábamos (otro monto o moneda, o se pagó en cuotas o con
      // un cupón, que DOAPP no acepta): lo decide una persona.
      const porCondiciones = veredicto.motivo === 'cuotas' || veredicto.motivo === 'cupon';
      await Payment.update(
        { status: 'pending_verification', mercadopagoPaymentId: mpPaymentId, mercadopagoStatus: String(mpData?.status ?? '') } as any,
        { where: { id: payment.id, status: { [Op.in]: [...ESTADOS_CAPTURABLES] } } },
      ).catch((e: unknown) => logger.error('payments', 'No se pudo dejar en revisión un pago con monto o moneda inesperados: nadie lo va a ver en el panel', {
        data: { paymentId: String(payment.id), mpPaymentId, motivo: veredicto.motivo, error: (e as Error)?.message },
      }));
      const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN } });
      for (const admin of admins) {
        await Notification.create({
          recipientId: admin.id,
          type: 'error',
          category: 'admin',
          title: porCondiciones ? 'Pago en cuotas o con cupón' : 'Pago con monto inesperado',
          message: `El pago ${payment.id} se confirmó con MercadoPago pero no coincide con lo esperado (${veredicto.detalle}). Quedó en revisión y no se ejecutó ninguna acción.`,
          relatedModel: 'Payment',
          relatedId: payment.id,
          sentVia: ['in_app'],
        } as any).catch((e: unknown) => logger.error('payments', 'No se pudo avisar a un administrador de un pago en revisión', {
          data: { paymentId: String(payment.id), adminId: String(admin.id), error: (e as Error)?.message },
        }));
      }
      res.status(409).json({
        success: false,
        code: 'PAYMENT_UNDER_REVIEW',
        message: porCondiciones
          ? 'Tu pago se hizo en cuotas o con un cupón de MercadoPago, y DOAPP sólo cobra en un pago y sin descuentos. Quedó en revisión: un administrador lo va a resolver; no hace falta que pagues de nuevo.'
          : 'Tu pago quedó en revisión porque el monto no coincide con el esperado. Un administrador lo va a verificar; no hace falta que pagues de nuevo.',
      });
      return;
    }
    case 'ajeno':
      res.status(403).json({
        success: false,
        code: 'PAYMENT_NOT_YOURS',
        message: 'Este pago de MercadoPago no corresponde a tu cuenta.',
      });
      return;
    default:
      res.status(502).json({
        success: false,
        code: 'PAYMENT_VERIFICATION_FAILED',
        message: 'MercadoPago devolvió información incompleta sobre el pago, así que no pudimos confirmarlo. Si ya pagaste, no pagues de nuevo: escribinos y lo revisamos.',
      });
  }
}

/**
 * Capture/Verify a payment after approval
 * POST /api/payments/capture-order
 *
 * For MercadoPago: payment_id from URL params or webhook
 * For PayPal (commented): orderId
 *
 * Regla de toda la ruta: el pago se confirma CONTRA MERCADOPAGO y recién entonces se ejecuta lo que
 * compra (publicar, activar la membresía, dejar la plata en escrow). Lo que falte, venga raro o no
 * coincida es un "no", nunca un "se supone que sí". Antes: sin id de pago, con MercadoPago caído o con
 * el pago "pendiente" se daba por aprobado y se ejecutaba igual.
 */
router.post("/capture-order", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, collection_id, preference_id } = req.body;
    const userId = req.user.id;

    console.log("🔍 [CAPTURE] Step 1 - Starting MercadoPago capture process");
    console.log("🔍 [CAPTURE] PaymentId:", paymentId);
    console.log("🔍 [CAPTURE] Collection ID:", collection_id);
    console.log("🔍 [CAPTURE] Preference ID:", preference_id);
    console.log("🔍 [CAPTURE] UserId:", userId);

    // MercadoPago: Find payment by preference ID or payment ID
    let payment = null;

    if (preference_id) {
      payment = await Payment.findOne({ where: { mercadopagoPreferenceId: preference_id } });
    } else if (paymentId || collection_id) {
      const mpPaymentId = paymentId || collection_id;
      payment = await Payment.findOne({ where: { mercadopagoPaymentId: mpPaymentId } });
    }

    console.log("🔍 [CAPTURE] Step 2 - Payment found:", payment ? "YES" : "NO");

    if (!payment) {
      console.error("❌ [CAPTURE] Payment not found");
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    console.log("🔍 [CAPTURE] Payment ID:", payment.id);
    console.log("🔍 [CAPTURE] Payment Status:", payment.status);
    console.log("🔍 [CAPTURE] Payment Type:", payment.paymentType);
    console.log("🔍 [CAPTURE] Is Escrow:", payment.isEscrow);

    // Verify user is the payer
    if (payment.payerId !== userId) {
      console.error("❌ [CAPTURE] Unauthorized - PayerId:", payment.payerId, "vs UserId:", userId);
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    console.log("🔍 [CAPTURE] Step 3 - Authorization verified");

    // Un pago que ya se procesó no se rehace: se responde lo mismo que la primera vez. También cuenta como procesado el que
    // Mercado Pago ya confirmó bien y espera a un administrador (un aumento de precio): al recargar la página de éxito se
    // responde que sigue en revisión, no un error de "no se puede volver a confirmar".
    const confirmadoPorMpEnRevision = String(payment.status) === 'pending_verification' && Boolean(payment.mercadopagoVerifiedAt);
    if (confirmadoPorMpEnRevision || (ESTADOS_YA_PROCESADOS as readonly string[]).includes(String(payment.status))) {
      await responderPagoYaProcesado(res, payment);
      return;
    }
    // Sólo se completa un pago pendiente o en proceso. Uno reembolsado, en disputa, fallido o ya
    // liberado no vuelve a escrow ni reabre un trabajo porque alguien repita la confirmación.
    if (!(ESTADOS_CAPTURABLES as readonly string[]).includes(String(payment.status))) {
      res.status(409).json({
        success: false,
        code: 'PAYMENT_NOT_CAPTURABLE',
        message: `Este pago está en estado "${payment.status}" y no se puede volver a confirmar.`,
      });
      return;
    }

    // El id del pago de MercadoPago: el que mandó el navegador o, si no mandó, el que ya registró el webhook.
    // Sin id no hay nada que verificar, y sin verificar no se da por pagado.
    const idCrudo = paymentId || collection_id || payment.mercadopagoPaymentId;
    const mpPaymentId = idCrudo === undefined || idCrudo === null ? '' : String(idCrudo).trim();
    if (!mpPaymentId || mpPaymentId === 'null' || mpPaymentId === 'undefined') {
      res.status(409).json({
        success: false,
        code: 'PAYMENT_PENDING',
        message: 'Todavía no recibimos la confirmación de MercadoPago. Si ya pagaste, no pagues de nuevo: se va a acreditar solo en unos minutos.',
      });
      return;
    }
    if (!esIdDePagoMp(mpPaymentId)) {
      res.status(400).json({ success: false, code: 'PAYMENT_ID_INVALID', message: 'El identificador del pago no es válido.' });
      return;
    }

    // MercadoPago es la única fuente de verdad sobre si se cobró. Si no responde, NO se asume aprobado.
    console.log("🔍 [CAPTURE] Step 4 - Getting MercadoPago payment info...");
    let mpPaymentData: any;
    try {
      mpPaymentData = await mercadopagoService.getPayment(mpPaymentId, 'mercadopago');
    } catch (error: any) {
      logger.silentError('payments', 'Could not get MercadoPago payment info', error, {
        mpPaymentId,
        internalPaymentId: payment.id,
        userId
      });
      res.status(503).json({
        success: false,
        code: 'PAYMENT_VERIFICATION_UNAVAILABLE',
        message: 'No pudimos confirmar tu pago con MercadoPago en este momento. Si ya pagaste, no pagues de nuevo: probá otra vez en unos minutos.',
      });
      return;
    }

    // Aprobado, por el monto y la moneda esperados y a nombre de quien lo reclama. Todo lo demás es un no.
    const veredicto = evaluarPagoMercadoPago(mpPaymentData, {
      amount: payment.amount,
      currency: payment.currency,
      payerId: userId,
    });
    // `=== false` y no `!veredicto.ok`: el tsconfig del servidor no es estricto y sin strictNullChecks la negación no
    // acota la unión (el chequeo de tipos del CI bloqueaba el deploy por esto).
    if (veredicto.ok === false) {
      await manejarCapturaNoAprobada(res, payment, mpPaymentId, mpPaymentData, veredicto, userId);
      return;
    }

    const captureResult: any = {
      status: 'COMPLETED',
      captureId: mpPaymentId,
      payerId: mpPaymentData.metadata?.payerId,
      payerEmail: mpPaymentData.metadata?.payerEmail,
      mpStatus: mpPaymentData.status, // Keep original MP status for debugging
    };

    // Update payment record
    console.log("🔍 [CAPTURE] Step 5 - Updating payment record...");
    const estadoFinal = payment.isEscrow ? "held_escrow" : "completed";

    // Se "reclama" el pago con un UPDATE condicional al estado: si dos confirmaciones llegan juntas (doble
    // clic, la página de éxito y el webhook), sólo una pasa a ejecutar lo que el pago compra. La otra ve
    // que ya está procesado y responde sin repetir nada.
    let reclamados = 0;
    try {
      [reclamados] = await Payment.update(
        {
          status: estadoFinal,
          mercadopagoPaymentId: mpPaymentId,
          mercadopagoStatus: String(mpPaymentData.status),
          mercadopagoStatusDetail: String(mpPaymentData.status_detail || mpPaymentData.status),
          // Cuándo se aprobó y cuándo libera MP esta plata: de eso depende cuándo se puede retirar lo que vuelve o se cobra por este pago.
          ...datosDeLiberacionDeMp(mpPaymentData),
        } as any,
        { where: { id: payment.id, status: { [Op.in]: [...ESTADOS_CAPTURABLES] } } },
      );
    } catch (error: any) {
      // El índice único de mercadopagoPaymentId: ese pago de MercadoPago ya respalda otra orden.
      if (error?.name === 'SequelizeUniqueConstraintError') {
        res.status(409).json({
          success: false,
          code: 'PAYMENT_ALREADY_USED',
          message: 'Ese pago de MercadoPago ya se usó para confirmar otra orden.',
        });
        return;
      }
      throw error;
    }
    if (reclamados === 0) {
      await payment.reload();
      await responderPagoYaProcesado(res, payment);
      return;
    }
    payment.status = estadoFinal as any;
    payment.mercadopagoPaymentId = mpPaymentId;
    payment.mercadopagoStatus = String(mpPaymentData.status);
    payment.mercadopagoStatusDetail = String(mpPaymentData.status_detail || mpPaymentData.status);
    // Lo que MP descontó de verdad y lo que acredita: se guarda y se compara con lo cobrado al cliente (avisa a administración si MP cobró más).
    try {
      const costo = await registrarCostoRealDeMp(payment, mpPaymentData);
      await Payment.update(
        {
          ...(costo.processingFee !== undefined && { processingFee: costo.processingFee }),
          ...(costo.netReceivedAmount !== undefined && { netReceivedAmount: costo.netReceivedAmount }),
        } as any,
        { where: { id: payment.id } },
      );
    } catch (e: any) {
      logger.silentError('payments', 'No se pudo guardar el costo real de Mercado Pago', e, { paymentId: payment.id });
    }
    console.log("✅ [CAPTURE] Step 6 - Payment record updated. New status:", payment.status);

    // Log payment capture success
    logger.payment('CAPTURED', 'Payment captured successfully', {
      paymentId: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      userId,
      status: payment.status,
      provider: 'mercadopago'
    });

    /* ===== PAYPAL CODE (COMMENTED) =====
    // Find payment by order ID
    const payment = await Payment.findOne({ where: { paypalOrderId: orderId } });

    if (!payment) {
      console.error("❌ [CAPTURE] Payment not found for orderId:", orderId);
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Capture the PayPal order
    const captureResult = await (paypalService as any)?.captureOrder(orderId);

    // Update payment record
    payment.status = captureResult.status === "COMPLETED" ? "completed" : "processing";
    payment.paypalCaptureId = captureResult.captureId;
    payment.paypalPayerId = captureResult.payerId;
    payment.paypalPayerEmail = captureResult.payerEmail;

    if (payment.isEscrow) {
      payment.status = "held_escrow";
    }

    await payment.save();
    ===== END PAYPAL CODE ===== */

    // Handle membership payment
    // Sólo por el TIPO del pago, que lo fija el servidor al crearlo. La descripción la escribe quien
    // paga (create-order la toma del cuerpo): con "Membresía" en el texto, cualquier pago activaba PRO.
    if (payment.paymentType === "membership") {
      console.log("🔍 [CAPTURE] Step 7 - Detected membership payment");
      console.log("💳 Procesando pago de membresía...");

      // Activar membresía
      const { Membership } = await import('../models/sql/Membership.model.js');
      const currencyExchange = (await import('../services/currencyExchange.js')).default;

      // Hoy hay una sola membresía paga: PRO (Términos 8.1). Toda compra activa PRO.
      // Antes el plan se deducía de `payment.amount >= 8.99`, pero ese monto está en
      // ARS (miles), así que casi toda compra de PRO terminaba como SUPER_PRO.
      const plan = "PRO" as const;
      const priceEUR = MEMBERSHIP_PRICES_EUR.pro;

      console.log(`📊 Plan: ${plan}`);

      // Cotización del día: la membresía se fija en euros y se cobra en pesos.
      const exchangeRate = await currencyExchange.getEURtoARSRate();
      const priceARS = await currencyExchange.convertEURtoARS(priceEUR);

      console.log(`💱 Tasa de cambio: 1 EUR = ${exchangeRate} ARS`);
      console.log(`💵 Precio: ${priceEUR} EUR = ${priceARS} ARS`);

      // Buscar o crear membresía
      let membership = await Membership.findOne({ where: { userId: payment.payerId } });

      if (membership) {
        // Actualizar membresía existente
        membership.plan = plan;
        membership.status = "active";

        // Nueva membresía o renovación: establecer 30 días desde ahora
        membership.startDate = new Date();
        membership.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
        membership.nextPaymentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        membership.lastPaymentId = payment.id as any;
        membership.lastPaymentDate = new Date();
        // priceUSD es legacy (filas anteriores a la cotización en euros): no se toca.
        membership.priceEUR = priceEUR;
        membership.priceARS = priceARS;
        membership.exchangeRateAtPurchase = exchangeRate;
        // La comisión no depende del plan: la fija el hook del modelo (COMMISSION_RATES).
        await membership.save();
        console.log("✅ Membresía actualizada (renovación)");
      } else {
        // Crear nueva membresía
        membership = await Membership.create({
          userId: payment.payerId,
          plan,
          status: "active",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          priceUSD: 0, // legacy: la columna es obligatoria pero ya no se cotiza en dólares
          priceEUR,
          priceARS,
          exchangeRateAtPurchase: exchangeRate,
          lastPaymentId: payment.id,
          lastPaymentDate: new Date(),
          nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          freeContractsTotal: 3,
          freeContractsUsed: 0,
          freeContractsRemaining: 3,
        });
        console.log("✅ Membresía creada");
      }

      // Actualizar usuario
      const user = await User.findByPk(payment.payerId);
      if (user) {
        user.hasMembership = true;
        user.membershipTier = "pro";
        user.proContractsUsedThisMonth = 0; // reset monthly counter on activation
        await user.save();
        console.log("✅ Usuario actualizado con membresía", plan);
      }

      // Notificar usuario
      await Notification.create({
        recipientId: payment.payerId,
        type: "success",
        category: "payment",
        title: `Membresía ${plan} activada`,
        message: `Tu membresía ${plan} ha sido activada exitosamente. Disfruta de todos los beneficios.`,
        relatedModel: "Membership",
        relatedId: membership.id,
        sentVia: ["in_app"],
      });

      res.json({
        success: true,
        data: {
          paymentId: payment.id,
          captureId: captureResult.captureId,
          status: payment.status,
          amount: payment.amount,
          membershipId: membership.id,
          membershipActivated: true,
          plan,
        },
      });
      return;
    }

    // Handle job publication payment
    if (payment.paymentType === "job_publication") {
      console.log("🔍 [CAPTURE] Step 7 - Detected job publication payment");
      // Find the job and publish it
      const job = await Job.findOne({
        where: { publicationPaymentId: payment.id },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
          }
        ]
      });
      // Sólo se publica un trabajo que estaba esperando este pago. Uno ya publicado, completado o
      // cancelado no se "reabre" porque se repita una confirmación.
      if (job && !["draft", "pending_payment"].includes(String(job.status))) {
        logger.warn('payments', `Pago de publicación confirmado pero el trabajo está en "${job.status}": no se cambia`, {
          data: { paymentId: payment.id, jobId: job.id },
        });
        res.json({
          success: true,
          data: {
            paymentId: payment.id,
            captureId: captureResult.captureId,
            status: payment.status,
            amount: payment.amount,
            jobId: job.id,
            jobPublished: job.status === "open",
            jobPendingApproval: job.status === "pending_approval",
          },
        });
        return;
      }
      if (job) {
        const previousStatus = job.status;
        // Etapa de lanzamiento: la publicación pagada la aprueba un administrador antes de que se vea (módulo
        // «Aprobación de publicaciones pagadas», encendido por defecto). Antes se abría directo al confirmar el pago.
        const requiereAprobacion = await moduloActivo(MODULO_APROBACION_DE_PUBLICACIONES, true);
        job.status = requiereAprobacion ? "pending_approval" : "open";
        job.publicationPaid = true;
        job.publicationPaidAt = new Date();
        await job.save();

        if (requiereAprobacion) {
          await Notification.create({
            recipientId: payment.payerId,
            type: "info",
            category: "payment",
            title: "Pago recibido: tu publicación está en revisión",
            message: `Recibimos el pago de "${job.title}". Un administrador la revisa y, apenas la apruebe, queda visible para los profesionales. Te avisamos.`,
            relatedModel: "Job",
            relatedId: job.id,
            sentVia: ["in_app"],
          });

          // Un administrador la tiene que aprobar: se le avisa a todos (si la lista saliera vacía, queda en el registro).
          const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN } });
          if (admins.length === 0) {
            logger.error('payments', 'Publicación pagada pendiente de aprobación y no hay ningún administrador a quien avisar', {
              data: { jobId: String(job.id), paymentId: String(payment.id) },
            });
          }
          for (const admin of admins) {
            await Notification.create({
              recipientId: admin.id,
              type: "warning",
              category: "admin",
              title: "Publicación pagada para aprobar",
              message: `El cliente pagó la publicación "${job.title}" ($${Number(payment.amount).toLocaleString('es-AR')} ARS). Aprobala o rechazala desde Publicaciones.`,
              relatedModel: "Job",
              relatedId: job.id,
              sentVia: ["in_app"],
            } as any).catch((e: unknown) => logger.error('payments', 'No se pudo avisar a un administrador de una publicación pagada', {
              data: { jobId: String(job.id), adminId: String(admin.id), error: (e as Error)?.message },
            }));
          }

          socketService.notifyJobStatusChanged(job.toJSON(), previousStatus);
        } else {
          // Notify user that job is published
          await Notification.create({
            recipientId: payment.payerId,
            type: "success",
            category: "payment",
            title: "Trabajo publicado",
            message: `Tu trabajo "${job.title}" ha sido publicado exitosamente. Los profesionales pueden ahora enviar propuestas.`,
            relatedModel: "Job",
            relatedId: job.id,
            sentVia: ["in_app"],
          });

          // Real-time notification: new job published
          socketService.notifyNewJob(job.toJSON());
          socketService.notifyJobStatusChanged(job.toJSON(), previousStatus);
        }

        // La notificación dentro de la app ya se creó arriba; falta el email para quien pagó.
        await avisarPagoRecibido({
          userId: payment.payerId,
          titulo: requiereAprobacion ? 'Recibimos tu pago: tu publicación está en revisión' : 'Recibimos tu pago: tu trabajo está publicado',
          mensaje: requiereAprobacion
            ? `Recibimos el pago de "${job.title}". Un administrador la revisa y, apenas la apruebe, queda visible para los profesionales. Te avisamos.`
            : `Recibimos el pago de "${job.title}" y ya está publicado: los profesionales pueden enviar propuestas.`,
          monto: Number(payment.amount),
          ruta: `/jobs/${job.id}`,
          notificarEnLaApp: false,
        });

        res.json({
          success: true,
          data: {
            paymentId: payment.id,
            captureId: captureResult.captureId,
            status: payment.status,
            amount: payment.amount,
            jobId: job.id,
            jobPublished: !requiereAprobacion,
            jobPendingApproval: requiereAprobacion,
          },
        });
        return;
      }
    }

    // Handle budget increase payment
    if (payment.paymentType === "budget_increase") {
      console.log("🔍 [CAPTURE] Step 7 - Detected budget increase payment");
      const job = await Job.findOne({ where: { publicationPaymentId: payment.id } });
      if (job && job.pendingNewPrice) {
        // Etapa de lanzamiento: todo pago confirmado por Mercado Pago lo confirma un administrador (módulo «Aprobación de
        // publicaciones pagadas», encendido por defecto). El aumento queda esperando; si nadie lo revisa en el plazo, un
        // proceso programado lo aprueba solo porque el pago está confirmado. Con el módulo apagado se aplica al volver.
        const requiereAprobacion = await moduloActivo(MODULO_APROBACION_DE_PUBLICACIONES, true);
        if (requiereAprobacion) {
          await dejarAumentoEnRevision(payment, job);
          res.json({
            success: true,
            data: {
              paymentId: payment.id,
              captureId: captureResult.captureId,
              status: payment.status,
              amount: payment.amount,
              jobId: job.id,
              budgetUpdated: false,
              budgetPendingApproval: true,
              approvalHours: POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS,
              oldPrice: Number(job.price),
              newPrice: Number(job.pendingNewPrice),
            },
          });
          return;
        }

        const aplicado = await aplicarAumentoDePrecio(payment, 'retorno');
        console.log(`✅ [CAPTURE] Budget increase applied: $${aplicado.precioAnterior} -> $${aplicado.precioNuevo} for job ${job.id}`);
        res.json({
          success: true,
          data: {
            paymentId: payment.id,
            captureId: captureResult.captureId,
            status: payment.status,
            amount: payment.amount,
            jobId: job.id,
            budgetUpdated: aplicado.aplicado,
            oldPrice: aplicado.precioAnterior,
            newPrice: aplicado.precioNuevo,
          },
        });
        return;
      }
    }

    // Update contract payment status (for contract payments)
    console.log("🔍 [CAPTURE] Step 7 - Processing contract payment...");
    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      console.log("🔍 [CAPTURE] Contract found:", contract.id);
      contract.paymentStatus = payment.isEscrow ? "escrow" : "completed";
      // Escrow SYNC: contract.escrowStatus + contract.paymentStatus + payment.status cambian juntos.
      if (payment.isEscrow) contract.escrowStatus = "held_escrow";
      await contract.save();
      console.log("✅ [CAPTURE] Contract updated. Payment status:", contract.paymentStatus);
    } else {
      console.log("⚠️ [CAPTURE] No contract found for contractId:", payment.contractId);
    }

    // Handle quote payment — mark quote accepted after payment
    if (payment.paymentType === 'quote_payment' && payment.quoteId) {
      const { Quote } = await import('../models/sql/Quote.model.js');
      const quote = await Quote.findByPk(payment.quoteId);
      if (quote) {
        await quote.update({ status: 'accepted' });

        if ((quote as any).conversationId) {
          const { ChatMessage } = await import('../models/sql/ChatMessage.model.js');
          await ChatMessage.create({
            conversationId: (quote as any).conversationId,
            senderId: payment.payerId,
            message: `Pago confirmado||Cotización pagada y aceptada||Monto: $${Number(payment.amount).toLocaleString('es-AR')} ARS`,
            type: 'system',
            metadata: { action: 'quote_payment_confirmed', quoteId: quote.id, paymentId: payment.id },
          } as any);
        }

        await Notification.create({
          recipientId: (quote as any).senderId,
          type: 'success',
          category: 'payment',
          title: 'Cotización pagada y aceptada',
          message: `Recibiste el pago por tu cotización "${(quote as any).title}". El monto neto estará disponible en tu balance.`,
          relatedModel: 'Quote',
          relatedId: quote.id,
          actionUrl: `/quotes/${quote.id}`,
          actionText: 'Ver cotización',
          sentVia: ['in_app'],
        });

        socketService.notifyUser((quote as any).senderId, 'notification:new', {
          title: 'Cotización pagada',
          message: `Recibiste el pago de "${(quote as any).title}"`,
        });

        res.json({
          success: true,
          data: { paymentId: payment.id, status: payment.status, quoteId: quote.id, quoteAccepted: true },
        });
        return;
      }
    }

    // Create notifications (for contract payments)
    const payer = await User.findByPk(payment.payerId);
    const recipient = await User.findByPk(payment.recipientId);

    if (recipient) {
      await Notification.create({
        recipientId: payment.recipientId,
        type: "success",
        category: "payment",
        title: "Pago recibido",
        message: payment.isEscrow
          ? `${payer?.name} ha depositado $${payment.amount} en escrow para el contrato`
          : `Has recibido un pago de $${payment.amount} de ${payer?.name}`,
        relatedModel: "Payment",
        relatedId: payment.id,
        sentVia: ["in_app"],
      });
    }

    await Notification.create({
      recipientId: payment.payerId,
      type: "info",
      category: "payment",
      title: "Pago enviado",
      message: payment.isEscrow
        ? `Tu pago de $${payment.amount} está en escrow hasta que se complete el trabajo`
        : `Has enviado $${payment.amount} a ${recipient?.name}`,
      relatedModel: "Payment",
      relatedId: payment.id,
      sentVia: ["in_app"],
    });

    console.log("✅ [CAPTURE] Step 8 - Capture process completed successfully");
    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        captureId: captureResult.captureId,
        status: payment.status,
        amount: payment.amount,
        contractId: payment.contractId,
      },
    });
  } catch (error: any) {
    console.error("❌❌❌ [CAPTURE ERROR] ❌❌❌");
    console.error("❌ [CAPTURE ERROR] Message:", error.message);
    console.error("❌ [CAPTURE ERROR] Stack:", error.stack);
    console.error("❌ [CAPTURE ERROR] Full error:", JSON.stringify(error, null, 2));
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
    const userId = req.user.id;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is the payer (client releasing payment)
    if (payment.payerId !== userId) {
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
    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      contract.paymentStatus = "completed";
      await contract.save();
    }

    // Notify recipient
    const recipient = await User.findByPk(payment.recipientId);
    await Notification.create({
      recipientId: payment.recipientId,
      type: "success",
      category: "payment",
      title: "Pago liberado",
      message: `El escrow de $${payment.amount} ha sido liberado. El pago está disponible.`,
      relatedModel: "Payment",
      relatedId: payment.id,
      sentVia: ["in_app"],
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
    const userId = req.user.id;

    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Only allow refund if user is recipient or admin
    const user = await User.findByPk(userId);
    if (payment.recipientId !== userId && !user?.adminRole) {
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
    const paypalService = (await import('../services/paypalService.js').catch(() => ({ default: null }))).default;
    const refundResult = await (paypalService as any)?.refundPayment(
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
    const contract = await Contract.findByPk(payment.contractId);
    if (contract) {
      contract.paymentStatus = "refunded";
      await contract.save();
    }

    // Notify payer
    await Notification.create({
      recipientId: payment.payerId,
      type: "info",
      category: "payment",
      title: "Pago reembolsado",
      message: `Tu pago de $${payment.amount} ha sido reembolsado. Razón: ${reason}`,
      relatedModel: "Payment",
      relatedId: payment.id,
      sentVia: ["in_app"],
    });

    res.json({ success: true, data: { payment, refundId: refundResult.refundId } });
  } catch (error: any) {
    console.error("Refund payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get user payments (sent and received)
 * GET /api/payments/my/list
 */
router.get("/my/list", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { type = "all", page = 1, limit = 20 } = req.query;

    const whereClause: any = {};
    if (type === "sent") {
      // Include both: sent to others AND platform payments (job publications, etc)
      whereClause.payerId = userId;
    } else if (type === "received") {
      whereClause.recipientId = userId;
    } else {
      // Show all: sent to others, received, AND platform payments
      whereClause[Op.or] = [
        { payerId: userId },
        { recipientId: userId }
      ];
    }

    const payments = await Payment.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'payer', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['name', 'email', 'avatar'] },
        {
          model: Contract,
          as: 'contract',
          attributes: ['id', 'status', 'price'],
          include: [{
            model: Job,
            as: 'job',
            attributes: ['id', 'title']
          }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit)
    });

    // For job_publication payments, find the associated job
    const paymentsData = payments.map((p: any) => p.toJSON());
    const jobPubPaymentIds = paymentsData
      .filter((p: any) => p.paymentType === 'job_publication' && !p.contract)
      .map((p: any) => p.id);

    if (jobPubPaymentIds.length > 0) {
      const jobs = await Job.findAll({
        where: { publicationPaymentId: { [Op.in]: jobPubPaymentIds } },
        attributes: ['id', 'title', 'publicationPaymentId'],
      });
      const jobByPaymentId = new Map(jobs.map((j: any) => [j.publicationPaymentId, j]));
      for (const p of paymentsData) {
        if (p.paymentType === 'job_publication' && !p.contract) {
          const job = jobByPaymentId.get(p.id);
          if (job) {
            p.relatedJob = { id: job.id, title: job.title };
          }
        }
      }
    }

    const total = await Payment.count({ where: whereClause });

    res.json({
      success: true,
      data: paymentsData,
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
    const userId = req.user.id;

    const contract = await Contract.findByPk(contractId);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is part of the contract
    if (
      contract.clientId !== userId &&
      contract.doerId !== userId
    ) {
      const user = await User.findByPk(userId);
      if (!user?.adminRole) {
        res.status(403).json({ success: false, message: "Unauthorized" });
        return;
      }
    }

    const payments = await Payment.findAll({
      where: { contractId },
      include: [
        { model: User, as: 'payer', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['name', 'email', 'avatar'] }
      ],
      order: [['createdAt', 'DESC']]
    });

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

/**
 * AstroPay webhook — payment status notifications.
 * Uses raw body so the HMAC signature can be verified byte-for-byte.
 * POST /api/payments/webhook/astropay
 */
router.post("/webhook/astropay", express.raw({ type: "*/*" }), async (req, res): Promise<void> => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
    const signature = (req.headers["merchant-gateway-signature"] || req.headers["x-astropay-signature"]) as string | undefined;

    if (!astropayService.verifyWebhookSignature(rawBody, signature)) {
      console.warn("[AstroPay webhook] invalid signature");
      res.status(401).json({ success: false, message: "Invalid signature" });
      return;
    }

    const event = JSON.parse(rawBody);
    const depositId: string | undefined = event.deposit_id || event.id;
    const apStatus: string = (event.status || "").toString().toUpperCase();

    if (!depositId) {
      res.status(400).json({ success: false, message: "Missing deposit id" });
      return;
    }

    const payment = await Payment.findOne({ where: { astropayDepositId: depositId } });
    if (!payment) {
      // Acknowledge so AstroPay stops retrying; nothing to update.
      res.json({ success: true, message: "Payment not found" });
      return;
    }

    payment.astropayStatus = apStatus;

    const approved = ["APPROVED", "COMPLETED", "PAID", "SUCCESS"].includes(apStatus);
    const failed = ["REJECTED", "CANCELLED", "FAILED", "EXPIRED"].includes(apStatus);

    if (approved && payment.status === "pending") {
      if (payment.paymentType === "contract_payment" && payment.isEscrow) {
        // Escrow SYNC: keep payment + contract escrow status aligned (see CLAUDE.md)
        payment.status = "held_escrow";
        if (payment.contractId) {
          const contract = await Contract.findByPk(payment.contractId);
          if (contract) {
            contract.escrowStatus = "held_escrow";
            (contract as any).paymentStatus = "held";
            await contract.save();
          }
        }
      } else if (payment.paymentType === "job_publication") {
        payment.status = "completed";
        // Move the related job to admin approval, mirroring the MercadoPago success path
        const relatedJob = await Job.findOne({ where: { publicationPaymentId: payment.id } });
        if (relatedJob && relatedJob.status === "pending_payment") {
          relatedJob.status = "pending_approval";
          (relatedJob as any).publicationPaid = true;
          await relatedJob.save();
        }
      } else {
        payment.status = "completed";
      }
    } else if (failed) {
      payment.status = "failed";
    }

    await payment.save();
    res.json({ success: true });
  } catch (error: any) {
    console.error("[AstroPay webhook] error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Create payment for job publication
 * POST /api/payments/job-publication/:jobId
 */
router.post("/job-publication/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    // Find the job
    const job = await Job.findByPk(jobId);
    if (!job) {
      res.status(404).json({ success: false, message: "Job not found" });
      return;
    }

    // Verify user is the owner
    if (job.client !== userId) {
      res.status(403).json({ success: false, message: "Unauthorized" });
      return;
    }

    // Verify job status
    if (job.status !== "draft" && job.status !== "pending_payment") {
      res.status(400).json({ success: false, message: "Job already published or invalid status" });
      return;
    }

    // Check if already paid
    if (job.publicationPaid) {
      res.status(400).json({ success: false, message: "Job publication already paid" });
      return;
    }

    const amount = job.publicationAmount || 10; // Default $10 USD

    // Create PayPal order
    const paypalService = (await import('../services/paypalService.js').catch(() => ({ default: null }))).default;
    const paypalOrder = await (paypalService as any)?.createOrder({
      amount: amount.toFixed(2),
      currency: "USD",
      description: `Publicación de trabajo: ${job.title}`,
      contractId: jobId,
      returnUrl: `${config.clientUrl}/payment/success?type=job-publication&jobId=${jobId}`,
      cancelUrl: `${config.clientUrl}/payment/cancel?type=job-publication&jobId=${jobId}`,
    });

    // Create payment record
    const payment = await Payment.create({
      contractId: null,
      payerId: userId,
      recipientId: null,
      amount,
      currency: "USD",
      status: "pending",
      paymentType: "job_publication",
      paypalOrderId: paypalOrder.orderId,
      description: `Publicación: ${job.title}`,
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
    });

    // Update job with payment reference
    job.publicationPaymentId = payment.id;
    job.status = "pending_payment";
    await job.save();

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: paypalOrder.orderId,
        approvalUrl: paypalOrder.links?.find((link: any) => link.rel === "approve")?.href,
        amount,
      },
    });
  } catch (error: any) {
    console.error("Create job publication payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Create a MercadoPago payment for contract with escrow
 * POST /api/payments/contract/:contractId
 */
router.post("/contract/:contractId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;

    // Find the contract
    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: Job, as: 'job' },
        { model: User, as: 'client' },
        { model: User, as: 'doer' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contract not found" });
      return;
    }

    // Verify user is the client
    if ((contract.client as any).id !== userId) {
      res.status(403).json({ success: false, message: "Only the client can pay for this contract" });
      return;
    }

    // Check if already paid
    if (contract.status === "in_progress" || contract.status === "completed") {
      res.status(400).json({ success: false, message: "Contract already paid" });
      return;
    }

    // Check for existing payment. También cuenta uno ya cobrado que espera al administrador (pendiente de verificación,
    // verificado, en proceso o completado): antes sólo se miraban pending/approved/held_escrow, y quien ya había pagado y
    // esperaba la verificación podía pagar una segunda vez.
    const existentes = await Payment.findAll({
      where: {
        contractId: contract.id,
        paymentType: { [Op.in]: ["contract_payment", "escrow_deposit", "contract"] },
        status: { [Op.in]: ["pending", "processing", "pending_verification", "verified", "approved", "held_escrow", "completed"] }
      },
      order: [["createdAt", "DESC"]],
    });

    // Se miran TODOS los pagos del contrato: si uno solo es plata en movimiento, no se crea otro. Un «pending» limpio se
    // anula (si nunca llegó a Mercado Pago) o se reanuda (misma dirección de pago, mismo registro); ver pagoDeContrato.ts.
    const clasificados = existentes.map((p) => ({ p, tipo: clasificarPagoExistente(p as any, contract as any) }));
    if (clasificados.some((x) => x.tipo === "bloquea")) {
      res.status(400).json({ success: false, message: "Payment already exists for this contract" });
      return;
    }
    const reanudable = clasificados.find((x) => x.tipo === "reanudable");
    if (reanudable) {
      res.json({
        success: true,
        reanudado: true,
        paymentUrl: direccionDePagoGuardada(reanudable.p as any),
        paymentId: reanudable.p.id,
        preferenceId: (reanudable.p as any).mercadopagoPreferenceId,
      });
      return;
    }
    for (const x of clasificados) {
      await anularPagoHuerfano(x.p, "Se había iniciado el pago pero nunca llegó a Mercado Pago; el cliente pidió pagar de nuevo.", `user:${userId}`);
    }

    const jobTitle = (contract.job as any).title || 'Contrato';

    // El registro va primero: su id viaja en la metadata de la preferencia y es
    // lo que le permite al webhook encontrarlo.
    const payment = await Payment.create({
      contractId: contract.id,
      payerId: userId,
      recipientId: (contract.doer as any).id,
      amount: contract.totalPrice,
      currency: "ARS",
      status: "pending",
      // "contract_payment" y no "contract": es el tipo que reconocen los pasos del administrador (aprobar, verificar la
      // garantía, liberar). Con "contract" el pago aprobado quedaba "completed" sin retener nada y no se podía verificar la
      // garantía: el contrato nunca arrancaba.
      paymentType: "contract_payment",
      description: `Contrato: ${jobTitle}`,
      platformFee: contract.commission,
      platformFeePercentage: contract.commission > 0 ? ((contract.commission / contract.price) * 100) : 0,
      isEscrow: true,
      escrowStatus: "pending",
    });

    const mercadoPagoService = (await import('../services/mercadopago.js')).default;
    let orden: Awaited<ReturnType<typeof mercadoPagoService.createPayment>>;
    try {
      orden = await mercadoPagoService.createPayment({
        amount: Number(contract.totalPrice),
        currency: "ARS",
        description: `Contrato: ${jobTitle}`,
        provider: 'mercadopago',
        metadata: {
          payment_id: payment.id,
          type: 'contract',
          contract_id: contract.id,
        },
        ...urlsDeRetorno(
          req.body?.origen,
          { exito: `${config.clientUrl}/contracts/${contract.id}?pago=ok`, cancelado: `${config.clientUrl}/contracts/${contract.id}?pago=cancelado` },
          { tipo: 'contrato', ids: { contractId: String(contract.id) } },
        ),
      });
    } catch (errorDeMp: any) {
      // El registro se creó antes de hablar con Mercado Pago; si la preferencia no se armó, nadie lo puede pagar y no
      // tiene que quedar «pending» bloqueando el próximo intento.
      await anularPagoHuerfano(payment, `Mercado Pago no pudo armar la preferencia: ${errorDeMp?.message || 'error desconocido'}`, 'system');
      throw errorDeMp;
    }

    (payment as any).mercadopagoPreferenceId = orden.providerPaymentId || orden.paymentId;
    // La dirección de pago queda guardada: si el cliente cierra el checkout, se la puede devolver (mismo pago, sin cobrar dos veces).
    (payment as any).metadata = { ...((payment as any).metadata || {}), checkoutUrl: orden.checkoutUrl };
    await payment.save();

    // Update contract with payment reference
    (contract as any).paymentId = payment.id;
    await contract.save();

    res.json({
      success: true,
      paymentUrl: orden.checkoutUrl,
      paymentId: payment.id,
      preferenceId: orden.providerPaymentId,
    });
  } catch (error: any) {
    console.error("Create contract payment error:", error);
    res.status(500).json({ success: false, message: error.message || "Error creating payment" });
  }
});

/**
 * Cobrar una cotizacion antes de aceptarla.
 * POST /api/payments/quote/:proposalId
 *
 * Primero se paga, despues se selecciona al trabajador. El contrato lo crea el
 * webhook cuando la plata se acredita, no esta ruta: si se creara acá, un pago
 * abandonado en la pantalla de MercadoPago dejaria al trabajador comprometido
 * con un contrato que nadie pago.
 */
router.post("/quote/:proposalId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { Proposal } = await import('../models/sql/Proposal.model.js');
    const { settleQuote } = await import('../services/quotePayment.js');

    const proposal = await Proposal.findByPk(req.params.proposalId);
    if (!proposal) {
      res.status(404).json({ success: false, message: "Cotización no encontrada" });
      return;
    }
    if ((proposal as any).clientId !== req.user.id) {
      res.status(403).json({ success: false, message: "Solo el cliente puede aceptar esta cotización" });
      return;
    }
    if ((proposal as any).status !== 'pending') {
      res.status(400).json({ success: false, message: "Esta cotización ya no está disponible" });
      return;
    }

    const job = await Job.findByPk((proposal as any).jobId);
    if (!job) {
      res.status(404).json({ success: false, message: "Trabajo no encontrado" });
      return;
    }

    const acordado = Number((proposal as any).proposedPrice) || Number(job.price) || 0;
    const liquidacion = await settleQuote(job as any, acordado);

    if (liquidacion.listoParaContratar) {
      res.status(400).json({
        success: false,
        message: "Esta cotización no requiere pago adicional: aceptala directamente.",
      });
      return;
    }

    // El pago se crea primero y sin id de pasarela: hace falta su id para que la
    // metadata que viaja a MercadoPago pueda apuntar de vuelta a este registro.
    // Sin eso el webhook no lo encuentra -- busca por contractId, y una
    // cotización todavía no tiene contrato.
    const payment = await Payment.create({
      contractId: null,
      payerId: req.user.id,
      recipientId: (proposal as any).freelancerId,
      amount: liquidacion.totalACobrar,
      currency: "ARS",
      status: "pending",
      paymentType: "contract_payment",
      description: `Cotización aceptada: ${job.title}`,
      platformFee: liquidacion.comision,
      platformFeePercentage: liquidacion.aPagar > 0 ? (liquidacion.comision / liquidacion.aPagar) * 100 : 0,
      processingCharge: liquidacion.procesamiento,
      isEscrow: true,
      escrowStatus: "pending",
      // El webhook necesita saber a que cotizacion corresponde este pago y por
      // cuanto se acordo: el precio del trabajo todavia no lo refleja.
      metadata: {
        proposalId: (proposal as any).id,
        jobId: job.id,
        montoAcordado: liquidacion.acordado,
        tipo: 'aceptacion_cotizacion',
      },
    } as any);

    const mercadoPagoService = (await import('../services/mercadopago.js')).default;
    const orden = await mercadoPagoService.createPayment({
      amount: liquidacion.totalACobrar,
      currency: 'ARS',
      description: `Cotización: ${job.title}`,
      provider: 'mercadopago',
      // payment_id es lo que hace que el webhook encuentre este registro. Va en
      // la metadata de la preferencia y MercadoPago la devuelve con el pago.
      metadata: {
        payment_id: payment.id,
        type: 'aceptacion_cotizacion',
        proposal_id: (proposal as any).id,
        job_id: job.id,
      },
      ...urlsDeRetorno(
        req.body?.origen,
        { exito: `${config.clientUrl}/proposals/${(proposal as any).id}?pago=ok`, cancelado: `${config.clientUrl}/proposals/${(proposal as any).id}?pago=cancelado` },
        { tipo: 'cotizacion', ids: { proposalId: String((proposal as any).id) } },
      ),
    });

    (payment as any).mercadopagoPreferenceId = orden.providerPaymentId || orden.paymentId;
    await payment.save();

    // El trabajador ve el proceso en vivo: saber que el cliente esta pagando
    // cambia lo que hace mientras tanto -- deja de buscar otro trabajo para esa
    // fecha. Que se entere recien con el contrato firmado llega tarde.
    socketService.notifyUser((proposal as any).freelancerId, 'quote:payment_started', {
      proposalId: (proposal as any).id,
      jobId: job.id,
      jobTitle: job.title,
      monto: liquidacion.acordado,
      estado: 'esperando_pago',
    });

    res.json({
      success: true,
      paymentUrl: orden.checkoutUrl,
      paymentId: payment.id,
      preferenceId: orden.providerPaymentId,
      liquidacion,
    });
  } catch (error: any) {
    console.error("Error creando el pago de la cotización:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Upload payment proof (for bank transfer and Binance payments)
 * POST /api/payments/:paymentId/upload-proof
 */
router.post("/:paymentId/upload-proof", protect, upload.single('proof'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;
    const {
      binanceNickname,
      transferAmount,
      transferCurrency,
      binanceTransactionId,
      binanceSenderUserId,
      // Bank transfer fields
      isOwnBankAccount,
      thirdPartyAccountHolder,
      senderBankName
    } = req.body;

    if (!req.file) {
      res.status(400).json({ success: false, message: "No se subió ningún archivo" });
      return;
    }

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Verify user is the payer
    if (payment.payerId !== userId) {
      res.status(403).json({ success: false, message: "No autorizado" });
      return;
    }

    // «Ya pagué»: una transferencia bancaria declara número de operación, quién la hizo (nombre y documento), banco y fecha. Se valida acá
    // (la pantalla ya lo hizo, pero nada que llegue del navegador se da por bueno) y el número no puede haberse usado en OTRO pago.
    const esTransferencia = payment.paymentMethod === 'bank_transfer';
    const declarado = {
      numero: String(req.body.bankReference ?? ''),
      nombre: String(req.body.senderName ?? ''),
      documento: String(req.body.senderDocument ?? ''),
      banco: String(req.body.senderBankName ?? ''),
      fecha: String(req.body.transferDate ?? ''),
    };
    // Se exige en los pagos de la pantalla /payment (publicación y aumento de presupuesto); en los demás (órdenes de pago al terminar, que suben
    // solo el archivo) se valida y se guarda si vienen, pero no se rechaza si faltan.
    const exigeDatos = esTransferencia && ['job_publication', 'budget_increase'].includes(String(payment.paymentType));
    const trajoDatos = Object.values(declarado).some((v) => v.trim() !== '');
    const declaraTransferencia = esTransferencia && (exigeDatos || trajoDatos);
    if (declaraTransferencia) {
      const { ok, errores } = validarDatosDeTransferencia(declarado, { exigirArchivo: false });
      if (!ok) {
        fs.promises.unlink(req.file.path).catch(() => {});
        res.status(400).json({
          success: false,
          code: 'DATOS_DE_TRANSFERENCIA_INVALIDOS',
          message: Object.values(errores).join(' '),
          errores,
        });
        return;
      }
      const repetido = await PaymentProof.findOne({
        where: { bankReference: { [Op.iLike]: declarado.numero.trim() }, paymentId: { [Op.ne]: paymentId }, status: { [Op.ne]: 'rejected' } } as any,
      });
      if (repetido) {
        fs.promises.unlink(req.file.path).catch(() => {});
        res.status(409).json({
          success: false,
          code: 'NUMERO_DE_OPERACION_REPETIDO',
          message: 'Ese número de operación ya se usó en otro pago. Revisá el número o escribinos a soporte si creés que es un error.',
        });
        return;
      }
    }

    // Deactivate previous proofs for this payment
    await PaymentProof.update(
      { isActive: false },
      { where: { paymentId, isActive: true } }
    );

    // Create new payment proof
    const proof = await PaymentProof.create({
      paymentId,
      userId,
      fileUrl: `/uploads/payment-proofs/${req.file.filename}`,
      fileType: path.extname(req.file.originalname).slice(1).toLowerCase() as any,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      binanceNickname: binanceNickname || null,
      binanceTransactionId: binanceTransactionId || null,
      binanceSenderUserId: binanceSenderUserId || null,
      transferAmount: transferAmount || null,
      transferCurrency: transferCurrency || null,
      // Bank transfer fields
      isOwnBankAccount: isOwnBankAccount === 'true' || isOwnBankAccount === true,
      thirdPartyAccountHolder: thirdPartyAccountHolder || null,
      senderBankName: senderBankName || null,
      ...(declaraTransferencia && {
        bankReference: declarado.numero.trim(),
        senderName: declarado.nombre.trim().replace(/\s+/g, ' '),
        senderDocument: documentoNormalizado(declarado.documento) ?? undefined,
        transferDate: declarado.fecha,
      }),
      status: 'pending',
      uploadedAt: new Date(),
      isActive: true,
    });

    // Update payment status to pending verification
    payment.status = 'pending_verification';
    await payment.save();

    // Update job status if this is a job publication payment
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'pending_approval'; // Waiting for admin to verify payment proof
        await job.save();
      }
    }

    // Update job status if this is a budget increase payment
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        // Keep job paused but mark payment as pending verification
        // Job will be reactivated when admin approves the payment
        console.log(`Budget increase payment proof uploaded for job ${job.id}, waiting for admin approval`);
      }
    }

    // Notify admins about new payment proof
    const adminUsers = await User.findAll({ where: { ...DONDE_ES_ADMIN } });

    // Los campos de Notification son recipientId/category/relatedModel; antes se mandaban userId y
    // relatedType (que no existen) sin category (obligatoria): al encontrar de verdad a algún admin,
    // el aviso lanzaba un error y la subida del comprobante respondía 500 con el estado ya cambiado.
    // Avisar es secundario: si falla, el comprobante igual quedó subido.
    for (const admin of adminUsers) {
      await Notification.create({
        recipientId: admin.id,
        type: 'info',
        category: 'payment',
        title: 'Nuevo comprobante de pago',
        message: `Usuario ${req.user.username} subió un comprobante para el pago ${paymentId}`,
        relatedModel: 'Payment',
        relatedId: paymentId,
        sentVia: ['in_app'],
      } as any).catch((error: any) => {
        logger.silentError('payments', 'No se pudo avisar a un administrador del comprobante', error, { paymentId });
      });
    }

    res.json({
      success: true,
      message: "Comprobante subido exitosamente. Será verificado por un administrador.",
      proof: {
        id: proof.id,
        fileUrl: proof.fileUrl,
        fileName: proof.fileName,
        status: proof.status,
        uploadedAt: proof.uploadedAt,
      }
    });
  } catch (error: any) {
    console.error("Upload payment proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error subiendo comprobante" });
  }
});

/**
 * Get payment proofs for a payment
 * GET /api/payments/:paymentId/proofs
 */
router.get("/:paymentId/proofs", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Verify user is involved in the payment or is admin
    const isAdmin = ['admin', 'super_admin', 'owner'].includes(req.user.role);
    if (payment.payerId !== userId && payment.recipientId !== userId && !isAdmin) {
      res.status(403).json({ success: false, message: "No autorizado" });
      return;
    }

    // Get all proofs for this payment
    const proofs = await PaymentProof.findAll({
      where: { paymentId },
      order: [['uploadedAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: User, as: 'verifier', attributes: ['id', 'username', 'email'] }
      ]
    });

    res.json({
      success: true,
      proofs
    });
  } catch (error: any) {
    console.error("Get payment proofs error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo comprobantes" });
  }
});

/**
 * GET /api/payments/quote?price=36000
 *
 * The authoritative breakdown for a contract price: commission, IVA and what
 * the client will actually be charged.
 *
 * Exists because JobPayment.tsx used to recompute the commission in the
 * browser — tiers, free contracts and the $1.000 minimum, all duplicated. That
 * second implementation cannot know about the platform phase or the tax, so it
 * showed one number while the server charged another. On a payment screen that
 * gap is a dispute waiting to happen, so the number comes from the same
 * function that does the charging.
 */
/**
 * GET /api/payments/bank-details
 * La cuenta para pagar por transferencia, tal como está en el entorno (BANK_CBU, BANK_ALIAS…). La pantalla de pago la pide al elegir
 * «Transferencia»; si no hay cuenta configurada responde disponible:false y la opción no se ofrece.
 */
router.get("/bank-details", protect, async (_req: AuthRequest, res: Response): Promise<void> => {
  const cuenta = datosBancarios();
  res.json({ success: true, disponible: !!cuenta, bankDetails: cuenta });
});

router.get("/quote", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    /**
     * Se puede pedir por precio o por trabajo, y la diferencia importa.
     *
     * Con `price` la comisión se calcula para quien pregunta: sirve cuando el
     * que mira es el cliente que va a pagar.
     *
     * Con `jobId` se calcula para el DUEÑO del trabajo. Es lo que necesita el
     * trabajador antes de postularse: cuánto le va a quedar depende del plan
     * del cliente, no del suyo, así que preguntarlo con su propio id daría un
     * número que no es el que va a cobrar.
     */
    const jobId = String((req.query as any).jobId || '');
    let price = Number((req.query as any).price);
    let quienPaga = req.user!.id;
    let job: Job | null = null;

    if (jobId) {
      job = await Job.findByPk(jobId, { attributes: ['id', 'price', 'clientId', 'pendingNewPrice', 'pendingBalanceDeduction', 'pendingPaymentAmount'] });
      if (!job) {
        res.status(404).json({ success: false, message: "Trabajo no encontrado" });
        return;
      }
      price = Number(job.price);
      quienPaga = (job as any).clientId;
    }

    const phase = await getPhaseInfo();

    /**
     * Con `aumento=1` y un trabajo con aumento pendiente, el desglose es el del
     * aumento: la misma cuenta que fijo el monto (liquidarAumento), para que la
     * pantalla de pago no lo rearme a partir de parametros de la URL.
     */
    if (job && String((req.query as any).aumento || '') === '1') {
      if (!job.pendingNewPrice) {
        res.status(400).json({ success: false, message: "Este trabajo no tiene un aumento pendiente" });
        return;
      }
      const { liquidarAumento } = await import('../services/quotePayment.js');
      const a = await liquidarAumento(job as any, Number(job.pendingNewPrice), Number((job as any).pendingBalanceDeduction) || 0);
      res.json({
        success: true,
        data: {
          modo: 'aumento',
          oldPrice: a.precioActual,
          newPrice: a.precioNuevo,
          priceDifference: a.diferencia,
          commission: a.comision,
          commissionRate: a.comisionRate,
          vat: a.iva,
          vatRate: 21,
          totalRequired: a.totalRequerido,
          balanceToUse: a.saldoAUsar,
          processingCharge: a.procesamiento,
          processingVat: a.procesamientoIva,
          processingRate: Math.round(getProcessingFeeRate() * 10000) / 100,
          totalToPay: a.aPagar,
          isBeta: phase.isBeta,
        },
      });
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      res.status(400).json({ success: false, message: "Precio invalido" });
      return;
    }

    // La misma cuenta que el cobro: con un cupo libre de comisión disponible el desglose ya sale sin comisión.
    const dueno: any = await User.findByPk(quienPaga);
    const c = dueno
      ? (await comisionDePublicacion(dueno, job as any, price)).comision
      : await calculateCommission(quienPaga, price);
    const split = splitFees(price, c.commission, c.vat);

    res.json({
      success: true,
      data: {
        price,
        commission: c.commission,
        commissionRate: c.rate,
        minimumApplied: c.minimumApplied,
        vat: c.vat,
        vatRate: c.vatRate,
        platformTotal: c.totalFee,
        // El costo de procesamiento lo paga el cliente, con una tasa unica. Se
        // muestra como una linea de su cuenta, con su IVA.
        processingCharge: split.processingCharge,
        processingVat: split.processingVat,
        processingRate: Math.round(split.rate * 10000) / 100,
        // IVA total de la factura: sobre la comision y sobre el procesamiento.
        totalVat: split.totalVat,
        // Las dos cifras que a cada parte le importan, ya calculadas, para que
        // ninguna tenga que sumar por su cuenta y llegar a otro numero.
        totalToPay: split.clientPays,
        workerReceives: split.workerReceives,
        tierDescription: c.tierDescription,
        phase: phase.phase,
        isBeta: phase.isBeta,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});
/**
 * Get currency conversion rates (ARS to USDT)
 * GET /api/payments/conversion/usdt
 */
router.get("/conversion/usdt", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount } = req.query;

    if (!amount || isNaN(Number(amount))) {
      res.status(400).json({ success: false, message: "Debe proporcionar un monto válido" });
      return;
    }

    const amountARS = Number(amount);
    // One quote for both figures: fetching the rate twice could straddle a cache
    // expiry and show an amount that does not match the rate beside it.
    const quote = await currencyExchange.getQuotedUSDTRate();
    const rate = quote.rate;
    const amountUSDT = Math.round((amountARS / rate) * 100) / 100;

    res.json({
      success: true,
      conversion: {
        amountARS,
        amountUSDT,
        rate,
        // When the rate was actually fetched, not when this response was built —
        // that is the number that tells the user how stale the quote is.
        quotedAt: quote.timestamp,
        source: quote.source,
        // El mismo dato, ya legible para mostrarlo tal cual en pantalla.
        cotizacion: (await import('../services/currencyExchange.js')).describirCotizacion(quote),
        timestamp: new Date(),
      },
      binanceInfo: {
        binanceId: process.env.BINANCE_ID || null,
        binanceNickname: process.env.BINANCE_NICKNAME || null,
      }
    });
  } catch (error: any) {
    console.error("Get conversion error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo conversión" });
  }
});

/**
 * Get latest active payment proof for a payment
 * GET /api/payments/:paymentId/proof
 */
router.get("/:paymentId/proof", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Verify user is involved in the payment or is admin
    const isAdmin = ['admin', 'super_admin', 'owner'].includes(req.user.role);
    if (payment.payerId !== userId && payment.recipientId !== userId && !isAdmin) {
      res.status(403).json({ success: false, message: "No autorizado" });
      return;
    }

    // Get latest active proof
    const proof = await PaymentProof.findOne({
      where: { paymentId, isActive: true },
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] },
        { model: User, as: 'verifier', attributes: ['id', 'username', 'email'] }
      ]
    });

    if (!proof) {
      res.status(404).json({ success: false, message: "No se encontró comprobante" });
      return;
    }

    res.json({
      success: true,
      proof
    });
  } catch (error: any) {
    console.error("Get payment proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo comprobante" });
  }
});

/**
 * Approve payment proof (admin only)
 * POST /api/payments/:paymentId/proof/:proofId/approve
 */
router.post("/:paymentId/proof/:proofId/approve", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, proofId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.id;

    // Find the payment proof
    const proof = await PaymentProof.findOne({
      where: { id: proofId, paymentId, isActive: true }
    });

    if (!proof) {
      res.status(404).json({ success: false, message: "Comprobante no encontrado" });
      return;
    }

    if (proof.status !== 'pending') {
      res.status(400).json({ success: false, message: "Este comprobante ya fue procesado" });
      return;
    }

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Nadie aprueba el comprobante de un pago propio (salvo el dueño): nadie más comprobaría que el dinero entró.
    const bloqueoPropio = bloqueoPorAprobacionPropia(payment, req.user);
    if (bloqueoPropio) {
      res.status(bloqueoPropio.status).json(bloqueoPropio.body);
      return;
    }

    // Update proof status
    proof.status = 'approved';
    proof.verifiedBy = adminId;
    proof.verifiedAt = new Date();
    if (notes) proof.notes = notes;
    await proof.save();

    // Update payment status to approved
    payment.status = 'approved';
    await payment.save();

    // If this is a job publication payment, publish the job
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'open';
        job.publicationPaid = true;
        await job.save();

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Pago aprobado',
          message: `Tu pago para publicar "${job.title}" fue aprobado. ¡El trabajo está ahora publicado!`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });

        // Real-time notification
        socketService.notifyJobStatusChanged(job.toJSON(), 'pending_payment');
      }
    }

    // If this is a budget increase payment, apply the new price and reactivate the job
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job && job.pendingNewPrice) {
        const oldPrice = Number(job.price);
        const newPrice = Number(job.pendingNewPrice);
        const previousStatus = job.previousStatus || 'open';

        // Agregar al historial de cambios
        const priceHistory = job.priceHistory || [];
        priceHistory.push({
          oldPrice,
          newPrice,
          reason: job.priceChangeReason || 'Aumento de presupuesto',
          changedAt: new Date(),
        });

        // Aplicar el nuevo precio y reactivar el trabajo
        await job.update({
          price: newPrice,
          priceChangedAt: new Date(),
          priceHistory,
          pendingNewPrice: null,
          pendingPaymentAmount: 0,
          previousStatus: null,
          status: previousStatus,
        });

        console.log(`✅ [APPROVE] Budget increase applied: $${oldPrice} -> $${newPrice} for job ${job.id}`);

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Presupuesto actualizado',
          message: `Tu pago fue aprobado. El presupuesto de "${job.title}" ha sido actualizado a $${newPrice.toLocaleString('es-AR')} ARS. El trabajo ha sido reactivado.`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });

        // Real-time notification
        socketService.notifyJobStatusChanged(job.toJSON(), 'paused');
      }
    }

    // Notify user
    await Notification.create({
      userId: payment.payerId,
      title: 'Comprobante aprobado',
      message: 'Tu comprobante de pago fue verificado y aprobado.',
      type: 'payment',
      relatedId: paymentId,
      relatedType: 'Payment',
    });

    res.json({
      success: true,
      message: "Comprobante aprobado exitosamente",
      proof: {
        id: proof.id,
        status: proof.status,
        verifiedAt: proof.verifiedAt,
      }
    });
  } catch (error: any) {
    console.error("Approve proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error aprobando comprobante" });
  }
});

/**
 * Reject payment proof (admin only)
 * POST /api/payments/:paymentId/proof/:proofId/reject
 */
router.post("/:paymentId/proof/:proofId/reject", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId, proofId } = req.params;
    const { reason, notes } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      res.status(400).json({ success: false, message: "Debe proporcionar un motivo de rechazo" });
      return;
    }

    // Find the payment proof
    const proof = await PaymentProof.findOne({
      where: { id: proofId, paymentId, isActive: true }
    });

    if (!proof) {
      res.status(404).json({ success: false, message: "Comprobante no encontrado" });
      return;
    }

    if (proof.status !== 'pending') {
      res.status(400).json({ success: false, message: "Este comprobante ya fue procesado" });
      return;
    }

    // Find the payment
    const payment = await Payment.findByPk(paymentId);
    if (!payment) {
      res.status(404).json({ success: false, message: "Pago no encontrado" });
      return;
    }

    // Update proof status
    proof.status = 'rejected';
    proof.verifiedBy = adminId;
    proof.verifiedAt = new Date();
    proof.rejectionReason = reason;
    if (notes) proof.notes = notes;
    await proof.save();

    // Update payment status back to pending_verification so user can upload a new proof
    payment.status = 'pending_verification';
    await payment.save();

    // If this is a job publication payment, keep job in pending_payment status
    if (payment.paymentType === 'job_publication') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        job.status = 'pending_payment'; // User needs to upload a new proof
        await job.save();

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Comprobante rechazado',
          message: `Tu comprobante de pago para "${job.title}" fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });
      }
    }

    // If this is a budget increase payment, keep job paused waiting for new proof
    if (payment.paymentType === 'budget_increase') {
      const job = await Job.findOne({
        where: { publicationPaymentId: paymentId }
      });

      if (job) {
        // Job stays paused, user needs to upload a new proof
        // Don't clear pendingNewPrice yet - they might upload a valid proof

        // Notify job owner
        await Notification.create({
          userId: job.clientId,
          title: 'Comprobante rechazado',
          message: `Tu comprobante de pago para el aumento de presupuesto de "${job.title}" fue rechazado. Motivo: ${reason}. El trabajo permanece pausado. Por favor, sube un nuevo comprobante o cancela el cambio de presupuesto.`,
          type: 'payment',
          relatedId: job.id,
          relatedType: 'Job',
        });
      }
    }

    // Notify user
    await Notification.create({
      userId: payment.payerId,
      title: 'Comprobante rechazado',
      message: `Tu comprobante de pago fue rechazado. Motivo: ${reason}. Por favor, sube un nuevo comprobante.`,
      type: 'payment',
      relatedId: paymentId,
      relatedType: 'Payment',
    });

    res.json({
      success: true,
      message: "Comprobante rechazado",
      proof: {
        id: proof.id,
        status: proof.status,
        rejectionReason: proof.rejectionReason,
        verifiedAt: proof.verifiedAt,
      }
    });
  } catch (error: any) {
    console.error("Reject proof error:", error);
    res.status(500).json({ success: false, message: error.message || "Error rechazando comprobante" });
  }
});

/**
 * Get all pending payment proofs (admin only)
 * GET /api/payments/proofs/pending
 */
router.get("/proofs/pending", protect, requireRole('admin', 'super_admin', 'owner', 'support'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proofs = await PaymentProof.findAll({
      where: {
        status: 'pending',
        isActive: true,
      },
      include: [
        {
          model: Payment,
          as: 'payment',
          attributes: ['id', 'amount', 'currency', 'paymentType', 'paymentMethod', 'status', 'createdAt'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email', 'firstName', 'lastName'],
        }
      ],
      order: [['uploadedAt', 'ASC']],
    });

    res.json({
      success: true,
      count: proofs.length,
      proofs
    });
  } catch (error: any) {
    console.error("Get pending proofs error:", error);
    res.status(500).json({ success: false, message: error.message || "Error obteniendo comprobantes pendientes" });
  }
});

// ============================================
// INVOICE ENDPOINTS
// ============================================

/**
 * List all invoices for the authenticated user
 * GET /api/payments/invoices
 */
router.get("/invoices", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invoices = await getUserInvoices(req.user.id);
    res.json({
      success: true,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.type,
        amount: inv.amount,
        commission: inv.commission,
        total: inv.total,
        currency: inv.currency,
        status: inv.status,
        metadata: inv.metadata,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error obteniendo facturas" });
  }
});

/**
 * Download invoice PDF
 * GET /api/payments/invoices/:id/download
 */
router.get("/invoices/:id/download", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invoice = await getInvoiceById(req.params.id, req.user.id);
    if (!invoice) {
      res.status(404).json({ success: false, message: "Factura no encontrada" });
      return;
    }

    if (!invoice.pdfUrl || !fs.existsSync(invoice.pdfUrl)) {
      res.status(404).json({ success: false, message: "Archivo PDF no encontrado" });
      return;
    }

    const filename = `factura_${invoice.invoiceNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(invoice.pdfUrl).pipe(res);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error descargando factura" });
  }
});

/**
 * Pedir una dirección de descarga de corta vida (5 minutos) para una factura propia.
 * POST /api/payments/invoices/:id/download-link
 *
 * La app abre el PDF con el navegador del teléfono, que no manda la sesión: ver services/descargaDeFactura.ts.
 */
router.post("/invoices/:id/download-link", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invoice = await getInvoiceById(req.params.id, req.user.id);
    if (!invoice) {
      res.status(404).json({ success: false, message: "Factura no encontrada" });
      return;
    }
    const firma = firmarDescargaDeFactura(String(invoice.id), String(req.user.id));
    res.json({
      success: true,
      // Relativa a /api: cada cliente (la app) la completa con su propia dirección base.
      ruta: `/payments/invoices/${invoice.id}/download-signed?t=${encodeURIComponent(firma)}`,
      venceEnSegundos: 300,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error preparando la descarga" });
  }
});

/**
 * Descargar el PDF con una dirección firmada (sin sesión: la firma es la autorización).
 * GET /api/payments/invoices/:id/download-signed?t=<firma>
 */
router.get("/invoices/:id/download-signed", async (req, res: Response): Promise<void> => {
  try {
    const autorizado = verificarDescargaDeFactura(req.query.t, req.params.id);
    if (!autorizado) {
      res.status(401).json({ success: false, message: "El enlace de descarga no es válido o venció. Pedí uno nuevo desde la app." });
      return;
    }
    // La factura tiene que seguir siendo de la persona que firmó (no sólo existir).
    const invoice = await getInvoiceById(req.params.id, autorizado.usuarioId);
    if (!invoice || !invoice.pdfUrl || !fs.existsSync(invoice.pdfUrl)) {
      res.status(404).json({ success: false, message: "Archivo PDF no encontrado" });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="factura_${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(invoice.pdfUrl).pipe(res);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error descargando factura" });
  }
});

/**
 * Get invoice for a specific payment
 * GET /api/payments/:paymentId/invoice
 */
router.get("/:paymentId/invoice", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invoice = await Invoice.findOne({
      where: { paymentId: req.params.paymentId, userId: req.user.id },
    });

    if (!invoice) {
      res.status(404).json({ success: false, message: "Factura no encontrada para este pago" });
      return;
    }

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        amount: invoice.amount,
        commission: invoice.commission,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
        pdfUrl: `/api/payments/invoices/${invoice.id}/download`,
        metadata: invoice.metadata,
        createdAt: invoice.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error obteniendo factura" });
  }
});

/**
 * Get payment details (MUST be last - catch-all :paymentId param)
 * GET /api/payments/:paymentId
 */
router.get("/:paymentId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = req.user.id;

    const payment = await Payment.findByPk(paymentId, {
      include: [
        { model: User, as: 'payer', attributes: ['name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['name', 'email', 'avatar'] },
        { model: Contract, as: 'contract', attributes: ['id', 'status', 'price'], include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }] }
      ]
    });

    if (!payment) {
      res.status(404).json({ success: false, message: "Payment not found" });
      return;
    }

    // Verify user is part of the payment
    if (
      payment.payerId !== userId &&
      payment.recipientId !== userId
    ) {
      const user = await User.findByPk(userId);
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

export default router;
