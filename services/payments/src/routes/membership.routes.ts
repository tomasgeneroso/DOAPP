import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Membership } from '../models/Membership.model.js';
import { Payment } from '../models/Payment.model.js';
import { pubsub } from '../redis.js';

const router = express.Router();

const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

// Pricing in EUR
const MEMBERSHIP_PRICING = {
  pro: { price: 5.99, contractsPerMonth: 3, commissionRate: 3 },
  super_pro: { price: 8.99, contractsPerMonth: 3, commissionRate: 2 },
};

// ===========================================
// GET PRICING
// ===========================================
router.get('/pricing', async (req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    pricing: {
      pro: {
        ...MEMBERSHIP_PRICING.pro,
        features: [
          '3 contratos/mes con 3% de comisión',
          'Badge de usuario PRO',
          'Prioridad en búsquedas',
          'Estadísticas avanzadas',
          'Verificación KYC',
        ],
      },
      super_pro: {
        ...MEMBERSHIP_PRICING.super_pro,
        features: [
          '3 contratos/mes con 2% de comisión',
          'Badge de usuario SUPER PRO',
          'Máxima prioridad en búsquedas',
          'Analytics avanzados',
          'Dashboard exclusivo',
          'Soporte prioritario',
        ],
      },
    },
  });
});

// ===========================================
// GET MY MEMBERSHIP
// ===========================================
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const membership = await Membership.findOne({
      where: { userId, status: 'active' },
      order: [['createdAt', 'DESC']],
    });

    if (!membership) {
      res.json({
        success: true,
        membership: null,
        tier: 'free',
        commissionRate: 8,
      });
      return;
    }

    res.json({
      success: true,
      membership,
      tier: membership.tier,
      commissionRate: membership.getCommissionRate(),
      contractsRemaining: membership.getContractsRemaining(),
      isExpired: membership.isExpired(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// GET USAGE
// ===========================================
router.get('/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const membership = await Membership.findOne({
      where: { userId, status: 'active' },
    });

    if (!membership) {
      res.json({
        success: true,
        tier: 'free',
        contractsUsed: 0,
        contractsTotal: 0,
        contractsRemaining: 0,
        commissionRate: 8,
      });
      return;
    }

    res.json({
      success: true,
      tier: membership.tier,
      contractsUsed: membership.contractsUsedThisMonth,
      contractsTotal: membership.contractsPerMonth,
      contractsRemaining: membership.getContractsRemaining(),
      commissionRate: membership.getCommissionRate(),
      expiresAt: membership.expiresAt,
      lastResetAt: membership.lastResetAt,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// UPGRADE TO PRO
// ===========================================
router.post('/upgrade-to-pro', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { tier = 'pro' } = req.body;

    if (!['pro', 'super_pro'].includes(tier)) {
      res.status(400).json({
        success: false,
        message: 'Tier inválido',
      });
      return;
    }

    // Check for existing active membership
    const existingMembership = await Membership.findOne({
      where: { userId, status: 'active' },
    });

    if (existingMembership && !existingMembership.isExpired()) {
      res.status(400).json({
        success: false,
        message: 'Ya tienes una membresía activa',
      });
      return;
    }

    const pricing = MEMBERSHIP_PRICING[tier as keyof typeof MEMBERSHIP_PRICING];

    // Create payment
    const payment = await Payment.create({
      userId,
      type: 'membership',
      amount: pricing.price,
      currency: 'EUR',
      status: 'pending',
      description: `Membresía ${tier.toUpperCase()}`,
    });

    // Create pending membership
    const membership = await Membership.create({
      userId,
      tier,
      status: 'pending',
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      price: pricing.price,
      currency: 'EUR',
      contractsPerMonth: pricing.contractsPerMonth,
    });

    await payment.update({ membershipId: membership.id });

    // Return payment preference
    res.json({
      success: true,
      membership,
      payment,
      preferenceId: `PREF-${payment.id.slice(0, 8)}`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// CANCEL MEMBERSHIP
// ===========================================
router.post('/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, message: 'No autorizado' });
      return;
    }

    const { reason } = req.body;

    const membership = await Membership.findOne({
      where: { userId, status: 'active' },
    });

    if (!membership) {
      res.status(404).json({
        success: false,
        message: 'No tienes una membresía activa',
      });
      return;
    }

    await membership.cancel(reason);

    // Publish cancellation event
    await pubsub.publish('membership:cancelled', {
      membershipId: membership.id,
      userId,
      tier: membership.tier,
    });

    res.json({
      success: true,
      message: 'Membresía cancelada. Permanecerá activa hasta la fecha de vencimiento.',
      membership,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

// ===========================================
// ACTIVATE MEMBERSHIP (After payment)
// ===========================================
router.post('/:id/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    const membership = await Membership.findByPk(req.params.id);

    if (!membership) {
      res.status(404).json({
        success: false,
        message: 'Membresía no encontrada',
      });
      return;
    }

    if (membership.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: 'Esta membresía ya fue procesada',
      });
      return;
    }

    await membership.update({
      status: 'active',
      startDate: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Publish activation event
    await pubsub.publish('membership:activated', {
      membershipId: membership.id,
      userId: membership.userId,
      tier: membership.tier,
    });

    res.json({
      success: true,
      membership,
      message: `Membresía ${membership.tier.toUpperCase()} activada`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error del servidor',
    });
  }
});

export default router;
