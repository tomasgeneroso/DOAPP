import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { User } from "../models/sql/User.model.js";
import { Referral } from "../models/sql/Referral.model.js";
import { FamilyCode } from "../models/sql/FamilyCode.model.js";
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
import { PasswordResetToken } from "../models/sql/PasswordResetToken.model.js";
import emailService from "../services/email.js";
import anomalyDetection from "../services/anomalyDetection.js";
import { createAuditLog, getClientIp, getUserAgent } from "../utils/auditLogger.js";
import { uploadAvatar, uploadCover } from "../middleware/upload.js";
import twitterOAuth from "../services/twitterOAuth.js";

const router = express.Router();

// Generar JWT Token (legacy - para compatibilidad)
const generateToken = (id: string): string => {
  const options: SignOptions = {
    expiresIn: config.jwtExpire as unknown as number | `${number}${"ms" | "s" | "m" | "h" | "d"}`,
  };

  return jwt.sign({ id }, config.jwtSecret as Secret, options);
};

// @route   POST /api/auth/register
// @desc    Registrar nuevo usuario
// @access  Public
router.post(
  "/register",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("El nombre es requerido"),
    body("username")
      .trim()
      .notEmpty()
      .withMessage("El nombre de usuario es requerido")
      .isLength({ min: 3, max: 30 })
      .withMessage("El nombre de usuario debe tener entre 3 y 30 caracteres")
      .matches(/^[a-zA-Z0-9._]+$/)
      .withMessage("El nombre de usuario solo puede contener letras, números, puntos y guiones bajos")
      .not()
      .matches(/^[._]|[._]$/)
      .withMessage("El nombre de usuario no puede empezar ni terminar con punto o guión bajo")
      .not()
      .matches(/[._]{2,}/)
      .withMessage("El nombre de usuario no puede tener puntos o guiones bajos consecutivos"),
    body("email").isEmail().withMessage("Email inválido"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("La contraseña debe tener al menos 6 caracteres"),
    body("dni")
      .trim()
      .notEmpty()
      .withMessage("El DNI es requerido")
      .isLength({ min: 7, max: 9 })
      .withMessage("El DNI debe tener entre 7 y 9 dígitos")
      .isNumeric()
      .withMessage("El DNI debe contener solo números"),
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

      const { name, username, email, password, phone, dni, termsAccepted, referralCode } = req.body;

      // Verificar si el usuario ya existe por email
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: "El email ya está registrado",
        });
        return;
      }

      // Verificar si el username ya existe
      const existingUsername = await User.findOne({ where: { username: username.toLowerCase() } });
      if (existingUsername) {
        res.status(400).json({
          success: false,
          message: "El nombre de usuario ya está en uso",
        });
        return;
      }

      // Verificar código de referido si se proporcionó
      let referrer = null;
      if (referralCode) {
        referrer = await User.findOne({ where: { referralCode: referralCode.toUpperCase() } });
        if (!referrer) {
          res.status(400).json({
            success: false,
            message: "Código de referido inválido",
          });
          return;
        }
      }

      // Crear usuario
      const user = await User.create({
        name,
        username: username.toLowerCase(),
        email,
        password,
        phone,
        dni,
        termsAccepted,
        termsAcceptedAt: termsAccepted ? new Date() : undefined,
        referredBy: referrer?.id,
      });

      // Crear registro de referido si existe
      if (referrer) {
        await Referral.create({
          referrerId: referrer.id,
          referredUserId: user.id,
          referralCode: referralCode.toUpperCase(),
          usedCode: referralCode.toUpperCase(),
          status: "registered",
          registeredAt: new Date(),
          metadata: {
            ipAddress: getClientIp(req),
            userAgent: req.headers["user-agent"],
          },
        });

        // Incrementar contador de referidos del referrer
        referrer.totalReferrals += 1;
        await referrer.save();
      }

      // Generar token
      const token = generateToken(user.id.toString());

      // Set token in httpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: false, // Temporalmente false hasta instalar SSL
        sameSite: 'lax', // Protección CSRF
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
      });

      res.status(201).json({
        success: true,
        token, // Mantener para compatibilidad temporal
        user: {
          _id: user.id,
          id: user.id, // Alias for compatibility
          name: user.name,
          username: user.username,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          rating: user.rating,
          reviewsCount: user.reviewsCount,
          completedJobs: user.completedJobs,
          role: user.role,
          adminRole: user.adminRole,
          permissions: user.permissions,
          membershipTier: user.membershipTier,
          hasMembership: user.hasMembership,
          balance: user.balance,
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
  authLimiter,
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
      const user = await User.findOne({
        where: { email },
        attributes: { include: ['password'] }
      });
      if (!user) {
        res.status(401).json({
          success: false,
          message: "No existe una cuenta con este email",
          field: "email"
        });
        return;
      }

      // Verificar contraseña
      if (!user.password) {
        res.status(401).json({
          success: false,
          message: "Contraseña incorrecta",
          field: "password"
        });
        return;
      }

      const bcrypt = await import('bcryptjs');
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: "Contraseña incorrecta",
          field: "password"
        });
        return;
      }

      // Registrar dispositivo y login
      const clientIp = getClientIp(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      // TODO: Temporarily disabled LoginDevice and anomalyDetection during debugging
      /*
      if (deviceFingerprint) {
        await (LoginDevice as any).recordLogin(
          user.id,
          deviceFingerprint,
          clientIp,
          userAgent
        );
      }

      // Detectar login anómalo
      const anomalyResult = await anomalyDetection.detectAnomalousLogin({
        userId: user.id as any,
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
      */

      // Actualizar último login
      user.lastLogin = new Date();
      user.lastLoginIP = clientIp;
      await user.save();

      // Generar token
      const token = generateToken(user.id.toString());

      // Set token in httpOnly cookie (más seguro que localStorage)
      res.cookie('token', token, {
        httpOnly: true, // No accesible desde JavaScript del cliente
        secure: false, // Temporalmente false hasta instalar SSL
        sameSite: 'lax', // Protección CSRF
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
      });

      const userData = {
        _id: user.id,
        id: user.id, // Alias for compatibility
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
        completedJobs: user.completedJobs,
        role: user.role,
        adminRole: user.adminRole,
        permissions: user.permissions,
        membershipTier: user.membershipTier,
        hasMembership: user.hasMembership,
        isPremiumVerified: user.isPremiumVerified,
        monthlyContractsUsed: user.monthlyContractsUsed,
        monthlyFreeContractsLimit: user.monthlyFreeContractsLimit,
        balance: user.balance,
      };

      const response: any = {
        success: true,
        token, // Mantener para compatibilidad temporal
        user: userData,
      };

      // Añadir advertencia si hay anomalía
      // TODO: Temporarily disabled during debugging
      /*
      if (anomalyResult.isAnomalous) {
        response.warning = {
          message: "Hemos detectado actividad inusual en este login",
          riskLevel: anomalyResult.riskLevel,
        };
      }
      */

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
    const user = await User.findByPk(req.user.id as string);

    // Generar nuevo token JWT para Socket.io (válido por 7 días)
    const token = jwt.sign(
      { id: user?.id },
      config.jwtSecret,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token, // Token para Socket.io
      user: {
        _id: (user?.id as unknown as string),
        id: (user?.id as unknown as string), // Alias for compatibility
        name: user?.name,
        username: user?.username,
        email: user?.email,
        phone: user?.phone,
        avatar: user?.avatar,
        bio: user?.bio,
        rating: user?.rating,
        reviewsCount: user?.reviewsCount,
        completedJobs: user?.completedJobs,
        role: user?.role,
        adminRole: user?.adminRole,
        permissions: user?.permissions,
        isVerified: user?.isVerified,
        interests: user?.interests,
        onboardingCompleted: user?.onboardingCompleted,
        address: user?.address,
        bankingInfo: user?.bankingInfo ? {
          accountHolder: user.bankingInfo.accountHolder,
          bankType: user.bankingInfo.bankType,
          bankName: user.bankingInfo.bankName,
          accountType: user.bankingInfo.accountType,
          // Return masked CBU for security
          cbu: user.bankingInfo.cbu ? user.getMaskedCBU() : undefined,
          alias: user.bankingInfo.alias,
        } : undefined,
        dontAskBankingInfo: user?.dontAskBankingInfo,
        legalInfo: user?.legalInfo,
        notificationPreferences: user?.notificationPreferences,
        referralCode: user?.referralCode,
        freeContractsRemaining: user?.freeContractsRemaining,
        totalReferrals: user?.totalReferrals,
        membershipTier: user?.membershipTier,
        hasMembership: user?.hasMembership,
        isPremiumVerified: user?.isPremiumVerified,
        monthlyContractsUsed: user?.monthlyContractsUsed,
        monthlyFreeContractsLimit: user?.monthlyFreeContractsLimit,
        balance: user?.balance,
        hasFamilyPlan: user?.hasFamilyPlan,
        familyCodeId: user?.familyCodeId,
        dni: user?.dni,
        needsDni: !user?.dni && (!!user?.googleId || !!user?.facebookId), // True if OAuth user without DNI
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/auth/complete-registration
// @desc    Completar registro con DNI (para usuarios de OAuth)
// @access  Private
router.put("/complete-registration", protect, [
  body("dni").notEmpty().withMessage("DNI es requerido")
    .isLength({ min: 7, max: 8 }).withMessage("DNI debe tener entre 7 y 8 dígitos")
    .isNumeric().withMessage("DNI debe contener solo números"),
], async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        errors: errors.array(),
      });
      return;
    }

    const { dni } = req.body;

    // Check if DNI is already in use
    const existingUser = await User.findOne({ where: { dni } });
    if (existingUser && existingUser.id !== req.user.id) {
      res.status(400).json({
        success: false,
        message: "Este DNI ya está registrado en otra cuenta",
      });
      return;
    }

    const user = await User.findByPk(req.user.id as string);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    await user.update({ dni });

    res.json({
      success: true,
      message: "DNI registrado exitosamente",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        dni: user.dni,
        needsDni: false,
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

    const user = await User.findByPk(req.user.id as string);
    if (user) {
      await user.update({ name, phone, bio, avatar });
    }

    res.json({
      success: true,
      user: {
        _id: (user?.id as unknown as string),
        id: (user?.id as unknown as string), // Alias for compatibility
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

// @route   POST /api/auth/onboarding
// @desc    Completar onboarding y guardar intereses del usuario
// @access  Private
router.post("/onboarding", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { interests, onboardingCompleted } = req.body;

    const user = await User.findByPk(req.user.id as string);
    if (user) {
      await user.update({
        interests: interests || [],
        onboardingCompleted: onboardingCompleted || true
      });
    }

    res.json({
      success: true,
      user: {
        _id: (user?.id as unknown as string),
        id: (user?.id as unknown as string), // Alias for compatibility
        name: user?.name,
        email: user?.email,
        interests: user?.interests,
        onboardingCompleted: user?.onboardingCompleted,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   POST /api/auth/onboarding-tooltips
// @desc    Guardar progreso del tutorial de tooltips
// @access  Private
router.post("/onboarding-tooltips", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { completed, skipped } = req.body;

    // For now, we just acknowledge - the actual state is stored in localStorage
    // This endpoint can be extended to save tooltip progress in DB if needed

    res.json({
      success: true,
      message: completed ? 'Tutorial completado' : 'Tutorial saltado',
      data: {
        completed,
        skipped,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   PUT /api/auth/settings
// @desc    Actualizar configuración completa del usuario con audit logs
// @access  Private
router.put("/settings", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      phone,
      bio,
      address,
      bankingInfo,
      dontAskBankingInfo,
      legalInfo,
      interests,
      notificationPreferences,
    } = req.body;

    // Obtener usuario actual para comparar cambios
    const oldUser = await User.findByPk(req.user.id as string, {
      attributes: { include: ['bankingInfo'] }
    });

    if (!oldUser) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Preparar cambios para audit log
    const changes: { field: string; oldValue: any; newValue: any }[] = [];

    if (name && name !== oldUser.name) {
      changes.push({ field: "name", oldValue: oldUser.name, newValue: name });
    }
    if (phone && phone !== oldUser.phone) {
      changes.push({ field: "phone", oldValue: oldUser.phone || "N/A", newValue: phone });
    }
    if (bio && bio !== oldUser.bio) {
      changes.push({ field: "bio", oldValue: oldUser.bio || "N/A", newValue: bio });
    }
    if (address) {
      if (JSON.stringify(address) !== JSON.stringify(oldUser.address)) {
        changes.push({ field: "address", oldValue: oldUser.address || {}, newValue: address });
      }
    }
    if (bankingInfo) {
      changes.push({
        field: "bankingInfo",
        oldValue: "***", // No registrar datos sensibles en logs
        newValue: "***",
      });
    }
    if (legalInfo) {
      if (JSON.stringify(legalInfo) !== JSON.stringify(oldUser.legalInfo)) {
        changes.push({
          field: "legalInfo",
          oldValue: oldUser.legalInfo || {},
          newValue: legalInfo,
        });
      }
    }
    if (interests && JSON.stringify(interests) !== JSON.stringify(oldUser.interests)) {
      changes.push({ field: "interests", oldValue: oldUser.interests || [], newValue: interests });
    }
    if (notificationPreferences && JSON.stringify(notificationPreferences) !== JSON.stringify(oldUser.notificationPreferences)) {
      changes.push({
        field: "notificationPreferences",
        oldValue: oldUser.notificationPreferences || {},
        newValue: notificationPreferences,
      });
    }

    // Actualizar usuario
    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (address) updateData.address = address;
    if (bankingInfo) {
      // Merge bankingInfo - preserve existing CBU if not provided in update
      updateData.bankingInfo = {
        ...(oldUser.bankingInfo || {}), // Keep existing values
        ...bankingInfo, // Override with new values
      };
      // If CBU wasn't provided, keep the existing one
      if (!bankingInfo.cbu && oldUser.bankingInfo?.cbu) {
        updateData.bankingInfo.cbu = oldUser.bankingInfo.cbu;
      }
    }
    if (dontAskBankingInfo !== undefined) updateData.dontAskBankingInfo = dontAskBankingInfo;
    if (legalInfo) updateData.legalInfo = legalInfo;
    if (interests) updateData.interests = interests;
    if (notificationPreferences) updateData.notificationPreferences = notificationPreferences;

    const user = await User.findByPk(req.user.id as string);
    if (user) {
      await user.update(updateData);
    }

    // Crear audit log si hubo cambios
    if (changes.length > 0) {
      await createAuditLog({
        userId: req.user.id,
        action: "user.settings_updated",
        entity: "user",
        entityId: (req.user.id as any).toString(),
        description: `User updated their settings (${changes.length} changes)`,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        changes,
        metadata: {
          changedFields: changes.map(c => c.field),
        },
      });
    }

    // Get fresh user data to return
    const updatedUser = await User.findByPk(req.user.id as string);

    res.json({
      success: true,
      user: {
        _id: (updatedUser?.id as unknown as string),
        id: (updatedUser?.id as unknown as string), // Alias for compatibility
        name: updatedUser?.name,
        email: updatedUser?.email,
        phone: updatedUser?.phone,
        bio: updatedUser?.bio,
        avatar: updatedUser?.avatar,
        rating: updatedUser?.rating,
        reviewsCount: updatedUser?.reviewsCount,
        completedJobs: updatedUser?.completedJobs,
        role: updatedUser?.role,
        address: updatedUser?.address,
        bankingInfo: updatedUser?.bankingInfo ? {
          accountHolder: updatedUser.bankingInfo.accountHolder,
          bankType: updatedUser.bankingInfo.bankType,
          bankName: updatedUser.bankingInfo.bankName,
          accountType: updatedUser.bankingInfo.accountType,
          // Return masked CBU for security
          cbu: updatedUser.bankingInfo.cbu ? updatedUser.getMaskedCBU() : undefined,
          alias: updatedUser.bankingInfo.alias,
        } : undefined,
        dontAskBankingInfo: updatedUser?.dontAskBankingInfo,
        legalInfo: updatedUser?.legalInfo,
        interests: updatedUser?.interests,
        notificationPreferences: updatedUser?.notificationPreferences,
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
    const token = generateToken((user.id as unknown as string));

    // Set token in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
    });

    // Check if user needs to complete registration (no DNI)
    const needsDni = !user.dni;

    // Redirigir con el token en la URL para el frontend
    res.redirect(`${config.clientUrl}/auth/callback?token=${token}${needsDni ? '&needsDni=true' : ''}`);
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
    const token = generateToken((user.id as unknown as string));

    // Check if user needs to complete registration (no DNI)
    const needsDni = !user.dni;

    res.redirect(`${config.clientUrl}/auth/callback?token=${token}${needsDni ? '&needsDni=true' : ''}`);
  }
);

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

    const fbUser = await response.json();

    if (fbUser.error || fbUser.id !== userID) {
      res.status(401).json({
        success: false,
        message: "Token de Facebook inválido",
      });
      return;
    }

    // Check if user exists
    let user = await User.findOne({ where: { facebookId: fbUser.id } });

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
    const token = generateAccessToken((user.id as unknown as string));
    const refreshToken = await generateRefreshToken(
      (user.id as unknown as string),
      getClientIp(req),
      req.headers["user-agent"]
    );

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        _id: (user as any)._id,
        id: (user as any)._id, // Alias for compatibility
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

// ============================================
// Twitter/X OAuth 2.0
// ============================================

// @route   GET /api/auth/twitter
// @desc    Initiate Twitter OAuth 2.0 flow
// @access  Public
router.get("/twitter", (req: Request, res: Response): void => {
  try {
    if (!twitterOAuth.isTwitterOAuthConfigured()) {
      res.redirect(`${config.clientUrl}/login?error=twitter_not_configured`);
      return;
    }

    const { url, state } = twitterOAuth.generateAuthUrl();

    console.log('🐦 Twitter OAuth initiated, state:', state.substring(0, 8) + '...');

    // Store state in cookie for verification
    // Use sameSite: 'none' with secure: true for cross-site redirects
    res.cookie('twitter_oauth_state', state, {
      httpOnly: true,
      secure: true, // Required for sameSite: 'none'
      sameSite: 'none', // Required for cross-site cookie
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    res.redirect(url);
  } catch (error: any) {
    console.error('Twitter OAuth initiation error:', error);
    res.redirect(`${config.clientUrl}/login?error=twitter_oauth_failed`);
  }
});

// @route   GET /api/auth/twitter/callback
// @desc    Twitter OAuth 2.0 callback
// @access  Public
router.get("/twitter/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Check for OAuth error
    if (oauthError) {
      console.error('Twitter OAuth error:', oauthError);
      res.redirect(`${config.clientUrl}/login?error=twitter_oauth_denied`);
      return;
    }

    // Verify state to prevent CSRF
    const storedState = req.cookies?.twitter_oauth_state;
    console.log('🐦 Twitter callback - state from URL:', state ? (state as string).substring(0, 8) + '...' : 'MISSING');
    console.log('🐦 Twitter callback - state from cookie:', storedState ? storedState.substring(0, 8) + '...' : 'MISSING');
    console.log('🐦 Twitter callback - all cookies:', Object.keys(req.cookies || {}));

    if (!state || state !== storedState) {
      console.error('🐦 State mismatch! URL state:', state, 'Cookie state:', storedState);
      res.redirect(`${config.clientUrl}/login?error=twitter_oauth_state_mismatch`);
      return;
    }

    // Clear the state cookie
    res.clearCookie('twitter_oauth_state');

    if (!code || typeof code !== 'string') {
      res.redirect(`${config.clientUrl}/login?error=twitter_oauth_no_code`);
      return;
    }

    // Exchange code for tokens
    const tokens = await twitterOAuth.exchangeCodeForTokens(code, state as string);

    // Get user profile
    const twitterUser = await twitterOAuth.getUserProfile(tokens.accessToken);

    // Find or create user
    let user = await User.findOne({ where: { twitterId: twitterUser.id } });

    if (!user) {
      // Generate a unique username based on Twitter username
      let username = twitterUser.username.toLowerCase();
      const existingUsername = await User.findOne({ where: { username } });
      if (existingUsername) {
        username = `${username}_${Date.now().toString(36)}`;
      }

      // Create new user
      user = await User.create({
        twitterId: twitterUser.id,
        name: twitterUser.name,
        username,
        email: '', // Twitter doesn't provide email in v2 API without additional permissions
        avatar: twitterUser.profileImageUrl,
        isVerified: true,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      });

      console.log(`✅ New user created via Twitter: ${user.id}`);
    } else {
      // Update avatar if changed
      if (twitterUser.profileImageUrl && twitterUser.profileImageUrl !== user.avatar) {
        user.avatar = twitterUser.profileImageUrl;
      }
    }

    // Update last login
    user.lastLogin = new Date();
    user.lastLoginIp = getClientIp(req);
    await user.save();

    // Generate JWT token
    const token = generateToken(user.id as string);
    console.log('🐦 Twitter login successful for user:', user.id);
    console.log('🐦 Generated token (first 20 chars):', token.substring(0, 20) + '...');

    // Set token in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Check if user needs to complete registration (no DNI)
    const needsDni = !user.dni;

    // Redirect to frontend with token
    const redirectUrl = `${config.clientUrl}/auth/callback?token=${token}${needsDni ? '&needsDni=true' : ''}`;
    console.log('🐦 Redirecting to:', redirectUrl.substring(0, 80) + '...');
    res.redirect(redirectUrl);
  } catch (error: any) {
    console.error('Twitter OAuth callback error:', error);
    res.redirect(`${config.clientUrl}/login?error=twitter_oauth_failed`);
  }
});

// ============================================
// Facebook GDPR Compliance Endpoints
// ============================================

// @route   POST /api/auth/facebook/data-deletion
// @desc    Handle Facebook data deletion request (GDPR)
// @access  Public (called by Facebook)
router.post("/facebook/data-deletion", async (req: Request, res: Response): Promise<void> => {
  try {
    const { signed_request } = req.body;

    if (!signed_request) {
      res.status(400).json({ error: "signed_request is required" });
      return;
    }

    // Parse the signed request from Facebook
    const [encodedSig, payload] = signed_request.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    const userId = data.user_id;

    if (!userId) {
      res.status(400).json({ error: "user_id not found in request" });
      return;
    }

    // Find user by Facebook ID
    const user = await User.findOne({ where: { facebookId: userId } });

    if (user) {
      // Clear Facebook-related data (but keep user for audit trail)
      user.facebookId = undefined;
      await user.save();

      console.log(`[GDPR] Facebook data deleted for user: ${user.id}`);
    }

    // Generate confirmation code for Facebook
    const confirmationCode = `DOAPP_DEL_${Date.now()}_${userId.slice(-6)}`;

    // Facebook expects this specific response format
    res.json({
      url: `${config.clientUrl}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode
    });
  } catch (error: any) {
    console.error("[GDPR] Facebook data deletion error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// @route   POST /api/auth/facebook/deauthorize
// @desc    Handle Facebook deauthorize callback
// @access  Public (called by Facebook)
router.post("/facebook/deauthorize", async (req: Request, res: Response): Promise<void> => {
  try {
    const { signed_request } = req.body;

    if (!signed_request) {
      res.status(400).json({ error: "signed_request is required" });
      return;
    }

    // Parse the signed request from Facebook
    const [encodedSig, payload] = signed_request.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    const userId = data.user_id;

    if (userId) {
      // Find user by Facebook ID and clear the connection
      const user = await User.findOne({ where: { facebookId: userId } });

      if (user) {
        user.facebookId = undefined;
        await user.save();

        console.log(`[OAuth] Facebook deauthorized for user: ${user.id}`);
      }
    }

    // Facebook just needs a 200 OK response
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("[OAuth] Facebook deauthorize error:", error);
    res.status(500).json({ error: "Internal server error" });
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

    // Clear httpOnly cookie
    res.clearCookie('token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax'
    });

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
    await revokeAllUserTokens(req.user.id, "Logged out from all devices");

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
  authLimiter,
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
      const user = await User.findOne({ where: { email } });
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
        user.id,
        getClientIp(req),
        req.headers["user-agent"]
      );

      // Enviar email con link de reset (solo pasar el token, el email service construye la URL)
      await emailService.sendPasswordResetEmail(
        user.email,
        user.name,
        resetData.token
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
  authLimiter,
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

      console.log('Reset password attempt with token:', token?.substring(0, 10) + '...');

      // Verificar token
      const resetToken = await (PasswordResetToken as any).verifyToken(token);

      if (!resetToken) {
        console.log('Token verification failed - token not found or expired');
        // Log for debugging - check if token exists at all
        const anyToken = await PasswordResetToken.findOne({ where: { token } });
        if (anyToken) {
          console.log('Token found but:', {
            used: anyToken.used,
            expiresAt: anyToken.expiresAt,
            now: new Date(),
            isExpired: anyToken.expiresAt < new Date()
          });
        } else {
          console.log('Token not found in database');
        }

        res.status(400).json({
          success: false,
          message: "Token inválido o expirado",
        });
        return;
      }

      // Obtener usuario
      const user = await User.findByPk(resetToken.userId);
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
      await revokeAllUserTokens(user.id as any, "Password reset");

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
    const devices = await (LoginDevice as any).getUserDevices(req.user.id);

    res.json({
      success: true,
      devices: devices.map((device: any) => ({
        id: device.id,
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
      where: {
        id: req.params.id,
        userId: req.user.id,
      }
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
        id: device.id,
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

// @route   POST /api/auth/upload-avatar
// @desc    Upload user avatar
// @access  Private
router.post(
  "/upload-avatar",
  protect,
  uploadAvatar,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: "No se proporcionó ninguna imagen",
        });
        return;
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      // Update user avatar
      const user = await User.findByPk(req.user.id);
      if (user) {
        await user.update({ avatar: avatarUrl });
      }

      res.json({
        success: true,
        avatar: avatarUrl,
        message: "Avatar actualizado exitosamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al subir avatar",
      });
    }
  }
);

// @route   POST /api/auth/upload-cover
// @desc    Upload user cover image
// @access  Private
router.post(
  "/upload-cover",
  protect,
  uploadCover,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: "No se proporcionó ninguna imagen",
        });
        return;
      }

      const coverUrl = `/uploads/avatars/${req.file.filename}`;

      // Update user cover image
      const user = await User.findByPk(req.user.id);
      if (user) {
        await user.update({ coverImage: coverUrl });
      }

      res.json({
        success: true,
        coverImage: coverUrl,
        message: "Imagen de portada actualizada exitosamente",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al subir imagen de portada",
      });
    }
  }
);

// ============================================
// Facebook Data Privacy Callbacks
// ============================================

// @route   POST /api/auth/facebook/deauthorize
// @desc    Handle Facebook app deauthorization
// @access  Public
router.post("/facebook/deauthorize", async (req: Request, res: Response): Promise<void> => {
  try {
    const { signed_request } = req.body;

    if (!signed_request) {
      res.status(400).json({
        success: false,
        message: "signed_request is required",
      });
      return;
    }

    // Parse the signed request (Facebook sends user_id in the payload)
    const [encodedSig, payload] = signed_request.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));

    const facebookUserId = data.user_id;

    if (facebookUserId) {
      // Find user by Facebook ID
      const user = await User.findOne({ where: { facebookId: facebookUserId } });

      if (user) {
        // Log the deauthorization
        await createAuditLog({
          userId: user.id as string,
          action: "facebook_deauthorize",
          resource: "user",
          resourceId: user.id as string,
          details: {
            facebookId: facebookUserId,
            timestamp: new Date().toISOString(),
          },
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
        });

        // Optional: Mark user as needing to re-authenticate
        // user.facebookId = null;
        // await user.save();

        console.log(`✅ User ${user.id} deauthorized Facebook app`);
      }
    }

    res.json({
      success: true,
      message: "Deauthorization processed",
    });
  } catch (error: any) {
    console.error("❌ Facebook deauthorization error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error processing deauthorization",
    });
  }
});

// @route   POST /api/auth/facebook/data-deletion
// @desc    Handle Facebook data deletion request
// @access  Public
router.post("/facebook/data-deletion", async (req: Request, res: Response): Promise<void> => {
  try {
    const { signed_request } = req.body;

    if (!signed_request) {
      res.status(400).json({
        success: false,
        message: "signed_request is required",
      });
      return;
    }

    // Parse the signed request
    const [encodedSig, payload] = signed_request.split(".");
    const data = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));

    const facebookUserId = data.user_id;

    if (facebookUserId) {
      // Find user by Facebook ID
      const user = await User.findOne({ where: { facebookId: facebookUserId } });

      if (user) {
        // Create audit log for data deletion request
        await createAuditLog({
          userId: user.id as string,
          action: "data_deletion_request",
          resource: "user",
          resourceId: user.id as string,
          details: {
            facebookId: facebookUserId,
            timestamp: new Date().toISOString(),
            source: "facebook",
          },
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
          severity: "high",
        });

        // Generate a unique confirmation code
        const confirmationCode = `${facebookUserId}_${Date.now()}`;

        console.log(
          `📋 Data deletion request for user ${user.id} (Facebook ID: ${facebookUserId})`
        );
        console.log(`Confirmation code: ${confirmationCode}`);

        // Send notification email to user
        try {
          await emailService.sendEmail({
            to: user.email || "",
            subject: "Solicitud de Eliminación de Datos - DOAPP",
            template: "data-deletion-request",
            context: {
              userName: user.name,
              confirmationCode,
              requestDate: new Date().toLocaleDateString("es-AR"),
            },
          });
        } catch (emailError) {
          console.error("Failed to send data deletion email:", emailError);
        }

        // Return the confirmation response to Facebook
        res.json({
          url: `${config.serverUrl}/data-deletion/status?id=${confirmationCode}`,
          confirmation_code: confirmationCode,
        });
        return;
      }
    }

    // User not found
    res.json({
      url: `${config.serverUrl}/data-deletion/not-found`,
      confirmation_code: `not_found_${Date.now()}`,
    });
  } catch (error: any) {
    console.error("❌ Facebook data deletion error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error processing data deletion request",
    });
  }
});

// @route   POST /api/auth/activate-family-code
// @desc    Activar un código familia
// @access  Private
router.post("/activate-family-code", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "El código es requerido",
      });
      return;
    }

    // Verificar si el usuario ya tiene un plan familia
    const user = await User.findByPk(req.user.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    if (user.hasFamilyPlan) {
      res.status(400).json({
        success: false,
        message: "Ya tienes un plan familia activo",
      });
      return;
    }

    // Buscar el código
    const familyCode = await FamilyCode.findOne({
      where: { code: code.toUpperCase().trim() },
    });

    if (!familyCode) {
      res.status(404).json({
        success: false,
        message: "Código no válido",
      });
      return;
    }

    // Verificar si el código está disponible
    if (!familyCode.isActive) {
      res.status(400).json({
        success: false,
        message: "Este código ya no está activo",
      });
      return;
    }

    if (familyCode.usedById) {
      res.status(400).json({
        success: false,
        message: "Este código ya fue utilizado",
      });
      return;
    }

    if (familyCode.expiresAt && new Date() > new Date(familyCode.expiresAt)) {
      res.status(400).json({
        success: false,
        message: "Este código ha expirado",
      });
      return;
    }

    // Activar el plan familia para el usuario
    await user.update({
      familyCodeId: familyCode.id,
      hasFamilyPlan: true,
      currentCommissionRate: 0, // Sin comisión
    });

    // Marcar el código como usado
    await familyCode.update({
      usedById: user.id,
      usedAt: new Date(),
    });

    res.json({
      success: true,
      message: `¡Plan Familia activado! Ahora disfrutas de 0% comisión en todos tus contratos.`,
      data: {
        hasFamilyPlan: true,
        commissionRate: 0,
      },
    });
  } catch (error: any) {
    console.error("Error activating family code:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

// @route   GET /api/auth/family-plan-status
// @desc    Obtener estado del plan familia del usuario
// @access  Private
router.get("/family-plan-status", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'hasFamilyPlan', 'familyCodeId'],
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    let familyCodeInfo = null;
    if (user.familyCodeId) {
      const familyCode = await FamilyCode.findByPk(user.familyCodeId, {
        attributes: ['id', 'firstName', 'lastName', 'code', 'expiresAt', 'usedAt'],
      });
      if (familyCode) {
        familyCodeInfo = {
          code: familyCode.code,
          activatedAt: familyCode.usedAt,
          expiresAt: familyCode.expiresAt,
          beneficiaryName: `${familyCode.firstName} ${familyCode.lastName}`,
        };
      }
    }

    res.json({
      success: true,
      data: {
        hasFamilyPlan: user.hasFamilyPlan,
        familyCode: familyCodeInfo,
      },
    });
  } catch (error: any) {
    console.error("Error fetching family plan status:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
