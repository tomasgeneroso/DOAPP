import express, { Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.model.js';
import { protect, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// ===========================================
// UPDATE PROFILE
// ===========================================
router.put('/update', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone, bio, avatar } = req.body;

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    await user.update({ name, phone, bio, avatar });

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
// UPDATE SETTINGS
// ===========================================
router.put('/settings', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      phone,
      bio,
      address,
      bankingInfo,
      legalInfo,
      interests,
      notificationPreferences,
    } = req.body;

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (address) updateData.address = address;
    if (bankingInfo) updateData.bankingInfo = bankingInfo;
    if (legalInfo) updateData.legalInfo = legalInfo;
    if (interests) updateData.interests = interests;
    if (notificationPreferences) updateData.notificationPreferences = notificationPreferences;

    await user.update(updateData);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        avatar: user.avatar,
        rating: user.rating,
        reviewsCount: user.reviewsCount,
        completedJobs: user.completedJobs,
        role: user.role,
        address: user.address,
        legalInfo: user.legalInfo,
        interests: user.interests,
        notificationPreferences: user.notificationPreferences,
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
// ONBOARDING
// ===========================================
router.post('/onboarding', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { interests, onboardingCompleted } = req.body;

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    await user.update({
      interests: interests || [],
      onboardingCompleted: onboardingCompleted || true,
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        interests: user.interests,
        onboardingCompleted: user.onboardingCompleted,
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
// GET USER BY ID (Public)
// ===========================================
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: [
        'id',
        'name',
        'avatar',
        'bio',
        'rating',
        'reviewsCount',
        'completedJobs',
        'role',
        'isVerified',
        'membershipTier',
        'isPremiumVerified',
        'createdAt',
      ],
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    res.json({
      success: true,
      user,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// UPDATE FCM TOKEN
// ===========================================
router.post('/fcm-token', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token FCM es requerido',
      });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    // Add token if not already present
    const fcmTokens = user.fcmTokens || [];
    if (!fcmTokens.includes(token)) {
      fcmTokens.push(token);
      await user.update({ fcmTokens });
    }

    res.json({
      success: true,
      message: 'Token FCM actualizado',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// REMOVE FCM TOKEN
// ===========================================
router.delete('/fcm-token', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token FCM es requerido',
      });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
      return;
    }

    const fcmTokens = (user.fcmTokens || []).filter((t: string) => t !== token);
    await user.update({ fcmTokens });

    res.json({
      success: true,
      message: 'Token FCM eliminado',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
