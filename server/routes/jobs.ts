import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { socketService } from "../index.js";
import { Op } from 'sequelize';

const router = express.Router();

// Normalize location string: remove punctuation and convert to lowercase
const normalizeLocation = (location: string): string => {
  return location
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
};

// @route   GET /api/jobs
// @desc    Obtener todos los trabajos con búsqueda avanzada
// @access  Public
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status,
      category,
      minPrice,
      maxPrice,
      limit = "20",
      query: searchQuery,
      location,
      tags,
      sortBy = 'date'
    } = req.query;

    const query: any = {};

    // Status filter
    if (status) {
      query.status = status;
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Text search (title, description, summary)
    if (searchQuery && typeof searchQuery === 'string') {
      query.$text = { $search: searchQuery };
    }

    // Location - will be handled with post-processing for normalized matching
    if (location && typeof location === 'string') {
      query.location = { $exists: true };
    }

    // Tags filter (match any of the provided tags)
    if (tags) {
      const tagsArray = typeof tags === 'string' ? tags.split(',') : tags;
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        query.tags = { [Op.in]: tagsArray };
      }
    }

    // Determine sort order based on sortBy parameter
    let sortOrder: any = [['createdAt', 'DESC']]; // default

    if (sortBy === 'budget-asc') {
      sortOrder = [['price', 'ASC']];
    } else if (sortBy === 'budget-desc') {
      sortOrder = [['price', 'DESC']];
    } else if (sortBy === 'proximity') {
      // For proximity, we'll need to sort after filtering by location
      sortOrder = [['createdAt', 'DESC']]; // fallback to date for now
    }

    let jobs = await Job.findAll({
      where: query,
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount'],
          required: false // LEFT JOIN (doer can be null)
        }
      ],
      order: sortOrder
    });

    // Apply location filter with normalization if provided
    if (location && typeof location === 'string') {
      const normalizedSearchLocation = normalizeLocation(location);
      jobs = jobs.filter((job: any) => {
        if (!job.location) return false;
        const normalizedJobLocation = normalizeLocation(job.location);
        return normalizedJobLocation.includes(normalizedSearchLocation);
      });
    }

    // Apply limit after filtering
    const limitNum = Number(limit);
    jobs = jobs.slice(0, limitNum);

    // Convert to plain objects (like .lean() in MongoDB)
    const plainJobs = jobs.map(job => {
      const jobData = job.toJSON();
      // Ensure clientId is included at root level for filtering
      if (!jobData.clientId && job.clientId) {
        jobData.clientId = job.clientId;
      }
      // Convert numeric strings to numbers for frontend compatibility
      if (jobData.price) jobData.price = parseFloat(jobData.price);
      if (jobData.publicationAmount) jobData.publicationAmount = parseFloat(jobData.publicationAmount);
      if (jobData.client?.rating) jobData.client.rating = parseFloat(jobData.client.rating);
      if (jobData.doer?.rating) jobData.doer.rating = parseFloat(jobData.doer.rating);
      return jobData;
    });

    res.json({
      success: true,
      count: plainJobs.length,
      jobs: plainJobs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/jobs/my-jobs
// @desc    Get all jobs posted by the authenticated user
// @access  Private
router.get("/my-jobs", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🔍 /my-jobs called by user:', req.user?.id, req.user?.email);

    const jobs = await Job.findAll({
      where: { clientId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    console.log(`✅ Found ${jobs.length} jobs for user ${req.user.email}`);

    // Simple response without complex processing for now
    const jobsSimple = jobs.map(job => ({
      ...job.toJSON(),
      proposalCount: 0,
      payment: null
    }));

    res.json({
      success: true,
      jobs: jobsSimple,
    });
  } catch (error: any) {
    console.error('❌ Error fetching my jobs:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/jobs/:id
// @desc    Obtener trabajo por ID
// @access  Public
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount', 'phone', 'email']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount', 'phone'],
          required: false
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

    const jobData = job.toJSON();
    // Convert numeric strings to numbers for frontend compatibility
    if (jobData.price) jobData.price = parseFloat(jobData.price);
    if (jobData.publicationAmount) jobData.publicationAmount = parseFloat(jobData.publicationAmount);
    if (jobData.client?.rating) jobData.client.rating = parseFloat(jobData.client.rating);
    if (jobData.doer?.rating) jobData.doer.rating = parseFloat(jobData.doer.rating);

    res.json({
      success: true,
      job: jobData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs
// @desc    Crear nuevo trabajo
// @access  Private
router.post(
  "/",
  protect,
  [
    body("title").trim().notEmpty().withMessage("El título es requerido"),
    body("summary").trim().notEmpty().withMessage("El resumen es requerido"),
    body("description").trim().notEmpty().withMessage("La descripción es requerida"),
    body("price").isNumeric().withMessage("El precio debe ser un número"),
    body("location").trim().notEmpty().withMessage("La ubicación es requerida"),
    body("startDate").isISO8601().withMessage("Fecha de inicio inválida"),
    body("endDate").isISO8601().withMessage("Fecha de fin inválida"),
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

      // Get full user data to check free contracts
      const user = await User.findByPk(req.user.id);
      if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
      }

      // Check if user has free contracts (initial or monthly PRO/SUPER PRO)
      const hasFreeInitialContracts = user.freeContractsRemaining > 0;

      let monthlyFreeLimit = 0;
      if (user.membershipTier === 'super_pro') monthlyFreeLimit = 2;
      else if (user.membershipTier === 'pro') monthlyFreeLimit = 1;

      const proContractsUsed = user.proContractsUsedThisMonth || 0;
      const hasMonthlyFreeContracts = proContractsUsed < monthlyFreeLimit;

      const canPublishForFree = hasFreeInitialContracts || hasMonthlyFreeContracts;

      const jobData = {
        ...req.body,
        clientId: req.user.id, // Sequelize uses camelCase foreign keys
        status: canPublishForFree ? "open" : "draft", // Free contracts auto-publish, others need payment
        publicationPaid: canPublishForFree, // Free contracts don't need payment
        publicationAmount: 0, // Will be calculated if payment needed
      };

      const job = await Job.create(jobData);

      // If can publish for free, decrement the appropriate counter
      if (canPublishForFree) {
        if (hasFreeInitialContracts) {
          user.freeContractsRemaining = user.freeContractsRemaining - 1;
          console.log(`✅ User ${user.id} used initial free contract. Remaining: ${user.freeContractsRemaining}`);
        } else if (hasMonthlyFreeContracts) {
          user.proContractsUsedThisMonth = proContractsUsed + 1;
          console.log(`✅ User ${user.id} used monthly ${user.membershipTier} contract. Used: ${user.proContractsUsedThisMonth}/${monthlyFreeLimit}`);
        }
        await user.save();
      }

      // Populate job for response and notifications
      const populatedJob = await Job.findByPk(job.id, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
          }
        ]
      });

      // Send real-time notifications via Socket.io
      socketService.notifyJobUpdate(
        job.id,
        req.user.id,
        {
          action: 'created',
          job: populatedJob?.toJSON()
        }
      );

      // Different responses based on whether payment is needed
      if (canPublishForFree) {
        res.status(201).json({
          success: true,
          message: hasFreeInitialContracts
            ? "Trabajo publicado exitosamente (contrato inicial gratuito)"
            : `Trabajo publicado exitosamente (contrato mensual ${user.membershipTier.toUpperCase()})`,
          job: populatedJob?.toJSON(),
          requiresPayment: false,
        });
      } else {
        res.status(201).json({
          success: true,
          message: "Job creado. Procede al pago para publicarlo",
          job: populatedJob?.toJSON(),
          requiresPayment: true,
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   PUT /api/jobs/:id
// @desc    Actualizar trabajo
// @access  Private
router.put("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let job = await Job.findByPk(req.params.id);

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
        message: "No tienes permiso para actualizar este trabajo",
      });
      return;
    }

    // Update the job
    await job.update(req.body);

    // Fetch updated job with associations
    const updatedJob = await Job.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount'],
          required: false
        }
      ]
    });

    // Send real-time notifications via Socket.io
    socketService.notifyJobUpdate(
      job.id,
      req.user.id,
      {
        action: 'updated',
        job: updatedJob?.toJSON()
      }
    );

    res.json({
      success: true,
      job: updatedJob?.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Eliminar trabajo
// @access  Private
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

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
        message: "No tienes permiso para eliminar este trabajo",
      });
      return;
    }

    const jobId = job.id;
    await job.destroy();

    // Send real-time notifications via Socket.io
    socketService.notifyJobUpdate(
      jobId,
      req.user.id,
      {
        action: 'deleted',
        jobId
      }
    );

    res.json({
      success: true,
      message: "Trabajo eliminado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/jobs/:id/apply
// @desc    Aplicar a un trabajo
// @access  Private
router.put("/:id/apply", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

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
        message: "Este trabajo ya no está disponible",
      });
      return;
    }

    if (job.doerId) {
      res.status(400).json({
        success: false,
        message: "Este trabajo ya tiene un doer asignado",
      });
      return;
    }

    job.doerId = req.user.id;
    job.status = "in_progress";
    await job.save();

    // Populate for response
    const populatedJob = await Job.findByPk(job.id, {
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount'],
          required: false
        }
      ]
    });

    // Send real-time notifications via Socket.io
    socketService.notifyJobUpdate(
      job.id,
      job.clientId,
      {
        action: 'applied',
        job: populatedJob?.toJSON(),
        doer: req.user.id
      }
    );

    res.json({
      success: true,
      job: populatedJob?.toJSON(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs/:id/initiate-payment
// @desc    Iniciar pago para publicar trabajo
// @access  Private
router.post("/:id/initiate-payment", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

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
        message: "No tienes permiso para publicar este trabajo",
      });
      return;
    }

    // Verificar que el job esté en estado draft
    if (job.status !== "draft") {
      res.status(400).json({
        success: false,
        message: "Este trabajo ya ha sido publicado o procesado",
      });
      return;
    }

    // Verificar si ya pagó
    if (job.publicationPaid) {
      res.status(400).json({
        success: false,
        message: "Este trabajo ya fue pagado",
      });
      return;
    }

    // TODO: Definir el costo de publicación (puede ser fijo o basado en duración/categoría)
    const PUBLICATION_FEE = 10; // $10 USD por publicar un trabajo

    // Guardar el jobId en la sesión para usarlo después del pago
    job.status = "pending_payment";
    job.publicationAmount = PUBLICATION_FEE;
    await job.save();

    res.json({
      success: true,
      message: "Procede al pago para publicar tu trabajo",
      jobId: job.id,
      publicationFee: PUBLICATION_FEE,
      paymentUrl: `/payment/job-publication?jobId=${job.id}&amount=${PUBLICATION_FEE}`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PATCH /api/jobs/:id/pause
// @desc    Pausar una publicación de trabajo
// @access  Private (only job owner)
router.patch("/:id/pause", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

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
        message: "No tienes permiso para pausar este trabajo",
      });
      return;
    }

    // Verificar que el job esté publicado (open)
    if (job.status !== "open") {
      res.status(400).json({
        success: false,
        message: "Solo puedes pausar trabajos publicados",
      });
      return;
    }

    // Pausar el trabajo
    job.status = "paused";
    await job.save();

    res.json({
      success: true,
      message: "Publicación pausada exitosamente",
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PATCH /api/jobs/:id/cancel
// @desc    Cancelar una publicación de trabajo (pierde la comisión)
// @access  Private (only job owner)
router.patch("/:id/cancel", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

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
        message: "No tienes permiso para cancelar este trabajo",
      });
      return;
    }

    // Verificar que el job esté publicado o pausado
    if (job.status !== "open" && job.status !== "paused") {
      res.status(400).json({
        success: false,
        message: "Solo puedes cancelar trabajos publicados o pausados",
      });
      return;
    }

    // Cancelar el trabajo (no se reembolsa la comisión)
    job.status = "cancelled";
    await job.save();

    res.json({
      success: true,
      message: "Publicación cancelada. La comisión pagada no será reembolsada.",
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
 
