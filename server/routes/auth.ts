import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
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

const router = express.Router();

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
  authLimiter,
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

      const { email, password } = req.body;

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

      // Generar token
      const token = generateToken((user as any)._id.toString());

      res.json({
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

export default router;
