import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { Job } from "../models/sql/Job.model.js";
import { User } from "../models/sql/User.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { BalanceTransaction } from "../models/sql/BalanceTransaction.model.js";
import { JobTask } from "../models/sql/JobTask.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { Conversation } from "../models/sql/Conversation.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { socketService } from "../index.js";
import { Op } from 'sequelize';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { cacheService, generateCacheKey } from "../services/cacheService.js";
import tasksRoutes from "./tasks.js";
import { checkAndProcessUserExpiredJobs } from "../jobs/autoCancelExpiredJobs.js";

const router = express.Router();

// Ensure upload directory exists
const JOB_IMAGES_DIR = path.join(process.cwd(), 'uploads', 'job-images');
if (!fs.existsSync(JOB_IMAGES_DIR)) {
  fs.mkdirSync(JOB_IMAGES_DIR, { recursive: true });
}

// Configure multer for job image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, JOB_IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `job-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5 // Max 5 files
  }
});

// Normalize location string: remove punctuation and convert to lowercase
const normalizeLocation = (location: string): string => {
  return location
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
};

// @route   GET /api/jobs
// @desc    Obtener todos los trabajos con búsqueda avanzada (o usuarios si type=users)
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
      sortBy = 'date',
      type // 'jobs' (default) or 'users'
    } = req.query;

    // Generate cache key for this request
    const cacheKey = generateCacheKey('jobs:search', {
      status, category, minPrice, maxPrice, limit, searchQuery, location, tags, sortBy, type
    });

    // Check cache first (cache for 60 seconds for search results)
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      res.json(cachedResult);
      return;
    }

    // If type is 'users', search users instead of jobs
    if (type === 'users' && searchQuery && typeof searchQuery === 'string') {
      const searchPattern = `%${searchQuery}%`;
      const limitNum = Math.min(Number(limit), 50);

      const { count, rows: users } = await User.findAndCountAll({
        where: {
          [Op.or]: [
            { name: { [Op.iLike]: searchPattern } },
            { username: { [Op.iLike]: searchPattern } },
          ],
          isBanned: false,
        },
        attributes: ['id', 'name', 'username', 'avatar', 'bio', 'rating', 'reviewsCount', 'completedJobs', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
        order: [['completedJobs', 'DESC'], ['rating', 'DESC']],
        limit: limitNum,
      });

      const usersResponse = {
        success: true,
        type: 'users',
        count: users.length,
        total: count,
        users: users.map(user => ({
          _id: user.id,
          id: user.id,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
          bio: user.bio,
          rating: user.rating,
          reviewsCount: user.reviewsCount,
          completedJobs: user.completedJobs,
          membershipTier: user.membershipTier,
          hasMembership: user.hasMembership,
          isPremiumVerified: user.isPremiumVerified,
        })),
      };

      // Cache users search for 120 seconds
      cacheService.set(cacheKey, usersResponse, 120);

      res.json(usersResponse);
      return;
    }

    const query: any = {};

    // Status filter
    if (status) {
      query.status = status;
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Price range filter (Sequelize syntax)
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price[Op.gte] = Number(minPrice);
      if (maxPrice) query.price[Op.lte] = Number(maxPrice);
    }

    // Text search (title, description, summary) - Sequelize ILIKE for PostgreSQL
    if (searchQuery && typeof searchQuery === 'string') {
      const searchPattern = `%${searchQuery}%`;
      query[Op.or] = [
        { title: { [Op.iLike]: searchPattern } },
        { summary: { [Op.iLike]: searchPattern } },
        { description: { [Op.iLike]: searchPattern } },
      ];
    }

    // Location - will be handled with post-processing for normalized matching
    // Just ensure location exists (not null/empty)
    if (location && typeof location === 'string') {
      query.location = { [Op.ne]: null };
    }

    // Tags filter (match any of the provided tags) - use overlap for PostgreSQL arrays
    if (tags) {
      const tagsArray = typeof tags === 'string' ? tags.split(',') : tags;
      if (Array.isArray(tagsArray) && tagsArray.length > 0) {
        query.tags = { [Op.overlap]: tagsArray };
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

    // Debug: Log the query being executed
    console.log('📝 Jobs query:', JSON.stringify(query, (key, value) => {
      // Handle Sequelize symbols
      if (typeof value === 'symbol') return value.toString();
      return value;
    }, 2));

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

    const response = {
      success: true,
      count: plainJobs.length,
      jobs: plainJobs,
    };

    // Cache the result for 60 seconds
    cacheService.set(cacheKey, response, 60);

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs/check-expired
// @desc    Check and process expired jobs for the current user (triggers notifications)
// @access  Private
router.post("/check-expired", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const expiredCount = await checkAndProcessUserExpiredJobs(req.user.id);

    res.json({
      success: true,
      expiredJobsProcessed: expiredCount,
      message: expiredCount > 0
        ? `Se procesaron ${expiredCount} trabajos expirados`
        : 'No hay trabajos expirados para procesar'
    });
  } catch (error: any) {
    console.error('❌ Error checking expired jobs:', error);
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

    // Check for expired jobs and process them immediately (don't wait for cron)
    // This ensures user sees notifications as soon as they check their jobs
    const expiredCount = await checkAndProcessUserExpiredJobs(req.user.id);
    if (expiredCount > 0) {
      console.log(`⚠️ Processed ${expiredCount} expired jobs for user ${req.user.email}`);
    }

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

// Helper function to get tasks with unlock status
const getTasksWithStatus = async (jobId: string): Promise<any[]> => {
  try {
    // Simple query without includes for reliability
    const tasks = await JobTask.findAll({
      where: { jobId },
      order: [['orderIndex', 'ASC']],
    });

    // Manually fetch user data if needed
    const tasksWithData = await Promise.all(tasks.map(async (task) => {
      const taskData = task.toJSON();
      taskData.isUnlocked = task.isUnlocked(tasks);

      // Fetch createdBy user if present
      if (task.createdById) {
        const createdByUser = await User.findByPk(task.createdById, {
          attributes: ['id', 'name', 'avatar']
        });
        taskData.createdBy = createdByUser?.toJSON() || null;
      }

      // Fetch completedBy user if present
      if (task.completedById) {
        const completedByUser = await User.findByPk(task.completedById, {
          attributes: ['id', 'name', 'avatar']
        });
        taskData.completedBy = completedByUser?.toJSON() || null;
      }

      return taskData;
    }));

    return tasksWithData;
  } catch (error: any) {
    console.error(`❌ Error getting tasks for job ${jobId}:`, error.message);
    return [];
  }
};

// @route   GET /api/jobs/my-active-tasks
// @desc    Get all active tasks for jobs where user is a worker (for "Work in Progress" section)
// @access  Private
router.get("/my-active-tasks", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // Validate userId
    if (!userId) {
      res.json({
        success: true,
        jobs: [],
        totalJobs: 0,
      });
      return;
    }

    // Find all jobs where user is a worker (doer)
    const jobsAsDoer = await Job.findAll({
      where: {
        status: 'in_progress',
        doerId: userId
      },
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });

    // For selectedWorkers, we handle it in-memory to avoid JSONB/UUID issues
    const jobsWithSelectedWorkers = await Job.findAll({
      where: {
        status: 'in_progress',
        [Op.or]: [
          { doerId: null },
          { doerId: { [Op.ne]: userId } }
        ]
      },
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'avatar']
        }
      ]
    });

    // Filter jobs where user is in selectedWorkers
    const jobsFromSelectedWorkers = jobsWithSelectedWorkers.filter(job => {
      if (!job.selectedWorkers || !Array.isArray(job.selectedWorkers)) return false;
      return job.selectedWorkers.includes(userId);
    });

    // Combine without duplicates
    const jobsAsWorker = [...jobsAsDoer];
    for (const job of jobsFromSelectedWorkers) {
      if (!jobsAsWorker.some(j => j.id === job.id)) {
        jobsAsWorker.push(job);
      }
    }

    // Also find jobs through active contracts
    const activeContracts = await Contract.findAll({
      where: {
        doerId: userId,
        status: { [Op.in]: ['active', 'in_progress'] }
      },
      include: [
        {
          model: Job,
          as: 'job',
          include: [
            {
              model: User,
              as: 'client',
              attributes: ['id', 'name', 'avatar']
            }
          ]
        }
      ]
    });

    // Combine job IDs
    const jobIds = new Set<string>();
    jobsAsWorker.forEach(job => jobIds.add(job.id));
    activeContracts.forEach(contract => {
      if (contract.jobId) jobIds.add(contract.jobId);
    });

    if (jobIds.size === 0) {
      res.json({
        success: true,
        jobs: [],
        totalJobs: 0,
      });
      return;
    }

    // Get all tasks for these jobs
    const result = [];

    for (const jobId of jobIds) {
      const job = await Job.findByPk(jobId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'avatar']
          }
        ]
      });

      if (!job) continue;

      const tasks = await getTasksWithStatus(jobId);
      const progress = JobTask.getProgressPercentage(tasks);

      if (tasks.length > 0) {
        result.push({
          job: {
            id: job.id,
            title: job.title,
            status: job.status,
            client: job.client,
          },
          tasks,
          progress,
          totalTasks: tasks.length,
          completedTasks: tasks.filter((t: any) => t.status === 'completed').length,
          inProgressTasks: tasks.filter((t: any) => t.status === 'in_progress').length,
          pendingTasks: tasks.filter((t: any) => t.status === 'pending').length,
        });
      }
    }

    res.json({
      success: true,
      jobs: result,
      totalJobs: result.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching active tasks:', error);
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
  upload.array('images', 5), // Handle up to 5 image uploads
  [
    body("title").trim().notEmpty().withMessage("El título es requerido"),
    body("summary").trim().notEmpty().withMessage("El resumen es requerido"),
    body("description").trim().notEmpty().withMessage("La descripción es requerida"),
    body("price").isNumeric().withMessage("El precio debe ser un número"),
    body("location").trim().notEmpty().withMessage("La ubicación es requerida"),
    body("startDate").isISO8601().withMessage("Fecha de inicio inválida"),
    body("endDate").optional().isISO8601().withMessage("Fecha de fin inválida"),
    body("endDateFlexible").optional().isBoolean().withMessage("endDateFlexible debe ser booleano"),
    body("singleDelivery").optional().isBoolean().withMessage("singleDelivery debe ser booleano"),
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

      // Process uploaded images
      const uploadedFiles = req.files as Express.Multer.File[];
      const imageUrls = uploadedFiles?.map(file => `/uploads/job-images/${file.filename}`) || [];

      // Parse tags if sent as JSON string
      let tags = req.body.tags;
      if (typeof tags === 'string') {
        try {
          tags = JSON.parse(tags);
        } catch (e) {
          tags = [];
        }
      }

      // Parse and validate maxWorkers (1-5)
      let maxWorkers = parseInt(req.body.maxWorkers) || 1;
      maxWorkers = Math.max(1, Math.min(5, maxWorkers));

      // Parse endDateFlexible - defaults to false
      const endDateFlexible = req.body.endDateFlexible === 'true' || req.body.endDateFlexible === true;

      // Parse singleDelivery - defaults to true
      const singleDelivery = req.body.singleDelivery !== 'false' && req.body.singleDelivery !== false;

      // Validate that endDate is provided if endDateFlexible is false
      if (!endDateFlexible && !req.body.endDate) {
        res.status(400).json({
          success: false,
          message: "La fecha de fin es requerida si no seleccionaste 'Todavía no lo sé'",
        });
        return;
      }

      const jobData = {
        title: req.body.title,
        summary: req.body.summary,
        description: req.body.description,
        price: Number(req.body.price),
        category: req.body.category,
        tags: tags || [],
        location: req.body.location,
        addressStreet: req.body.addressStreet || null,
        addressNumber: req.body.addressNumber || null,
        addressDetails: req.body.addressDetails || null,
        startDate: req.body.startDate,
        endDate: endDateFlexible ? null : req.body.endDate,
        endDateFlexible,
        remoteOk: req.body.remoteOk === 'true',
        images: imageUrls,
        clientId: req.user.id, // Sequelize uses camelCase foreign keys
        status: canPublishForFree ? "open" : "draft", // Free contracts auto-publish, others need payment
        publicationPaid: canPublishForFree, // Free contracts don't need payment
        publicationAmount: 0, // Will be calculated if payment needed
        maxWorkers, // New: support for multiple workers (1-5)
        selectedWorkers: [], // Initialize empty array
        singleDelivery, // If true, single final delivery; if false, per-task due dates
      };

      const job = await Job.create(jobData);

      // Invalidate jobs cache so new job appears immediately
      cacheService.delPattern('jobs:*');

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

      // Notify admin panel of new job (only if published)
      if (canPublishForFree) {
        socketService.notifyNewJob(populatedJob?.toJSON());
      }

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

    // Check if job is permanently cancelled
    if (job.permanentlyCancelled) {
      res.status(403).json({
        success: false,
        message: "Este trabajo ha sido cancelado definitivamente y no puede ser editado",
      });
      return;
    }

    // Check if job has past dates (expired) - only if endDateFlexible is false
    const now = new Date();
    const jobEndDate = job.endDate ? new Date(job.endDate) : null;
    // Default endDateFlexible to false for jobs created before this field existed
    const jobEndDateFlexible = job.endDateFlexible ?? false;
    const hasExpiredDates = !jobEndDateFlexible && jobEndDate && jobEndDate < now;

    // Parse endDateFlexible from request
    const newEndDateFlexible = req.body.endDateFlexible === 'true' || req.body.endDateFlexible === true;

    // Store previous status for notification
    const previousStatus = job.status;

    // If job was rejected or cancelled by admin (not permanently), change to pending_approval when edited
    const requiresReapproval = ['rejected', 'cancelled'].includes(job.status) && !job.permanentlyCancelled;

    // Prepare update data
    let updateData: any = { ...req.body };

    // Handle endDateFlexible
    if (newEndDateFlexible !== undefined) {
      updateData.endDateFlexible = newEndDateFlexible;
      if (newEndDateFlexible) {
        updateData.endDate = null; // Clear endDate if flexible
      }
    }

    // Validate endDate if not flexible
    if (!newEndDateFlexible && !req.body.endDate && !jobEndDateFlexible) {
      // Only require endDate if job wasn't already flexible
      res.status(400).json({
        success: false,
        message: "La fecha de fin es requerida si no seleccionaste 'Todavía no lo sé'",
      });
      return;
    }

    // If job has expired dates, only allow updating dates first
    if (hasExpiredDates) {
      // Check if new dates are being provided
      const { startDate, endDate } = req.body;

      // If switching to flexible, allow it
      if (newEndDateFlexible) {
        console.log(`📅 Job ${job.id} has expired dates, switching to flexible end date`);
      } else if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Este trabajo tiene fechas vencidas. Debes actualizar las fechas de inicio y fin antes de poder editar otros campos.",
          requiresDateUpdate: true,
        });
        return;
      } else {
        const newStartDate = new Date(startDate);
        const newEndDate = new Date(endDate);

        // Validate new dates are in the future
        if (newStartDate <= now) {
          res.status(400).json({
            success: false,
            message: "La nueva fecha de inicio debe ser posterior a la fecha actual.",
            requiresDateUpdate: true,
          });
          return;
        }

        if (newEndDate <= newStartDate) {
          res.status(400).json({
            success: false,
            message: "La fecha de fin debe ser posterior a la fecha de inicio.",
            requiresDateUpdate: true,
          });
          return;
        }

        // Only allow date fields to be updated when dates are expired
        // (unless new valid dates are provided, then allow all fields)
        console.log(`📅 Job ${job.id} has expired dates, updating with new dates: ${startDate} - ${endDate}`);
      }
    }

    if (requiresReapproval) {
      updateData.status = 'pending_approval';
      updateData.rejectedReason = null; // Clear previous rejection reason
      updateData.reviewedBy = null;
      updateData.reviewedAt = null;
      console.log(`📝 Job ${job.id} was ${previousStatus}, changing to pending_approval after edit`);
    }

    // ============================================
    // VALIDACIÓN DE CAMBIO DE PRECIO
    // Si el precio aumenta, requiere pago de diferencia + comisión
    // ============================================
    const newPrice = req.body.price !== undefined ? Number(req.body.price) : null;
    const oldPrice = Number(job.price);

    if (newPrice !== null && newPrice !== oldPrice) {
      const priceDifference = newPrice - oldPrice;

      if (priceDifference > 0) {
        // Precio aumentado - requiere pago de diferencia + comisión
        const client = await User.findByPk(req.user.id);
        if (!client) {
          res.status(404).json({
            success: false,
            message: "Usuario no encontrado",
          });
          return;
        }

        // Calcular comisión según el tipo de membresía
        let commissionRate = 8; // FREE: 8%
        const MIN_COMMISSION = 1000; // Mínimo $1000 ARS

        if (client.hasFamilyPlan) {
          commissionRate = 0; // Family Plan: 0%
        } else if (client.membershipTier === 'super_pro') {
          commissionRate = 2; // Super Pro: 2%
        } else if (client.membershipTier === 'pro') {
          commissionRate = 3; // Pro: 3%
        } else if (client.hasReferralDiscount) {
          commissionRate = 3; // Referral discount: 3%
        }

        // Calcular comisión con mínimo $1000 ARS
        let additionalCommission = priceDifference * (commissionRate / 100);
        additionalCommission = Math.max(additionalCommission, MIN_COMMISSION);

        const totalRequired = priceDifference + additionalCommission;

        // Guardar estado actual para restaurar si cancela
        const prevStatus = job.status;

        // Remover el precio de los datos de actualización - se actualizará después del pago
        delete updateData.price;

        await job.update({
          ...updateData,
          pendingNewPrice: newPrice,
          priceChangeReason: req.body.priceChangeReason || 'Modificación de presupuesto',
          originalPrice: job.originalPrice || oldPrice,
          previousStatus: prevStatus,
          status: 'pending_payment', // Requiere pago
          pendingPaymentAmount: totalRequired,
        });

        // Notificar actualización
        socketService.notifyJobStatusChanged(job.toJSON(), 'pending_payment');

        res.status(402).json({
          success: false,
          requiresPayment: true,
          message: "Para aumentar el presupuesto debes pagar la diferencia + comisión.",
          amountRequired: totalRequired,
          breakdown: {
            oldPrice,
            newPrice,
            priceDifference,
            commission: additionalCommission,
            commissionRate,
            minCommission: MIN_COMMISSION,
            total: totalRequired,
          },
          redirectTo: `/jobs/${job.id}/payment?amount=${totalRequired}&reason=budget_increase&oldPrice=${oldPrice}&newPrice=${newPrice}`,
          job: {
            id: job.id,
            title: job.title,
            status: 'pending_payment',
            oldPrice,
            pendingNewPrice: newPrice,
          },
        });
        return;
      }

      // Si el precio disminuyó
      if (priceDifference < 0) {
        // Verificar si estamos a menos de 24hr del inicio
        const now = new Date();
        const startDate = new Date(job.startDate);
        const twentyFourHoursBefore = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);

        if (now > twentyFourHoursBefore) {
          res.status(400).json({
            success: false,
            message: "No puedes reducir el precio del trabajo con menos de 24 horas antes del inicio.",
          });
          return;
        }

        // Verificar si se proporcionó razón (obligatorio)
        const priceDecreaseReason = req.body.priceChangeReason || req.body.priceDecreaseReason;
        if (!priceDecreaseReason || priceDecreaseReason.trim().length === 0) {
          res.status(400).json({
            success: false,
            message: "Debes proporcionar un motivo para la reducción del precio.",
            requiresReason: true,
          });
          return;
        }

        // Verificar si hay postulados
        const { Proposal } = await import('../models/sql/Proposal.model.js');
        const proposals = await Proposal.findAll({
          where: {
            jobId: job.id,
            status: { [Op.in]: ['pending', 'approved'] }
          },
          include: [{
            model: User,
            as: 'doer',
            attributes: ['id', 'name', 'email']
          }]
        });

        // Si hay postulados, crear solicitud pendiente que requiere su aceptación
        if (proposals.length > 0) {
          // Guardar la solicitud de disminución pendiente
          await job.update({
            pendingPriceDecrease: newPrice,
            pendingPriceDecreaseReason: priceDecreaseReason.trim(),
            pendingPriceDecreaseAt: new Date(),
            priceDecreaseAcceptances: [],
            priceDecreaseRejections: [],
          });

          // Notificar a todos los trabajadores con propuestas
          const { Notification } = await import('../models/sql/Notification.model.js');
          for (const proposal of proposals) {
            await Notification.create({
              recipientId: proposal.doerId,
              type: 'warning',
              category: 'job',
              title: 'Propuesta de cambio de precio',
              message: `El cliente ha propuesto reducir el precio del trabajo "${job.title}" de $${oldPrice.toLocaleString('es-AR')} a $${newPrice.toLocaleString('es-AR')}. Motivo: ${priceDecreaseReason}. Por favor acepta o rechaza esta propuesta.`,
              relatedModel: 'Job',
              relatedId: job.id,
              data: {
                type: 'price_decrease_proposal',
                oldPrice,
                newPrice,
                reason: priceDecreaseReason,
                proposalId: proposal.id,
              },
              read: false,
            });

            // Notificación por socket
            socketService.notifyUser(proposal.doerId, 'price_decrease_proposal', {
              jobId: job.id,
              jobTitle: job.title,
              oldPrice,
              newPrice,
              reason: priceDecreaseReason,
              proposalId: proposal.id,
            });
          }

          // Invalidar cache
          cacheService.delPattern('jobs:*');

          res.json({
            success: true,
            pendingApproval: true,
            message: `Se ha enviado la propuesta de reducción de precio a ${proposals.length} trabajador(es). El precio se actualizará cuando todos acepten.`,
            workersNotified: proposals.length,
            proposedPrice: newPrice,
            currentPrice: oldPrice,
            reason: priceDecreaseReason,
          });
          return;
        }

        // Si no hay postulados, aplicar el cambio directamente
        // Guardar precio original si es el primer cambio
        if (!job.originalPrice) {
          updateData.originalPrice = oldPrice;
        }

        // Agregar al historial de cambios
        const priceHistory = job.priceHistory || [];
        priceHistory.push({
          oldPrice,
          newPrice,
          reason: priceDecreaseReason,
          changedAt: new Date(),
        });
        updateData.priceHistory = priceHistory;
        updateData.priceChangedAt = new Date();

        // Si el trabajo ya fue pagado, crear saldo a favor para el cliente
        // y procesar devolución parcial del monto de la diferencia
        if (job.publicationPaid) {
          const refundAmount = Math.abs(priceDifference);
          // Crear registro de saldo a favor (se procesará la devolución)
          const { BalanceTransaction } = await import('../models/sql/BalanceTransaction.model.js');
          await BalanceTransaction.create({
            userId: req.user.id,
            type: 'refund',
            amount: refundAmount,
            description: `Saldo a favor por reducción de presupuesto del trabajo "${job.title}"`,
            status: 'pending',
            relatedModel: 'Job',
            relatedId: job.id,
            metadata: {
              oldPrice,
              newPrice,
              reason: 'price_decrease',
            },
          });

          // Crear notificación al usuario
          const { Notification } = await import('../models/sql/Notification.model.js');
          await Notification.create({
            recipientId: req.user.id,
            type: 'info',
            category: 'payment',
            title: 'Saldo a favor generado',
            message: `Se ha generado un saldo a favor de $${refundAmount.toLocaleString('es-AR')} por la reducción del presupuesto de tu trabajo "${job.title}".`,
            relatedModel: 'Job',
            relatedId: job.id,
            data: { refundAmount, oldPrice, newPrice },
            read: false,
          });
        }
      }
    }

    // Update the job
    await job.update(updateData);

    // Invalidate jobs cache
    cacheService.delPattern('jobs:*');

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

    // Also notify admin panel
    socketService.notifyAdminJobUpdated(updatedJob?.toJSON());

    // If job was resubmitted for approval, notify as a new job for admin
    if (requiresReapproval && updatedJob) {
      socketService.notifyNewJob(updatedJob.toJSON());
      console.log(`🔔 Job ${job.id} resubmitted for approval, notified admin panel`);
    }

    res.json({
      success: true,
      job: updatedJob?.toJSON(),
      message: requiresReapproval
        ? "Trabajo actualizado y enviado para aprobación"
        : "Trabajo actualizado exitosamente",
      requiresApproval: requiresReapproval,
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
    const jobTitle = job.title;

    // Importar Proposal
    const { Proposal } = await import('../models/sql/Proposal.model.js');

    // Verificar contratos en progreso o completados (no se pueden eliminar)
    const inProgressContracts = await Contract.findAll({
      where: {
        jobId: job.id,
        status: { [Op.in]: ['in_progress', 'awaiting_confirmation', 'completed'] }
      }
    });

    if (inProgressContracts.length > 0) {
      res.status(400).json({
        success: false,
        message: "No puedes eliminar un trabajo que tiene contratos en progreso o completados.",
      });
      return;
    }

    // Obtener contratos activos (pending, ready, accepted) para cancelarlos
    const activeContracts = await Contract.findAll({
      where: {
        jobId: job.id,
        status: { [Op.in]: ['pending', 'ready', 'accepted'] }
      },
      include: [{ model: User, as: 'doer', attributes: ['id', 'name', 'email'] }]
    });

    // Cancelar contratos activos y notificar a los workers
    for (const contract of activeContracts) {
      contract.status = 'cancelled';
      contract.cancellationReason = 'El trabajo fue eliminado por el cliente';
      contract.cancelledBy = req.user.id;
      await contract.save();

      if (contract.doerId) {
        // Crear notificación persistente
        await Notification.create({
          recipientId: contract.doerId,
          type: 'warning',
          title: 'Contrato cancelado',
          message: `El trabajo "${jobTitle}" ha sido eliminado por el cliente. Tu contrato ha sido cancelado.`,
          category: 'contract',
          relatedId: contract.id,
          data: { jobId, jobTitle, contractId: contract.id, action: 'job_deleted' }
        });

        // Notificar en tiempo real
        socketService.notifyUser(contract.doerId, 'notification:new', {
          type: 'warning',
          title: 'Contrato cancelado',
          message: `El trabajo "${jobTitle}" ha sido eliminado por el cliente. Tu contrato ha sido cancelado.`,
        });
      }
    }

    // Obtener propuestas aprobadas que no tienen contrato (workers seleccionados sin contrato aún)
    const approvedProposals = await Proposal.findAll({
      where: {
        jobId: job.id,
        status: 'approved'
      },
      include: [{ model: User, as: 'freelancer', attributes: ['id', 'name'] }]
    });

    // Notificar a workers con propuestas aprobadas (si no fueron notificados ya por contrato)
    const notifiedWorkerIds = new Set(activeContracts.map(c => c.doerId));
    for (const proposal of approvedProposals) {
      if (proposal.freelancerId && !notifiedWorkerIds.has(proposal.freelancerId)) {
        // Crear notificación persistente
        await Notification.create({
          recipientId: proposal.freelancerId,
          type: 'warning',
          title: 'Trabajo eliminado',
          message: `El trabajo "${jobTitle}" para el que fuiste seleccionado ha sido eliminado por el cliente.`,
          category: 'job',
          relatedId: jobId,
          data: { jobId, jobTitle, action: 'job_deleted' }
        });

        // Notificar en tiempo real
        socketService.notifyUser(proposal.freelancerId, 'notification:new', {
          type: 'warning',
          title: 'Trabajo eliminado',
          message: `El trabajo "${jobTitle}" para el que fuiste seleccionado ha sido eliminado por el cliente.`,
        });
      }
    }

    // Eliminar propuestas relacionadas primero (para evitar error de foreign key)
    await Proposal.destroy({ where: { jobId: job.id } });

    // Eliminar tareas relacionadas
    await JobTask.destroy({ where: { jobId: job.id } });

    // Eliminar conversaciones y mensajes relacionados
    const conversations = await Conversation.findAll({ where: { jobId: job.id } });
    for (const conversation of conversations) {
      await ChatMessage.destroy({ where: { conversationId: conversation.id } });
    }
    await Conversation.destroy({ where: { jobId: job.id } });

    // Eliminar todos los contratos relacionados (ya están cancelados los activos)
    await Contract.destroy({ where: { jobId: job.id } });

    // Ahora eliminar el trabajo
    await job.destroy();

    // Invalidate jobs cache
    cacheService.delPattern('jobs:*');

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

// @route   PATCH /api/jobs/:id/budget
// @desc    Cambiar el presupuesto de un trabajo (solo el dueño)
// @access  Private (only job owner)
router.patch("/:id/budget", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { newPrice, reason } = req.body;

    // Validaciones
    if (!newPrice || typeof newPrice !== 'number' || newPrice <= 0) {
      res.status(400).json({
        success: false,
        message: "El nuevo presupuesto debe ser un número mayor a 0",
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      res.status(400).json({
        success: false,
        message: "Debes proporcionar una razón de al menos 10 caracteres",
      });
      return;
    }

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
        message: "No tienes permiso para modificar este trabajo",
      });
      return;
    }

    // Si el trabajo está en progreso con contrato, redirigir al endpoint de contratos
    if (job.status === 'in_progress') {
      const contract = await Contract.findOne({ where: { jobId: job.id } });
      if (contract) {
        res.status(400).json({
          success: false,
          message: "Para cambiar el presupuesto de un trabajo en progreso con contrato, usa el endpoint de modificación de contratos",
          redirectTo: `/api/contracts/${contract.id}/request-price-change`,
        });
        return;
      }
    }

    // No permitir cambios en trabajos completados
    if (job.status === 'completed') {
      res.status(400).json({
        success: false,
        message: "No puedes cambiar el presupuesto de un trabajo completado",
      });
      return;
    }

    const currentPrice = Number(job.price);
    // Usar el precio máximo pagado históricamente para calcular el crédito
    // Si hay originalPrice y es mayor al precio actual, significa que hubo reducciones
    // y el usuario ya pagó por ese monto mayor
    const maxPaidPrice = job.originalPrice ? Math.max(Number(job.originalPrice), currentPrice) : currentPrice;

    // La diferencia real a pagar es: nuevo precio - máximo pagado
    // Si newPrice <= maxPaidPrice, no hay que pagar más (ya pagó eso o más)
    const priceDifference = newPrice - maxPaidPrice;

    // Si el precio supera lo que ya pagó, manejar pago de diferencia
    if (priceDifference > 0) {
      const client = await User.findByPk(req.user.id);
      if (!client) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      // Calcular comisión según el tipo de membresía
      let commissionRate = 8; // FREE: 8%

      if (client.hasFamilyPlan) {
        commissionRate = 0; // Family Plan: 0%
      } else if (client.membershipTier === 'super_pro') {
        commissionRate = 2; // Super Pro: 2%
      } else if (client.membershipTier === 'pro') {
        commissionRate = 3; // Pro: 3%
      }

      const additionalCommission = priceDifference * (commissionRate / 100);
      const totalRequired = priceDifference + additionalCommission;

      // NO actualizar el precio todavía - solo guardar el precio propuesto
      // El precio real se actualiza cuando el pago sea exitoso

      // Guardar estado actual para restaurar si cancela
      const previousStatus = job.status;

      await job.update({
        // NO cambiar el precio todavía
        // price: newPrice,  <- Se actualiza después del pago
        pendingNewPrice: newPrice, // Guardar el nuevo precio propuesto
        priceChangeReason: req.body.reason.trim(),
        originalPrice: job.originalPrice || currentPrice, // Guardar el primer precio pagado
        previousStatus: previousStatus, // Guardar estado anterior
        status: 'paused', // Pausar hasta que pague
        pendingPaymentAmount: totalRequired,
      });

      // Notificar actualización
      socketService.notifyJobStatusChanged(job.toJSON(), 'paused');

      res.status(402).json({
        success: false,
        requiresPayment: true,
        message: "Presupuesto actualizado. Debes completar el pago para reactivar el trabajo.",
        amountRequired: totalRequired,
        breakdown: {
          oldPrice: currentPrice,
          newPrice,
          maxPaidPrice, // El máximo que ya pagó
          priceDifference, // Solo la diferencia adicional a pagar
          commission: additionalCommission,
          commissionRate,
          total: totalRequired,
        },
        redirectTo: `/jobs/${job.id}/payment?amount=${totalRequired}&reason=budget_increase&oldPrice=${currentPrice}&newPrice=${newPrice}`,
        job: {
          id: job.id,
          title: job.title,
          status: 'paused',
          oldPrice: currentPrice,
          newPrice,
          creditApplied: maxPaidPrice - currentPrice, // Crédito aplicado
        },
      });
      return;
    }

    // Guardar precio original (máximo pagado) si es el primer cambio
    // Esto permite rastrear el crédito disponible para futuros aumentos
    if (!job.originalPrice) {
      job.originalPrice = currentPrice;
    }

    // Agregar al historial de cambios
    const priceHistory = job.priceHistory || [];
    priceHistory.push({
      oldPrice: currentPrice,
      newPrice,
      reason: reason.trim(),
      changedAt: new Date(),
    });

    // Actualizar el trabajo
    // Mantener originalPrice como el máximo pagado históricamente
    await job.update({
      price: newPrice,
      priceChangeReason: reason.trim(),
      priceChangedAt: new Date(),
      priceHistory,
      // originalPrice se mantiene como el máximo para calcular créditos futuros
    });

    // Notificar actualización en tiempo real
    socketService.notifyJobStatusChanged(job.toJSON(), job.status);

    res.json({
      success: true,
      message: "Presupuesto actualizado exitosamente",
      job: {
        id: job.id,
        title: job.title,
        oldPrice: currentPrice,
        newPrice,
        reason: reason.trim(),
        priceHistory,
        creditAvailable: maxPaidPrice - newPrice, // Crédito restante
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PATCH /api/jobs/:id/cancel-budget-change
// @desc    Cancelar el cambio de presupuesto pendiente y restaurar el estado anterior
// @access  Private (only job owner)
router.patch("/:id/cancel-budget-change", protect, async (req: AuthRequest, res: Response): Promise<void> => {
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
        message: "No tienes permiso para modificar este trabajo",
      });
      return;
    }

    // Verificar que hay un cambio de presupuesto pendiente
    if (!job.pendingNewPrice && !job.pendingPaymentAmount) {
      res.status(400).json({
        success: false,
        message: "No hay cambio de presupuesto pendiente",
      });
      return;
    }

    // Restaurar el estado anterior
    const previousStatus = job.previousStatus || 'open';

    await job.update({
      pendingNewPrice: null,
      pendingPaymentAmount: 0,
      previousStatus: null,
      priceChangeReason: null,
      status: previousStatus,
    });

    // Notificar actualización
    socketService.notifyJobStatusChanged(job.toJSON(), previousStatus);

    res.json({
      success: true,
      message: "Cambio de presupuesto cancelado. El trabajo ha sido restaurado.",
      job: {
        id: job.id,
        title: job.title,
        price: job.price,
        status: job.status,
      },
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

    // Verificar que falten más de 24 horas para el inicio del trabajo
    const now = new Date();
    const startDate = new Date(job.startDate);
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilStart <= 24) {
      res.status(400).json({
        success: false,
        message: "No puedes pausar el trabajo con menos de 24 horas de anticipación.",
      });
      return;
    }

    // Pausar el trabajo
    job.status = "paused";
    (job as any).pausedAt = new Date();
    await job.save();

    // Notificar actualizacion en tiempo real
    socketService.notifyJobStatusChanged(job.toJSON(), 'open');

    res.json({
      success: true,
      message: "Publicación pausada exitosamente. Se reanudará automáticamente si no se cancela.",
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PATCH /api/jobs/:id/resume
// @desc    Reanudar una publicación de trabajo pausada
// @access  Private (only job owner)
router.patch("/:id/resume", protect, async (req: AuthRequest, res: Response): Promise<void> => {
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
        message: "No tienes permiso para reanudar este trabajo",
      });
      return;
    }

    // Verificar que el job esté pausado
    if (job.status !== "paused") {
      res.status(400).json({
        success: false,
        message: "Solo puedes reanudar trabajos pausados",
      });
      return;
    }

    // Reanudar el trabajo
    job.status = "open";
    (job as any).pausedAt = null;
    await job.save();

    // Notificar actualizacion en tiempo real
    socketService.notifyJobStatusChanged(job.toJSON(), 'paused');

    res.json({
      success: true,
      message: "Publicación reanudada exitosamente",
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
// @desc    Cancelar una publicación de trabajo
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

    // Determinar si es cancelacion durante pending_approval (reembolso total)
    const isPendingApproval = job.status === "pending_approval";

    // Verificar que el job esté en un estado cancelable
    if (job.status !== "open" && job.status !== "paused" && job.status !== "pending_approval") {
      res.status(400).json({
        success: false,
        message: "Solo puedes cancelar trabajos publicados, pausados o pendientes de aprobación",
      });
      return;
    }

    // Para trabajos open o paused, verificar restriccion de 24 horas
    if (job.status === "open" || job.status === "paused") {
      const now = new Date();
      const startDate = new Date(job.startDate);
      const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilStart <= 24) {
        res.status(400).json({
          success: false,
          message: "No puedes cancelar el trabajo con menos de 24 horas de anticipación. Por favor, contacta a soporte si necesitas ayuda.",
        });
        return;
      }
    }

    // Obtener razon de cancelacion del body
    const { reason } = req.body;
    const previousStatus = job.status;

    // Cancelar el trabajo
    job.status = "cancelled";
    job.cancellationReason = reason || null;
    job.cancelledAt = new Date();
    job.cancelledById = req.user.id;
    job.cancelledByRole = 'owner'; // Cancelled by job owner
    await job.save();

    // Invalidar cache
    cacheService.delPattern('jobs:*');

    // Notificar actualizacion en tiempo real
    socketService.notifyJobStatusChanged(job.toJSON(), previousStatus);

    // Emitir evento de actualización para la vista de mis publicaciones
    socketService.io.emit("jobs:refresh", {
      action: "cancelled",
      jobId: job.id,
      job: job.toJSON(),
      cancelledBy: 'owner'
    });

    // Si estaba pending_approval, se reembolsa todo (precio + comision)
    // TODO: Implementar logica de reembolso via MercadoPago si es necesario
    const refundMessage = isPendingApproval
      ? "Publicacion cancelada. Se te reembolsará el total pagado (precio + comisión) ya que estaba pendiente de aprobación."
      : "Publicacion cancelada. La comision pagada no sera reembolsada.";

    res.json({
      success: true,
      message: refundMessage,
      refundTotal: isPendingApproval,
      job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// Error handler for multer
router.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'El archivo es demasiado grande. Máximo 10MB por archivo.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Demasiados archivos. Máximo 5 imágenes.'
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  if (error.message === 'Solo se permiten archivos de imagen') {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  next(error);
});

// @route   GET /api/jobs/:id/worker-allocations
// @desc    Get worker payment allocations for a job
// @access  Private
router.get("/:id/worker-allocations", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id, {
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

    // Only client can view allocations
    if (job.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede ver las asignaciones de pago",
      });
      return;
    }

    const jobPrice = typeof job.price === 'string' ? parseFloat(job.price) : Number(job.price);
    const allocatedTotal = typeof job.allocatedTotal === 'string'
      ? parseFloat(job.allocatedTotal)
      : (job.allocatedTotal || 0);

    // Get worker details for each allocation
    const allocationsWithDetails = await Promise.all(
      (job.workerAllocations || []).map(async (allocation) => {
        const worker = await User.findByPk(allocation.workerId, {
          attributes: ['id', 'name', 'email', 'avatar']
        });
        return {
          ...allocation,
          worker: worker?.toJSON() || null
        };
      })
    );

    res.json({
      success: true,
      job: {
        id: job.id,
        title: job.title,
        totalBudget: jobPrice,
        allocatedTotal,
        remainingBudget: jobPrice - allocatedTotal,
        maxWorkers: job.maxWorkers,
        currentWorkers: job.selectedWorkers?.length || 0,
      },
      allocations: allocationsWithDetails,
    });
  } catch (error: any) {
    console.error('❌ Error getting worker allocations:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/jobs/:id/worker-allocations
// @desc    Update worker payment allocations for a job
// @access  Private (Client only)
router.put("/:id/worker-allocations", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { allocations } = req.body;
    // allocations: [{ workerId: string, allocatedAmount: number }]

    if (!allocations || !Array.isArray(allocations)) {
      res.status(400).json({
        success: false,
        message: "Se requiere un array de asignaciones",
      });
      return;
    }

    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Only client can modify allocations
    if (job.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede modificar las asignaciones de pago",
      });
      return;
    }

    const jobPrice = typeof job.price === 'string' ? parseFloat(job.price) : Number(job.price);
    const MINIMUM_CONTRACT_AMOUNT = 5000;

    // Validate all allocations
    let totalAllocation = 0;
    for (const allocation of allocations) {
      if (!allocation.workerId || allocation.allocatedAmount === undefined) {
        res.status(400).json({
          success: false,
          message: "Cada asignación debe tener workerId y allocatedAmount",
        });
        return;
      }

      const amount = parseFloat(allocation.allocatedAmount);
      if (isNaN(amount) || amount < 0) {
        res.status(400).json({
          success: false,
          message: "Los montos de asignación deben ser números positivos",
        });
        return;
      }

      if (amount < MINIMUM_CONTRACT_AMOUNT) {
        res.status(400).json({
          success: false,
          message: `El monto mínimo por trabajador es de $${MINIMUM_CONTRACT_AMOUNT.toLocaleString()} ARS`,
        });
        return;
      }

      // Verify worker is in selectedWorkers
      if (!job.selectedWorkers?.includes(allocation.workerId)) {
        res.status(400).json({
          success: false,
          message: `El trabajador ${allocation.workerId} no está seleccionado para este trabajo`,
        });
        return;
      }

      totalAllocation += amount;
    }

    // Verify total allocation doesn't exceed budget
    if (totalAllocation > jobPrice) {
      res.status(400).json({
        success: false,
        message: `El total de asignaciones ($${totalAllocation.toLocaleString()}) excede el presupuesto del trabajo ($${jobPrice.toLocaleString()})`,
      });
      return;
    }

    // Update allocations
    const newAllocations = allocations.map((allocation: any) => ({
      workerId: allocation.workerId,
      allocatedAmount: parseFloat(allocation.allocatedAmount),
      percentage: (parseFloat(allocation.allocatedAmount) / jobPrice) * 100,
      allocatedAt: new Date(),
    }));

    job.workerAllocations = newAllocations;
    job.allocatedTotal = totalAllocation;
    job.remainingBudget = jobPrice - totalAllocation;
    await job.save();

    // Update contracts with new allocation amounts
    for (const allocation of allocations) {
      const contract = await Contract.findOne({
        where: {
          jobId: job.id,
          doerId: allocation.workerId,
          status: { [Op.notIn]: ['cancelled', 'rejected'] }
        }
      });

      if (contract) {
        const newAmount = parseFloat(allocation.allocatedAmount);
        const PLATFORM_COMMISSION = 0.1;
        const newCommission = newAmount * PLATFORM_COMMISSION;

        // Add to price modification history
        contract.addPriceModification(
          Number(contract.price),
          newAmount,
          req.user.id,
          'Reajuste de asignación de presupuesto por el cliente'
        );

        contract.price = newAmount;
        contract.allocatedAmount = newAmount;
        contract.percentageOfBudget = (newAmount / jobPrice) * 100;
        contract.commission = newCommission;
        contract.totalPrice = newAmount + newCommission;
        await contract.save();

        // Notify worker about the change
        await Notification.create({
          recipientId: allocation.workerId,
          type: 'contract_updated',
          category: 'contract',
          title: 'Asignación de pago actualizada',
          message: `Tu asignación de pago para el trabajo "${job.title}" ha sido ajustada a $${newAmount.toLocaleString()} ARS.`,
          relatedModel: 'Contract',
          relatedId: contract.id,
          actionText: 'Ver contrato',
          data: {
            jobId: job.id,
            contractId: contract.id,
            newAmount,
            previousAmount: Number(contract.originalPrice || contract.price),
          },
          read: false,
        });
      }
    }

    // Invalidate cache
    cacheService.delPattern('jobs:*');

    res.json({
      success: true,
      message: "Asignaciones actualizadas correctamente",
      job: {
        id: job.id,
        totalBudget: jobPrice,
        allocatedTotal: totalAllocation,
        remainingBudget: jobPrice - totalAllocation,
      },
      allocations: newAllocations,
    });
  } catch (error: any) {
    console.error('❌ Error updating worker allocations:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   DELETE /api/jobs/:id/workers/:workerId
// @desc    Remove a worker from a job and redistribute payment
// @access  Private (Client only)
router.delete("/:id/workers/:workerId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { redistributeToWorkers } = req.body;
    // redistributeToWorkers: boolean - if true, redistribute removed worker's allocation to remaining workers

    const job = await Job.findByPk(req.params.id);
    const workerId = req.params.workerId;

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Only client can remove workers
    if (job.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el cliente puede remover trabajadores",
      });
      return;
    }

    // Check if worker is in the job
    if (!job.selectedWorkers?.includes(workerId)) {
      res.status(400).json({
        success: false,
        message: "Este trabajador no está asignado a este trabajo",
      });
      return;
    }

    // Get the worker's allocation
    const workerAllocation = job.workerAllocations?.find(a => a.workerId === workerId);
    const removedAmount = workerAllocation?.allocatedAmount || 0;

    // Remove worker from selectedWorkers
    job.selectedWorkers = job.selectedWorkers.filter(id => id !== workerId);

    // Remove worker from allocations
    job.workerAllocations = (job.workerAllocations || []).filter(a => a.workerId !== workerId);

    // If this was the doer, clear doerId or assign to first remaining worker
    if (job.doerId === workerId) {
      job.doerId = job.selectedWorkers.length > 0 ? job.selectedWorkers[0] : undefined;
    }

    // Calculate new totals
    const jobPrice = typeof job.price === 'string' ? parseFloat(job.price) : Number(job.price);

    if (redistributeToWorkers && job.selectedWorkers.length > 0) {
      // Redistribute removed worker's amount to remaining workers equally
      const redistributePerWorker = removedAmount / job.selectedWorkers.length;

      job.workerAllocations = job.workerAllocations.map(allocation => ({
        ...allocation,
        allocatedAmount: allocation.allocatedAmount + redistributePerWorker,
        percentage: ((allocation.allocatedAmount + redistributePerWorker) / jobPrice) * 100,
        allocatedAt: new Date(),
      }));

      // Update contracts for remaining workers
      for (const allocation of job.workerAllocations) {
        const contract = await Contract.findOne({
          where: {
            jobId: job.id,
            doerId: allocation.workerId,
            status: { [Op.notIn]: ['cancelled', 'rejected'] }
          }
        });

        if (contract) {
          const newAmount = allocation.allocatedAmount;
          const PLATFORM_COMMISSION = 0.1;
          const newCommission = newAmount * PLATFORM_COMMISSION;

          contract.addPriceModification(
            Number(contract.price),
            newAmount,
            req.user.id,
            'Redistribución por remoción de trabajador'
          );

          contract.price = newAmount;
          contract.allocatedAmount = newAmount;
          contract.percentageOfBudget = allocation.percentage;
          contract.commission = newCommission;
          contract.totalPrice = newAmount + newCommission;
          await contract.save();

          // Notify worker about the increased payment
          await Notification.create({
            recipientId: allocation.workerId,
            type: 'payment_increased',
            category: 'contract',
            title: 'Asignación aumentada',
            message: `Tu pago para el trabajo "${job.title}" ha aumentado debido a la redistribución del presupuesto.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            actionText: 'Ver contrato',
            data: {
              jobId: job.id,
              contractId: contract.id,
              newAmount,
            },
            read: false,
          });
        }
      }
    } else {
      // Don't redistribute - update remaining budget
      job.remainingBudget = (job.remainingBudget || 0) + removedAmount;
    }

    // Recalculate allocated total
    const newAllocatedTotal = job.workerAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
    job.allocatedTotal = newAllocatedTotal;

    await job.save();

    // Cancel the removed worker's contract
    const workerContract = await Contract.findOne({
      where: {
        jobId: job.id,
        doerId: workerId,
        status: { [Op.notIn]: ['cancelled', 'completed'] }
      }
    });

    if (workerContract) {
      workerContract.status = 'cancelled';
      workerContract.cancellationReason = 'Removido del trabajo por el cliente';
      workerContract.cancelledBy = req.user.id;
      await workerContract.save();

      // Notify removed worker
      await Notification.create({
        recipientId: workerId,
        type: 'contract_cancelled',
        category: 'contract',
        title: 'Has sido removido del trabajo',
        message: `Has sido removido del trabajo "${job.title}". Tu contrato ha sido cancelado.`,
        relatedModel: 'Contract',
        relatedId: workerContract.id,
        actionText: 'Ver detalles',
        data: {
          jobId: job.id,
          contractId: workerContract.id,
          reason: 'removed_by_client',
        },
        read: false,
      });
    }

    // Invalidate cache
    cacheService.delPattern('jobs:*');

    res.json({
      success: true,
      message: redistributeToWorkers
        ? "Trabajador removido y presupuesto redistribuido"
        : "Trabajador removido del trabajo",
      job: {
        id: job.id,
        selectedWorkers: job.selectedWorkers,
        allocatedTotal: job.allocatedTotal,
        remainingBudget: job.remainingBudget,
      },
      redistributedAmount: redistributeToWorkers ? removedAmount : 0,
    });
  } catch (error: any) {
    console.error('❌ Error removing worker:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs/:id/accept-price-decrease
// @desc    Accept a pending price decrease proposal (worker)
// @access  Private
router.post("/:id/accept-price-decrease", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Verificar que hay una disminución de precio pendiente
    if (!job.pendingPriceDecrease) {
      res.status(400).json({
        success: false,
        message: "No hay una propuesta de reducción de precio pendiente para este trabajo.",
      });
      return;
    }

    // Verificar que el usuario tiene una propuesta en este trabajo
    const { Proposal } = await import('../models/sql/Proposal.model.js');
    const userProposal = await Proposal.findOne({
      where: {
        jobId: job.id,
        doerId: req.user.id,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    if (!userProposal) {
      res.status(403).json({
        success: false,
        message: "No tienes una postulación activa en este trabajo.",
      });
      return;
    }

    // Verificar que no haya aceptado o rechazado ya
    const acceptances = job.priceDecreaseAcceptances || [];
    const rejections = job.priceDecreaseRejections || [];

    if (acceptances.some(a => a.workerId === req.user.id)) {
      res.status(400).json({
        success: false,
        message: "Ya has aceptado esta propuesta de reducción de precio.",
      });
      return;
    }

    if (rejections.some(r => r.workerId === req.user.id)) {
      res.status(400).json({
        success: false,
        message: "Ya has rechazado esta propuesta de reducción de precio.",
      });
      return;
    }

    // Agregar aceptación
    acceptances.push({
      workerId: req.user.id,
      acceptedAt: new Date(),
    });

    // Contar propuestas activas
    const totalProposals = await Proposal.count({
      where: {
        jobId: job.id,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    // Verificar si todos han aceptado
    const allAccepted = acceptances.length >= totalProposals;

    if (allAccepted) {
      // Aplicar la reducción de precio
      const oldPrice = Number(job.price);
      const newPrice = Number(job.pendingPriceDecrease);
      const priceDifference = newPrice - oldPrice;

      // Guardar precio original si es el primer cambio
      const updateData: any = {
        price: newPrice,
        priceDecreaseAcceptances: acceptances,
        pendingPriceDecrease: null,
        pendingPriceDecreaseReason: null,
        pendingPriceDecreaseAt: null,
      };

      if (!job.originalPrice) {
        updateData.originalPrice = oldPrice;
      }

      // Agregar al historial de cambios
      const priceHistory = job.priceHistory || [];
      priceHistory.push({
        oldPrice,
        newPrice,
        reason: job.pendingPriceDecreaseReason || 'Reducción de presupuesto aceptada',
        changedAt: new Date(),
      });
      updateData.priceHistory = priceHistory;
      updateData.priceChangedAt = new Date();

      // Si el trabajo ya fue pagado, crear saldo a favor para el cliente
      if (job.publicationPaid) {
        const refundAmount = Math.abs(priceDifference);
        const { BalanceTransaction } = await import('../models/sql/BalanceTransaction.model.js');
        await BalanceTransaction.create({
          userId: job.clientId,
          type: 'refund',
          amount: refundAmount,
          description: `Saldo a favor por reducción de presupuesto del trabajo "${job.title}"`,
          status: 'pending',
          relatedModel: 'Job',
          relatedId: job.id,
          metadata: {
            oldPrice,
            newPrice,
            reason: 'price_decrease_accepted',
          },
        });
      }

      await job.update(updateData);

      // Notificar al cliente que todos aceptaron
      const { Notification } = await import('../models/sql/Notification.model.js');
      await Notification.create({
        recipientId: job.clientId,
        type: 'success',
        category: 'job',
        title: 'Reducción de precio aprobada',
        message: `Todos los trabajadores han aceptado la reducción de precio de tu trabajo "${job.title}". El nuevo precio es $${newPrice.toLocaleString('es-AR')}.`,
        relatedModel: 'Job',
        relatedId: job.id,
        data: { oldPrice, newPrice },
        read: false,
      });

      // Notificar por socket
      socketService.notifyUser(job.clientId, 'price_decrease_approved', {
        jobId: job.id,
        jobTitle: job.title,
        oldPrice,
        newPrice,
      });

      // Invalidar cache
      cacheService.delPattern('jobs:*');

      res.json({
        success: true,
        message: "Has aceptado la reducción de precio. Todos los trabajadores han aceptado, el precio ha sido actualizado.",
        priceUpdated: true,
        newPrice,
        oldPrice,
      });
    } else {
      // Guardar aceptación pero esperar a los demás
      await job.update({
        priceDecreaseAcceptances: acceptances,
      });

      // Notificar al cliente del progreso
      const { Notification } = await import('../models/sql/Notification.model.js');
      await Notification.create({
        recipientId: job.clientId,
        type: 'info',
        category: 'job',
        title: 'Un trabajador aceptó la reducción',
        message: `Un trabajador ha aceptado la reducción de precio de tu trabajo "${job.title}". ${acceptances.length}/${totalProposals} han aceptado.`,
        relatedModel: 'Job',
        relatedId: job.id,
        data: {
          accepted: acceptances.length,
          total: totalProposals,
        },
        read: false,
      });

      res.json({
        success: true,
        message: `Has aceptado la reducción de precio. Esperando a que los demás trabajadores respondan (${acceptances.length}/${totalProposals}).`,
        priceUpdated: false,
        acceptedCount: acceptances.length,
        totalWorkers: totalProposals,
      });
    }
  } catch (error: any) {
    console.error('❌ Error accepting price decrease:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/jobs/:id/reject-price-decrease
// @desc    Reject a pending price decrease proposal (worker)
// @access  Private
router.post("/:id/reject-price-decrease", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Verificar que hay una disminución de precio pendiente
    if (!job.pendingPriceDecrease) {
      res.status(400).json({
        success: false,
        message: "No hay una propuesta de reducción de precio pendiente para este trabajo.",
      });
      return;
    }

    // Verificar que el usuario tiene una propuesta en este trabajo
    const { Proposal } = await import('../models/sql/Proposal.model.js');
    const userProposal = await Proposal.findOne({
      where: {
        jobId: job.id,
        doerId: req.user.id,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    if (!userProposal) {
      res.status(403).json({
        success: false,
        message: "No tienes una postulación activa en este trabajo.",
      });
      return;
    }

    // Verificar que no haya aceptado o rechazado ya
    const acceptances = job.priceDecreaseAcceptances || [];
    const rejections = job.priceDecreaseRejections || [];

    if (acceptances.some(a => a.workerId === req.user.id)) {
      res.status(400).json({
        success: false,
        message: "Ya has aceptado esta propuesta. No puedes cambiar tu decisión.",
      });
      return;
    }

    if (rejections.some(r => r.workerId === req.user.id)) {
      res.status(400).json({
        success: false,
        message: "Ya has rechazado esta propuesta de reducción de precio.",
      });
      return;
    }

    // Agregar rechazo
    rejections.push({
      workerId: req.user.id,
      rejectedAt: new Date(),
    });

    // Cancelar la propuesta de reducción (con un rechazo es suficiente)
    const oldPrice = Number(job.price);
    const proposedPrice = Number(job.pendingPriceDecrease);
    const reason = job.pendingPriceDecreaseReason;

    await job.update({
      priceDecreaseRejections: rejections,
      pendingPriceDecrease: null,
      pendingPriceDecreaseReason: null,
      pendingPriceDecreaseAt: null,
      priceDecreaseAcceptances: [],
    });

    // Notificar al cliente que un trabajador rechazó
    const { Notification } = await import('../models/sql/Notification.model.js');
    const worker = await User.findByPk(req.user.id, { attributes: ['id', 'name'] });

    await Notification.create({
      recipientId: job.clientId,
      type: 'warning',
      category: 'job',
      title: 'Reducción de precio rechazada',
      message: `El trabajador ${worker?.name || 'Un trabajador'} ha rechazado la reducción de precio de tu trabajo "${job.title}". El precio se mantiene en $${oldPrice.toLocaleString('es-AR')}.`,
      relatedModel: 'Job',
      relatedId: job.id,
      data: {
        oldPrice,
        proposedPrice,
        reason,
        rejectedBy: req.user.id,
      },
      read: false,
    });

    // Notificar por socket
    socketService.notifyUser(job.clientId, 'price_decrease_rejected', {
      jobId: job.id,
      jobTitle: job.title,
      oldPrice,
      proposedPrice,
      rejectedBy: req.user.id,
    });

    // Invalidar cache
    cacheService.delPattern('jobs:*');

    res.json({
      success: true,
      message: "Has rechazado la reducción de precio. El precio del trabajo se mantiene sin cambios.",
      currentPrice: oldPrice,
    });
  } catch (error: any) {
    console.error('❌ Error rejecting price decrease:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/jobs/:id/pending-price-decrease
// @desc    Get pending price decrease details for a job
// @access  Private
router.get("/:id/pending-price-decrease", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id, {
      attributes: [
        'id', 'title', 'price', 'clientId',
        'pendingPriceDecrease', 'pendingPriceDecreaseReason', 'pendingPriceDecreaseAt',
        'priceDecreaseAcceptances', 'priceDecreaseRejections'
      ]
    });

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    if (!job.pendingPriceDecrease) {
      res.json({
        success: true,
        hasPendingDecrease: false,
        message: "No hay propuesta de reducción de precio pendiente.",
      });
      return;
    }

    // Contar propuestas activas
    const { Proposal } = await import('../models/sql/Proposal.model.js');
    const totalProposals = await Proposal.count({
      where: {
        jobId: job.id,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    // Verificar si el usuario actual ya respondió
    const acceptances = job.priceDecreaseAcceptances || [];
    const rejections = job.priceDecreaseRejections || [];
    const userAccepted = acceptances.some(a => a.workerId === req.user.id);
    const userRejected = rejections.some(r => r.workerId === req.user.id);

    res.json({
      success: true,
      hasPendingDecrease: true,
      currentPrice: job.price,
      proposedPrice: job.pendingPriceDecrease,
      reason: job.pendingPriceDecreaseReason,
      proposedAt: job.pendingPriceDecreaseAt,
      acceptedCount: acceptances.length,
      rejectedCount: rejections.length,
      totalWorkers: totalProposals,
      userResponse: userAccepted ? 'accepted' : userRejected ? 'rejected' : null,
      isOwner: job.clientId === req.user.id,
    });
  } catch (error: any) {
    console.error('❌ Error getting pending price decrease:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   DELETE /api/jobs/:id/cancel-price-decrease
// @desc    Cancel a pending price decrease proposal (client only)
// @access  Private
router.delete("/:id/cancel-price-decrease", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const job = await Job.findByPk(req.params.id);

    if (!job) {
      res.status(404).json({
        success: false,
        message: "Trabajo no encontrado",
      });
      return;
    }

    // Solo el cliente puede cancelar
    if (job.clientId !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "Solo el dueño del trabajo puede cancelar la propuesta de reducción.",
      });
      return;
    }

    if (!job.pendingPriceDecrease) {
      res.status(400).json({
        success: false,
        message: "No hay una propuesta de reducción de precio pendiente.",
      });
      return;
    }

    const proposedPrice = job.pendingPriceDecrease;

    // Cancelar la propuesta
    await job.update({
      pendingPriceDecrease: null,
      pendingPriceDecreaseReason: null,
      pendingPriceDecreaseAt: null,
      priceDecreaseAcceptances: [],
      priceDecreaseRejections: [],
    });

    // Notificar a los trabajadores con propuestas
    const { Proposal } = await import('../models/sql/Proposal.model.js');
    const { Notification } = await import('../models/sql/Notification.model.js');
    const proposals = await Proposal.findAll({
      where: {
        jobId: job.id,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    for (const proposal of proposals) {
      await Notification.create({
        recipientId: proposal.doerId,
        type: 'info',
        category: 'job',
        title: 'Propuesta de cambio de precio cancelada',
        message: `El cliente ha cancelado la propuesta de reducción de precio del trabajo "${job.title}". El precio se mantiene en $${job.price.toLocaleString('es-AR')}.`,
        relatedModel: 'Job',
        relatedId: job.id,
        data: {
          currentPrice: job.price,
          proposedPrice,
        },
        read: false,
      });

      socketService.notifyUser(proposal.doerId, 'price_decrease_cancelled', {
        jobId: job.id,
        jobTitle: job.title,
        currentPrice: job.price,
      });
    }

    // Invalidar cache
    cacheService.delPattern('jobs:*');

    res.json({
      success: true,
      message: "Propuesta de reducción de precio cancelada.",
      currentPrice: job.price,
    });
  } catch (error: any) {
    console.error('❌ Error cancelling price decrease:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// Mount tasks routes - /api/jobs/:jobId/tasks
router.use("/:jobId/tasks", tasksRoutes);

export default router;
 
