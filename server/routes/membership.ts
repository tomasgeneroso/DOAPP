import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth.js";
import membershipService from "../services/membershipService.js";
import { body, validationResult } from "express-validator";

const router = Router();

/**
 * GET /api/membership
 * Obtener información de la membresía del usuario
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const membershipInfo = await membershipService.getMembershipInfo(userId);

    if (!membershipInfo) {
      res.json({
        success: true,
        hasMembership: false,
        message: "No tienes una membresía activa",
      });
      return;
    }

    res.json({
      success: true,
      hasMembership: true,
      data: membershipInfo,
    });
  } catch (error: any) {
    console.error('Error fetching membership:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener membresía",
    });
  }
});

/**
 * POST /api/membership/create
 * Crear una nueva membresía
 */
router.post("/create", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id || req.user._id?.toString();

    const result = await membershipService.createMembership(userId);

    res.status(201).json({
      success: true,
      message: "Membresía creada. Completa el pago para activarla.",
      data: {
        membership: result.membership,
        paymentUrl: result.paymentPreference.initPoint,
        preferenceId: result.paymentPreference.preferenceId,
      },
    });
  } catch (error: any) {
    console.error('Error creating membership:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear membresía",
    });
  }
});

/**
 * POST /api/membership/activate
 * Activar membresía después del pago
 */
router.post(
  "/activate",
  protect,
  [body("paymentId").notEmpty().withMessage("Payment ID es requerido")],
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

      const userId = req.user.id || req.user._id?.toString();
      const { paymentId } = req.body;

      const membership = await membershipService.activateMembership(userId, paymentId);

      res.json({
        success: true,
        message: "Membresía activada exitosamente",
        data: membership,
      });
    } catch (error: any) {
      console.error('Error activating membership:', error);
      res.status(500).json({
        success: false,
        message: error.message || "Error al activar membresía",
      });
    }
  }
);

/**
 * POST /api/membership/cancel
 * Cancelar membresía
 */
router.post(
  "/cancel",
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user.id || req.user._id?.toString();
      const { reason } = req.body;

      const membership = await membershipService.cancelMembership(userId, reason);

      res.json({
        success: true,
        message: "Membresía cancelada. Seguirás teniendo acceso hasta el fin del período pagado.",
        data: membership,
      });
    } catch (error: any) {
      console.error('Error cancelling membership:', error);
      res.status(500).json({
        success: false,
        message: error.message || "Error al cancelar membresía",
      });
    }
  }
);

/**
 * GET /api/membership/pricing
 * Obtener precio de las membresías en USD (PayPal)
 */
router.get("/pricing", async (req, res) => {
  try {
    const proPriceUSD = 5.99;
    const superProPriceUSD = 8.99;

    res.json({
      success: true,
      pricing: {
        free: {
          name: 'Free',
          price: 0,
          currency: 'USD',
          benefits: [
            '3 contratos gratis (primeros 1000 usuarios)',
            'Comisión: 6%',
            '3 códigos de invitación',
          ],
        },
        pro: {
          name: 'PRO Mensual',
          price: proPriceUSD,
          priceARS: 0, // No usamos ARS con PayPal
          currency: 'USD',
          benefits: [
            '3 contratos mensuales con 2% de comisión',
            'Prioridad en búsquedas',
            'KYC Premium - Verificación completa',
            'Badge verificado PRO',
            'Estadísticas avanzadas',
            'Bonificación: 1 contrato gratis al completar 3 en el mes',
            'Renovación automática mensual',
            'Cancela en cualquier momento',
          ],
        },
        superPro: {
          name: 'SUPER PRO',
          price: superProPriceUSD,
          priceARS: 0,
          currency: 'USD',
          benefits: [
            'Todos los beneficios de PRO',
            'Estadísticas avanzadas de perfil',
            'Analytics de visitas y conversaciones',
            'Insights de contratos completados',
            'Reportes mensuales detallados',
            'Analytics de engagement',
            'Análisis de actividad por tiempo',
            'Dashboard exclusivo con métricas',
          ],
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener precio",
    });
  }
});

/**
 * POST /api/membership/upgrade-to-pro
 * Actualizar a membresía PRO
 */
router.post("/upgrade-to-pro", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const { User } = await import('../models/sql/User.model.js');

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Verificar que no tenga ya membresía PRO
    if (user.membershipTier === 'pro' && user.hasMembership) {
      res.status(400).json({
        success: false,
        message: "Ya tienes una membresía PRO activa",
      });
      return;
    }

    // Crear la membresía PRO
    const result = await membershipService.createMembership(userId);

    res.status(201).json({
      success: true,
      message: "Actualización a PRO iniciada. Completa el pago para activarla.",
      data: {
        membership: result.membership,
        paymentUrl: result.paymentPreference.initPoint,
        preferenceId: result.paymentPreference.preferenceId,
      },
    });
  } catch (error: any) {
    console.error('Error upgrading to PRO:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al actualizar a PRO",
    });
  }
});

/**
 * POST /api/membership/create-payment
 * Crear preferencia de pago para membresía
 */
router.post("/create-payment", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const { plan } = req.body; // 'monthly', 'quarterly', or 'super_pro'

    if (!plan || !['monthly', 'quarterly', 'super_pro'].includes(plan)) {
      res.status(400).json({
        success: false,
        message: "Plan inválido. Debe ser 'monthly', 'quarterly' o 'super_pro'",
      });
      return;
    }

    const { User } = await import('../models/sql/User.model.js');
    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    // Verificar si es un upgrade válido
    const isUpgrade = user.membershipTier === 'pro' && user.hasMembership && plan === 'super_pro';

    if (user.membershipTier === 'pro' && user.hasMembership) {
      // Permitir upgrade a SUPER PRO
      if (plan !== 'super_pro') {
        res.status(400).json({
          success: false,
          message: "Ya tienes una membresía PRO activa",
        });
        return;
      }
    }

    // Verificar si ya tiene SUPER PRO
    if (user.membershipTier === 'super_pro' && user.hasMembership) {
      res.status(400).json({
        success: false,
        message: "Ya tienes la membresía SUPER PRO activa",
      });
      return;
    }

    // Calcular precio según el plan (usando USD para PayPal)
    const proPriceUSD = 5.99;
    const superProPriceUSD = 8.99;
    let finalPrice = proPriceUSD;
    let description = 'Membresía DOAPP PRO - Mensual';
    let membershipPlan = 'PRO'; // 'PRO' or 'SUPER_PRO'

    if (plan === 'quarterly') {
      finalPrice = parseFloat((proPriceUSD * 3 * 0.89).toFixed(2)); // 11% descuento
      description = 'Membresía DOAPP PRO - Trimestral (ahorra 11%)';
      membershipPlan = 'PRO';
    } else if (plan === 'super_pro') {
      // Calcular diferencia de precio si es upgrade
      if (isUpgrade) {
        // Obtener membresía actual para calcular días restantes
        const { Membership } = await import('../models/sql/Membership.model.js');
        const currentMembership = await Membership.findOne({ where: { userId, status: 'active' } });

        if (currentMembership && currentMembership.endDate) {
          const now = new Date();
          const endDate = new Date(currentMembership.endDate);
          const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysRemaining > 0) {
            // Calcular valor proporcional del plan PRO restante
            const proDailyRate = proPriceUSD / 30;
            const proValueRemaining = proDailyRate * daysRemaining;

            // Calcular valor proporcional del plan SUPER PRO por los días restantes
            const superProDailyRate = superProPriceUSD / 30;
            const superProValueForRemainingDays = superProDailyRate * daysRemaining;

            // Diferencia a pagar
            const priceDifference = superProValueForRemainingDays - proValueRemaining;

            finalPrice = parseFloat(Math.max(priceDifference, 0.50).toFixed(2)); // Mínimo $0.50
            description = `Upgrade a SUPER PRO (${daysRemaining} días restantes - diferencia prorrateada)`;

            console.log('💰 Cálculo de upgrade:', {
              daysRemaining,
              proDailyRate: proDailyRate.toFixed(2),
              proValueRemaining: proValueRemaining.toFixed(2),
              superProDailyRate: superProDailyRate.toFixed(2),
              superProValueForRemainingDays: superProValueForRemainingDays.toFixed(2),
              priceDifference: priceDifference.toFixed(2),
              finalPrice
            });
          } else {
            // Membresía ya expiró, cobrar precio completo
            finalPrice = superProPriceUSD;
            description = 'Membresía DOAPP SUPER PRO - Mensual';
          }
        } else {
          // No se encontró membresía activa, cobrar precio completo
          finalPrice = superProPriceUSD;
          description = 'Membresía DOAPP SUPER PRO - Mensual';
        }
      } else {
        // No es upgrade, cobrar precio completo
        finalPrice = superProPriceUSD;
        description = 'Membresía DOAPP SUPER PRO - Mensual';
      }
      membershipPlan = 'SUPER_PRO';
    }

    console.log('💳 Creando orden de pago PayPal:', { plan, finalPrice, description });

    // Crear orden de pago con PayPal
    const paypalService = (await import('../services/paypal.js')).default;

    const orderData = {
      amount: finalPrice.toString(),
      currency: 'USD',
      description: description,
      contractId: `membership_${userId}_${plan}_${Date.now()}`,
      returnUrl: `${process.env.CLIENT_URL}/payment/success?type=membership&plan=${plan}`,
      cancelUrl: `${process.env.CLIENT_URL}/payment/cancel`,
    };

    console.log('📦 Order data preparado:', orderData);

    const order = await paypalService.createOrder(orderData);

    console.log('📥 PayPal response:', order);

    // Obtener el link de aprobación
    const approvalLink = order.links.find((link: any) => link.rel === 'approve')?.href;

    if (!approvalLink) {
      console.error('❌ No se encontró approve link en:', order.links);
      throw new Error('No se pudo obtener el link de pago de PayPal');
    }

    console.log('✅ Orden PayPal creada:', { orderId: order.orderId, approvalLink });

    // Crear registro de pago
    const { Payment } = await import('../models/sql/Payment.model.js');
    const payment = await Payment.create({
      payerId: userId,
      recipientId: null, // No hay recipiente en pagos de membresía
      contractId: null,
      amount: finalPrice,
      currency: 'USD',
      status: 'pending',
      paymentType: 'membership',
      paypalOrderId: order.orderId,
      description: description,
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
    });

    console.log('✅ Registro de pago creado:', payment.id);

    res.json({
      success: true,
      message: "Orden de pago creada",
      initPoint: approvalLink,
      orderId: order.orderId,
      paymentId: payment.id,
    });
  } catch (error: any) {
    console.error('Error creating payment preference:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear preferencia de pago",
    });
  }
});

/**
 * GET /api/membership/usage
 * Obtener uso de contratos del mes actual (PRO)
 */
router.get("/usage", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const { User } = await import('../models/sql/User.model.js');

    const user = await User.findByPk(userId, {
      attributes: ['membershipTier', 'hasMembership', 'proContractsUsedThisMonth', 'freeContractsRemaining', 'membershipExpiresAt']
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
      return;
    }

    if ((user.membershipTier !== 'pro' && user.membershipTier !== 'super_pro') || !user.hasMembership) {
      res.status(403).json({
        success: false,
        message: "Esta función solo está disponible para miembros PRO y SUPER PRO",
      });
      return;
    }

    // Calculate monthly free contract limits
    let monthlyFreeLimit = 0;
    if (user.membershipTier === 'super_pro') monthlyFreeLimit = 2;
    else if (user.membershipTier === 'pro') monthlyFreeLimit = 1;

    res.json({
      success: true,
      data: {
        contractsUsed: user.proContractsUsedThisMonth,
        contractsLimit: monthlyFreeLimit,
        contractsRemaining: Math.max(0, monthlyFreeLimit - user.proContractsUsedThisMonth),
        freeContractsRemaining: user.freeContractsRemaining,
        membershipExpiresAt: user.membershipExpiresAt,
      },
    });
  } catch (error: any) {
    console.error('Error fetching usage:', error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener uso",
    });
  }
});

export default router;
