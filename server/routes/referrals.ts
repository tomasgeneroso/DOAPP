import express, { Response } from "express";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import { User } from "../models/sql/User.model.js";
import { Referral } from "../models/sql/Referral.model.js";
import referralService from "../services/referralService.js";

const router = express.Router();

// @route   GET /api/referrals/stats
// @desc    Get referral stats for current user
// @access  Private
router.get("/stats", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id.toString();
    const data = await referralService.getReferralStats(userId);

    // Separar stats y referrals para el frontend
    const { referrals, ...stats } = data;

    res.json({
      success: true,
      stats,
      referrals,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/referrals/validate
// @desc    Validate a referral code
// @access  Public
router.post("/validate", async (req, res): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "Código de referido requerido",
      });
      return;
    }

    const validation = await referralService.validateReferralCode(code);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/referrals/info
// @desc    Get referral program information
// @access  Public
router.get("/info", async (req, res): Promise<void> => {
  try {
    res.json({
      success: true,
      program: {
        name: "Programa de Referidos - Primeros 1000 Usuarios",
        description: "Refiere amigos y obtén beneficios exclusivos",
        maxReferrals: 3,
        referredBenefits: {
          title: "Beneficios para ti al registrarte con un código:",
          items: ["1 contrato gratis (solo primeros 1000 usuarios)"],
        },
        referrerBenefits: {
          title: "Beneficios por cada referido que complete su primer contrato:",
          items: [
            {
              position: 1,
              reward: "2 contratos gratis",
              description: "Cuando tu primer referido complete su primer contrato",
            },
            {
              position: 2,
              reward: "1 contrato gratis",
              description: "Cuando tu segundo referido complete su primer contrato",
            },
            {
              position: 3,
              reward: "3% de comisión permanente",
              description: "Cuando tu tercer referido complete su primer contrato (en lugar del 5% normal)",
            },
          ],
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/referrals/my-invitations
// @desc    Get user's invitation codes status
// @access  Private
router.get("/my-invitations", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['referralCode', 'invitationCodesRemaining', 'invitationCodesUsed'],
      include: [{
        model: User,
        as: 'invitedUsers',
        attributes: ['name', 'email', 'avatar', 'createdAt']
      }]
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        referralCode: user.referralCode,
        codesRemaining: user.invitationCodesRemaining,
        codesUsed: user.invitationCodesUsed,
        maxCodes: 3,
        invitedUsers: user.invitedUsers,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/referrals/use-code
// @desc    Use a referral code during registration
// @access  Private (called after user creation but before completing registration)
router.post("/use-code", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "Código de invitación requerido",
      });
      return;
    }

    // Verificar que el usuario no haya usado ya un código
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    if (currentUser.referredBy) {
      res.status(400).json({
        success: false,
        message: "Ya has usado un código de invitación",
      });
      return;
    }

    // Buscar el usuario que generó el código
    const referrer = await User.findOne({
      where: { referralCode: code.toUpperCase() },
      include: [{
        model: User,
        as: 'invitedUsers'
      }]
    });
    if (!referrer) {
      res.status(404).json({
        success: false,
        message: "Código de invitación inválido",
      });
      return;
    }

    // Verificar que el referidor no sea el mismo usuario
    if (referrer.id.toString() === userId.toString()) {
      res.status(400).json({
        success: false,
        message: "No puedes usar tu propio código de invitación",
      });
      return;
    }

    // Verificar que el referidor tenga códigos disponibles
    if (referrer.invitationCodesRemaining <= 0) {
      res.status(400).json({
        success: false,
        message: "Este código ya no tiene invitaciones disponibles",
      });
      return;
    }

    // Verificar que el referidor no haya alcanzado el límite de 3 invitados
    if (referrer.invitedUsers && referrer.invitedUsers.length >= 3) {
      res.status(400).json({
        success: false,
        message: "Este usuario ya alcanzó el límite de invitaciones",
      });
      return;
    }

    // Aplicar el código
    currentUser.referredBy = referrer.id;
    await currentUser.save();

    // Actualizar el referidor
    referrer.invitationCodesUsed += 1;
    referrer.invitationCodesRemaining -= 1;
    await referrer.save();

    // Crear el registro de referido
    await Referral.create({
      referrerId: referrer.id,
      referredId: userId,
      status: "pending",
    });

    res.json({
      success: true,
      message: "Código de invitación aplicado exitosamente",
      data: {
        referrerName: referrer.name,
      },
    });
  } catch (error: any) {
    console.error('Error using invitation code:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
