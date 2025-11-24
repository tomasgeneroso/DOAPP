import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import fcmService from "../services/fcm.js";
import { body, validationResult } from "express-validator";
import { Op } from "sequelize";

const router = Router();

/**
 * Register FCM token for push notifications
 * POST /api/notifications/register-token
 */
router.post(
  "/register-token",
  protect,
  [body("token").notEmpty().withMessage("Token is required")],
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

      const userId = req.user.id;
      const { token } = req.body;

      const user = await User.findByPk(userId);

      if (!user) {
        res.status(404).json({
          success: false,
          message: "Usuario no encontrado",
        });
        return;
      }

      // Add token if not already present
      if (!user.fcmTokens.includes(token)) {
        user.fcmTokens = [...user.fcmTokens, token];
        await user.save();
      }

      res.json({
        success: true,
        message: "Token FCM registrado exitosamente",
      });
    } catch (error: any) {
      console.error("Register FCM token error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Unregister FCM token
 * POST /api/notifications/unregister-token
 */
router.post(
  "/unregister-token",
  protect,
  [body("token").notEmpty().withMessage("Token is required")],
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

      const userId = req.user.id;
      const { token } = req.body;

      const user = await User.findByPk(userId);

      if (user) {
        user.fcmTokens = user.fcmTokens.filter((t: string) => t !== token);
        await user.save();
      }

      res.json({
        success: true,
        message: "Token FCM eliminado exitosamente",
      });
    } catch (error: any) {
      console.error("Unregister FCM token error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
router.get("/preferences", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['notificationPreferences'],
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
      data: user.notificationPreferences,
    });
  } catch (error: any) {
    console.error("Get notification preferences error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
router.put("/preferences", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const preferences = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Update preferences
    user.notificationPreferences = {
      ...user.notificationPreferences,
      ...preferences,
    };

    await user.save();

    res.json({
      success: true,
      data: user.notificationPreferences,
      message: "Preferencias actualizadas exitosamente",
    });
  } catch (error: any) {
    console.error("Update notification preferences error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get user notifications
 * GET /api/notifications
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const where: any = { recipientId: userId };

    if (unreadOnly === "true") {
      where.read = false;
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    const { count: total, rows: notifications } = await Notification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    });

    const unreadCount = await Notification.count({
      where: {
        recipientId: userId,
        read: false,
      },
    });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
router.put("/:id/read", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: {
        id,
        recipientId: userId,
      },
    });

    if (!notification) {
      res.status(404).json({
        success: false,
        message: "Notificación no encontrada",
      });
      return;
    }

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({
      success: true,
      message: "Notificación marcada como leída",
    });
  } catch (error: any) {
    console.error("Mark notification as read error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
router.put("/read-all", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    await Notification.update(
      { read: true, readAt: new Date() },
      { where: { recipientId: userId, read: false } }
    );

    res.json({
      success: true,
      message: "Todas las notificaciones marcadas como leídas",
    });
  } catch (error: any) {
    console.error("Mark all notifications as read error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const deleted = await Notification.destroy({
      where: {
        id,
        recipientId: userId,
      },
    });

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: "Notificación no encontrada",
      });
      return;
    }

    res.json({
      success: true,
      message: "Notificación eliminada",
    });
  } catch (error: any) {
    console.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Test push notification (for development)
 * POST /api/notifications/test
 */
router.post("/test", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const result = await fcmService.sendToUser({
      userId,
      title: "Notificación de prueba",
      body: "Esta es una notificación de prueba de DoApp",
      data: {
        type: "test",
      },
    });

    res.json({
      success: result,
      message: result
        ? "Notificación de prueba enviada exitosamente"
        : "No se pudo enviar la notificación de prueba",
    });
  } catch (error: any) {
    console.error("Test notification error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
