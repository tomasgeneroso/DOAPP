import express, { Request, Response } from "express";
import { body, validationResult } from "express-validator";
import jwt, { Secret, SignOptions,StringValue, JwtPayload } from "jsonwebtoken";
import User from "../models/User.js";
import { config } from "../config/env.js";
import { protect, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

// Generar JWT Token
const generateToken = (id: string): string => {
  const options: SignOptions = {
    expiresIn: config.jwtExpire as StringValue,
  };


  return jwt.sign({ id }, config.jwtSecret as Secret, options);
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
      const token = generateToken((user as UserDocument)._id.toString());

      res.status(201).json({
        success: true,
        token,
        user: {
          id: (user as UserDocument)._id,
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
      const token = generateToken((user as UserDocument)._id.toString());

      res.json({
        success: true,
        token,
        user: {
          id: (user as UserDocument)._id,
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
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      user: {
        id: user?._id,
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
      req.user._id,
      { name, phone, bio, avatar },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      user: {
        id: user?._id,
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

export default router;
