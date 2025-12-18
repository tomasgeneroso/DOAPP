import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Referral } from "../models/sql/Referral.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { socketService } from "../index.js";
import { Op } from 'sequelize';

const router = express.Router();

// Comisión de la plataforma (10%) - DEPRECATED: usar currentCommissionRate del usuario
const PLATFORM_COMMISSION = 0.1;

/**
 * Check if user has admin privileges for viewing contracts
 */
function isAdminUser(user: any): boolean {
  return user?.adminRole && ['owner', 'super_admin', 'admin'].includes(user.adminRole);
}

// Mínimo de contrato en ARS
const MINIMUM_CONTRACT_AMOUNT = 8000;
const MINIMUM_COMMISSION = 1000;

/**
 * Process referral credit when a referred user completes their first contract
 * @param userId - The user ID who completed the contract (client or doer)
 * @param contractId - The contract ID that was completed
 */
async function processReferralCredit(userId: any, contractId: any): Promise<void> {
  try {
    // Find if this user was referred
    const referral = await Referral.findOne({
      where: {
        referredId: userId,
        status: "pending",
      },
      include: [
        {
          model: User,
          as: 'referrer',
        }
      ]
    });

    if (!referral) {
      return; // User was not referred or already processed
    }

    // Check if this is their first completed contract (as client or doer)
    const completedContracts = await Contract.count({
      where: {
        [Op.or]: [{ clientId: userId }, { doerId: userId }],
        status: "completed",
      }
    });

    if (completedContracts === 1) {
      // This is their first completed contract!
      // Update referral status
      referral.status = "completed";
      referral.firstContractId = contractId;
      referral.firstContractCompletedAt = new Date();
      await referral.save();

      // Credit the referrer with a free contract
      const referrer = await User.findByPk(referral.referrerId);
      if (referrer) {
        referrer.freeContractsRemaining += 1;
        await referrer.save();

        // Update referral to credited
        referral.status = "credited";
        referral.creditedAt = new Date();
        await referral.save();

        console.log(`Referral credit applied: User ${userId} completed first contract, credited referrer ${referrer.id}`);
      }
    }
  } catch (error) {
    console.error("Error processing referral credit:", error);
    // Don't throw - we don't want to fail contract completion if referral processing fails
  }
}

// @route   GET /api/contracts
// @desc    Obtener contratos del usuario con paginación
// @access  Private
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, page = "1", limit = "10" } = req.query;

    const query: any = {
      [Op.or]: [{ clientId: req.user.id }, { doerId: req.user.id }],
    };

    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const total = await Contract.count({ where: query });

    // Get paginated contracts
    const contracts = await Contract.findAll({
      where: query,
      include: [
        {
          model: Job,
          as: 'job',
          attributes: ['title', 'summary', 'location']
        },
        {
          model: User,
          as: 'client',
          attributes: ['name', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['name', 'avatar', 'rating', 'reviewsCount']
        }
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limitNum
    });

    res.json({
      success: true,
      count: contracts.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      hasMore: skip + contracts.length < total,
      contracts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/contracts/by-job/:jobId
// @desc    Obtener contrato por ID del trabajo
// @access  Private
router.get("/by-job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contract = await Contract.findOne({
      where: { jobId: req.params.jobId },
      include: [
        {
          model: Job,
          as: 'job'
        },
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email', 'phone', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'email', 'phone', 'avatar', 'rating', 'reviewsCount']
        }
      ]
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado para este trabajo",
      });
      return;
    }

    // Verificar que el usuario sea parte del contrato o sea admin
    const isParticipant =
      contract.clientId.toString() === req.user.id.toString() ||
      contract.doerId.toString() === req.user.id.toString();

    if (!isParticipant && !isAdminUser(req.user)) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este contrato",
      });
      return;
    }

    res.json({
      success: true,
      contract,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/contracts/:id
// @desc    Obtener contrato por ID
// @access  Private
router.get("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contract = await Contract.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: 'job'
        },
        {
          model: User,
          as: 'client',
          attributes: ['name', 'email', 'phone', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['name', 'email', 'phone', 'avatar', 'rating', 'reviewsCount']
        }
      ]
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea parte del contrato o sea admin
    const isParticipant =
      contract.clientId.toString() === req.user.id.toString() ||
      contract.doerId.toString() === req.user.id.toString();

    if (!isParticipant && !isAdminUser(req.user)) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este contrato",
      });
      return;
    }

    res.json({
      success: true,
      contract,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/contracts
// @desc    Crear nuevo contrato
// @access  Private
router.post(
  "/",
  protect,
  [
    body("job").notEmpty().withMessage("El trabajo es requerido"),
    body("doer").notEmpty().withMessage("El doer es requerido"),
    body("price").isNumeric().withMessage("El precio debe ser un número"),
    body("startDate").isISO8601().withMessage("Fecha de inicio inválida"),
    body("endDate").isISO8601().withMessage("Fecha de fin inválida"),
    body("termsAccepted", "Debes aceptar los términos del contrato")
      .custom((value) => value === true),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { job: jobId, doer: doerId, price, startDate, endDate, termsAccepted, notes, useFreeContract } = req.body;

      // Validar monto mínimo de $8,000 ARS
      if (price < MINIMUM_CONTRACT_AMOUNT) {
        res.status(400).json({
          success: false,
          message: `El monto mínimo del contrato es de $${MINIMUM_CONTRACT_AMOUNT.toLocaleString()} ARS`,
        });
        return;
      }

      // Verificar que el trabajo existe
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({
          success: false,
          message: "Trabajo no encontrado",
        });
        return;
      }

      // Verificar que el usuario sea el dueño del trabajo
      if (job.clientId.toString() !== req.user.id.toString()) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para crear un contrato para este trabajo",
        });
        return;
      }

      // Verificar que el doer existe
      const doer = await User.findByPk(doerId);
      if (!doer) {
        res.status(404).json({
          success: false,
          message: "Doer no encontrado",
        });
        return;
      }

      // Check if user wants to use a free contract and has one available
      const client = await User.findByPk(req.user.id);
      let isFreeContract = false;

      if (useFreeContract && client && client.freeContractsRemaining > 0) {
        isFreeContract = true;
        // Decrement free contracts
        client.freeContractsRemaining -= 1;
        await client.save();
      }

      // Calcular comisión basada en el tier del usuario
      // PLAN FAMILIA: 0% | SUPER PRO: 2% | PRO: 3% | FREE: 8%
      // Mínimo de contrato: $8,000 ARS
      let commissionRate = client?.currentCommissionRate || 8; // 8% por defecto para usuarios FREE

      // Asegurar que la tasa sea correcta según el tier
      // Plan Familia tiene prioridad (0% comisión)
      if (client?.hasFamilyPlan) {
        commissionRate = 0;
      } else if (client?.membershipTier === 'super_pro') {
        commissionRate = 2;
      } else if (client?.membershipTier === 'pro') {
        commissionRate = 3;
      } else if (!client?.hasMembership) {
        commissionRate = 8;
      }

      // Calcular comisión con mínimo de $1,000 ARS
      let commission = 0;

      // Plan Familia y contratos gratuitos no pagan comisión
      const hasFamilyPlan = client?.hasFamilyPlan === true;
      if (!isFreeContract && !hasFamilyPlan) {
        // Calcular comisión basada en porcentaje
        const calculatedCommission = price * (commissionRate / 100);
        // Aplicar mínimo de $1,000 ARS siempre
        commission = Math.max(calculatedCommission, MINIMUM_COMMISSION);
      }

      const totalPrice = price + commission;

      // Crear contrato
      const contract = await Contract.create({
        jobId: jobId,
        clientId: req.user.id,
        doerId: doerId,
        type: "trabajo", // tipo por defecto
        price,
        commission,
        commissionPercentage: commissionRate,
        totalPrice,
        startDate,
        endDate,
        termsAccepted,
        termsAcceptedAt: termsAccepted ? new Date() : undefined,
        termsAcceptedByClient: termsAccepted,
        notes,
      });

      // Actualizar estado del trabajo
      job.status = "in_progress";
      job.doerId = doerId as any;
      await job.save();

      const populatedContract = await Contract.findByPk(contract.id, {
        include: [
          {
            model: Job,
            as: 'job'
          },
          {
            model: User,
            as: 'client',
            attributes: ['name', 'email', 'phone', 'avatar']
          },
          {
            model: User,
            as: 'doer',
            attributes: ['name', 'email', 'phone', 'avatar']
          }
        ]
      });

      // Send email notifications
      const emailService = (await import('../services/email.js')).default;
      const jobPopulated = populatedContract!.job as any;
      await emailService.sendContractCreatedEmail(
        req.user.id.toString(),
        doerId,
        contract.id.toString(),
        jobPopulated.title || 'Contrato',
        price,
        'ARS'
      );

      // Send real-time notifications via Socket.io
      socketService.notifyContractUpdate(
        contract.id.toString(),
        req.user.id.toString(),
        doerId,
        {
          action: 'created',
          contract: populatedContract
        }
      );

      // Notify dashboard refresh
      socketService.notifyDashboardRefresh(req.user.id.toString());
      socketService.notifyDashboardRefresh(doerId);

      res.status(201).json({
        success: true,
        contract: populatedContract,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/contracts/:id/accept
// @desc    Aceptar contrato (por el cliente o doer)
// @desc    Flujo: pending → admin aprueba → ready → ambas partes aceptan → accepted
// @access  Private
router.put("/:id/accept", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contract = await Contract.findByPk(req.params.id, {
      include: [
        { model: Job, as: 'job', attributes: ['id', 'title'] }
      ]
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    const isClient = contract.clientId.toString() === req.user.id.toString();
    const isDoer = contract.doerId.toString() === req.user.id.toString();

    // Verificar que el usuario sea parte del contrato
    if (!isClient && !isDoer) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para aceptar este contrato",
      });
      return;
    }

    // Solo se pueden aceptar contratos en estado "pending" o "ready"
    if (!["pending", "ready"].includes(contract.status)) {
      res.status(400).json({
        success: false,
        message: "Este contrato no puede ser aceptado en su estado actual",
      });
      return;
    }

    // Actualizar la aceptación según quién sea
    if (isClient) {
      if (contract.termsAcceptedByClient) {
        res.status(400).json({
          success: false,
          message: "Ya has aceptado este contrato",
        });
        return;
      }
      contract.termsAcceptedByClient = true;
    } else if (isDoer) {
      if (contract.termsAcceptedByDoer) {
        res.status(400).json({
          success: false,
          message: "Ya has aceptado este contrato",
        });
        return;
      }
      contract.termsAcceptedByDoer = true;
    }

    // Si ambas partes han aceptado, cambiar a "accepted"
    const bothAccepted = contract.termsAcceptedByClient && contract.termsAcceptedByDoer;

    if (bothAccepted) {
      contract.status = "accepted";
      contract.termsAccepted = true;
      contract.termsAcceptedAt = new Date();
      contract.paymentStatus = "held";
    }

    await contract.save();

    // Send email notification
    const emailService = (await import('../services/email.js')).default;
    const job = contract.job as any;
    const jobTitle = job?.title || 'Contrato';

    if (bothAccepted) {
      // Notificar que el contrato fue aceptado por ambas partes
      await emailService.sendContractAcceptedEmail(
        contract.clientId.toString(),
        contract.doerId.toString(),
        contract.id.toString(),
        jobTitle
      );
    } else {
      // Notificar a la otra parte que debe aceptar
      const otherPartyId = isClient ? contract.doerId : contract.clientId;
      const acceptedByRole = isClient ? 'cliente' : 'trabajador';

      // Crear notificación para la otra parte
      const { Notification } = await import('../models/sql/Notification.model.js');
      await Notification.create({
        recipientId: otherPartyId,
        type: 'info',
        category: 'contract',
        title: 'Contrato pendiente de aceptación',
        message: `El ${acceptedByRole} ha aceptado el contrato para "${jobTitle}". Ahora es tu turno de aceptarlo.`,
        relatedModel: 'Contract',
        relatedId: contract.id,
        actionText: 'Ver contrato',
        data: { contractId: contract.id },
        read: false,
      });
    }

    // Send real-time notifications via Socket.io
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: bothAccepted ? 'accepted' : 'partial_acceptance',
        acceptedBy: isClient ? 'client' : 'doer',
        contract
      }
    );

    // Notify dashboard refresh
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    res.json({
      success: true,
      message: bothAccepted
        ? "Contrato aceptado por ambas partes"
        : `Has aceptado el contrato. Esperando aceptación de la otra parte.`,
      contract,
      bothAccepted,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/contracts/:id/complete
// @desc    Marcar contrato como completado
// @access  Private
router.put("/:id/complete", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contract = await Contract.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: 'job'
        }
      ]
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Solo el cliente puede marcar como completado
    if (contract.clientId.toString() !== req.user.id.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede marcar el contrato como completado",
      });
      return;
    }

    contract.status = "completed";
    contract.actualEndDate = new Date();
    contract.paymentStatus = "released";
    contract.paymentDate = new Date();
    await contract.save();

    // Actualizar el trabajo
    if (contract.jobId) {
      const job = await Job.findByPk(contract.jobId);
      if (job) {
        job.status = "completed";
        await job.save();
      }
    }

    // Incrementar trabajos completados del doer
    const doer = await User.findByPk(contract.doerId);
    if (doer) {
      doer.completedJobs = (doer.completedJobs || 0) + 1;
      await doer.save();
    }

    // Verificar si este es el primer contrato de un usuario referido
    // y acreditar al referidor si aplica
    await processReferralCredit(contract.clientId, contract.id);
    await processReferralCredit(contract.doerId, contract.id);

    // Send real-time notifications via Socket.io
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: 'completed',
        contract
      }
    );

    // Notify dashboard refresh
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    res.json({
      success: true,
      contract,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/contracts/:id/cancel
// @desc    Cancelar contrato
// @access  Private
router.put("/:id/cancel", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cancellationReason } = req.body;

    const contract = await Contract.findByPk(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.clientId.toString() === req.user.id.toString();
    const isDoer = contract.doerId.toString() === req.user.id.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para cancelar este contrato",
      });
      return;
    }

    contract.status = "cancelled";
    contract.cancellationReason = cancellationReason;
    contract.cancelledBy = req.user.id;
    contract.paymentStatus = "refunded";
    await contract.save();

    // Actualizar el trabajo
    const job = await Job.findByPk(contract.jobId);
    if (job) {
      job.status = "cancelled";
      await job.save();
    }

    // Send real-time notifications via Socket.io
    const otherPartyId = isClient ? contract.doerId.toString() : contract.clientId.toString();
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: 'cancelled',
        contract,
        cancelledBy: req.user.id.toString()
      }
    );

    // Notify dashboard refresh
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    res.json({
      success: true,
      contract,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * POST /api/contracts/:id/confirm
 * Confirmar que el servicio fue realizado correctamente
 * Cliente o Doer pueden confirmar
 */
router.post("/:id/confirm", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id.toString();
    const { review } = req.body; // Opcional: agregar review al confirmar

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    const isClient = contract.clientId.toString() === userId;
    const isDoer = contract.doerId.toString() === userId;

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No eres parte de este contrato" });
      return;
    }

    // Marcar confirmación
    if (isClient) {
      contract.clientConfirmed = true;
      contract.clientConfirmedAt = new Date();
    } else {
      contract.doerConfirmed = true;
      contract.doerConfirmedAt = new Date();
    }

    // Si ambas partes confirmaron, liberar el pago
    if (contract.clientConfirmed && contract.doerConfirmed) {
      contract.status = 'completed';
      contract.paymentStatus = 'released';
      contract.actualEndDate = new Date();

      // Buscar el pago y liberarlo
      const Payment = (await import('../models/sql/Payment.model.js')).default;
      const payment = await Payment.findOne({ where: { contractId: id } });

      // Determinar el monto a pagar al trabajador
      // Para trabajos multi-trabajador, usar el allocatedAmount del contrato
      // Para trabajos de un solo trabajador, usar el precio del contrato
      const paymentAmount = contract.allocatedAmount
        ? parseFloat(contract.allocatedAmount.toString())
        : contract.price;

      if (payment) {
        payment.status = 'completed';
        payment.escrowReleasedAt = new Date();
        payment.payerConfirmed = contract.clientConfirmed;
        payment.recipientConfirmed = contract.doerConfirmed;
        // Guardar el monto real que se paga a este trabajador
        payment.workerPaymentAmount = paymentAmount;
        await payment.save();

        // TODO: Transferir fondos al destinatario usando MercadoPago
        // Para multi-trabajador: payment.workerPaymentAmount es el monto a transferir
        console.log(`💰 Liberando pago de $${paymentAmount.toLocaleString()} ARS al trabajador ${contract.doerId}`);
      }

      // Send completion email
      const emailService = (await import('../services/email.js')).default;
      const job = await Job.findByPk(contract.jobId);
      await emailService.sendContractCompletedEmail(
        contract.clientId.toString(),
        contract.doerId.toString(),
        contract.id.toString(),
        job?.title || 'Contrato',
        paymentAmount,
        'ARS'
      );

      // Si es un trabajo multi-trabajador, crear registro de pago pendiente
      if (job && (job.maxWorkers || 1) > 1) {
        const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;

        // Registrar el pago pendiente al trabajador
        await BalanceTransaction.create({
          userId: contract.doerId,
          type: 'payment',
          amount: paymentAmount,
          description: `Pago por contrato #${contract.id} - ${job.title}`,
          status: 'pending', // Pendiente de transferencia real
          relatedModel: 'Contract',
          relatedId: contract.id,
          metadata: {
            jobId: job.id,
            contractId: contract.id,
            jobTitle: job.title,
            isMultiWorker: true,
            totalWorkers: job.maxWorkers,
            percentageOfBudget: contract.percentageOfBudget || (paymentAmount / job.price * 100),
          },
        });

        console.log(`📝 Registrado pago pendiente de $${paymentAmount.toLocaleString()} ARS para trabajador ${contract.doerId} (trabajo multi-trabajador)`);
      }
    } else {
      contract.status = 'awaiting_confirmation';

      // Send awaiting confirmation email to the other party
      const emailService = (await import('../services/email.js')).default;
      const job = await Job.findByPk(contract.jobId);

      const otherPartyId = isClient ? contract.doerId.toString() : contract.clientId.toString();
      const currentUser = await User.findByPk(userId);
      const otherPartyUser = await User.findByPk(otherPartyId);

      if (currentUser && otherPartyUser) {
        await emailService.sendContractAwaitingConfirmationEmail(
          otherPartyId,
          currentUser.name,
          contract.id.toString(),
          job?.title || 'Contrato',
          !isClient
        );
      }
    }

    await contract.save();

    // Send real-time notifications via Socket.io
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: contract.clientConfirmed && contract.doerConfirmed ? 'both_confirmed' : 'confirmation_pending',
        contract,
        confirmedBy: userId
      }
    );

    // Notify dashboard refresh
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    res.json({
      success: true,
      message: contract.clientConfirmed && contract.doerConfirmed
        ? '¡Contrato completado! El pago ha sido liberado.'
        : 'Confirmación registrada. Esperando confirmación de la otra parte.',
      contract,
    });
  } catch (error: any) {
    console.error('Error confirming contract:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * POST /api/contracts/:id/dispute
 * Reportar un problema con el contrato (rápido)
 * Esto crea una disputa y pausa el pago
 */
router.post("/:id/dispute", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id.toString();
    const { reason, description, category } = req.body;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    const isClient = contract.clientId.toString() === userId;
    const isDoer = contract.doerId.toString() === userId;

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No eres parte de este contrato" });
      return;
    }

    // Redirigir a crear disputa
    res.json({
      success: true,
      message: 'Por favor, proporciona más detalles sobre el problema en la página de disputas',
      redirect: `/disputes/create?contractId=${id}`,
    });
  } catch (error: any) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Request contract modification
 * POST /api/contracts/:id/request-modification
 */
router.post("/:id/request-modification", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { startDate, endDate, price, notes } = req.body;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso para modificar este contrato" });
      return;
    }

    // Verificar que falten al menos 2 días para el inicio
    const daysUntilStart = Math.ceil((new Date(contract.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilStart < 2) {
      res.status(400).json({
        success: false,
        message: "No se puede modificar el contrato: faltan menos de 2 días para el inicio"
      });
      return;
    }

    // Crear solicitud de modificación
    contract.pendingModification = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      price: price,
      notes: notes,
      requestedBy: userId,
      requestedAt: new Date(),
      clientApproved: isClient,
      doerApproved: isDoer,
    };

    await contract.save();

    res.json({
      success: true,
      message: "Solicitud de modificación enviada. Esperando confirmación de la otra parte.",
      contract,
    });
  } catch (error: any) {
    console.error('Error requesting modification:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Approve contract modification
 * POST /api/contracts/:id/approve-modification
 */
router.post("/:id/approve-modification", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    if (!contract.pendingModification) {
      res.status(400).json({ success: false, message: "No hay modificación pendiente" });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso" });
      return;
    }

    // Marcar como aprobado por esta parte
    if (isClient) {
      contract.pendingModification.clientApproved = true;
    } else {
      contract.pendingModification.doerApproved = true;
    }

    // Si ambos aprobaron, aplicar los cambios
    if (contract.pendingModification.clientApproved && contract.pendingModification.doerApproved) {
      if (contract.pendingModification.startDate) {
        contract.startDate = contract.pendingModification.startDate;
      }
      if (contract.pendingModification.endDate) {
        contract.endDate = contract.pendingModification.endDate;
      }
      if (contract.pendingModification.price) {
        contract.price = contract.pendingModification.price;
        contract.totalPrice = contract.price * (1 + contract.commission);
      }
      if (contract.pendingModification.notes) {
        contract.notes = contract.pendingModification.notes;
      }

      // Limpiar modificación pendiente
      contract.pendingModification = undefined;

      await contract.save();

      res.json({
        success: true,
        message: "Modificación aplicada exitosamente",
        contract,
      });
    } else {
      await contract.save();
      res.json({
        success: true,
        message: "Modificación aprobada. Esperando confirmación de la otra parte.",
        contract,
      });
    }
  } catch (error: any) {
    console.error('Error approving modification:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Cancel contract (up to 2 days before start)
 * POST /api/contracts/:id/cancel
 */
router.post("/:id/cancel", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso para cancelar este contrato" });
      return;
    }

    // Verificar que falten al menos 2 días para el inicio
    const daysUntilStart = Math.ceil((new Date(contract.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilStart < 2) {
      res.status(400).json({
        success: false,
        message: "No se puede cancelar el contrato: faltan menos de 2 días para el inicio"
      });
      return;
    }

    // Si el contrato ya está en progreso, no se puede cancelar sin penalización
    if (contract.status === 'in_progress' || contract.status === 'completed') {
      res.status(400).json({
        success: false,
        message: "No se puede cancelar un contrato en progreso o completado. Debes crear una disputa."
      });
      return;
    }

    contract.status = 'cancelled';
    contract.cancellationReason = reason;
    contract.cancelledBy = userId;

    // Si hay pago en escrow, reembolsar
    if (contract.paymentStatus === 'escrow' || contract.paymentStatus === 'held') {
      contract.paymentStatus = 'refunded';
    }

    await contract.save();

    res.json({
      success: true,
      message: "Contrato cancelado exitosamente",
      contract,
    });
  } catch (error: any) {
    console.error('Error cancelling contract:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Request contract extension
 * - Maximum 1 extension per contract
 * - Must be requested at least 24h before job start date
 * - Requires approval from the worker (doer)
 * POST /api/contracts/:id/request-extension
 */
router.post("/:id/request-extension", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { extensionDays, extensionAmount, extensionNotes } = req.body;
    const userId = req.user.id;

    if (!extensionDays || extensionDays < 1) {
      res.status(400).json({ success: false, message: "Debes especificar los días de extensión (mínimo 1)" });
      return;
    }

    const contract = await Contract.findByPk(id, {
      include: [{ model: Job, as: 'job' }]
    });
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso para solicitar una extensión de este contrato" });
      return;
    }

    // *** NUEVA RESTRICCIÓN: Máximo 1 extensión por contrato ***
    if (contract.hasBeenExtended || (contract.extensionCount || 0) >= 1) {
      res.status(400).json({
        success: false,
        message: "Este contrato ya ha sido extendido una vez. Solo se permite una extensión por contrato. Si necesitas más tiempo, deberás crear un nuevo contrato."
      });
      return;
    }

    // *** NUEVA RESTRICCIÓN: Solo el cliente puede solicitar extensión ***
    if (!isClient) {
      res.status(403).json({
        success: false,
        message: "Solo el dueño del trabajo puede solicitar una extensión de fecha."
      });
      return;
    }

    // *** NUEVA RESTRICCIÓN: Verificar que estemos al menos 24h antes del inicio del trabajo ***
    const job = contract.job as Job;
    if (job && job.startDate) {
      const now = new Date();
      const jobStartDate = new Date(job.startDate);
      const twentyFourHoursBeforeStart = new Date(jobStartDate.getTime() - 24 * 60 * 60 * 1000);

      if (now > twentyFourHoursBeforeStart) {
        res.status(400).json({
          success: false,
          message: "No puedes solicitar una extensión con menos de 24 horas antes del inicio del trabajo. La solicitud debe realizarse antes de ese plazo."
        });
        return;
      }
    }

    // Verificar que no haya una solicitud de extensión pendiente
    if (contract.extensionRequestedBy && !contract.extensionApprovedBy) {
      res.status(400).json({
        success: false,
        message: "Ya hay una solicitud de extensión pendiente. Espera a que el trabajador la apruebe o rechace."
      });
      return;
    }

    // Verificar que el contrato esté activo o en progreso
    if (contract.status !== 'accepted' && contract.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        message: "Solo puedes solicitar extensiones para contratos aceptados o en progreso"
      });
      return;
    }

    // Almacenar la fecha de fin original si no existe
    if (!contract.originalEndDate) {
      contract.originalEndDate = contract.endDate;
    }

    // Marcar la solicitud de extensión
    contract.extensionRequestedBy = userId;
    contract.extensionRequestedAt = new Date();
    contract.extensionDays = extensionDays;
    contract.extensionAmount = extensionAmount || 0;
    contract.extensionNotes = extensionNotes;
    // Clear approval fields for new request
    contract.extensionApprovedBy = undefined;
    contract.extensionApprovedAt = undefined;

    await contract.save();

    // *** NOTIFICACIÓN MEJORADA: Crear notificación persistente para el trabajador ***
    await Notification.create({
      recipientId: contract.doerId,
      type: 'warning',
      category: 'contract',
      title: 'Solicitud de extensión de contrato',
      message: `El cliente ha solicitado extender el contrato por ${extensionDays} día${extensionDays > 1 ? 's' : ''}${extensionAmount ? ` con un monto adicional de $${extensionAmount.toLocaleString()} ARS` : ''}. Por favor revisa y aprueba o rechaza la solicitud.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      actionText: 'Ver contrato',
      data: {
        contractId: contract.id,
        jobId: contract.jobId,
        extensionDays,
        extensionAmount: extensionAmount || 0,
        extensionNotes,
        action: 'extension_requested'
      },
      read: false,
    });

    // Notificar en tiempo real a la otra parte
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: 'extension_requested',
        contract,
        requestedBy: userId.toString()
      }
    );

    res.json({
      success: true,
      message: `Solicitud de extensión enviada. El trabajador debe aprobar la extensión para que sea efectiva.`,
      contract,
      extensionNumber: 1, // Always 1 since we only allow one extension
    });
  } catch (error: any) {
    console.error('Error requesting extension:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Approve contract extension
 * POST /api/contracts/:id/approve-extension
 */
router.post("/:id/approve-extension", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que haya una solicitud de extensión pendiente
    if (!contract.extensionRequestedBy || contract.extensionApprovedBy) {
      res.status(400).json({ success: false, message: "No hay solicitud de extensión pendiente" });
      return;
    }

    // Verificar que el usuario sea la otra parte (no quien solicitó)
    if (contract.extensionRequestedBy.toString() === userId.toString()) {
      res.status(400).json({
        success: false,
        message: "No puedes aprobar tu propia solicitud de extensión"
      });
      return;
    }

    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso" });
      return;
    }

    // Store previous end date for history
    const previousEndDate = new Date(contract.endDate);

    // Extender la fecha de finalización
    const newEndDate = new Date(previousEndDate);
    newEndDate.setDate(newEndDate.getDate() + (contract.extensionDays || 0));

    // Add to extension history
    const extensionRecord = {
      previousEndDate: previousEndDate,
      newEndDate: newEndDate,
      extensionDays: contract.extensionDays || 0,
      extensionAmount: contract.extensionAmount || 0,
      requestedBy: contract.extensionRequestedBy,
      requestedAt: contract.extensionRequestedAt || new Date(),
      approvedBy: userId,
      approvedAt: new Date(),
      notes: contract.extensionNotes,
    };

    const extensionHistory = contract.extensionHistory || [];
    extensionHistory.push(extensionRecord);

    // Aplicar la extensión
    contract.hasBeenExtended = true;
    contract.extensionApprovedBy = userId;
    contract.extensionApprovedAt = new Date();
    contract.endDate = newEndDate;
    contract.extensionHistory = extensionHistory;
    contract.extensionCount = (contract.extensionCount || 0) + 1;

    // Si hay monto adicional, actualizar el precio
    if (contract.extensionAmount && contract.extensionAmount > 0) {
      contract.price += contract.extensionAmount;
      // Recalcular comisión y precio total
      contract.totalPrice = contract.price + contract.commission;
    }

    await contract.save();

    // *** Crear notificación persistente para el cliente (quien solicitó) ***
    await Notification.create({
      recipientId: contract.clientId,
      type: 'success',
      category: 'contract',
      title: 'Extensión de contrato aprobada',
      message: `El trabajador ha aprobado la extensión de ${contract.extensionDays} día${(contract.extensionDays || 0) > 1 ? 's' : ''}. Nueva fecha de fin: ${newEndDate.toLocaleDateString('es-AR')}.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      actionText: 'Ver contrato',
      data: {
        contractId: contract.id,
        jobId: contract.jobId,
        extensionDays: contract.extensionDays,
        newEndDate: newEndDate.toISOString(),
        action: 'extension_approved'
      },
      read: false,
    });

    // Notificar a ambas partes en tiempo real
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: 'extension_approved',
        contract,
        approvedBy: userId.toString()
      }
    );

    // Notify dashboard refresh
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    res.json({
      success: true,
      message: `Extensión aprobada. El contrato se extendió ${contract.extensionDays} días${contract.extensionAmount ? ` con un monto adicional de $${contract.extensionAmount.toLocaleString()} ARS` : ''}. Nueva fecha de fin: ${newEndDate.toLocaleDateString('es-AR')}.`,
      contract,
      extensionNumber: contract.extensionCount,
    });
  } catch (error: any) {
    console.error('Error approving extension:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Reject contract extension
 * POST /api/contracts/:id/reject-extension
 */
router.post("/:id/reject-extension", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que haya una solicitud de extensión pendiente
    if (!contract.extensionRequestedBy || contract.extensionApprovedBy) {
      res.status(400).json({ success: false, message: "No hay solicitud de extensión pendiente" });
      return;
    }

    // Verificar que el usuario sea la otra parte
    if (contract.extensionRequestedBy.toString() === userId.toString()) {
      res.status(400).json({
        success: false,
        message: "No puedes rechazar tu propia solicitud de extensión"
      });
      return;
    }

    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso" });
      return;
    }

    // Guardar datos de extensión para la notificación antes de limpiar
    const extensionDaysRequested = contract.extensionDays;

    // Limpiar la solicitud de extensión
    contract.extensionRequestedBy = undefined;
    contract.extensionRequestedAt = undefined;
    contract.extensionDays = undefined;
    contract.extensionAmount = undefined;
    contract.extensionNotes = reason || "Solicitud de extensión rechazada";

    await contract.save();

    // *** Crear notificación persistente para el cliente (quien solicitó) ***
    await Notification.create({
      recipientId: contract.clientId,
      type: 'warning',
      category: 'contract',
      title: 'Extensión de contrato rechazada',
      message: `El trabajador ha rechazado la solicitud de extensión de ${extensionDaysRequested} día${(extensionDaysRequested || 0) > 1 ? 's' : ''}.${reason ? ` Razón: ${reason}` : ''} La fecha de fin del contrato se mantiene sin cambios.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      actionText: 'Ver contrato',
      data: {
        contractId: contract.id,
        jobId: contract.jobId,
        reason: reason || 'Sin razón especificada',
        action: 'extension_rejected'
      },
      read: false,
    });

    // Notificar a ambas partes en tiempo real
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: 'extension_rejected',
        contract,
        rejectedBy: userId.toString()
      }
    );

    res.json({
      success: true,
      message: "Solicitud de extensión rechazada. La fecha de fin se mantiene sin cambios.",
      contract,
    });
  } catch (error: any) {
    console.error('Error rejecting extension:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Generate pairing code for contract
 * POST /api/contracts/:id/generate-pairing
 */
router.post("/:id/generate-pairing", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const contract = await Contract.findByPk(id);

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que el contrato esté aceptado por ambas partes
    if (!contract.termsAcceptedByClient || !contract.termsAcceptedByDoer) {
      res.status(400).json({
        success: false,
        message: "Ambas partes deben aceptar el contrato antes de generar el código"
      });
      return;
    }

    // Verificar que la fecha de inicio haya llegado o esté cerca (dentro de 24 horas)
    const hoursUntilStart = (new Date(contract.startDate).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilStart > 24) {
      res.status(400).json({
        success: false,
        message: "El código solo se puede generar 24 horas antes de la fecha de inicio"
      });
      return;
    }

    // Generar código de 10 caracteres (alfanumérico)
    const code = Array.from({ length: 10 }, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');

    contract.pairingCode = code;
    contract.pairingGeneratedAt = new Date();
    contract.pairingExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 horas para confirmar

    await contract.save();

    res.json({
      success: true,
      message: "Código de pareamiento generado",
      pairingCode: code,
      expiresAt: contract.pairingExpiry,
    });
  } catch (error: any) {
    console.error('Error generating pairing code:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * Confirm pairing code
 * POST /api/contracts/:id/confirm-pairing
 */
router.post("/:id/confirm-pairing", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      res.status(400).json({ success: false, message: "El código es requerido" });
      return;
    }

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso" });
      return;
    }

    // Verificar que existe un código
    if (!contract.pairingCode) {
      res.status(400).json({ success: false, message: "No hay código de pareamiento generado" });
      return;
    }

    // Verificar que no haya expirado
    if (contract.pairingExpiry && new Date() > contract.pairingExpiry) {
      res.status(400).json({
        success: false,
        message: "El código de pareamiento ha expirado. Genera uno nuevo."
      });
      return;
    }

    // Verificar que el código sea correcto
    if (contract.pairingCode !== code.toUpperCase()) {
      res.status(400).json({ success: false, message: "Código incorrecto" });
      return;
    }

    // Marcar como confirmado por esta parte
    if (isClient && !contract.clientConfirmedPairing) {
      contract.clientConfirmedPairing = true;
      contract.clientPairingConfirmedAt = new Date();
    } else if (isDoer && !contract.doerConfirmedPairing) {
      contract.doerConfirmedPairing = true;
      contract.doerPairingConfirmedAt = new Date();
    } else {
      res.status(400).json({ success: false, message: "Ya confirmaste el pareamiento" });
      return;
    }

    // Si ambos confirmaron, iniciar el contrato
    if (contract.clientConfirmedPairing && contract.doerConfirmedPairing) {
      contract.status = 'in_progress';
      contract.actualStartDate = new Date();

      await contract.save();

      res.json({
        success: true,
        message: "¡Pareamiento confirmado! El contrato ha comenzado.",
        contract,
      });
    } else {
      await contract.save();
      res.json({
        success: true,
        message: "Pareamiento confirmado. Esperando confirmación de la otra parte.",
        contract,
      });
    }
  } catch (error: any) {
    console.error('Error confirming pairing:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

// Modify contract price (only if no proposals exist)
router.put("/:id/modify-price", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPrice, reason } = req.body;
    const userId = req.user.id;

    // Validations
    if (!newPrice || newPrice < 5000) {
      res.status(400).json({
        success: false,
        message: "El precio mínimo es de $5000 ARS"
      });
      return;
    }

    const contract = await Contract.findByPk(id, {
      include: [
        {
          model: User,
          as: 'client'
        },
        {
          model: Job,
          as: 'job'
        }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Only client can modify price
    if (contract.clientId.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede modificar el precio del contrato"
      });
      return;
    }

    // Check if contract is still pending (no one has accepted yet)
    if (contract.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: "Solo puedes modificar el precio de contratos pendientes"
      });
      return;
    }

    // Import Proposal model dynamically
    const Proposal = (await import('../models/sql/Proposal.model.js')).default;

    // Check if there are any proposals for this contract's job
    const proposalCount = await Proposal.count({
      where: {
        jobId: contract.jobId,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    if (proposalCount > 0) {
      res.status(400).json({
        success: false,
        message: "No puedes modificar el precio porque ya hay propuestas para este trabajo"
      });
      return;
    }

    const previousPrice = contract.price;
    const priceDifference = newPrice - previousPrice;

    // Import models
    const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;

    const client = await User.findByPk(userId);
    if (!client) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    let transaction;

    if (priceDifference > 0) {
      // Price increased - check if user has enough balance
      if (client.balance < priceDifference) {
        // User needs to pay the difference via MercadoPago
        res.status(402).json({
          success: false,
          message: "Debes pagar la diferencia para aumentar el precio",
          requiresPayment: true,
          amountRequired: priceDifference,
          currentBalance: client.balance
        });
        return;
      }

      // Deduct from user balance
      const balanceBefore = client.balance;
      client.balance -= priceDifference;
      await client.save();

      // Create transaction record
      transaction = await BalanceTransaction.create({
        userId: userId,
        type: 'payment',
        amount: -priceDifference,
        balanceBefore,
        balanceAfter: client.balance,
        description: `Pago de diferencia por aumento de precio de contrato`,
        relatedContractId: contract.id,
        metadata: {
          previousPrice,
          newPrice,
          reason: reason || 'Aumento de precio'
        },
        status: 'completed'
      });

    } else if (priceDifference < 0) {
      // Price decreased - refund to user balance
      const refundAmount = Math.abs(priceDifference);
      const balanceBefore = client.balance;
      client.balance += refundAmount;
      await client.save();

      // Create transaction record
      transaction = await BalanceTransaction.create({
        userId: userId,
        type: 'refund',
        amount: refundAmount,
        balanceBefore,
        balanceAfter: client.balance,
        description: `Reembolso por reducción de precio de contrato`,
        relatedContractId: contract.id,
        metadata: {
          previousPrice,
          newPrice,
          reason: reason || 'Reducción de precio'
        },
        status: 'completed'
      });
    }

    // Save original price if this is the first modification
    if (!contract.originalPrice) {
      contract.originalPrice = previousPrice;
    }

    // Update contract price
    contract.price = newPrice;
    contract.commission = newPrice * (client.currentCommissionRate / 100);
    contract.totalPrice = newPrice + contract.commission;

    // Add to price modification history
    if (!contract.priceModificationHistory) {
      contract.priceModificationHistory = [];
    }

    contract.priceModificationHistory.push({
      previousPrice,
      newPrice,
      modifiedBy: userId,
      modifiedAt: new Date(),
      reason: reason || '',
      paymentDifference: priceDifference,
      transactionId: transaction?.id
    });

    await contract.save();

    // Update the related Job price as well
    const jobToUpdate = await Job.findByPk(contract.jobId);
    if (jobToUpdate) {
      jobToUpdate.price = newPrice;
      jobToUpdate.budget = newPrice;
      await jobToUpdate.save();
    }

    // Send email notifications
    const emailService = (await import('../services/email.js')).default;

    if (priceDifference > 0) {
      // Price increase - user paid difference
      await emailService.sendPriceModificationEmail(
        client.email,
        client.name,
        contract.id.toString(),
        previousPrice,
        newPrice,
        true, // isIncrease
        priceDifference
      );
    } else if (priceDifference < 0) {
      // Price decrease - user got refund to balance
      await emailService.sendBalanceRefundEmail(
        client.email,
        client.name,
        Math.abs(priceDifference),
        `Reducción de precio en contrato ${contract.id}`,
        client.balance
      );
    }

    res.status(200).json({
      success: true,
      message: priceDifference > 0
        ? 'Precio aumentado y diferencia pagada desde saldo'
        : priceDifference < 0
          ? 'Precio reducido y diferencia reembolsada a tu saldo'
          : 'Precio actualizado',
      contract,
      transaction,
      newBalance: client.balance
    });
  } catch (error: any) {
    console.error("Error modifying contract price:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al modificar precio del contrato"
    });
  }
});

// @route   POST /api/contracts/:id/request-price-change
// @desc    Request price change for in_progress contract (requires worker approval)
// @access  Private (client only)
router.post("/:id/request-price-change", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPrice, reason } = req.body;
    const userId = req.user.id;

    // Validations
    if (!newPrice || newPrice < 5000) {
      res.status(400).json({
        success: false,
        message: "El precio mínimo es de $5000 ARS"
      });
      return;
    }

    if (!reason || reason.trim().length < 10) {
      res.status(400).json({
        success: false,
        message: "Debes proporcionar una razón de al menos 10 caracteres"
      });
      return;
    }

    const contract = await Contract.findByPk(id, {
      include: [
        { model: User, as: 'client' },
        { model: User, as: 'doer' },
        { model: Job, as: 'job' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Only client can request price change
    if (contract.clientId.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede solicitar cambio de precio"
      });
      return;
    }

    // Only for in_progress contracts
    if (contract.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        message: "Solo puedes modificar el precio de contratos en progreso"
      });
      return;
    }

    const previousPrice = Number(contract.price);
    const priceDifference = newPrice - previousPrice;

    // Check if client has pending modification already
    if (contract.pendingModification && contract.pendingModification.price) {
      res.status(400).json({
        success: false,
        message: "Ya tienes una solicitud de cambio de precio pendiente"
      });
      return;
    }

    // If increasing price, calculate commission on difference
    let additionalCommission = 0;
    if (priceDifference > 0) {
      const client = await User.findByPk(userId);
      if (!client) {
        res.status(404).json({ success: false, message: "Usuario no encontrado" });
        return;
      }

      // Calculate commission rate (considering family plan, pro membership, etc.)
      let commissionRate = 8; // default
      if (client.hasFamilyPlan) {
        commissionRate = 0;
      } else if (client.membershipTier === 'super_pro' && client.hasMembership) {
        commissionRate = 2;
      } else if (client.membershipTier === 'pro' && client.hasMembership) {
        commissionRate = 3;
      }

      additionalCommission = priceDifference * (commissionRate / 100);

      // Check if client can afford the difference + commission
      const totalRequired = priceDifference + additionalCommission;
      if (client.balance < totalRequired) {
        res.status(402).json({
          success: false,
          message: "No tienes suficiente saldo para pagar la diferencia + comisión",
          requiresPayment: true,
          amountRequired: totalRequired,
          priceDifference,
          additionalCommission,
          currentBalance: client.balance
        });
        return;
      }
    }

    // Create pending modification
    contract.pendingModification = {
      price: newPrice,
      notes: reason.trim(),
      requestedBy: userId,
      requestedAt: new Date(),
      clientApproved: true, // Client automatically approves their own request
      doerApproved: false
    };

    await contract.save();

    // Notify doer
    const notificationService = (await import('../services/notification.js')).default;
    await notificationService.createNotification({
      userId: contract.doerId,
      type: 'contract_price_change_request',
      title: 'Solicitud de cambio de precio',
      message: `El cliente ha solicitado cambiar el precio del contrato de $${previousPrice.toLocaleString('es-AR')} a $${newPrice.toLocaleString('es-AR')}. Razón: ${reason}`,
      relatedContractId: contract.id,
      actionUrl: `/contracts/${contract.id}`
    });

    res.status(200).json({
      success: true,
      message: "Solicitud de cambio de precio enviada al trabajador",
      contract,
      pendingModification: contract.pendingModification,
      priceDifference,
      additionalCommission
    });
  } catch (error: any) {
    console.error("Error requesting price change:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al solicitar cambio de precio"
    });
  }
});

// @route   POST /api/contracts/:id/approve-price-change
// @desc    Approve/reject price change request (worker only)
// @access  Private (doer only)
router.post("/:id/approve-price-change", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id, {
      include: [
        { model: User, as: 'client' },
        { model: User, as: 'doer' },
        { model: Job, as: 'job' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Only doer can approve/reject
    if (contract.doerId.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el trabajador puede aprobar/rechazar cambios de precio"
      });
      return;
    }

    if (!contract.pendingModification || !contract.pendingModification.price) {
      res.status(400).json({
        success: false,
        message: "No hay solicitud de cambio de precio pendiente"
      });
      return;
    }

    const previousPrice = Number(contract.price);
    const newPrice = contract.pendingModification.price;
    const priceDifference = newPrice - previousPrice;

    if (approved) {
      // Doer approved - process payment and update price
      const client = await User.findByPk(contract.clientId);
      if (!client) {
        res.status(404).json({ success: false, message: "Cliente no encontrado" });
        return;
      }

      const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;
      let transaction;

      if (priceDifference > 0) {
        // Price increased - deduct from client balance
        let commissionRate = 8;
        if (client.hasFamilyPlan) {
          commissionRate = 0;
        } else if (client.membershipTier === 'super_pro' && client.hasMembership) {
          commissionRate = 2;
        } else if (client.membershipTier === 'pro' && client.hasMembership) {
          commissionRate = 3;
        }

        const additionalCommission = priceDifference * (commissionRate / 100);
        const totalDeduct = priceDifference + additionalCommission;

        const balanceBefore = client.balance;
        client.balance -= totalDeduct;
        await client.save();

        transaction = await BalanceTransaction.create({
          userId: client.id,
          type: 'payment',
          amount: -totalDeduct,
          balanceBefore,
          balanceAfter: client.balance,
          description: `Pago de diferencia + comisión por aumento de precio de contrato`,
          relatedContractId: contract.id,
          metadata: {
            previousPrice,
            newPrice,
            priceDifference,
            additionalCommission,
            reason: contract.pendingModification.notes
          },
          status: 'completed'
        });

        // Update contract commission and total
        contract.commission = Number(contract.commission) + additionalCommission;
        contract.totalPrice = newPrice + contract.commission;
      } else if (priceDifference < 0) {
        // Price decreased - refund to client
        const refundAmount = Math.abs(priceDifference);
        const balanceBefore = client.balance;
        client.balance += refundAmount;
        await client.save();

        transaction = await BalanceTransaction.create({
          userId: client.id,
          type: 'refund',
          amount: refundAmount,
          balanceBefore,
          balanceAfter: client.balance,
          description: `Reembolso por reducción de precio de contrato`,
          relatedContractId: contract.id,
          metadata: {
            previousPrice,
            newPrice,
            reason: contract.pendingModification.notes
          },
          status: 'completed'
        });
      }

      // Save original price if first modification
      if (!contract.originalPrice) {
        contract.originalPrice = previousPrice;
      }

      // Update contract price
      contract.price = newPrice;

      // Add to price modification history
      if (!contract.priceModificationHistory) {
        contract.priceModificationHistory = [];
      }

      contract.priceModificationHistory.push({
        previousPrice,
        newPrice,
        modifiedBy: contract.clientId,
        modifiedAt: new Date(),
        reason: contract.pendingModification.notes || '',
        paymentDifference: priceDifference,
        transactionId: transaction?.id
      });

      // Clear pending modification
      contract.pendingModification = undefined;
      await contract.save();

      // Update Job price
      const job = await Job.findByPk(contract.jobId);
      if (job) {
        job.price = newPrice;
        await job.save();
      }

      // Notify client
      const notificationService = (await import('../services/notification.js')).default;
      await notificationService.createNotification({
        userId: contract.clientId,
        type: 'contract_price_change_approved',
        title: 'Cambio de precio aprobado',
        message: `El trabajador ha aprobado el cambio de precio del contrato a $${newPrice.toLocaleString('es-AR')}`,
        relatedContractId: contract.id,
        actionUrl: `/contracts/${contract.id}`
      });

      res.status(200).json({
        success: true,
        message: "Cambio de precio aprobado y aplicado",
        contract,
        transaction,
        newBalance: client.balance
      });
    } else {
      // Doer rejected
      contract.pendingModification = undefined;
      await contract.save();

      // Notify client
      const notificationService = (await import('../services/notification.js')).default;
      await notificationService.createNotification({
        userId: contract.clientId,
        type: 'contract_price_change_rejected',
        title: 'Cambio de precio rechazado',
        message: `El trabajador ha rechazado el cambio de precio del contrato`,
        relatedContractId: contract.id,
        actionUrl: `/contracts/${contract.id}`
      });

      res.status(200).json({
        success: true,
        message: "Cambio de precio rechazado",
        contract
      });
    }
  } catch (error: any) {
    console.error("Error approving price change:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al procesar aprobación de cambio de precio"
    });
  }
});

export default router;
