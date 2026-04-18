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
import { calculateCommission } from "../services/commissionService.js";
import cacheService from "../services/cacheService.js";

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
      // Support multiple statuses separated by comma
      const statusArray = (status as string).split(',').map(s => s.trim());
      if (statusArray.length > 1) {
        query.status = { [Op.in]: statusArray };
      } else {
        query.status = statusArray[0];
      }
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
          attributes: ['id', 'title', 'summary', 'location']
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
// @desc    Obtener contrato por ID del trabajo (para team jobs, devuelve el contrato del usuario actual)
// @access  Private
router.get("/by-job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id.toString();
    const includeOptions = [
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
    ];

    // First, check if user is a worker (doer) - return their specific contract
    let contract = await Contract.findOne({
      where: {
        jobId: req.params.jobId,
        doerId: userId
      },
      include: includeOptions
    });

    // If not found as doer, check if user is the client
    if (!contract) {
      // For clients (job owners), find the first contract that needs their confirmation
      // Priority: unconfirmed contracts first, then any contract
      contract = await Contract.findOne({
        where: {
          jobId: req.params.jobId,
          clientId: userId,
          clientConfirmed: false
        },
        include: includeOptions
      });

      // If all contracts are confirmed by client, just return any contract
      if (!contract) {
        contract = await Contract.findOne({
          where: {
            jobId: req.params.jobId,
            clientId: userId
          },
          include: includeOptions
        });
      }
    }

    // If not found as participant, try to find any contract for admin users
    if (!contract && isAdminUser(req.user)) {
      contract = await Contract.findOne({
        where: { jobId: req.params.jobId },
        include: includeOptions
      });
    }

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado para este trabajo",
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

// @route   GET /api/contracts/debug-job/:jobId
// @desc    Diagnóstico de contratos por trabajo (temporal)
// @access  Private
router.get("/debug-job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id.toString();
    const jobId = req.params.jobId;

    // Find all contracts for this job (without user filter)
    const allContracts = await Contract.findAll({
      where: { jobId },
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Find the job
    const job = await Job.findByPk(jobId, {
      include: [{ model: User, as: 'client', attributes: ['id', 'name', 'email'] }]
    });

    res.json({
      success: true,
      debug: {
        currentUserId: userId,
        jobExists: !!job,
        jobId: job?.id,
        jobCode: job?.code,
        jobStatus: job?.status,
        jobClientId: job?.clientId,
        jobClient: job?.client,
        jobDoerId: job?.doerId,
        jobSelectedWorkers: job?.selectedWorkers,
        totalContracts: allContracts.length,
        contracts: allContracts.map(c => ({
          id: c.id,
          status: c.status,
          clientId: c.clientId,
          doerId: c.doerId,
          client: (c as any).client,
          doer: (c as any).doer,
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// @route   POST /api/contracts/repair-job/:jobId
// @desc    Crear contrato faltante para trabajo con doerId asignado (temporal)
// @access  Private
router.post("/repair-job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobId = req.params.jobId;
    const userId = req.user.id.toString();

    // Find the job
    const job = await Job.findByPk(jobId);
    if (!job) {
      res.status(404).json({ success: false, message: 'Trabajo no encontrado' });
      return;
    }

    // Check if user is the client
    if (job.clientId !== userId) {
      res.status(403).json({ success: false, message: 'Solo el cliente puede reparar este trabajo' });
      return;
    }

    // Check if job has doerId but no contract
    if (!job.doerId) {
      res.status(400).json({ success: false, message: 'El trabajo no tiene trabajador asignado' });
      return;
    }

    // Check if contract already exists
    const existingContract = await Contract.findOne({
      where: { jobId, doerId: job.doerId }
    });

    if (existingContract) {
      res.status(400).json({ success: false, message: 'Ya existe un contrato para este trabajo', contractId: existingContract.id });
      return;
    }

    // Create the missing contract
    const price = parseFloat(job.price?.toString() || '0');
    const commissionRate = 0.10; // 10% default
    const commission = price * commissionRate;
    const totalPrice = price + commission;

    const startDate = job.startDate ? new Date(job.startDate) : new Date();
    const endDate = job.endDate ? new Date(job.endDate) : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const contract = await Contract.create({
      jobId: job.id,
      clientId: job.clientId,
      doerId: job.doerId,
      type: 'trabajo',
      price,
      commission,
      totalPrice,
      startDate,
      endDate,
      status: 'pending',
      termsAccepted: false,
      termsAcceptedByClient: false,
      termsAcceptedByDoer: false,
    });

    // Update job's selectedWorkers if empty
    if (!job.selectedWorkers || job.selectedWorkers.length === 0) {
      job.selectedWorkers = [job.doerId];
      await job.save();
    }

    console.log(`✅ Contract ${contract.id} created for job ${job.id} with doer ${job.doerId}`);

    res.json({
      success: true,
      message: 'Contrato creado exitosamente',
      contract: {
        id: contract.id,
        status: contract.status,
        price: contract.price,
        doerId: contract.doerId,
      }
    });
  } catch (error: any) {
    console.error('Error repairing job:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/contracts/all-by-job/:jobId
// @desc    Obtener TODOS los contratos de un trabajo (para team jobs)
// @access  Private
router.get("/all-by-job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id.toString();

    // First verify the user is a participant (client or one of the workers)
    const job = await Job.findByPk(req.params.jobId);
    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    const jobClientId = typeof job.client === 'object' ? (job.client as any)?.id : job.clientId;
    const isClient = jobClientId?.toString() === userId;
    const isWorker = job.selectedWorkers?.includes(userId) || job.doerId?.toString() === userId;
    const isAdmin = isAdminUser(req.user);

    // Also check if user has any contract as doer for this job
    let hasContractAsDoer = false;
    if (!isClient && !isWorker && !isAdmin) {
      const userContract = await Contract.findOne({
        where: { jobId: req.params.jobId, doerId: userId }
      });
      hasContractAsDoer = !!userContract;
    }

    if (!isClient && !isWorker && !isAdmin && !hasContractAsDoer) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver los contratos de este trabajo",
      });
      return;
    }

    const contracts = await Contract.findAll({
      where: { jobId: req.params.jobId },
      include: [
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'avatar']
        }
      ],
      attributes: ['id', 'doerId', 'clientConfirmed', 'doerConfirmed', 'status']
    });

    res.json({
      success: true,
      contracts: contracts.map(c => ({
        id: c.id,
        doerId: c.doerId,
        doerName: (c.doer as any)?.name || 'Trabajador',
        doerAvatar: (c.doer as any)?.avatar,
        clientConfirmed: c.clientConfirmed,
        doerConfirmed: c.doerConfirmed,
        status: c.status,
      })),
      totalContracts: contracts.length,
      allClientConfirmed: contracts.every(c => c.clientConfirmed),
      allDoerConfirmed: contracts.every(c => c.doerConfirmed),
      allCompleted: contracts.every(c => c.clientConfirmed && c.doerConfirmed),
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

      // Calcular comisión basada en el plan del usuario
      // FREE: 8% | PRO: 3% | SUPER PRO: 1% | Plan Familia: 0%
      // Mínimo de comisión: $1,000 ARS
      const commissionResult = await calculateCommission(req.user.id, price, {
        isFreeContract,
      });

      const commissionRate = commissionResult.rate;
      const commission = commissionResult.commission;
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
 * Confirmar trabajo y proponer horas reales.
 * Flujo secuencial:
 *   1. Cualquier parte propone horas (startTime, endTime) → awaiting_confirmation
 *   2. La otra parte confirma (acepta las horas) → completed
 * Regla: el trabajador solo puede confirmar después de que transcurrió 30% de la duración del contrato.
 * Gracia: 5 horas para que la otra parte responda (auto-confirm).
 */
router.post("/:id/confirm", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id.toString();
    const { proposedStartTime, proposedEndTime, notes } = req.body;

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

    // Doer: verificar que pasó al menos 30% de la duración del contrato
    if (isDoer && !contract.doerConfirmed) {
      if (!contract.canDoerConfirm()) {
        const totalMs = new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime();
        const minMs = totalMs * 0.3;
        const minDate = new Date(new Date(contract.startDate).getTime() + minMs);
        res.status(400).json({
          success: false,
          message: `Debes esperar hasta ${minDate.toLocaleString('es-AR')} para confirmar (30% del tiempo del contrato).`,
        });
        return;
      }
    }

    // === CASO 1: Primera parte confirma (propone horas) ===
    const otherPartyConfirmed = isClient ? contract.doerConfirmed : contract.clientConfirmed;
    const thisPartyConfirmed = isClient ? contract.clientConfirmed : contract.doerConfirmed;

    if (thisPartyConfirmed && !otherPartyConfirmed) {
      res.status(400).json({ success: false, message: "Ya has confirmado. Esperando respuesta de la otra parte." });
      return;
    }

    if (!otherPartyConfirmed) {
      // Primera parte proponiendo horas
      const startTime = proposedStartTime ? new Date(proposedStartTime) : contract.startDate;
      const endTime = proposedEndTime ? new Date(proposedEndTime) : contract.endDate;

      if (endTime <= startTime) {
        res.status(400).json({ success: false, message: "La hora de fin debe ser posterior a la hora de inicio" });
        return;
      }

      // Guardar propuesta
      contract.confirmationProposedBy = userId;
      contract.proposedStartTime = startTime;
      contract.proposedEndTime = endTime;
      contract.confirmationNotes = notes || null;

      // Marcar confirmación de esta parte
      if (isClient) {
        contract.clientConfirmed = true;
        contract.clientConfirmedAt = new Date();
      } else {
        contract.doerConfirmed = true;
        contract.doerConfirmedAt = new Date();
      }

      contract.status = 'awaiting_confirmation';
      contract.awaitingConfirmationAt = new Date();

      // Agregar al historial
      const history = contract.confirmationHistory || [];
      history.push({
        proposedBy: userId,
        proposedAt: new Date(),
        proposedStartTime: startTime,
        proposedEndTime: endTime,
        notes: notes || undefined,
        action: 'proposed',
      });
      contract.confirmationHistory = history;

      await contract.save();

      // Notificar a la otra parte
      const emailService = (await import('../services/email.js')).default;
      const job = await Job.findByPk(contract.jobId);
      const otherPartyId = isClient ? contract.doerId.toString() : contract.clientId.toString();
      const currentUser = await User.findByPk(userId);

      if (currentUser) {
        await emailService.sendContractAwaitingConfirmationEmail(
          otherPartyId,
          currentUser.name,
          contract.id.toString(),
          job?.title || 'Contrato',
          !isClient
        );
      }

      // Notificar via socket
      socketService.notifyContractUpdate(
        contract.id.toString(),
        contract.clientId.toString(),
        contract.doerId.toString(),
        { action: 'hours_proposed', contract, confirmedBy: userId }
      );
      socketService.notifyDashboardRefresh(contract.clientId.toString());
      socketService.notifyDashboardRefresh(contract.doerId.toString());

      // Invalidar cache
      cacheService.delPattern('contracts:*');

      res.json({
        success: true,
        message: 'Horas confirmadas. Esperando que la otra parte revise y confirme.',
        contract,
      });
      return;
    }

    // === CASO 2: Segunda parte confirma (acepta las horas propuestas) ===
    if (isClient) {
      contract.clientConfirmed = true;
      contract.clientConfirmedAt = new Date();
    } else {
      contract.doerConfirmed = true;
      contract.doerConfirmedAt = new Date();
    }

    // Agregar al historial
    const history = contract.confirmationHistory || [];
    history.push({
      proposedBy: contract.confirmationProposedBy || '',
      proposedAt: contract.awaitingConfirmationAt || new Date(),
      proposedStartTime: contract.proposedStartTime || contract.startDate,
      proposedEndTime: contract.proposedEndTime || contract.endDate,
      action: 'confirmed',
      respondedBy: userId,
      respondedAt: new Date(),
    });
    contract.confirmationHistory = history;

    // Ambos confirmaron → completar contrato
    contract.status = 'completed';
    contract.paymentStatus = 'pending_payout';
    contract.escrowStatus = 'released';
    contract.actualStartDate = contract.proposedStartTime || contract.startDate;
    contract.actualEndDate = contract.proposedEndTime || contract.endDate;

    // Verificar datos bancarios del trabajador
    const doer = await User.findByPk(contract.doerId);
    const hasBankingInfo = doer?.bankingInfo?.cbu || doer?.bankingInfo?.alias;

    if (!hasBankingInfo) {
      const Notification = (await import('../models/sql/Notification.model.js')).default;
      await Notification.create({
        recipientId: contract.doerId,
        type: 'warning',
        category: 'payment',
        title: 'Datos bancarios requeridos',
        message: 'Para recibir tu pago, necesitamos que completes tus datos bancarios (CBU/CVU). Por favor actualiza tu información de pago en la configuración de tu perfil.',
        relatedModel: 'Contract',
        relatedId: contract.id,
        sentVia: ['in_app', 'email', 'push'],
        data: {
          requiresBankingInfo: true,
          contractId: contract.id,
          amount: contract.allocatedAmount || contract.price,
        },
      });

      const emailService2 = (await import('../services/email.js')).default;
      await emailService2.sendBankingInfoRequiredEmail(
        contract.doerId.toString(),
        contract.id.toString(),
        contract.allocatedAmount || contract.price
      );
    }

    // Liberar pago
    const Payment = (await import('../models/sql/Payment.model.js')).default;
    const payment = await Payment.findOne({ where: { contractId: id } });

    const paymentAmount = contract.allocatedAmount
      ? parseFloat(contract.allocatedAmount.toString())
      : contract.price;

    if (payment) {
      payment.status = 'completed';
      payment.escrowReleasedAt = new Date();
      payment.payerConfirmed = contract.clientConfirmed;
      payment.recipientConfirmed = contract.doerConfirmed;
      payment.workerPaymentAmount = paymentAmount;
      await payment.save();
      console.log(`💰 Liberando pago de $${paymentAmount.toLocaleString()} ARS al trabajador ${contract.doerId}`);
    }

    // Email de completado
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

    // Balance y job completion
    if (job && (job.maxWorkers || 1) > 1) {
      const BalanceTransaction = (await import('../models/sql/BalanceTransaction.model.js')).default;
      const worker = await User.findByPk(contract.doerId);
      const currentBalance = worker?.availableBalance || 0;
      const newBalance = currentBalance + paymentAmount;

      await BalanceTransaction.create({
        userId: contract.doerId,
        type: 'payment',
        amount: paymentAmount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        description: `Pago por contrato #${contract.id} - ${job.title}`,
        status: 'pending',
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

      if (worker) {
        worker.availableBalance = newBalance;
        await worker.save();
      }

      const allJobContracts = await Contract.findAll({ where: { jobId: job.id } });
      const allContractsCompleted = allJobContracts.every(c => c.clientConfirmed && c.doerConfirmed);

      if (allContractsCompleted) {
        job.status = 'completed';
        await job.save();
        socketService.notifyJobUpdate(job.id.toString(), job.clientId?.toString() || '', {
          action: 'job_completed',
          job
        });
      }
    } else if (job) {
      job.status = 'completed';
      await job.save();
      socketService.notifyJobUpdate(job.id.toString(), job.clientId?.toString() || '', {
        action: 'job_completed',
        job
      });
    }

    await contract.save();

    // Socket notifications
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      { action: 'both_confirmed', contract, confirmedBy: userId }
    );
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    // Invalidar cache
    cacheService.delPattern('contracts:*');

    res.json({
      success: true,
      message: '¡Contrato completado! El pago ha sido liberado.',
      contract,
    });
  } catch (error: any) {
    console.error('Error confirming contract:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * POST /api/contracts/:id/reject-confirmation
 * La otra parte rechaza la propuesta de horas → crea disputa automáticamente
 */
router.post("/:id/reject-confirmation", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id.toString();
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, message: "Debes proporcionar un motivo de rechazo" });
      return;
    }

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

    if (contract.status !== 'awaiting_confirmation') {
      res.status(400).json({ success: false, message: "El contrato no está esperando confirmación" });
      return;
    }

    // Solo puede rechazar la parte que NO propuso las horas
    if (contract.confirmationProposedBy === userId) {
      res.status(400).json({ success: false, message: "No puedes rechazar tu propia propuesta" });
      return;
    }

    // Guardar rechazo
    contract.confirmationRejectionReason = reason.trim();
    contract.status = 'disputed';

    // Agregar al historial
    const history = contract.confirmationHistory || [];
    history.push({
      proposedBy: contract.confirmationProposedBy || '',
      proposedAt: contract.awaitingConfirmationAt || new Date(),
      proposedStartTime: contract.proposedStartTime || contract.startDate,
      proposedEndTime: contract.proposedEndTime || contract.endDate,
      action: 'rejected',
      respondedBy: userId,
      respondedAt: new Date(),
      rejectionReason: reason.trim(),
    });
    contract.confirmationHistory = history;
    await contract.save();

    // Auto-crear disputa
    const Dispute = (await import('../models/sql/Dispute.model.js')).default;
    const Payment = (await import('../models/sql/Payment.model.js')).default;
    const Notification = (await import('../models/sql/Notification.model.js')).default;

    const payment = await Payment.findOne({ where: { contractId: id } });
    const job = await Job.findByPk(contract.jobId);

    const againstUserId = contract.confirmationProposedBy === contract.clientId.toString()
      ? contract.clientId
      : contract.doerId;

    const dispute = await Dispute.create({
      contractId: id,
      paymentId: payment?.id || null,
      initiatedBy: userId,
      against: againstUserId,
      reason: `Rechazo de confirmación: ${reason.trim()}`,
      detailedDescription: `La confirmación del contrato "${job?.title || 'Contrato'}" fue rechazada. Horas propuestas: ${contract.proposedStartTime?.toLocaleString('es-AR')} - ${contract.proposedEndTime?.toLocaleString('es-AR')}. Motivo del rechazo: ${reason.trim()}`,
      category: 'quality_issues',
      status: 'open',
      priority: 'medium',
      evidence: [],
      messages: [],
    });

    // Notificar a la otra parte
    const otherPartyId = isClient ? contract.doerId.toString() : contract.clientId.toString();
    await Notification.create({
      recipientId: otherPartyId,
      type: 'warning',
      category: 'contract',
      title: 'Confirmación rechazada - Disputa abierta',
      message: `Tu confirmación de horas fue rechazada. Se ha abierto una disputa automáticamente. Motivo: ${reason.trim()}`,
      relatedModel: 'Dispute',
      relatedId: dispute.id,
      sentVia: ['in_app', 'push'],
      data: { contractId: id, disputeId: dispute.id },
    });

    // Socket notifications
    socketService.notifyContractUpdate(
      contract.id.toString(),
      contract.clientId.toString(),
      contract.doerId.toString(),
      { action: 'confirmation_rejected', contract, dispute, rejectedBy: userId }
    );
    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    // Invalidar cache
    cacheService.delPattern('contracts:*');

    res.json({
      success: true,
      message: 'Confirmación rechazada. Se ha creado una disputa automáticamente.',
      contract,
      dispute,
    });
  } catch (error: any) {
    console.error('Error rejecting confirmation:', error);
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
/**
 * POST /api/contracts/:id/request-cancellation
 * Request contract cancellation - requires admin approval
 * While pending, the job publication is paused
 */
router.post("/:id/request-cancellation", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason, category } = req.body;
    const userId = req.user.id;

    if (!reason || reason.trim().length < 10) {
      res.status(400).json({
        success: false,
        message: "Debes proporcionar una razón detallada (mínimo 10 caracteres)"
      });
      return;
    }

    const contract = await Contract.findByPk(id, {
      include: [{ model: Job, as: 'job' }]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verify user is part of the contract
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({ success: false, message: "No tienes permiso para solicitar cancelación de este contrato" });
      return;
    }

    // Can't cancel completed contracts
    if (contract.status === 'completed' || contract.status === 'cancelled') {
      res.status(400).json({
        success: false,
        message: "No se puede solicitar cancelación de un contrato completado o ya cancelado"
      });
      return;
    }

    // Check if there's already a pending cancellation request
    const { ContractCancellationRequest } = await import('../models/sql/ContractCancellationRequest.model.js');
    const existingRequest = await ContractCancellationRequest.findOne({
      where: {
        contractId: id,
        status: 'pending'
      }
    });

    if (existingRequest) {
      res.status(400).json({
        success: false,
        message: "Ya existe una solicitud de cancelación pendiente para este contrato"
      });
      return;
    }

    const job = contract.job as any;
    const otherPartyId = isClient ? contract.doerId : contract.clientId;

    // Determine priority based on contract status and timing
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
    const daysUntilStart = Math.ceil((new Date(contract.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (contract.status === 'in_progress') {
      priority = 'urgent'; // Contract already in progress
    } else if (daysUntilStart <= 1) {
      priority = 'urgent'; // Less than 1 day
    } else if (daysUntilStart <= 3) {
      priority = 'high'; // Less than 3 days
    }

    // Create cancellation request
    const cancellationRequest = await ContractCancellationRequest.create({
      contractId: id,
      jobId: contract.jobId,
      requestedBy: userId,
      otherPartyId: otherPartyId,
      reason: reason.trim(),
      category: category || 'other',
      requestType: 'full_cancellation',
      priority,
      previousJobStatus: job?.status || null,
      previousContractStatus: contract.status,
      statusHistory: [{
        status: 'pending',
        changedAt: new Date(),
        changedBy: userId,
        note: 'Solicitud creada'
      }]
    });

    // Pause the job publication while cancellation is pending
    if (job && !['completed', 'cancelled'].includes(job.status)) {
      job.status = 'paused';
      job.pausedReason = 'Solicitud de cancelación de contrato pendiente';
      job.pausedAt = new Date();
      await job.save();
    }

    // Create notifications for both parties
    const { Notification } = await import('../models/sql/Notification.model.js');

    // Notify other party
    await Notification.create({
      recipientId: otherPartyId,
      type: 'warning',
      category: 'contract',
      title: 'Solicitud de cancelación de contrato',
      message: `Se ha solicitado cancelar el contrato para "${job?.title || 'Contrato'}". Un administrador revisará la solicitud.`,
      relatedModel: 'Contract',
      relatedId: id,
      actionText: 'Ver contrato',
      data: { contractId: id, cancellationRequestId: cancellationRequest.id },
      read: false,
    });

    // Notify admins
    const admins = await User.findAll({
      where: {
        adminRole: ['owner', 'super_admin', 'admin', 'support']
      }
    });

    for (const admin of admins) {
      await Notification.create({
        recipientId: admin.id,
        type: 'warning',
        category: 'contract',
        title: `[${priority.toUpperCase()}] Solicitud de cancelación`,
        message: `Nueva solicitud de cancelación para contrato - ${job?.title || 'Sin título'}`,
        relatedModel: 'ContractCancellationRequest',
        relatedId: cancellationRequest.id,
        actionText: 'Revisar solicitud',
        data: { contractId: id, cancellationRequestId: cancellationRequest.id, priority },
        read: false,
      });
    }

    // Socket notifications
    socketService.notifyContractUpdate(
      id,
      contract.clientId.toString(),
      contract.doerId.toString(),
      {
        action: 'cancellation_requested',
        contract,
        cancellationRequest
      }
    );

    socketService.notifyDashboardRefresh(contract.clientId.toString());
    socketService.notifyDashboardRefresh(contract.doerId.toString());

    res.json({
      success: true,
      message: "Solicitud de cancelación enviada. Un administrador la revisará.",
      cancellationRequest,
      jobPaused: true
    });
  } catch (error: any) {
    console.error('Error requesting contract cancellation:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

/**
 * GET /api/contracts/:id/cancellation-request
 * Get the current cancellation request for a contract
 */
router.get("/:id/cancellation-request", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const contract = await Contract.findByPk(id);
    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Verify user has access
    const isClient = contract.clientId.toString() === userId.toString();
    const isDoer = contract.doerId.toString() === userId.toString();
    const isAdmin = isAdminUser(req.user);

    if (!isClient && !isDoer && !isAdmin) {
      res.status(403).json({ success: false, message: "No tienes permiso para ver esta información" });
      return;
    }

    const { ContractCancellationRequest } = await import('../models/sql/ContractCancellationRequest.model.js');
    const cancellationRequest = await ContractCancellationRequest.findOne({
      where: { contractId: id },
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'otherParty', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'assignedAdmin', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'resolver', attributes: ['id', 'name', 'email'] },
      ]
    });

    res.json({
      success: true,
      cancellationRequest
    });
  } catch (error: any) {
    console.error('Error getting cancellation request:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

router.post("/:id/cancel", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  // Redirect to request-cancellation for proper admin approval flow
  res.status(400).json({
    success: false,
    message: "Para cancelar un contrato, debes usar la solicitud de cancelación que será revisada por un administrador.",
    redirectTo: `/api/contracts/${req.params.id}/request-cancellation`
  });
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

    // Generar código de 4 caracteres (1 letra + 3 números, ej: A123)
    const letter = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)];
    const numbers = Array.from({ length: 3 }, () => Math.floor(Math.random() * 10)).join('');
    const code = `${letter}${numbers}`;

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

      // Calculate commission using volume-based service
      const commissionResult = await calculateCommission(userId, priceDifference);
      additionalCommission = commissionResult.commission;

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
        // Calculate commission using volume-based service
        const commissionResult = await calculateCommission(contract.clientId, priceDifference);
        const additionalCommission = commissionResult.commission;
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

// ============================================
// TASK CLAIM SYSTEM
// ============================================

// @route   POST /api/contracts/:id/claim-tasks
// @desc    Client claims uncompleted tasks before confirming contract completion
// @access  Private (Client only)
router.post("/:id/claim-tasks", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { taskIds, newEndDate, reason } = req.body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "Debe seleccionar al menos una tarea no completada"
      });
      return;
    }

    if (!newEndDate) {
      res.status(400).json({
        success: false,
        message: "Debe especificar una nueva fecha de entrega"
      });
      return;
    }

    const contract = await Contract.findByPk(id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
        { model: Job }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Only client can claim tasks
    if (contract.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede reclamar tareas no completadas"
      });
      return;
    }

    // Contract must be awaiting confirmation or in progress
    if (contract.status !== 'awaiting_confirmation' && contract.status !== 'in_progress') {
      res.status(400).json({
        success: false,
        message: "Solo se pueden reclamar tareas en contratos en progreso o esperando confirmación"
      });
      return;
    }

    // Check if there's already a pending claim
    if (contract.hasPendingTaskClaim) {
      res.status(400).json({
        success: false,
        message: "Ya hay un reclamo de tareas pendiente de respuesta"
      });
      return;
    }

    // Verify the tasks exist and belong to this job
    const { JobTask } = await import('../models/sql/JobTask.model.js');
    const tasks = await JobTask.findAll({
      where: {
        id: taskIds,
        jobId: contract.jobId
      }
    });

    if (tasks.length !== taskIds.length) {
      res.status(400).json({
        success: false,
        message: "Una o más tareas no existen o no pertenecen a este trabajo"
      });
      return;
    }

    // Mark tasks as claimed
    for (const task of tasks) {
      task.isClaimed = true;
      task.claimedAt = new Date();
      task.claimedBy = req.user.id;
      task.claimNotes = reason;
      await task.save();
    }

    // Update contract with claim info
    contract.hasPendingTaskClaim = true;
    contract.taskClaimRequestedAt = new Date();
    contract.taskClaimRequestedBy = req.user.id;
    contract.taskClaimNewEndDate = new Date(newEndDate);
    contract.taskClaimReason = reason || 'Tareas no completadas';
    contract.claimedTaskIds = taskIds;
    contract.taskClaimResponse = 'pending';
    await contract.save();

    // Notify the worker
    const notificationService = (await import('../services/notification.js')).default;
    await notificationService.createNotification({
      userId: contract.doerId,
      type: 'task_claim',
      title: 'Reclamo de tareas pendientes',
      message: `El cliente ha reclamado ${tasks.length} tarea(s) como no completada(s). Tienes 48 horas para responder.`,
      relatedContractId: contract.id,
      actionUrl: `/contracts/${contract.id}`
    });

    // Send email notification
    const emailService = await import('../services/email.js');
    if (contract.doer?.email) {
      await emailService.sendEmail(
        contract.doer.email,
        'Reclamo de tareas pendientes en DoApp',
        'task-claim',
        {
          workerName: contract.doer.name,
          clientName: contract.client?.name,
          taskCount: tasks.length,
          taskNames: tasks.map(t => t.title).join(', '),
          newEndDate: new Date(newEndDate).toLocaleDateString('es-AR'),
          reason: reason || 'No especificado',
          contractUrl: `${process.env.FRONTEND_URL || 'https://doapp.com'}/contracts/${contract.id}`
        }
      );
    }

    res.json({
      success: true,
      message: "Reclamo de tareas enviado. El trabajador será notificado.",
      contract
    });
  } catch (error: any) {
    console.error('Error claiming tasks:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

// @route   POST /api/contracts/:id/respond-task-claim
// @desc    Worker responds to task claim (accept or reject)
// @access  Private (Doer only)
router.post("/:id/respond-task-claim", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { accept, rejectionReason } = req.body;

    const contract = await Contract.findByPk(id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
        { model: Job }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Only worker can respond
    if (contract.doerId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el trabajador puede responder al reclamo"
      });
      return;
    }

    // Must have a pending claim
    if (!contract.hasPendingTaskClaim) {
      res.status(400).json({
        success: false,
        message: "No hay reclamo de tareas pendiente"
      });
      return;
    }

    const { JobTask } = await import('../models/sql/JobTask.model.js');
    const notificationService = (await import('../services/notification.js')).default;

    // Add to claim history
    contract.taskClaimHistory = [
      ...contract.taskClaimHistory,
      {
        claimedTaskIds: contract.claimedTaskIds,
        requestedAt: contract.taskClaimRequestedAt!,
        requestedBy: contract.taskClaimRequestedBy!,
        newEndDate: contract.taskClaimNewEndDate!,
        reason: contract.taskClaimReason || '',
        response: accept ? 'accepted' : 'rejected',
        respondedAt: new Date(),
        rejectionReason: accept ? undefined : rejectionReason
      }
    ];

    contract.taskClaimRespondedAt = new Date();

    if (accept) {
      // Worker accepts - extend the contract end date
      contract.taskClaimResponse = 'accepted';
      contract.hasPendingTaskClaim = false;

      // Update contract end date
      const originalEndDate = contract.endDate;
      contract.endDate = contract.taskClaimNewEndDate!;

      // Reset confirmation status so both parties need to confirm again
      contract.clientConfirmed = false;
      contract.doerConfirmed = false;
      contract.status = 'in_progress';

      // Clear claim data
      const claimedTasks = await JobTask.findAll({
        where: { id: contract.claimedTaskIds }
      });

      // Mark tasks as still needing completion (not claimed anymore)
      for (const task of claimedTasks) {
        task.isClaimed = false;
        task.status = 'pending';
        await task.save();
      }

      await contract.save();

      // Notify client
      await notificationService.createNotification({
        userId: contract.clientId,
        type: 'task_claim_accepted',
        title: 'Reclamo aceptado',
        message: `El trabajador aceptó completar las tareas reclamadas. Nueva fecha de entrega: ${contract.taskClaimNewEndDate?.toLocaleDateString('es-AR')}`,
        relatedContractId: contract.id,
        actionUrl: `/contracts/${contract.id}`
      });

      res.json({
        success: true,
        message: "Reclamo aceptado. La fecha de entrega ha sido extendida.",
        contract
      });
    } else {
      // Worker rejects - create a dispute automatically
      if (!rejectionReason) {
        res.status(400).json({
          success: false,
          message: "Debe proporcionar una razón para el rechazo"
        });
        return;
      }

      contract.taskClaimResponse = 'rejected';
      contract.taskClaimRejectionReason = rejectionReason;
      contract.hasPendingTaskClaim = false;

      // Create dispute
      const { Dispute } = await import('../models/sql/Dispute.model.js');
      const dispute = await Dispute.create({
        contractId: contract.id,
        jobId: contract.jobId,
        initiatorId: req.user.id, // Worker is the initiator since they're denying
        respondentId: contract.clientId,
        reason: `Reclamo de tareas denegado: ${rejectionReason}`,
        description: `El cliente reclamó las siguientes tareas como no completadas. El trabajador ha denegado el reclamo.\n\nTareas reclamadas: ${contract.claimedTaskIds.join(', ')}\n\nRazón del cliente: ${contract.taskClaimReason}\n\nRazón del rechazo del trabajador: ${rejectionReason}`,
        status: 'open',
        type: 'task_completion'
      });

      contract.status = 'disputed';
      contract.disputeId = dispute.id;
      contract.disputedAt = new Date();
      await contract.save();

      // Notify both parties
      await notificationService.createNotification({
        userId: contract.clientId,
        type: 'dispute_created',
        title: 'Disputa creada automáticamente',
        message: `El trabajador rechazó el reclamo de tareas. Se ha abierto una disputa para resolver el conflicto.`,
        relatedContractId: contract.id,
        relatedDisputeId: dispute.id,
        actionUrl: `/disputes/${dispute.id}`
      });

      await notificationService.createNotification({
        userId: contract.doerId,
        type: 'dispute_created',
        title: 'Disputa creada',
        message: `Has rechazado el reclamo de tareas. Se ha abierto una disputa para resolver el conflicto.`,
        relatedContractId: contract.id,
        relatedDisputeId: dispute.id,
        actionUrl: `/disputes/${dispute.id}`
      });

      res.json({
        success: true,
        message: "Reclamo rechazado. Se ha creado una disputa automáticamente.",
        contract,
        disputeId: dispute.id
      });
    }
  } catch (error: any) {
    console.error('Error responding to task claim:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

// @route   GET /api/contracts/:id/task-claim
// @desc    Get task claim status for a contract
// @access  Private
router.get("/:id/task-claim", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const contract = await Contract.findByPk(id, {
      attributes: [
        'id', 'clientId', 'doerId', 'hasPendingTaskClaim',
        'taskClaimRequestedAt', 'taskClaimRequestedBy',
        'taskClaimNewEndDate', 'taskClaimReason', 'claimedTaskIds',
        'taskClaimResponse', 'taskClaimRejectionReason', 'taskClaimHistory'
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Only parties involved can view
    if (contract.clientId !== req.user.id && contract.doerId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este reclamo"
      });
      return;
    }

    // Get claimed tasks details
    const { JobTask } = await import('../models/sql/JobTask.model.js');
    const claimedTasks = contract.claimedTaskIds.length > 0
      ? await JobTask.findAll({
          where: { id: contract.claimedTaskIds }
        })
      : [];

    res.json({
      success: true,
      taskClaim: {
        hasPendingClaim: contract.hasPendingTaskClaim,
        requestedAt: contract.taskClaimRequestedAt,
        requestedBy: contract.taskClaimRequestedBy,
        newEndDate: contract.taskClaimNewEndDate,
        reason: contract.taskClaimReason,
        response: contract.taskClaimResponse,
        rejectionReason: contract.taskClaimRejectionReason,
        claimedTasks,
        history: contract.taskClaimHistory
      }
    });
  } catch (error: any) {
    console.error('Error getting task claim:', error);
    res.status(500).json({ success: false, message: error.message || "Error del servidor" });
  }
});

export default router;
