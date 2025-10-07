import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import Contract from "../models/Contract.js";
import Job from "../models/Job.js";
import User from "../models/User.js";
import { protect, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

// Comisión de la plataforma (10%)
const PLATFORM_COMMISSION = 0.1;

// @route   GET /api/contracts
// @desc    Obtener contratos del usuario
// @access  Private
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    const query: any = {
      $or: [{ client: req.user._id }, { doer: req.user._id }],
    };

    if (status) {
      query.status = status;
    }

    const contracts = await Contract.find(query)
      .populate("job", "title summary location")
      .populate("client", "name avatar rating reviewsCount")
      .populate("doer", "name avatar rating reviewsCount")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: contracts.length,
      contracts,
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
    const contract = await Contract.findById(req.params.id)
      .populate("job")
      .populate("client", "name email phone avatar rating reviewsCount")
      .populate("doer", "name email phone avatar rating reviewsCount");

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    if (
      contract.client._id.toString() !== req.user._id.toString() &&
      contract.doer._id.toString() !== req.user._id.toString()
    ) {
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

      const { job: jobId, doer: doerId, price, startDate, endDate, termsAccepted, notes } = req.body;

      // Verificar que el trabajo existe
      const job = await Job.findById(jobId);
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
          message: "No tienes permiso para crear un contrato para este trabajo",
        });
        return;
      }

      // Verificar que el doer existe
      const doer = await User.findById(doerId);
      if (!doer) {
        res.status(404).json({
          success: false,
          message: "Doer no encontrado",
        });
        return;
      }

      // Calcular comisión
      const commission = price * PLATFORM_COMMISSION;
      const totalPrice = price + commission;

      // Crear contrato
      const contract = await Contract.create({
        job: jobId,
        client: req.user._id,
        doer: doerId,
        price,
        commission,
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
      job.doer = doerId as any;
      await job.save();

      const populatedContract = await Contract.findById(contract._id)
        .populate("job")
        .populate("client", "name email phone avatar")
        .populate("doer", "name email phone avatar");

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
// @desc    Aceptar contrato (por el doer)
// @access  Private
router.put("/:id/accept", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea el doer
    if (contract.doer.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: "Solo el doer puede aceptar este contrato",
      });
      return;
    }

    if (contract.status !== "pending") {
      res.status(400).json({
        success: false,
        message: "Este contrato no puede ser aceptado",
      });
      return;
    }

    contract.status = "accepted";
    contract.termsAcceptedByDoer = true;
    contract.paymentStatus = "held";
    await contract.save();

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

// @route   PUT /api/contracts/:id/complete
// @desc    Marcar contrato como completado
// @access  Private
router.put("/:id/complete", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const contract = await Contract.findById(req.params.id).populate("job");

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Solo el cliente puede marcar como completado
    if (contract.client.toString() !== req.user._id.toString()) {
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
    if (contract.job) {
      const job = await Job.findById(contract.job);
      if (job) {
        job.status = "completed";
        await job.save();
      }
    }

    // Incrementar trabajos completados del doer
    await User.findByIdAndUpdate(contract.doer, {
      $inc: { completedJobs: 1 },
    });

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

    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    // Verificar que el usuario sea parte del contrato
    const isClient = contract.client.toString() === req.user._id.toString();
    const isDoer = contract.doer.toString() === req.user._id.toString();

    if (!isClient && !isDoer) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para cancelar este contrato",
      });
      return;
    }

    contract.status = "cancelled";
    contract.cancellationReason = cancellationReason;
    contract.cancelledBy = req.user._id;
    contract.paymentStatus = "refunded";
    await contract.save();

    // Actualizar el trabajo
    const job = await Job.findById(contract.job);
    if (job) {
      job.status = "cancelled";
      await job.save();
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

export default router;
