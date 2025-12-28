import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { Proposal } from "../models/sql/Proposal.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Conversation } from "../models/sql/Conversation.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import emailService from "../services/email.js";
import { config } from "../config/env.js";
import { socketService } from "../index.js";
import { Op } from 'sequelize';
import cacheService from "../services/cacheService.js";

const router = express.Router();

/**
 * Crear o actualizar chat grupal para trabajos con múltiples trabajadores
 */
async function createOrUpdateGroupChat(job: Job, workerIds: string[]): Promise<Conversation | null> {
  try {
    // Todos los participantes: cliente + trabajadores
    const allParticipants = [job.clientId, ...workerIds];

    // Buscar si ya existe un chat grupal para este trabajo
    let groupChat = job.groupChatId
      ? await Conversation.findByPk(job.groupChatId)
      : null;

    if (groupChat) {
      // Actualizar participantes del chat grupal existente
      groupChat.participants = allParticipants;
      await groupChat.save();
    } else {
      // Crear nuevo chat grupal
      groupChat = await Conversation.create({
        participants: allParticipants,
        jobId: job.id,
        type: 'contract' as any, // Tipo especial para chats grupales de trabajo
        lastMessage: `Chat grupal creado para el trabajo "${job.title}"`,
        lastMessageAt: new Date(),
      });

      // Guardar referencia al chat grupal en el trabajo
      job.groupChatId = groupChat.id;
      await job.save();

      // Crear mensaje del sistema informando sobre el chat grupal
      await ChatMessage.create({
        conversationId: groupChat.id,
        senderId: job.clientId,
        message: `📋 Chat grupal del trabajo: ${job.title}||Equipo de trabajo||Este chat incluye al cliente y a todos los trabajadores seleccionados para este trabajo.\n\n👥 Participantes: ${allParticipants.length}\n📍 Ubicación: ${job.location}\n📅 Inicio: ${new Date(job.startDate).toLocaleDateString('es-AR')}`,
        type: 'system',
        metadata: {
          jobId: job.id,
          action: 'group_chat_created',
        },
      });
    }

    // Notificar a todos los participantes sobre el chat grupal
    for (const participantId of allParticipants) {
      const notification = await Notification.create({
        recipientId: participantId,
        type: 'group_chat',
        category: 'chat',
        title: 'Chat grupal disponible',
        message: `Se ha creado un chat grupal para el trabajo "${job.title}" con ${allParticipants.length} participantes.`,
        relatedModel: 'Conversation',
        relatedId: groupChat.id,
        actionText: 'Ir al chat',
        data: {
          jobId: job.id,
          conversationId: groupChat.id,
          participantCount: allParticipants.length,
        },
        read: false,
      });

      // Send real-time notification
      const { socketService } = await import('../index.js');
      socketService.notifyUser(participantId, notification.toJSON());
    }

    return groupChat;
  } catch (error) {
    console.error('Error creating/updating group chat:', error);
    return null;
  }
}

// @route   GET /api/proposals
// @desc    Obtener propuestas del usuario (enviadas o recibidas)
// @access  Private
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type } = req.query;

    let whereClause: any = {};

    // type: 'sent' (propuestas enviadas) o 'received' (propuestas recibidas)
    if (type === "sent") {
      whereClause.freelancerId = req.user.id;
    } else if (type === "received") {
      whereClause.clientId = req.user.id;
    } else {
      // Por defecto, mostrar todas las propuestas relacionadas con el usuario
      whereClause[Op.or] = [
        { freelancerId: req.user.id },
        { clientId: req.user.id }
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    const proposals = await Proposal.findAll({
      where: whereClause,
      include: [
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title', 'description', 'summary', 'price', 'location', 'category', 'status', 'startDate', 'endDate']
        },
        {
          model: User,
          as: 'freelancer',
          attributes: ['name', 'avatar', 'rating', 'reviewsCount', 'completedJobs']
        },
        {
          model: User,
          as: 'client',
          attributes: ['name', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/proposals/check/:jobId
// @desc    Verificar si el usuario ya aplicó a un trabajo
// @access  Private
router.get("/check/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findOne({
      where: {
        jobId: req.params.jobId,
        freelancerId: req.user.id,
      },
    });

    res.json({
      success: true,
      hasApplied: !!proposal,
      proposalId: proposal?.id || null,
      proposalStatus: proposal?.status || null,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/proposals/job/:jobId
// @desc    Obtener propuestas de un trabajo específico
// @access  Private
router.get("/job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea el dueño del trabajo
    if (job.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver las propuestas de este trabajo",
      });
      return;
    }

    const proposals = await Proposal.findAll({
      where: { jobId: req.params.jobId },
      include: [
        {
          model: User,
          as: 'freelancer',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount', 'completedJobs']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/proposals/:id
// @desc    Obtener propuesta por ID
// @access  Private
router.get("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: 'job'
        },
        {
          model: User,
          as: 'freelancer',
          attributes: ['name', 'email', 'avatar', 'rating', 'reviewsCount', 'completedJobs']
        },
        {
          model: User,
          as: 'client',
          attributes: ['name', 'email', 'avatar']
        }
      ]
    });

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea parte de la propuesta
    const isFreelancer = proposal.freelancerId === req.user.id;
    const isClient = proposal.clientId === req.user.id;

    if (!isFreelancer && !isClient) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver esta propuesta",
      });
      return;
    }

    res.json({
      success: true,
      proposal,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/proposals
// @desc    Enviar propuesta a un trabajo
// @access  Private
router.post(
  "/",
  protect,
  [
    body("job").notEmpty().withMessage("El trabajo es requerido"),
    body("coverLetter")
      .notEmpty()
      .withMessage("La carta de presentación es requerida")
      .isLength({ max: 1000 })
      .withMessage("La carta no puede exceder 1000 caracteres"),
    body("proposedPrice")
      .isNumeric()
      .withMessage("El precio debe ser un número")
      .custom((value) => value >= 0)
      .withMessage("El precio no puede ser negativo"),
    body("estimatedDuration")
      .isInt({ min: 1 })
      .withMessage("La duración debe ser al menos 1 día"),
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

      const { job: jobId, coverLetter, proposedPrice, estimatedDuration } = req.body;

      // Verificar que el trabajo existe y está abierto
      const job = await Job.findByPk(jobId);
      if (!job) {
        res.status(404).json({
          success: false,
          message: "Trabajo no encontrado",
        });
        return;
      }

      if (job.status !== "open") {
        res.status(400).json({
          success: false,
          message: "Este trabajo ya no está abierto para propuestas",
        });
        return;
      }

      // Verificar que el usuario no sea el dueño del trabajo
      if (job.clientId === req.user.id) {
        res.status(400).json({
          success: false,
          message: "No puedes enviar una propuesta a tu propio trabajo",
        });
        return;
      }

      // Verificar que no haya enviado una propuesta previamente
      const existingProposal = await Proposal.findOne({
        where: {
          jobId: jobId,
          freelancerId: req.user.id,
        }
      });

      if (existingProposal) {
        res.status(400).json({
          success: false,
          message: "Ya has enviado una propuesta para este trabajo",
        });
        return;
      }

      // Detectar si es contraoferta (precio diferente al original)
      const isCounterOffer = proposedPrice !== job.price;

      // Crear propuesta
      const proposal = await Proposal.create({
        jobId: jobId,
        freelancerId: req.user.id,
        clientId: job.clientId,
        coverLetter,
        proposedPrice,
        estimatedDuration,
        isCounterOffer,
        originalJobPrice: job.price,
      });

      const populatedProposal = await Proposal.findByPk(proposal.id, {
        include: [
          {
            model: Job,
            as: 'job',
            attributes: ['title', 'summary', 'price', 'location']
          },
          {
            model: User,
            as: 'freelancer',
            attributes: ['name', 'avatar', 'rating', 'reviewsCount']
          },
          {
            model: User,
            as: 'client',
            attributes: ['name', 'avatar']
          }
        ]
      });

      // Crear o encontrar conversación
      let conversation = await Conversation.findOne({
        where: {
          participants: {
            [Op.contains]: [req.user.id, job.clientId]
          },
          jobId: job.id,
          type: "direct",
        }
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [req.user.id, job.clientId],
          jobId: job.id,
          type: "direct",
        });
      }

      // Crear mensaje del sistema
      const messageText = isCounterOffer
        ? `${req.user.name} envió una contraoferta||${job.title}||**Contraoferta:** $${proposedPrice.toLocaleString("es-AR")} ARS (Precio original: $${job.price.toLocaleString("es-AR")} ARS)\n**Ubicación:** ${job.location}\n**Duración estimada:** ${estimatedDuration} días\n\n**Mensaje:**\n${coverLetter}`
        : `${req.user.name} aplicó al trabajo||${job.title}||**Precio propuesto:** $${proposedPrice.toLocaleString("es-AR")} ARS\n**Ubicación:** ${job.location}\n**Duración estimada:** ${estimatedDuration} días\n**Fecha de inicio:** ${new Date(job.startDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}`;

      await ChatMessage.create({
        conversationId: conversation.id,
        senderId: req.user.id,
        message: messageText,
        type: "system",
        metadata: {
          jobId: job.id,
          proposalId: proposal.id,
          action: "job_application",
          isCounterOffer,
        },
      });

      // Actualizar conversación
      conversation.lastMessage = isCounterOffer ? "Nueva contraoferta recibida" : "Nueva aplicación recibida";
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Send real-time notifications via Socket.io
      socketService.notifyProposalUpdate(
        proposal.id,
        req.user.id,
        job.clientId,
        {
          action: 'created',
          proposal: populatedProposal,
          isCounterOffer
        }
      );

      // Notify admin panel and job owner of new proposal
      socketService.notifyNewProposal(populatedProposal?.toJSON(), job.clientId);

      // Notify dashboard refresh for both parties
      socketService.notifyDashboardRefresh(req.user.id);
      socketService.notifyDashboardRefresh(job.clientId);

      // Create persistent notification for job owner
      const freelancerUser = await User.findByPk(req.user.id, {
        attributes: ['name', 'avatar']
      });

      const notificationTitle = isCounterOffer
        ? 'Nueva contraoferta recibida'
        : 'Nueva postulación recibida';
      const notificationMessage = isCounterOffer
        ? `${freelancerUser?.name || 'Un trabajador'} envió una contraoferta de $${proposedPrice.toLocaleString('es-AR')} ARS para "${job.title}"`
        : `${freelancerUser?.name || 'Un trabajador'} se postuló para "${job.title}" por $${proposedPrice.toLocaleString('es-AR')} ARS`;

      const notification = await Notification.create({
        recipientId: job.clientId,
        type: isCounterOffer ? 'counter_offer' : 'new_proposal',
        category: 'proposal',
        title: notificationTitle,
        message: notificationMessage,
        relatedModel: 'Proposal',
        relatedId: proposal.id,
        actionText: 'Ver postulación',
        data: {
          jobId: job.id,
          jobTitle: job.title,
          proposalId: proposal.id,
          freelancerId: req.user.id,
          freelancerName: freelancerUser?.name,
          freelancerAvatar: freelancerUser?.avatar,
          proposedPrice,
          isCounterOffer,
        },
        read: false,
      });

      // Send real-time notification to job owner
      socketService.notifyUser(job.clientId, notification.toJSON());

      res.status(201).json({
        success: true,
        proposal: populatedProposal,
        conversationId: conversation.id,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/proposals/:id/approve
// @desc    Aprobar propuesta (por el cliente) - soporta múltiples trabajadores con asignación de pago personalizada
// @access  Private
router.put("/:id/approve", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Extract optional allocated amount from request body
    const { allocatedAmount } = req.body;

    const proposal = await Proposal.findByPk(req.params.id, {
      include: [
        {
          model: Job,
          as: 'job'
        },
        {
          model: User,
          as: 'freelancer',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea el cliente
    if (proposal.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede aprobar esta propuesta",
      });
      return;
    }

    if (proposal.status !== "pending") {
      res.status(400).json({
        success: false,
        message: `Esta propuesta no puede ser aprobada porque su estado es "${proposal.status}" (debe ser "pending")`,
      });
      return;
    }

    // Obtener el trabajo para verificar maxWorkers
    const job = await Job.findByPk(proposal.jobId, {
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    const maxWorkers = job.maxWorkers || 1;
    const currentWorkers = job.selectedWorkers || [];
    const currentWorkerCount = currentWorkers.length;

    // Verificar si ya se alcanzó el máximo de trabajadores
    if (currentWorkerCount >= maxWorkers) {
      res.status(400).json({
        success: false,
        message: `Este trabajo ya tiene el máximo de ${maxWorkers} trabajador${maxWorkers > 1 ? 'es' : ''} seleccionado${maxWorkers > 1 ? 's' : ''}`,
      });
      return;
    }

    // Verificar si este trabajador ya fue seleccionado
    if (currentWorkers.includes(proposal.freelancerId)) {
      res.status(400).json({
        success: false,
        message: "Este trabajador ya fue seleccionado para este trabajo",
      });
      return;
    }

    // Actualizar propuesta
    proposal.status = "approved";
    await proposal.save();

    // Agregar trabajador al array de selectedWorkers
    const updatedWorkers = [...currentWorkers, proposal.freelancerId];
    job.selectedWorkers = updatedWorkers;

    // Si es el primer trabajador, también asignar a doerId para compatibilidad
    if (!job.doerId) {
      job.doerId = proposal.freelancerId;
    }

    // ============================================
    // WORKER PAYMENT ALLOCATION LOGIC
    // ============================================
    const jobPrice = typeof job.price === 'string' ? parseFloat(job.price) : Number(job.price);

    // Calculate worker's allocated amount
    let workerAllocation: number;

    if (allocatedAmount !== undefined && allocatedAmount !== null) {
      // Client specified a custom amount for this worker
      workerAllocation = parseFloat(allocatedAmount);

      // Validate allocation doesn't exceed remaining budget
      const currentAllocatedTotal = typeof job.allocatedTotal === 'string'
        ? parseFloat(job.allocatedTotal)
        : (job.allocatedTotal || 0);
      const remainingBudget = jobPrice - currentAllocatedTotal;

      if (workerAllocation > remainingBudget) {
        res.status(400).json({
          success: false,
          message: `El monto asignado ($${workerAllocation.toLocaleString()}) excede el presupuesto restante ($${remainingBudget.toLocaleString()})`,
        });
        return;
      }
    } else {
      // Default: use proposed price or equal split
      if (maxWorkers === 1) {
        // Single worker: use proposal price
        workerAllocation = proposal.proposedPrice;
      } else {
        // Multiple workers: use proposal price as allocation
        // The client can later adjust via the allocation endpoint
        workerAllocation = proposal.proposedPrice;
      }
    }

    // Calculate percentage of total budget
    const percentageOfBudget = (workerAllocation / jobPrice) * 100;

    // Update job's worker allocations
    const currentAllocations = job.workerAllocations || [];
    currentAllocations.push({
      workerId: proposal.freelancerId,
      allocatedAmount: workerAllocation,
      percentage: percentageOfBudget,
      allocatedAt: new Date(),
    });
    job.workerAllocations = currentAllocations;

    // Update allocated total and remaining budget
    const newAllocatedTotal = currentAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    job.allocatedTotal = newAllocatedTotal;
    job.remainingBudget = jobPrice - newAllocatedTotal;

    // Si se alcanzó el máximo de trabajadores, rechazar las demás propuestas pendientes
    if (updatedWorkers.length >= maxWorkers) {
      await Proposal.update(
        {
          status: "rejected",
          rejectionReason: `Se completaron los ${maxWorkers} puesto${maxWorkers > 1 ? 's' : ''} disponible${maxWorkers > 1 ? 's' : ''}`,
        },
        {
          where: {
            jobId: proposal.jobId,
            id: { [Op.ne]: proposal.id },
            status: "pending",
          }
        }
      );

      // Solo cambiar a in_progress si la fecha de inicio ya pasó
      const now = new Date();
      const jobStartDate = job.startDate ? new Date(job.startDate) : now;

      if (jobStartDate <= now) {
        job.status = "in_progress";
      }
    }

    await job.save();

    // Crear o actualizar chat grupal si hay múltiples trabajadores
    if (updatedWorkers.length > 1 || maxWorkers > 1) {
      await createOrUpdateGroupChat(job, updatedWorkers);
    }

    // Validar monto mínimo de $5000 ARS para la asignación del trabajador
    const MINIMUM_CONTRACT_AMOUNT = 5000;
    if (workerAllocation < MINIMUM_CONTRACT_AMOUNT) {
      res.status(400).json({
        success: false,
        message: `El monto mínimo del contrato es de $${MINIMUM_CONTRACT_AMOUNT.toLocaleString()} ARS`,
      });
      return;
    }

    // Crear contrato automáticamente con el monto asignado
    const PLATFORM_COMMISSION = 0.1;
    const commission = workerAllocation * PLATFORM_COMMISSION;
    const totalPrice = workerAllocation + commission;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + proposal.estimatedDuration);

    // Generate pairing code (6 digit code)
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const pairingExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const contract = await Contract.create({
      jobId: proposal.jobId,
      clientId: proposal.clientId,
      doerId: proposal.freelancerId,
      type: "trabajo",
      price: workerAllocation, // Use allocated amount, not proposal price
      commission,
      totalPrice,
      startDate,
      endDate,
      status: "pending",
      termsAccepted: false,
      termsAcceptedByClient: false,
      termsAcceptedByDoer: false,
      pairingCode,
      pairingGeneratedAt: new Date(),
      pairingExpiry,
      // New allocation fields
      allocatedAmount: workerAllocation,
      percentageOfBudget,
    });

    // Update the chat message metadata to reflect approved status
    await ChatMessage.update(
      {
        metadata: {
          jobId: proposal.jobId,
          proposalId: proposal.id,
          action: 'job_application',
          proposalStatus: 'approved',
          contractId: contract.id,
        }
      },
      {
        where: {
          type: 'system',
          'metadata.proposalId': proposal.id,
        }
      }
    );

    // Send real-time notifications via Socket.io
    socketService.notifyProposalUpdate(
      proposal.id,
      proposal.freelancerId,
      req.user.id,
      {
        action: 'approved',
        proposal,
        proposalStatus: 'approved',
      }
    );

    // Notify dashboard refresh for both parties
    socketService.notifyDashboardRefresh(proposal.freelancerId);
    socketService.notifyDashboardRefresh(req.user.id);

    // Create persistent notification for the freelancer
    const notification = await Notification.create({
      recipientId: proposal.freelancerId,
      type: "success",
      category: "contract",
      title: "¡Has sido seleccionado!",
      message: `Felicitaciones! Fuiste elegido para el trabajo "${job?.title}". Revisa los detalles del contrato.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      actionText: 'Ver contrato',
      data: {
        jobId: proposal.jobId,
        proposalId: proposal.id,
        contractId: contract.id,
      },
      read: false,
    });

    // Send real-time notification
    socketService.notifyUser(proposal.freelancerId, notification.toJSON());

    // Notify admin panel of new contract
    const populatedContract = await Contract.findByPk(contract.id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] }
      ]
    });
    socketService.notifyNewContract(populatedContract?.toJSON());

    // Invalidate job cache to ensure fresh data on next fetch
    cacheService.delPattern(`jobs:*`);
    cacheService.delPattern(`job:${job.id}*`);

    // Emit job update event with updated job data for real-time UI refresh
    const updatedJob = await Job.findByPk(job.id, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'avatar', 'rating'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'avatar', 'rating'], required: false }
      ]
    });

    // Notify job update to refresh the job detail page
    socketService.notifyJobUpdate(job.id, req.user.id, {
      action: 'worker_selected',
      job: updatedJob?.toJSON(),
      selectedWorkers: updatedJob?.selectedWorkers,
      maxWorkers: updatedJob?.maxWorkers,
    });

    // Also emit jobs:refresh for the list views
    socketService.io.emit("jobs:refresh", {
      action: "worker_selected",
      jobId: job.id,
      job: updatedJob?.toJSON()
    });

    res.json({
      success: true,
      proposal,
      contractId: contract.id,
      message: "Propuesta aprobada y contrato creado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/proposals/:id/reject
// @desc    Rechazar propuesta (por el cliente)
// @access  Private
router.put(
  "/:id/reject",
  protect,
  [body("rejectionReason").optional().isLength({ max: 500 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rejectionReason } = req.body;

      const proposal = await Proposal.findByPk(req.params.id);

      if (!proposal) {
        res.status(404).json({
          success: false,
          message: "Propuesta no encontrada",
        });
        return;
      }

      // Verificar que el usuario sea el cliente
      if (proposal.clientId !== req.user.id) {
        res.status(403).json({
          success: false,
          message: "Solo el cliente puede rechazar esta propuesta",
        });
        return;
      }

      if (proposal.status !== "pending") {
        res.status(400).json({
          success: false,
          message: "Esta propuesta no puede ser rechazada",
        });
        return;
      }

      proposal.status = "rejected";
      proposal.rejectionReason = rejectionReason;
      await proposal.save();

      // Update the chat message metadata to reflect rejected status
      await ChatMessage.update(
        {
          metadata: {
            jobId: proposal.jobId,
            proposalId: proposal.id,
            action: 'job_application',
            proposalStatus: 'rejected',
          }
        },
        {
          where: {
            type: 'system',
            'metadata.proposalId': proposal.id,
          }
        }
      );

      // Send real-time notifications via Socket.io
      socketService.notifyProposalUpdate(
        proposal.id,
        proposal.freelancerId,
        req.user.id,
        {
          action: 'rejected',
          proposal,
          proposalStatus: 'rejected',
          rejectionReason
        }
      );

      // Notify dashboard refresh for both parties
      socketService.notifyDashboardRefresh(proposal.freelancerId);
      socketService.notifyDashboardRefresh(req.user.id);

      res.json({
        success: true,
        proposal,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/proposals/:id/withdraw
// @desc    Retirar propuesta (por el freelancer)
// @access  Private
router.put(
  "/:id/withdraw",
  protect,
  [body("withdrawnReason").optional().isLength({ max: 500 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { withdrawnReason } = req.body;

      const proposal = await Proposal.findByPk(req.params.id);

      if (!proposal) {
        res.status(404).json({
          success: false,
          message: "Propuesta no encontrada",
        });
        return;
      }

      // Verificar que el usuario sea el freelancer
      if (proposal.freelancerId !== req.user.id) {
        res.status(403).json({
          success: false,
          message: "Solo el freelancer puede retirar esta propuesta",
        });
        return;
      }

      if (proposal.status !== "pending") {
        res.status(400).json({
          success: false,
          message: "Esta propuesta no puede ser retirada",
        });
        return;
      }

      proposal.status = "withdrawn";
      proposal.withdrawnReason = withdrawnReason;
      await proposal.save();

      // Update the chat message metadata to reflect withdrawn status
      await ChatMessage.update(
        {
          metadata: {
            jobId: proposal.jobId,
            proposalId: proposal.id,
            action: 'job_application',
            proposalStatus: 'withdrawn',
          }
        },
        {
          where: {
            type: 'system',
            'metadata.proposalId': proposal.id,
          }
        }
      );

      // Send real-time notifications via Socket.io
      socketService.notifyProposalUpdate(
        proposal.id,
        req.user.id,
        proposal.clientId,
        {
          action: 'withdrawn',
          proposal,
          proposalStatus: 'withdrawn',
          withdrawnReason
        }
      );

      // Notify dashboard refresh for both parties
      socketService.notifyDashboardRefresh(req.user.id);
      socketService.notifyDashboardRefresh(proposal.clientId);

      res.json({
        success: true,
        proposal,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   DELETE /api/proposals/:id
// @desc    Eliminar propuesta (solo si está pending y es el freelancer)
// @access  Private
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findByPk(req.params.id);

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea el freelancer
    if (proposal.freelancerId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar esta propuesta",
      });
      return;
    }

    if (proposal.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Solo puedes eliminar propuestas pendientes",
      });
      return;
    }

    await proposal.destroy();

    res.json({
      success: true,
      message: "Propuesta eliminada",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/proposals/apply-and-accept
// @desc    Aplicar y aceptar trabajo directamente (crea propuesta, conversación y envía emails)
// @access  Private
router.post(
  "/apply-and-accept",
  protect,
  [body("jobId").notEmpty().withMessage("El trabajo es requerido")],
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

      const { jobId } = req.body;

      // Verificar que el trabajo existe y está abierto
      const job = await Job.findByPk(jobId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['name', 'email']
          }
        ]
      });
      if (!job) {
        res.status(404).json({
          success: false,
          message: "Trabajo no encontrado",
        });
        return;
      }

      if (job.status !== "open") {
        res.status(400).json({
          success: false,
          message: "Este trabajo ya no está abierto",
        });
        return;
      }

      // Verificar que el usuario no sea el dueño del trabajo
      if (job.clientId === req.user.id) {
        res.status(400).json({
          success: false,
          message: "No puedes aplicar a tu propio trabajo",
        });
        return;
      }

      // Verificar que no haya una propuesta previa
      const existingProposal = await Proposal.findOne({
        where: {
          jobId: jobId,
          freelancerId: req.user.id,
        }
      });

      if (existingProposal) {
        res.status(400).json({
          success: false,
          message: "Ya has enviado una propuesta para este trabajo",
        });
        return;
      }

      // Ensure price is a number
      const jobPrice = typeof job.price === 'string' ? parseFloat(job.price) : job.price;

      // Calculate duration safely - handle flexible end date
      const startDate = new Date(job.startDate);
      const endDate = job.endDate ? new Date(job.endDate) : null;
      let durationDays = 1; // Default to 1 day if no end date
      if (endDate) {
        const durationMs = endDate.getTime() - startDate.getTime();
        durationDays = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
      }

      // Crear propuesta automáticamente aprobada
      const proposal = await Proposal.create({
        jobId: jobId,
        freelancerId: req.user.id,
        clientId: job.clientId,
        coverLetter: "Aplicación directa - El freelancer aceptó los términos del trabajo tal como fueron publicados.",
        proposedPrice: jobPrice,
        estimatedDuration: durationDays,
        status: "approved",
      });

      // Actualizar trabajo
      // Solo poner in_progress si la fecha de inicio ya pasó
      const now = new Date();
      const jobStartDate = job.startDate ? new Date(job.startDate) : now;

      if (jobStartDate <= now) {
        job.status = "in_progress";
      }
      // Si la fecha de inicio es futura, mantener el estado actual pero con doer asignado
      job.doerId = req.user.id;
      await job.save();

      // Crear o encontrar conversación para este trabajo específico
      let conversation = await Conversation.findOne({
        where: {
          participants: {
            [Op.contains]: [req.user.id, job.clientId]
          },
          jobId: job.id,
          type: "direct",
        }
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [req.user.id, job.clientId],
          jobId: job.id,
          type: "direct",
        });
      }

      // Crear mensaje automático del sistema con nuevo formato
      const endDateText = endDate
        ? `Finalización estimada: ${endDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })} a las ${endDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
        : `Finalización: Por definir (fecha flexible)`;
      const systemMessage = `${req.user.name} se postuló al trabajo||${job.title}||Inicio: ${startDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })} a las ${startDate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}\n${endDateText}\nPrecio Acordado: $${jobPrice.toLocaleString("es-AR")} ARS\nUbicación: ${job.location}\n\n⏳ Puedes ser seleccionado hasta 48 horas antes del inicio del trabajo.`;

      await ChatMessage.create({
        conversationId: conversation.id,
        senderId: req.user.id,
        message: systemMessage,
        type: "system",
        metadata: {
          jobId: job.id,
          proposalId: proposal.id,
          action: "job_application",
        },
      });

      // Actualizar conversación
      conversation.lastMessage = "Nueva postulación recibida";
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Enviar emails a ambas partes
      const clientUser = job.client as any;
      const jobUrl = `${config.clientUrl}/jobs/${job.id}`;

      // Email al freelancer
      await emailService.sendEmail({
        to: req.user.email,
        subject: `Te postulaste al trabajo: ${job.title}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; padding: 12px 30px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .info-box { background: white; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; }
                .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📋 Postulación Enviada</h1>
                </div>
                <div class="content">
                  <p>Hola ${req.user.name},</p>
                  <p>Te has postulado exitosamente al trabajo:</p>
                  <div class="info-box">
                    <h3>${job.title}</h3>
                    <p><strong>Cliente:</strong> ${clientUser.name}</p>
                    <p><strong>Ubicación:</strong> ${job.location}</p>
                    <p><strong>Inicio:</strong> ${startDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Fin:</strong> ${endDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Pago:</strong> $${jobPrice.toLocaleString("es-AR")}</p>
                  </div>
                  <div class="warning-box">
                    <p><strong>⏳ Importante:</strong> Puedes ser seleccionado hasta 48 horas antes del inicio del trabajo. Te notificaremos cuando el cliente tome una decisión.</p>
                  </div>
                  <p>El cliente ha sido notificado de tu postulación.</p>
                  <a href="${config.clientUrl}/chat/${conversation.id}" class="button">Ir al Chat</a>
                  <a href="${jobUrl}" class="button" style="background: #64748b;">Ver Trabajo</a>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      // Email al cliente
      await emailService.sendEmail({
        to: clientUser.email,
        subject: `${req.user.name} se postuló a tu trabajo: ${job.title}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .info-box { background: white; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📋 Nueva Postulación</h1>
                </div>
                <div class="content">
                  <p>Hola ${clientUser.name},</p>
                  <p><strong>${req.user.name}</strong> se ha postulado a tu trabajo:</p>
                  <div class="info-box">
                    <h3>${job.title}</h3>
                    <p><strong>Candidato:</strong> ${req.user.name}</p>
                    <p><strong>Inicio:</strong> ${startDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Fin:</strong> ${endDate.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Pago:</strong> $${jobPrice.toLocaleString("es-AR")}</p>
                  </div>
                  <p>Puedes revisar todas las postulaciones y seleccionar al trabajador ideal.</p>
                  <a href="${config.clientUrl}/jobs/${job.id}/applications" class="button">Ver Postulaciones</a>
                  <a href="${config.clientUrl}/chat/${conversation.id}" class="button" style="background: #64748b;">Ir al Chat</a>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      res.json({
        success: true,
        conversationId: conversation.id,
        message: "Postulación enviada exitosamente",
      });
    } catch (error: any) {
      console.error("Error in apply-and-accept:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/proposals/start-negotiation
// @desc    Iniciar negociación (crea conversación sin aceptar el trabajo)
// @access  Private
router.post(
  "/start-negotiation",
  protect,
  [body("jobId").notEmpty().withMessage("El trabajo es requerido")],
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

      const { jobId } = req.body;

      // Verificar que el trabajo existe
      const job = await Job.findByPk(jobId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['name', 'email']
          }
        ]
      });
      if (!job) {
        res.status(404).json({
          success: false,
          message: "Trabajo no encontrado",
        });
        return;
      }

      // Verificar que el usuario no sea el dueño del trabajo
      if (job.clientId === req.user.id) {
        res.status(400).json({
          success: false,
          message: "No puedes negociar tu propio trabajo",
        });
        return;
      }

      // Verificar si el trabajo está abierto
      if (job.status !== 'open') {
        res.status(400).json({
          success: false,
          message: "Este trabajo ya no está disponible para aplicar",
          jobStatus: job.status,
        });
        return;
      }

      // Verificar si ya existe una propuesta del usuario para este trabajo
      const existingProposal = await Proposal.findOne({
        where: {
          jobId: job.id,
          freelancerId: req.user.id,
        }
      });

      // Solo crear o encontrar conversación (NO crear propuesta automáticamente)
      let conversation = await Conversation.findOne({
        where: {
          participants: {
            [Op.contains]: [req.user.id, job.clientId]
          },
          jobId: job.id,
          type: "direct",
        }
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [req.user.id, job.clientId],
          jobId: job.id,
          type: "direct",
        });
      }

      // Actualizar conversación
      conversation.lastMessage = "Nueva conversación iniciada";
      conversation.lastMessageAt = new Date();
      await conversation.save();

      res.json({
        success: true,
        conversationId: conversation.id,
        message: "Conversación iniciada",
        alreadyApplied: !!existingProposal,
        proposalId: existingProposal?.id || null,
        proposalStatus: existingProposal?.status || null,
        jobStatus: job.status,
      });
    } catch (error: any) {
      console.error("Error in start-negotiation:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

export default router;
