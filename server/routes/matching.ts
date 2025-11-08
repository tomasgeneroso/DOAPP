import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth";
import { MatchingCode } from "../models/sql/MatchingCode.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { body, validationResult } from "express-validator";
import { Op } from 'sequelize';

const router = Router();

/**
 * Generate matching code for a contract meeting
 * POST /api/matching/generate
 */
router.post(
  "/generate",
  protect,
  [
    body("contractId").notEmpty().withMessage("Contract ID es requerido"),
    body("scheduledMeetingTime").isISO8601().withMessage("Fecha de reunión inválida"),
    body("meetingLocation").optional().isString(),
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

      const { contractId, scheduledMeetingTime, meetingLocation } = req.body;
      const userId = req.user.id;

      // Verify contract exists and user is part of it
      const contract = await Contract.findByPk(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      if (
        contract.client !== userId &&
        contract.doer !== userId
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para generar códigos para este contrato",
        });
        return;
      }

      // Check if meeting time is in the future
      const meetingTime = new Date(scheduledMeetingTime);
      if (meetingTime <= new Date()) {
        res.status(400).json({
          success: false,
          message: "La fecha de reunión debe ser en el futuro",
        });
        return;
      }

      // Delete any existing codes for this user and contract
      await MatchingCode.destroy({ where: { contractId, userId } });

      // Generate new code
      const { code, document } = await (MatchingCode as any).generateCode(
        contractId,
        userId,
        meetingTime,
        meetingLocation
      );

      // Notify the other party
      const otherUserId =
        contract.client === userId
          ? contract.doer
          : contract.client;

      await Notification.create({
        userId: otherUserId,
        type: "matching_code_generated",
        title: "Código de verificación generado",
        message: "Tu contraparte ha generado un código de verificación para la reunión",
        metadata: {
          contractId,
          scheduledMeetingTime: meetingTime,
          meetingLocation,
        },
      });

      res.json({
        success: true,
        data: {
          code,
          validFrom: document.validFrom,
          expiresAt: document.expiresAt,
          scheduledMeetingTime: document.scheduledMeetingTime,
          message: "Código generado. Compártelo con la otra persona en la reunión.",
        },
      });
    } catch (error: any) {
      console.error("Generate matching code error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Verify matching code from partner
 * POST /api/matching/verify
 */
router.post(
  "/verify",
  protect,
  [
    body("contractId").notEmpty().withMessage("Contract ID es requerido"),
    body("partnerCode").isString().isLength({ min: 6, max: 6 }).withMessage("Código inválido"),
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

      const { contractId, partnerCode } = req.body;
      const userId = req.user.id;
      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

      // Verify contract exists and user is part of it
      const contract = await Contract.findByPk(contractId);
      if (!contract) {
        res.status(404).json({
          success: false,
          message: "Contrato no encontrado",
        });
        return;
      }

      if (
        contract.client !== userId &&
        contract.doer !== userId
      ) {
        res.status(403).json({
          success: false,
          message: "No tienes permiso para verificar códigos de este contrato",
        });
        return;
      }

      // Find partner's code
      const partnerId =
        contract.client === userId
          ? contract.doer
          : contract.client;

      const partnerMatchingCode = await MatchingCode.findOne({
        where: {
          contractId,
          userId: partnerId,
        }
      });

      if (!partnerMatchingCode) {
        res.status(404).json({
          success: false,
          message: "El código de tu contraparte no ha sido generado aún",
        });
        return;
      }

      // Check if code is valid (time window)
      if (!partnerMatchingCode.isValid()) {
        res.status(400).json({
          success: false,
          message: partnerMatchingCode.isUsed
            ? "Este código ya ha sido usado"
            : "Este código ha expirado o aún no es válido",
          validFrom: partnerMatchingCode.validFrom,
          expiresAt: partnerMatchingCode.expiresAt,
        });
        return;
      }

      // Verify the code
      if (!partnerMatchingCode.verifyCode(partnerCode)) {
        res.status(401).json({
          success: false,
          message: "Código incorrecto",
        });
        return;
      }

      // Mark as used and verified
      partnerMatchingCode.isUsed = true;
      partnerMatchingCode.usedAt = new Date();
      partnerMatchingCode.usedFromIp = clientIp as string;
      partnerMatchingCode.partnerVerified = true;
      partnerMatchingCode.partnerVerifiedAt = new Date();
      await partnerMatchingCode.save();

      // Notify both parties
      await Notification.create([
        {
          userId: partnerId,
          type: "matching_verified",
          title: "Verificación exitosa",
          message: "Tu contraparte ha verificado tu código correctamente",
          metadata: { contractId },
        },
        {
          userId,
          type: "matching_verified",
          title: "Verificación exitosa",
          message: "Has verificado el código de tu contraparte correctamente",
          metadata: { contractId },
        },
      ]);

      res.json({
        success: true,
        message: "Verificación exitosa. Ambas partes están confirmadas.",
        data: {
          verifiedAt: partnerMatchingCode.partnerVerifiedAt,
        },
      });
    } catch (error: any) {
      console.error("Verify matching code error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get my active matching codes
 * GET /api/matching/my-codes
 */
router.get("/my-codes", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const codes = await MatchingCode.findAll({
      where: {
        userId,
        expiresAt: { [Op.gt]: new Date() },
      },
      include: [{
        model: Contract,
        as: 'contract',
        attributes: ['title']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: codes.map((code) => ({
        id: code.id,
        contractId: code.contractId,
        validFrom: code.validFrom,
        expiresAt: code.expiresAt,
        isUsed: code.isUsed,
        partnerVerified: code.partnerVerified,
        scheduledMeetingTime: code.scheduledMeetingTime,
        meetingLocation: code.meetingLocation,
      })),
    });
  } catch (error: any) {
    console.error("Get matching codes error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Check verification status for a contract
 * GET /api/matching/status/:contractId
 */
router.get("/status/:contractId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const userId = req.user.id;

    // Verify contract exists and user is part of it
    const contract = await Contract.findByPk(contractId);
    if (!contract) {
      res.status(404).json({
        success: false,
        message: "Contrato no encontrado",
      });
      return;
    }

    if (
      contract.client !== userId &&
      contract.doer !== userId
    ) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para ver este contrato",
      });
      return;
    }

    // Get both users' codes
    const codes = await MatchingCode.findAll({
      where: {
        contractId,
        expiresAt: { [Op.gt]: new Date() },
      }
    });

    const myCode = codes.find((c) => c.userId === userId);
    const partnerId =
      contract.client === userId
        ? contract.doer
        : contract.client;
    const partnerCode = codes.find((c) => c.userId === partnerId);

    res.json({
      success: true,
      data: {
        myCodeGenerated: !!myCode,
        partnerCodeGenerated: !!partnerCode,
        myCodeUsed: myCode?.isUsed || false,
        partnerCodeUsed: partnerCode?.isUsed || false,
        bothVerified: myCode?.partnerVerified && partnerCode?.partnerVerified,
        scheduledMeetingTime: myCode?.scheduledMeetingTime || partnerCode?.scheduledMeetingTime,
      },
    });
  } catch (error: any) {
    console.error("Get verification status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
