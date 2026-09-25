import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Membership } from '../models/Membership.model.js';
import { Payment } from '../models/Payment.model.js';
import { pubsub } from '../redis.js';

const router = express.Router();

const getUserId = (req: Request): string | null => {
  return req.headers['x-user-id'] as string || null;
};

/**
 * ⚠️ SERVICIO DORMIDO — NO ENCENDER SIN ACTUALIZAR ESTOS NÚMEROS.
 *
 * Este microservicio no corre en producción (sólo aparece en
 * docker-compose.microservices.yml) y su tabla de precios quedó congelada en un
 * modelo que ya no existe: acá dice super_pro con 1% y pro con 3%, cuando el
 * modelo vigente es un solo plan PRO, precio en EUR y 10% de comisión para
 * todos. La fuente de verdad es `shared/constants/membershipPricing.ts`.
 *
 * Si algún día se enciende este servicio: borrar esta tabla y consumir la
 * compartida, no copiarla de nuevo. Un número de plata copiado a mano en dos
 * lugares termina siempre con los dos lugares diciendo cosas distintas —esta
 * tabla es la prueba—.
 */
const MEMBERSHIP_PRICING = {
  pro: { priceUSD: 6, contractsPerMonth: 3, commissionRate: 3 },
  super_pro: { priceUSD: 8, contractsPerMonth: 3, commissionRate: 1 },
};

/**
 * Dólar blue por API. Antes raspaba el HTML de dolarhoy.com con una expresión
 * regular; el sitio cambió el maquetado, la expresión dejó de encontrar el
 * número y devolvía el valor de respaldo para siempre sin fallar ni avisar.
 * Mismas fuentes que el monolito (`server/services/currencyExchange.ts`).
 */
let blueCache: { rate: number; expiresAt: number } | null = null;
const BLUE_FALLBACK = 1430;
async function getDolarBlueRate(): Promise<number> {
  if (blueCache && Date.now() < blueCache.expiresAt) return blueCache.rate;
  const fuentes: Array<{ id: string; url: string; leer: (d: any) => number }> = [
    { id: 'dolarapi', url: 'https://dolarapi.com/v1/dolares/blue', leer: (d) => Number(d?.venta) },
    { id: 'bluelytics', url: 'https://api.bluelytics.com.ar/v2/latest', leer: (d) => Number(d?.blue?.value_sell) },
  ];
  for (const f of fuentes) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const rate = f.leer(await res.json());
      if (!Number.isFinite(rate) || rate < 100 || rate > 100_000) throw new Error(`fuera de rango: ${rate}`);
      blueCache = { rate, expiresAt: Date.now() + 3600 * 1000 };
      return rate;
    } catch (e: any) {
      console.warn(`⚠️ ${f.id} no respondió: ${e?.message}`);
    }
  }
  console.warn('⚠️ Ninguna fuente del blue respondió; se usa el valor de respaldo');
  return BLUE_FALLBACK;
}
async function getPriceARS(tier: keyof typeof MEMBERSHIP_PRICING): Promise<number> {
  const rate = await getDolarBlueRate();
  return Math.round(MEMBERSHIP_PRICING[tier].priceUSD * rate);
}

// ===========================================
// GET PRICING
// ===========================================
router.get('/pricing', async (req: Request, res: Response): Promise<void> => {
  const [proARS, superProARS] = await Promise.all([
    getPriceARS('pro'),
    getPriceARS('super_pro'),
  ]);
  res.json({
    success: true,
    pricing: {
      pro: {
        ...MEMBERSHIP_PRICING.pro,
        priceARS: proARS,
        currency: 'ARS',
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
        priceARS: superProARS,
        currency: 'ARS',
        features: [
          '3 contratos/mes con 1% de comisión',
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

    const tierKey = tier as keyof typeof MEMBERSHIP_PRICING;
    const pricing = MEMBERSHIP_PRICING[tierKey];
    const priceARS = await getPriceARS(tierKey);

    // Create payment
    const payment = await Payment.create({
      userId,
      type: 'membership',
      amount: priceARS,
      currency: 'ARS',
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
      price: priceARS,
      currency: 'ARS',
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
