import express, { Request, Response } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { User } from "../../models/sql/User.model.js";
import { protect } from "../../middleware/auth.js";
import { logAudit } from "../../utils/auditLog.js";
import { limpiarCampos } from "../../utils/limpiarCampos.js";
import type { AuthRequest } from "../../types/index.js";

const router = express.Router();

router.use(protect);

/**
 * Tope de intentos fallidos de código por usuario.
 *
 * Un código de 6 dígitos con ventana de ±2 pasos tiene 5 valores válidos en un millón: sin tope por cuenta,
 * lo único que frenaba una adivinanza era el límite general por IP (500 pedidos cada 15 minutos). Con 5
 * fallos seguidos se bloquea 15 minutos a esa cuenta, venga de la IP que venga. En memoria: PM2 corre una sola
 * instancia (un reinicio lo limpia, y eso sólo le da más intentos al atacante hasta el próximo tope).
 */
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const fallosPorUsuario = new Map<string, { n: number; hasta: number }>();

function bloqueadoPorFallos(userId: string): number {
  const f = fallosPorUsuario.get(userId);
  if (!f) return 0;
  if (f.hasta && Date.now() < f.hasta) return f.hasta - Date.now();
  if (f.hasta && Date.now() >= f.hasta) fallosPorUsuario.delete(userId);
  return 0;
}
function registrarFallo(userId: string): void {
  const f = fallosPorUsuario.get(userId) || { n: 0, hasta: 0 };
  f.n += 1;
  if (f.n >= MAX_FALLOS) f.hasta = Date.now() + BLOQUEO_MS;
  fallosPorUsuario.set(userId, f);
}
const limpiarFallos = (userId: string) => fallosPorUsuario.delete(userId);

/** Sólo para los tests: arrancan siempre sin fallos acumulados. */
export const _reiniciarFallosDe2FA = () => fallosPorUsuario.clear();

function respuestaBloqueado(res: Response, ms: number): void {
  res.status(429).json({
    success: false,
    code: 'TWO_FACTOR_LOCKED',
    message: `Demasiados intentos fallidos. Probá de nuevo en ${Math.ceil(ms / 60000)} minutos.`,
  });
}

// @route   POST /api/admin/2fa/setup
// @desc    Generar secret y QR code para 2FA
// @access  Private
router.post("/setup", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user.id);

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

    const user = await User.findByPk(req.user.id);

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
      targetId: user.id.toString(),
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

    const user = await User.findByPk(req.user.id);

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
    // En NULL: con undefined, Sequelize no los borraba y el secreto y los códigos de respaldo quedaban en la base.
    limpiarCampos(user, 'twoFactorSecret', 'twoFactorBackupCodes');

    await user.save();

    await logAudit({
      req,
      action: "disable_2fa",
      category: "user",
      severity: "high",
      description: "2FA deshabilitado",
      targetModel: "User",
      targetId: user.id.toString(),
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

    const user = await User.findByPk(req.user.id);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({
        success: false,
        message: "2FA no está habilitado",
      });
      return;
    }

    const espera = bloqueadoPorFallos(String(user.id));
    if (espera > 0) {
      respuestaBloqueado(res, espera);
      return;
    }

    // Verificar código normal
    let verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: String(code),
      window: 2,
    });

    // Si falla, verificar backup codes
    if (!verified && user.twoFactorBackupCodes) {
      const backupIndex = user.twoFactorBackupCodes.indexOf(String(code));
      if (backupIndex !== -1) {
        verified = true;
        // Eliminar el backup code usado. Se ASIGNA un arreglo nuevo: `splice` muta el arreglo en el lugar y
        // Sequelize no detecta el cambio, así que el código "usado" no se borraba de la base y valía para
        // siempre.
        user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter((_c: string, i: number) => i !== backupIndex);
        await user.save();
      }
    }

    if (!verified) {
      registrarFallo(String(user.id));
      res.status(401).json({
        success: false,
        message: "Código inválido",
      });
      return;
    }
    limpiarFallos(String(user.id));

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
// @desc    Ya no existe: regenerar códigos es un POST que pide el código del autenticador
router.get("/backup-codes", (_req: AuthRequest, res: Response): void => {
  res.status(410).json({
    success: false,
    code: 'TWO_FACTOR_ROUTE_GONE',
    message: "Para regenerar los códigos de respaldo usá POST /api/admin/2fa/backup-codes con el código de tu autenticador.",
  });
});

// @route   POST /api/admin/2fa/backup-codes
// @desc    Regenerar backup codes (exige el código actual del autenticador)
// @access  Private
router.post("/backup-codes", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body ?? {};
    const user = await User.findByPk(req.user.id);

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({
        success: false,
        message: "2FA no está habilitado",
      });
      return;
    }

    // Antes era un GET que regeneraba los 10 códigos con sólo tener sesión: quien se llevara una sesión (token
    // robado, XSS) sacaba códigos nuevos y con eso salteaba el segundo factor. Ahora hace falta el código del
    // autenticador en este momento (un código de respaldo NO sirve para generar más de respaldo).
    if (!code) {
      res.status(400).json({ success: false, message: "El código del autenticador es requerido" });
      return;
    }
    const espera = bloqueadoPorFallos(String(user.id));
    if (espera > 0) {
      respuestaBloqueado(res, espera);
      return;
    }
    const vigente = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: String(code),
      window: 1,
    });
    if (!vigente) {
      registrarFallo(String(user.id));
      res.status(401).json({ success: false, message: "Código inválido" });
      return;
    }
    limpiarFallos(String(user.id));

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
      targetId: user.id.toString(),
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
