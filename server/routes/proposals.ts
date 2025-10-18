import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import Proposal from "../models/Proposal.js";
import Job from "../models/Job.js";
import Contract from "../models/Contract.js";
import Conversation from "../models/Conversation.js";
import ChatMessage from "../models/ChatMessage.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import emailService from "../services/email.js";
import { config } from "../config/env.js";

const router = express.Router();

// @route   GET /api/proposals
// @desc    Obtener propuestas del usuario (enviadas o recibidas)
// @access  Private
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type } = req.query;

    let query: any = {};

    // type: 'sent' (propuestas enviadas) o 'received' (propuestas recibidas)
    if (type === "sent") {
      query.freelancer = req.user._id;
    } else if (type === "received") {
      query.client = req.user._id;
    } else {
      // Por defecto, mostrar todas las propuestas relacionadas con el usuario
      query.$or = [{ freelancer: req.user._id }, { client: req.user._id }];
    }

    if (status) {
      query.status = status;
    }

    const proposals = await Proposal.find(query)
      .populate("job", "title summary price location category")
      .populate("freelancer", "name avatar rating reviewsCount completedJobs")
      .populate("client", "name avatar")
      .sort({ createdAt: -1 });

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

// @route   GET /api/proposals/job/:jobId
// @desc    Obtener propuestas de un trabajo específico
// @access  Private
router.get("/job/:jobId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea el dueño del trabajo
    if (job.client.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver las propuestas de este trabajo",
      });
      return;
    }

    const proposals = await Proposal.find({ job: req.params.jobId })
      .populate("freelancer", "name avatar rating reviewsCount completedJobs")
      .sort({ createdAt: -1 });

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
    const proposal = await Proposal.findById(req.params.id)
      .populate("job")
      .populate("freelancer", "name email avatar rating reviewsCount completedJobs")
      .populate("client", "name email avatar");

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea parte de la propuesta
    const isFreelancer = proposal.freelancer._id.toString() === req.user._id.toString();
    const isClient = proposal.client._id.toString() === req.user._id.toString();

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
      const job = await Job.findById(jobId);
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
      if (job.client.toString() === req.user._id.toString()) {
        res.status(400).json({
          success: false,
          message: "No puedes enviar una propuesta a tu propio trabajo",
        });
        return;
      }

      // Verificar que no haya enviado una propuesta previamente
      const existingProposal = await Proposal.findOne({
        job: jobId,
        freelancer: req.user._id,
      });

      if (existingProposal) {
        res.status(400).json({
          success: false,
          message: "Ya has enviado una propuesta para este trabajo",
        });
        return;
      }

      // Crear propuesta
      const proposal = await Proposal.create({
        job: jobId,
        freelancer: req.user._id,
        client: job.client,
        coverLetter,
        proposedPrice,
        estimatedDuration,
      });

      const populatedProposal = await Proposal.findById(proposal._id)
        .populate("job", "title summary price location")
        .populate("freelancer", "name avatar rating reviewsCount")
        .populate("client", "name avatar");

      res.status(201).json({
        success: true,
        proposal: populatedProposal,
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
// @desc    Aprobar propuesta (por el cliente)
// @access  Private
router.put("/:id/approve", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const proposal = await Proposal.findById(req.params.id).populate("job");

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea el cliente
    if (proposal.client.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede aprobar esta propuesta",
      });
      return;
    }

    if (proposal.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Esta propuesta no puede ser aprobada",
      });
      return;
    }

    // Actualizar propuesta
    proposal.status = "approved";
    await proposal.save();

    // Rechazar todas las demás propuestas del mismo trabajo
    await Proposal.updateMany(
      {
        job: proposal.job._id,
        _id: { $ne: proposal._id },
        status: "pending",
      },
      {
        status: "rejected",
        rejectionReason: "Se aprobó otra propuesta",
      }
    );

    // Actualizar trabajo
    const job = await Job.findById(proposal.job._id);
    if (job) {
      job.status = "in_progress";
      job.doer = proposal.freelancer;
      await job.save();
    }

    // Crear contrato automáticamente
    const PLATFORM_COMMISSION = 0.1;
    const commission = proposal.proposedPrice * PLATFORM_COMMISSION;
    const totalPrice = proposal.proposedPrice + commission;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + proposal.estimatedDuration);

    await Contract.create({
      job: proposal.job._id,
      client: proposal.client,
      doer: proposal.freelancer,
      type: "trabajo",
      price: proposal.proposedPrice,
      commission,
      totalPrice,
      startDate,
      endDate,
      status: "pending",
      termsAccepted: false,
      termsAcceptedByClient: false,
      termsAcceptedByDoer: false,
    });

    res.json({
      success: true,
      proposal,
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

      const proposal = await Proposal.findById(req.params.id);

      if (!proposal) {
        res.status(404).json({
          success: false,
          message: "Propuesta no encontrada",
        });
        return;
      }

      // Verificar que el usuario sea el cliente
      if (proposal.client.toString() !== req.user._id.toString()) {
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

      const proposal = await Proposal.findById(req.params.id);

      if (!proposal) {
        res.status(404).json({
          success: false,
          message: "Propuesta no encontrada",
        });
        return;
      }

      // Verificar que el usuario sea el freelancer
      if (proposal.freelancer.toString() !== req.user._id.toString()) {
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
    const proposal = await Proposal.findById(req.params.id);

    if (!proposal) {
      res.status(404).json({
        success: false,
        message: "Propuesta no encontrada",
      });
      return;
    }

    // Verificar que el usuario sea el freelancer
    if (proposal.freelancer.toString() !== req.user._id.toString()) {
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

    await proposal.deleteOne();

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
      const job = await Job.findById(jobId).populate("client", "name email");
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
      if (job.client._id.toString() === req.user._id.toString()) {
        res.status(400).json({
          success: false,
          message: "No puedes aplicar a tu propio trabajo",
        });
        return;
      }

      // Verificar que no haya una propuesta previa
      const existingProposal = await Proposal.findOne({
        job: jobId,
        freelancer: req.user._id,
      });

      if (existingProposal) {
        res.status(400).json({
          success: false,
          message: "Ya has enviado una propuesta para este trabajo",
        });
        return;
      }

      // Crear propuesta automáticamente aprobada
      const proposal = await Proposal.create({
        job: jobId,
        freelancer: req.user._id,
        client: job.client._id,
        coverLetter: "Aplicación directa - El freelancer aceptó los términos del trabajo tal como fueron publicados.",
        proposedPrice: job.price,
        estimatedDuration: Math.ceil(
          (new Date(job.endDate).getTime() - new Date(job.startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        ),
        status: "approved",
      });

      // Actualizar trabajo
      job.status = "in_progress";
      job.doer = req.user._id;
      await job.save();

      // Crear o encontrar conversación entre el freelancer y el cliente
      let conversation = await Conversation.findOne({
        participants: { $all: [req.user._id, job.client._id] },
        type: "direct",
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [req.user._id, job.client._id],
          type: "direct",
        });
      }

      // Crear mensaje automático del sistema
      const jobUrl = `${config.clientUrl}/jobs/${job._id}`;
      const systemMessage = `✅ **Trabajo Aceptado**\n\n${req.user.name} ha aceptado el trabajo "${job.title}".\n\n📅 **Detalles:**\n• Inicio: ${new Date(job.startDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}\n• Fin: ${new Date(job.endDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}\n• Precio: $${job.price.toLocaleString("es-AR")}\n\n🔗 Ver trabajo: ${jobUrl}`;

      await ChatMessage.create({
        conversationId: conversation._id,
        sender: req.user._id,
        message: systemMessage,
        type: "system",
      });

      // Actualizar conversación
      conversation.lastMessage = "Trabajo aceptado";
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Enviar emails a ambas partes
      const freelancerUser = await req.user.populate("name email");
      const clientUser = job.client as any;

      // Email al freelancer
      await emailService.sendEmail({
        to: req.user.email,
        subject: `Has aceptado el trabajo: ${job.title}`,
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
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>✅ Trabajo Aceptado</h1>
                </div>
                <div class="content">
                  <p>Hola ${req.user.name},</p>
                  <p>Has aceptado exitosamente el trabajo:</p>
                  <div class="info-box">
                    <h3>${job.title}</h3>
                    <p><strong>Cliente:</strong> ${clientUser.name}</p>
                    <p><strong>Ubicación:</strong> ${job.location}</p>
                    <p><strong>Inicio:</strong> ${new Date(job.startDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Fin:</strong> ${new Date(job.endDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Pago:</strong> $${job.price.toLocaleString("es-AR")}</p>
                  </div>
                  <p>El cliente ha sido notificado. Pueden comenzar a coordinar los detalles a través del chat.</p>
                  <a href="${config.clientUrl}/chat/${conversation._id}" class="button">Ir al Chat</a>
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
        subject: `${req.user.name} ha aceptado tu trabajo: ${job.title}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .info-box { background: white; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🎉 ¡Encontraste un profesional!</h1>
                </div>
                <div class="content">
                  <p>Hola ${clientUser.name},</p>
                  <p><strong>${req.user.name}</strong> ha aceptado tu trabajo:</p>
                  <div class="info-box">
                    <h3>${job.title}</h3>
                    <p><strong>Profesional:</strong> ${req.user.name}</p>
                    <p><strong>Inicio:</strong> ${new Date(job.startDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Fin:</strong> ${new Date(job.endDate).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    <p><strong>Pago:</strong> $${job.price.toLocaleString("es-AR")}</p>
                  </div>
                  <p>Pueden coordinar los detalles finales a través del chat.</p>
                  <a href="${config.clientUrl}/chat/${conversation._id}" class="button">Ir al Chat</a>
                  <a href="${jobUrl}" class="button" style="background: #64748b;">Ver Trabajo</a>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      res.json({
        success: true,
        conversationId: conversation._id,
        message: "Trabajo aceptado exitosamente",
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
      const job = await Job.findById(jobId).populate("client", "name email");
      if (!job) {
        res.status(404).json({
          success: false,
          message: "Trabajo no encontrado",
        });
        return;
      }

      // Verificar que el usuario no sea el dueño del trabajo
      if (job.client._id.toString() === req.user._id.toString()) {
        res.status(400).json({
          success: false,
          message: "No puedes negociar tu propio trabajo",
        });
        return;
      }

      // Crear o encontrar conversación
      let conversation = await Conversation.findOne({
        participants: { $all: [req.user._id, job.client._id] },
        type: "direct",
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [req.user._id, job.client._id],
          type: "direct",
        });
      }

      // Crear mensaje automático
      const jobUrl = `${config.clientUrl}/jobs/${job._id}`;
      const systemMessage = `💬 **Inicio de Conversación**\n\n${req.user.name} está interesado en el trabajo "${job.title}" y quiere discutir los detalles.\n\n📋 **Información del trabajo:**\n• Precio propuesto: $${job.price.toLocaleString("es-AR")}\n• Ubicación: ${job.location}\n• Inicio: ${new Date(job.startDate).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}\n\n🔗 Ver trabajo: ${jobUrl}`;

      await ChatMessage.create({
        conversationId: conversation._id,
        sender: req.user._id,
        message: systemMessage,
        type: "system",
      });

      // Actualizar conversación
      conversation.lastMessage = "Nueva conversación iniciada";
      conversation.lastMessageAt = new Date();
      await conversation.save();

      res.json({
        success: true,
        conversationId: conversation._id,
        message: "Conversación iniciada",
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
