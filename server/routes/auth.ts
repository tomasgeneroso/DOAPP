import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import cors from "cors";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import User, { IUser } from "../models/User.js";
import { config } from "../config/env.js";
import { protect } from "../middleware/auth.js";
import type { AuthRequest } from "../types/index.js";
import passport from "../config/passport.js";
import {
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from "../utils/tokens.js";
import { authLimiter } from "../middleware/security.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import PhoneVerificationCode from "../models/PhoneVerificationCode.js";
import { LoginDevice } from "../models/LoginDevice.js";
import emailService from "../services/email.js";
import whatsappService from "../services/whatsapp.js";
import anomalyDetection from "../services/anomalyDetection.js";
import mongoose from "mongoose";

const router = express.Router();

// Configuración de CORS específica para estas rutas de autenticación.
// Esto permite solicitudes desde el cliente (http://localhost:5173).
const corsOptions = {
  origin: config.clientUrl,
  credentials: true,
  optionsSuccessStatus: 200,
};

router.use(cors(corsOptions));

// Generar JWT Token (legacy - para compatibilidad)
const generateToken = (id: string): string => {
  const options: SignOptions = {
    expiresIn: config.jwtExpire as unknown as number | `${number}${"ms" | "s" | "m" | "h" | "d"}`,
  };

  return jwt.sign({ id }, config.jwtSecret as Secret, options);
};

// Helper para obtener IP
const getClientIp = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown"
  );
};

// @route   POST /api/auth/register
// @desc    Registrar nuevo usuario
// @access  Public
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("El nombre es requerido"),
    body("email").isEmail().withMessage("Email inválido"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("La contraseña debe tener al menos 6 caracteres"),
    body("termsAccepted", "Debes aceptar los términos y condiciones")
      .custom((value) => value === true)
      .withMessage("Debes aceptar los términos y condiciones"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { name, email, password, phone, termsAccepted } = req.body;

      // Verificar si el usuario ya existe
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: "El email ya está registrado",
        });
        return;
      }

      // Crear usuario
      const user = await User.create({
        name,
        email,
        password,
        phone,
        termsAccepted,
        termsAcceptedAt: termsAccepted ? new Date() : undefined,
      });

      // Generar token
      const token = generateToken((user as any)._id.toString());

      res.status(201).json({
        success: true,
        token,
        user: {
          id: (user as any)._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          rating: user.rating,
          reviewsCount: user.reviewsCount,
          completedJobs: user.completedJobs,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login de usuario
// @access  Public
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Email inválido"),
    body("password").notEmpty().withMessage("La contraseña es requerida"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { email, password, deviceFingerprint } = req.body;

      // Buscar usuario con password
      const user = await User.findOne({ email }).select("+password");
      if (!user) {
        res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
        return;
      }

      // Verificar contraseña
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: "Credenciales inválidas",
        });
        return;
      }

      // Registrar dispositivo y login
      const clientIp = getClientIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      if (deviceFingerprint) {
        await (LoginDevice as any).recordLogin(
          user._id,
          deviceFingerprint,
          clientIp,
          userAgent
        );
      }

      // Detectar login anómalo
      const anomalyResult = await anomalyDetection.detectAnomalousLogin({
        userId: user._id as mongoose.Types.ObjectId,
        ipAddress: clientIp,
        userAgent,
        deviceFingerprint,
        timestamp: new Date(),
        success: true,
      });

      // Si es altamente sospechoso, bloquear
      if (anomalyResult.shouldBlock) {
        res.status(403).json({
          success: false,
          message: "Login bloqueado por actividad sospechosa. Revisa tu email para más detalles.",
          code: "SUSPICIOUS_LOGIN_BLOCKED",
        });
        return;
      }

      // Actualizar último login
      user.lastLogin = new Date();
      user.lastLoginIP = clientIp;
      await user.save();

      // Generar token
      const token = generateToken((user as any)._id.toString());

      const response: any = {
        success: true,
        token,
        user: {
          id: (user as any)._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          rating: user.rating,
          reviewsCount: user.reviewsCount,
          completedJobs: user.completedJobs,
          role: user.role,
        },
      };

      // Añadir advertencia si hay anomalía
      if (anomalyResult.isAnomalous) {
        response.warning = {
          message: "Hemos detectado actividad inusual en este login",
          riskLevel: anomalyResult.riskLevel,
        };
      }

      res.json(response);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Obtener usuario actual
// @access  Private
router.get("/me", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user._id as string);

    res.json({
      success: true,
      user: {
        id: (user?._id as unknown as string),
        name: user?.name,
        email: user?.email,
        phone: user?.phone,
        avatar: user?.avatar,
        bio: user?.bio,
        rating: user?.rating,
        reviewsCount: user?.reviewsCount,
        completedJobs: user?.completedJobs,
        role: user?.role,
        isVerified: user?.isVerified,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/auth/update
// @desc    Actualizar perfil de usuario
// @access  Private
router.put("/update", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, bio, avatar } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id as string,
      { name, phone, bio, avatar },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      user: {
        id: (user?._id as unknown as string),
        name: user?.name,
        email: user?.email,
        phone: user?.phone,
        avatar: user?.avatar,
        bio: user?.bio,
        rating: user?.rating,
        reviewsCount: user?.reviewsCount,
        completedJobs: user?.completedJobs,
        role: user?.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// --- Rutas de Autenticación Social ---

// Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${config.clientUrl}/login?error=social_failed`,
    session: false,
  }),
  (req: Request, res: Response) => {
    const user = req.user as IUser;
    const token = generateToken((user._id as unknown as string));
    // Aquí podrías guardar el token en una cookie o redirigir con el token
    res.redirect(`${config.clientUrl}/auth/callback?token=${token}`);
  }
);

// Facebook
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email", "public_profile"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", {
    failureRedirect: `${config.clientUrl}/login?error=social_failed`,
    session: false,
  }),
  (req: Request, res: Response) => {
    const user = req.user as IUser;
    const token = generateToken((user._id as unknown as string));
    res.redirect(`${config.clientUrl}/auth/callback?token=${token}`);
  }
);

// Facebook User Response Interface
interface FacebookUser {
  id: string;
  name: string;
  email: string;
  picture?: {
    data?: {
      url: string;
    };
  };
  error?: any;
}

// Facebook Token Authentication (for SDK login)
router.post("/facebook/token", async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken, userID } = req.body;

    if (!accessToken || !userID) {
      res.status(400).json({
        success: false,
        message: "Access token y userID son requeridos",
      });
      return;
    }

    // Verify the token with Facebook Graph API
    const response = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`
    );

    const fbUser = await response.json() as FacebookUser;

    if (fbUser.error || fbUser.id !== userID) {
      res.status(401).json({
        success: false,
        message: "Token de Facebook inválido",
      });
      return;
    }

    // Check if user exists
    let user = await User.findOne({ facebookId: fbUser.id });

    if (!user) {
      // Create new user
      user = await User.create({
        facebookId: fbUser.id,
        name: fbUser.name,
        email: fbUser.email,
        avatar: fbUser.picture?.data?.url,
        isVerified: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      });
    }

    // Update last login
    user.lastLogin = new Date();
    user.lastLoginIP = getClientIp(req);
    await user.save();

    // Generate tokens
    const token = generateAccessToken((user._id as unknown as string));
    const refreshToken = await generateRefreshToken(
      (user._id as unknown as string),
      getClientIp(req),
      req.headers["user-agent"]
    );

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
        completedJobs: user.completedJobs,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Renovar access token con refresh token
// @access  Public
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Refresh token es requerido",
      });
      return;
    }

    const tokens = await refreshAccessToken(token, getClientIp(req));

    if (!tokens) {
      res.status(401).json({
        success: false,
        message: "Refresh token inválido o expirado",
      });
      return;
    }

    res.json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Cerrar sesión (revocar refresh token)
// @access  Private
router.post("/logout", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (token) {
      await revokeRefreshToken(token, getClientIp(req), "Logged out");
    }

    res.json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/logout-all
// @desc    Cerrar todas las sesiones
// @access  Private
router.post("/logout-all", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await revokeAllUserTokens(req.user._id, "Logged out from all devices");

    res.json({
      success: true,
      message: "Todas las sesiones cerradas correctamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Solicitar reset de contraseña
// @access  Public
router.post(
  "/forgot-password",
  [
    body("email").isEmail().withMessage("Email inválido"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { email } = req.body;

      // Buscar usuario
      const user = await User.findOne({ email });
      if (!user) {
        // Por seguridad, no revelamos si el email existe o no
        res.json({
          success: true,
          message: "Si el email existe, recibirás un enlace de recuperación",
        });
        return;
      }

      // Generar token de reset
      const resetData = await (PasswordResetToken as any).generateToken(
        user._id,
        getClientIp(req),
        req.headers["user-agent"]
      );

      // Enviar email con link de reset
      const resetUrl = `${config.clientUrl}/reset-password?token=${resetData.token}`;

      await emailService.sendPasswordResetEmail(
        user.email,
        user.name,
        resetUrl
      );

      res.json({
        success: true,
        message: "Si el email existe, recibirás un enlace de recuperación",
      });
    } catch (error: any) {
      console.error("Error en forgot-password:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar la solicitud",
      });
    }
  }
);

// @route   POST /api/auth/reset-password
// @desc    Reset de contraseña con token
// @access  Public
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Token es requerido"),
    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("La contraseña debe tener al menos 6 caracteres"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { token, newPassword } = req.body;

      // Verificar token
      const resetToken = await (PasswordResetToken as any).verifyToken(token);

      if (!resetToken) {
        res.status(400).json({
          success: false,
          message: "Token inválido o expirado",
        });
        return;
      }

      // Obtener usuario
      const user = await User.findById(resetToken.userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      // Actualizar contraseña
      user.password = newPassword;
      await user.save();

      // Marcar token como usado
      resetToken.used = true;
      resetToken.usedAt = new Date();
      await resetToken.save();

      // Revocar todas las sesiones activas por seguridad
      await revokeAllUserTokens((user._id as string).toString(), "Password reset");

      // Enviar email de confirmación
      await emailService.sendPasswordChangedEmail(user.email, user.name);

      res.json({
        success: true,
        message: "Contraseña actualizada correctamente",
      });
    } catch (error: any) {
      console.error("Error en reset-password:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar la solicitud",
      });
    }
  }
);

// @route   GET /api/auth/devices
// @desc    Obtener dispositivos de login del usuario
// @access  Private
router.get("/devices", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const devices = await (LoginDevice as any).getUserDevices(req.user._id);

    res.json({
      success: true,
      devices: devices.map((device: any) => ({
        id: device._id,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        ipAddress: device.ipAddress,
        country: device.country,
        city: device.city,
        lastLoginAt: device.lastLoginAt,
        loginCount: device.loginCount,
        isTrusted: device.isTrusted,
        createdAt: device.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/devices/:id/trust
// @desc    Marcar dispositivo como confiable
// @access  Private
router.post("/devices/:id/trust", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const device = await LoginDevice.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!device) {
      res.status(404).json({
        success: false,
        message: "Dispositivo no encontrado",
      });
      return;
    }

    device.isTrusted = !device.isTrusted;
    await device.save();

    res.json({
      success: true,
      message: device.isTrusted ? "Dispositivo marcado como confiable" : "Dispositivo desmarcado como confiable",
      device: {
        id: device._id,
        isTrusted: device.isTrusted,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/send-phone-verification
// @desc    Enviar código de verificación SMS al teléfono
// @access  Public
router.post(
  "/send-phone-verification",
  [
    body("phone").notEmpty().withMessage("Teléfono es requerido"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { phone, userName } = req.body;

      // Generar código de 6 dígitos y guardarlo en BD
      const { code, expiresAt } = await (PhoneVerificationCode as any).generateCode(
        phone,
        getClientIp(req),
        req.headers["user-agent"]
      );

      // Enviar código por SMS
      const sent = await whatsappService.sendPhoneVerificationCode(
        phone,
        userName || "Usuario",
        code
      );

      if (!sent) {
        console.warn("SMS not sent, but code was saved");
      }

      res.json({
        success: true,
        message: "Código de verificación enviado por SMS",
        expiresIn: 10, // minutos
      });
    } catch (error: any) {
      console.error("Error en send-phone-verification:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar la solicitud",
      });
    }
  }
);

// @route   POST /api/auth/verify-phone-code
// @desc    Verificar código de verificación SMS
// @access  Public
router.post(
  "/verify-phone-code",
  [
    body("phone").notEmpty().withMessage("Teléfono es requerido"),
    body("code").notEmpty().withMessage("Código es requerido"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const { phone, code } = req.body;

      // Verificar código
      const verificationCode = await (PhoneVerificationCode as any).verifyCode(phone, code);

      if (!verificationCode) {
        res.status(400).json({
          success: false,
          message: "Código inválido o expirado",
        });
        return;
      }

      // Marcar código como usado
      verificationCode.used = true;
      verificationCode.usedAt = new Date();
      await verificationCode.save();

      // Si hay userId asociado, actualizar el usuario como verificado
      if (verificationCode.userId) {
        await User.findByIdAndUpdate(verificationCode.userId, {
          phoneVerified: true,
        });
      }

      res.json({
        success: true,
        message: "Teléfono verificado correctamente",
      });
    } catch (error: any) {
      console.error("Error en verify-phone-code:", error);
      res.status(500).json({
        success: false,
        message: "Error al procesar la solicitud",
      });
    }
  }
);

export default router;
