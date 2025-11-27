import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.model.js';
import { protect, authLimiter, AuthRequest } from '../middleware/auth.js';
import {
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from '../services/jwt.service.js';
import {
  requestPasswordReset,
  resetPassword,
  changePassword,
} from '../services/password.service.js';
import { config } from '../config.js';

const router = express.Router();

// Helper to get client IP
const getClientIp = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

// ===========================================
// REGISTER
// ===========================================
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('El nombre es requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('La contraseña debe tener al menos 6 caracteres'),
    body('dni')
      .trim()
      .notEmpty()
      .withMessage('El DNI es requerido')
      .isLength({ min: 7, max: 9 })
      .withMessage('El DNI debe tener entre 7 y 9 dígitos'),
    body('termsAccepted')
      .custom((value) => value === true)
      .withMessage('Debes aceptar los términos y condiciones'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { name, email, password, phone, dni, termsAccepted, referralCode } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'El email ya está registrado',
        });
        return;
      }

      // Verify referral code if provided
      let referrer = null;
      if (referralCode) {
        referrer = await User.findOne({
          where: { referralCode: referralCode.toUpperCase() },
        });
        if (!referrer) {
          res.status(400).json({
            success: false,
            message: 'Código de referido inválido',
          });
          return;
        }
      }

      // Create user
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        phone,
        dni,
        termsAccepted,
        termsAcceptedAt: termsAccepted ? new Date() : undefined,
        referredBy: referrer?.id,
      });

      // Generate tokens
      const token = generateAccessToken(user.id);
      const refreshToken = await generateRefreshToken(
        user.id,
        getClientIp(req),
        req.headers['user-agent']
      );

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          role: user.role,
          adminRole: user.adminRole,
          permissions: user.permissions,
          membershipTier: user.membershipTier,
          hasMembership: user.hasMembership,
        },
      });
    } catch (error: any) {
      console.error('[Auth] Register error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor',
      });
    }
  }
);

// ===========================================
// LOGIN
// ===========================================
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'No existe una cuenta con este email',
          field: 'email',
        });
        return;
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: 'Contraseña incorrecta',
          field: 'password',
        });
        return;
      }

      // Check if banned
      if (user.isBanned) {
        res.status(403).json({
          success: false,
          message: 'Tu cuenta ha sido suspendida',
          reason: user.banReason,
        });
        return;
      }

      // Update last login
      user.lastLogin = new Date();
      user.lastLoginIp = getClientIp(req);
      await user.save();

      // Generate tokens
      const token = generateAccessToken(user.id);
      const refreshToken = await generateRefreshToken(
        user.id,
        getClientIp(req),
        req.headers['user-agent']
      );

      // Set cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar: user.avatar,
          bio: user.bio,
          rating: user.rating,
          reviewsCount: user.reviewsCount,
          completedJobs: user.completedJobs,
          role: user.role,
          adminRole: user.adminRole,
          permissions: user.permissions,
          isVerified: user.isVerified,
          membershipTier: user.membershipTier,
          hasMembership: user.hasMembership,
          isPremiumVerified: user.isPremiumVerified,
          balanceArs: user.balanceArs,
        },
      });
    } catch (error: any) {
      console.error('[Auth] Login error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor',
      });
    }
  }
);

// ===========================================
// GET CURRENT USER
// ===========================================
router.get('/me', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        bio: user.bio,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
        completedJobs: user.completedJobs,
        role: user.role,
        adminRole: user.adminRole,
        permissions: user.permissions,
        isVerified: user.isVerified,
        interests: user.interests,
        onboardingCompleted: user.onboardingCompleted,
        address: user.address,
        legalInfo: user.legalInfo,
        notificationPreferences: user.notificationPreferences,
        referralCode: user.referralCode,
        freeContractsRemaining: user.freeContractsRemaining,
        totalReferrals: user.totalReferrals,
        membershipTier: user.membershipTier,
        hasMembership: user.hasMembership,
        isPremiumVerified: user.isPremiumVerified,
        balanceArs: user.balanceArs,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// REFRESH TOKEN
// ===========================================
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Refresh token es requerido',
      });
      return;
    }

    const tokens = await refreshAccessToken(token, getClientIp(req));

    if (!tokens) {
      res.status(401).json({
        success: false,
        message: 'Refresh token inválido o expirado',
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
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// LOGOUT
// ===========================================
router.post('/logout', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (token) {
      await revokeRefreshToken(token, getClientIp(req), 'Logged out');
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
    });

    res.json({
      success: true,
      message: 'Sesión cerrada correctamente',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// LOGOUT ALL DEVICES
// ===========================================
router.post('/logout-all', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await revokeAllUserTokens(req.user!.id, 'Logged out from all devices');

    res.json({
      success: true,
      message: 'Todas las sesiones cerradas correctamente',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// FORGOT PASSWORD
// ===========================================
router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('Email inválido')],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const result = await requestPasswordReset(
        req.body.email,
        getClientIp(req),
        req.headers['user-agent']
      );

      // TODO: Send email with token
      // await emailService.sendPasswordResetEmail(email, result.token);

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Error al procesar la solicitud',
      });
    }
  }
);

// ===========================================
// RESET PASSWORD
// ===========================================
router.post(
  '/reset-password',
  authLimiter,
  [
    body('token').notEmpty().withMessage('Token es requerido'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('La contraseña debe tener al menos 6 caracteres'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { token, newPassword } = req.body;
      const result = await resetPassword(token, newPassword);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Error al procesar la solicitud',
      });
    }
  }
);

// ===========================================
// CHANGE PASSWORD
// ===========================================
router.post(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Contraseña actual es requerida'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      const result = await changePassword(req.user!.id, currentPassword, newPassword);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Error al procesar la solicitud',
      });
    }
  }
);

export default router;
