import express, { Request, Response } from "express";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { User } from "../models/sql/User.model.js";
import { ConsentLog } from "../models/sql/ConsentLog.model.js";
import { DataAccessLog } from "../models/sql/DataAccessLog.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { body, validationResult } from "express-validator";
import { Op } from 'sequelize';

const router = express.Router();

// Helper to get client IP
const getClientIp = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
};

/**
 * @route   POST /api/privacy/consent
 * @desc    Log user consent
 * @access  Private
 */
router.post(
  "/consent",
  protect,
  [
    body("consentType")
      .isIn([
        "terms_and_conditions",
        "privacy_policy",
        "data_processing",
        "marketing_emails",
        "push_notifications",
        "cookies",
        "data_sharing",
        "analytics",
      ])
      .withMessage("Tipo de consentimiento inválido"),
    body("action")
      .isIn(["accepted", "rejected", "updated", "revoked"])
      .withMessage("Acción inválida"),
    body("version").notEmpty().withMessage("Versión requerida"),
    body("value").isBoolean().withMessage("Valor debe ser booleano"),
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

      const { consentType, action, version, value, previousValue } = req.body;

      // Registrar consentimiento
      await (ConsentLog as any).logConsent({
        userId: req.user.id,
        consentType,
        action,
        version,
        newValue: value,
        previousValue,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || "unknown",
      });

      res.json({
        success: true,
        message: "Consentimiento registrado correctamente",
      });
    } catch (error: any) {
      console.error("Error logging consent:", error);
      res.status(500).json({
        success: false,
        message: "Error al registrar consentimiento",
      });
    }
  }
);

/**
 * @route   GET /api/privacy/consent
 * @desc    Get user's consent history
 * @access  Private
 */
router.get("/consent", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { consentType } = req.query;

    const consents = await (ConsentLog as any).getUserConsents(
      req.user.id,
      consentType as string
    );

    res.json({
      success: true,
      consents,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error al obtener historial de consentimientos",
    });
  }
});

/**
 * @route   GET /api/privacy/export
 * @desc    Export all user data (GDPR right to data portability)
 * @access  Private
 */
router.get("/export", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Log data access
    await (DataAccessLog as any).logAccess({
      userId: req.user.id,
      accessedBy: req.user.id,
      accessType: "export",
      dataType: "full_account",
      reason: "User requested data export",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || "unknown",
      success: true,
    });

    // Obtener todos los datos del usuario
    const user = await User.findByPk(req.user.id, {
      attributes: { include: ['twoFactorSecret'] },
    });
    const contracts = await Contract.findAll({
      where: {
        [Op.or]: [{ clientId: req.user.id }, { doerId: req.user.id }],
      },
      include: [{
        association: 'job',
      }],
    });
    const payments = await Payment.findAll({
      where: {
        [Op.or]: [{ payerId: req.user.id }, { recipientId: req.user.id }],
      },
    });
    const consents = await (ConsentLog as any).getUserConsents(req.user.id);
    const dataAccessLogs = await (DataAccessLog as any).getUserAccessHistory(
      req.user.id
    );

    const exportData = {
      exportDate: new Date(),
      user: {
        personalInfo: {
          name: user?.name,
          email: user?.email,
          phone: user?.phone,
          bio: user?.bio,
        },
        accountInfo: {
          createdAt: user?.createdAt,
          lastLogin: user?.lastLogin,
          lastLoginIP: user?.lastLoginIP,
          isVerified: user?.isVerified,
          verificationLevel: user?.verificationLevel,
        },
        statistics: {
          rating: user?.rating,
          reviewsCount: user?.reviewsCount,
          completedJobs: user?.completedJobs,
          trustScore: user?.trustScore,
        },
        preferences: user?.notificationPreferences,
      },
      contracts: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        price: c.price,
        createdAt: c.createdAt,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt,
      })),
      consents: consents,
      dataAccessHistory: dataAccessLogs,
    };

    res.json({
      success: true,
      data: exportData,
    });
  } catch (error: any) {
    console.error("Error exporting data:", error);

    // Log failed access
    await (DataAccessLog as any).logAccess({
      userId: req.user.id,
      accessedBy: req.user.id,
      accessType: "export",
      dataType: "full_account",
      reason: "User requested data export",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || "unknown",
      success: false,
      errorMessage: error.message,
    });

    res.status(500).json({
      success: false,
      message: "Error al exportar datos",
    });
  }
});

/**
 * @route   POST /api/privacy/delete-request
 * @desc    Request account deletion (GDPR right to erasure)
 * @access  Private
 */
router.post(
  "/delete-request",
  protect,
  [body("reason").notEmpty().withMessage("Razón requerida")],
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

      const { reason, password } = req.body;

      // Verificar contraseña
      const user = await User.findByPk(req.user.id, {
        attributes: { include: ['password'] },
      });
      if (!user || !(await user.comparePassword(password))) {
        res.status(401).json({
          success: false,
          message: "Contraseña incorrecta",
        });
        return;
      }

      // Log data access
      await (DataAccessLog as any).logAccess({
        userId: req.user.id,
        accessedBy: req.user.id,
        accessType: "delete",
        dataType: "full_account",
        reason: `Account deletion requested: ${reason}`,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || "unknown",
        success: true,
      });

      // Marcar cuenta para eliminación (no eliminar inmediatamente por obligaciones legales)
      user.isBanned = true;
      user.banReason = `Account deletion requested: ${reason}`;
      user.bannedAt = new Date();
      await user.save();

      res.json({
        success: true,
        message:
          "Solicitud de eliminación procesada. Tu cuenta será eliminada en 30 días.",
      });
    } catch (error: any) {
      console.error("Error requesting deletion:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar solicitud de eliminación",
      });
    }
  }
);

/**
 * @route   GET /api/privacy/access-history
 * @desc    Get data access history
 * @access  Private
 */
router.get(
  "/access-history",
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { limit, skip, accessType, dataType } = req.query;

      const history = await (DataAccessLog as any).getUserAccessHistory(
        req.user.id,
        {
          limit: limit ? parseInt(limit as string) : 50,
          skip: skip ? parseInt(skip as string) : 0,
          accessType: accessType as string,
          dataType: dataType as string,
        }
      );

      res.json({
        success: true,
        history,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Error al obtener historial de acceso",
      });
    }
  }
);

export default router;
