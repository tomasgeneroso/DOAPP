import express, { Request, Response } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { User } from "../../models/sql/User.model.js";
import { protect } from "../../middleware/auth.js";
import { logAudit } from "../../utils/auditLog.js";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();

router.use(protect);

// @route   POST /api/admin/2fa/setup
// @desc    Generar secret y QR code para 2FA
// @access  Private
router.post("/setup", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user._id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    if (user.twoFactorEnabled) {
      res.status(400).json({
        success: false,
        message: "2FA ya está habilitado",
      });
      return;
    }

    // Generar secret
    const secret = speakeasy.generateSecret({
      name: `Doers (${user.email})`,
      issuer: "Doers",
    });

    // Guardar temporalmente (no habilitar hasta verificar)
    user.twoFactorSecret = secret.base32;

    // Generar backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(
        speakeasy.generateSecret({ length: 8 }).base32.substring(0, 8)
      );
    }
    user.twoFactorBackupCodes = backupCodes;

    await user.save();

    // Generar QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    res.json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        backupCodes,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/admin/2fa/verify
// @desc    Verificar código y habilitar 2FA
// @access  Private
router.post("/verify", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "El código es requerido",
      });
      return;
    }

    const user = await User.findByPk(req.user._id).select("+twoFactorSecret");

    if (!user || !user.twoFactorSecret) {
      res.status(400).json({
        success: false,
        message: "2FA no configurado. Ejecuta /setup primero",
      });
      return;
    }

    // Verificar código
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (!verified) {
      res.status(401).json({
        success: false,
        message: "Código inválido",
      });
      return;
    }

    // Habilitar 2FA
    user.twoFactorEnabled = true;
    await user.save();

    await logAudit({
      req,
      action: "enable_2fa",
      category: "user",
      severity: "high",
      description: "2FA habilitado",
      targetModel: "User",
      targetId: user._id.toString(),
      targetIdentifier: user.email,
    });

    res.json({
      success: true,
      message: "2FA habilitado correctamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/admin/2fa/disable
// @desc    Deshabilitar 2FA
// @access  Private
router.post("/disable", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({
        success: false,
        message: "La contraseña es requerida para deshabilitar 2FA",
      });
      return;
    }

    const user = await User.findByPk(req.user._id).select("+password +twoFactorSecret");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Verificar contraseña
    if (!user.password || !(await user.comparePassword(password))) {
      res.status(401).json({
        success: false,
        message: "Contraseña incorrecta",
      });
      return;
    }

    // Deshabilitar 2FA
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = undefined;

    await user.save();

    await logAudit({
      req,
      action: "disable_2fa",
      category: "user",
      severity: "high",
      description: "2FA deshabilitado",
      targetModel: "User",
      targetId: user._id.toString(),
      targetIdentifier: user.email,
    });

    res.json({
      success: true,
      message: "2FA deshabilitado correctamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/admin/2fa/validate
// @desc    Validar código 2FA (para acciones críticas)
// @access  Private
router.post("/validate", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "El código es requerido",
      });
      return;
    }

    const user = await User.findByPk(req.user._id).select("+twoFactorSecret +twoFactorBackupCodes");

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({
        success: false,
        message: "2FA no está habilitado",
      });
      return;
    }

    // Verificar código normal
    let verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    // Si falla, verificar backup codes
    if (!verified && user.twoFactorBackupCodes) {
      const backupIndex = user.twoFactorBackupCodes.indexOf(code);
      if (backupIndex !== -1) {
        verified = true;
        // Eliminar backup code usado
        user.twoFactorBackupCodes.splice(backupIndex, 1);
        await user.save();
      }
    }

    if (!verified) {
      res.status(401).json({
        success: false,
        message: "Código inválido",
      });
      return;
    }

    res.json({
      success: true,
      message: "Código válido",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/admin/2fa/backup-codes
// @desc    Regenerar backup codes
// @access  Private
router.get("/backup-codes", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user._id).select("+twoFactorBackupCodes");

    if (!user || !user.twoFactorEnabled) {
      res.status(400).json({
        success: false,
        message: "2FA no está habilitado",
      });
      return;
    }

    // Generar nuevos backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(
        speakeasy.generateSecret({ length: 8 }).base32.substring(0, 8)
      );
    }

    user.twoFactorBackupCodes = backupCodes;
    await user.save();

    await logAudit({
      req,
      action: "regenerate_2fa_backup_codes",
      category: "user",
      severity: "medium",
      description: "Backup codes 2FA regenerados",
      targetModel: "User",
      targetId: user._id.toString(),
      targetIdentifier: user.email,
    });

    res.json({
      success: true,
      data: { backupCodes },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
