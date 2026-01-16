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
 * Obtener precio de las membresías con MercadoPago (ARS)
 */
router.get("/pricing", async (req, res) => {
  try {
    // Importar servicio de conversión de moneda para calcular ARS desde EUR
    const currencyExchange = (await import('../services/currencyExchange.js')).default;

    const proPriceEUR = 5.99;
    const superProPriceEUR = 8.99;

    // Convertir EUR a ARS usando el servicio de conversión
    const proPriceARS = await currencyExchange.convertEURtoARS(proPriceEUR);
    const superProPriceARS = await currencyExchange.convertEURtoARS(superProPriceEUR);

    res.json({
      success: true,
      pricing: {
        free: {
          name: 'Free',
          price: 0,
          currency: 'ARS',
          benefits: [
            '3 contratos gratis (primeros 1000 usuarios)',
            'Comisión basada en volumen mensual',
            '3 códigos de invitación',
          ],
          // Información detallada del sistema de comisiones por volumen
          volumeCommissions: {
            description: 'Cuando agotes tus contratos gratis, se aplica comisión según tu volumen mensual de contratos:',
            tiers: [
              { minVolume: 0, maxVolume: 50000, rate: 6, description: '$0 - $50,000/mes' },
              { minVolume: 50000, maxVolume: 150000, rate: 4, description: '$50,000 - $150,000/mes' },
              { minVolume: 150000, maxVolume: 200000, rate: 3, description: '$150,000 - $200,000/mes' },
              { minVolume: 200000, maxVolume: null, rate: 2, description: '+$200,000/mes' },
            ],
            minimumCommission: 1000,
            notes: [
              'Comisión mínima: $1,000 ARS por contrato',
              'El volumen se calcula sumando todos tus contratos del mes',
              'A mayor volumen, menor comisión',
            ],
          },
        },
        pro: {
          name: 'PRO Mensual',
          price: proPriceEUR, // Precio en EUR para referencia
          priceARS: Math.round(proPriceARS), // Precio en ARS para MercadoPago
          currency: 'ARS',
          benefits: [
            '1 contrato mensual sin comisión (0%)',
            '2 contratos gratis iniciales únicos',
            'Contratos adicionales: 3% de comisión',
            'Prioridad en búsquedas',
            'KYC Premium - Verificación completa',
            'Badge verificado PRO',
            'Estadísticas avanzadas',
            'Renovación automática mensual',
            'Cancela en cualquier momento',
          ],
        },
        superPro: {
          name: 'SUPER PRO',
          price: superProPriceEUR,
          priceARS: Math.round(superProPriceARS),
          currency: 'ARS',
          benefits: [
            'Todos los beneficios de PRO',
            '2 contratos mensuales sin comisión (0%)',
            'Contratos adicionales: 2% de comisión',
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
 * Actualizar a membresía PRO (usando MercadoPago)
 * LEGACY: Este endpoint redirige al nuevo flujo de /create-payment
 */
router.post("/upgrade-to-pro", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id || req.user._id?.toString();
    const { User } = await import('../models/sql/User.model.js');
    const currencyExchange = (await import('../services/currencyExchange.js')).default;

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

    // ========================================
    // Crear preferencia de pago con MercadoPago
    // ========================================
    const proPriceEUR = 5.99;
    const proPriceARS = await currencyExchange.convertEURtoARS(proPriceEUR);
    const finalPrice = Math.round(proPriceARS);

    const mercadopagoService = (await import('../services/mercadopago.js')).default;

    const mpPayment = await mercadopagoService.createPayment({
      amount: finalPrice,
      currency: 'ARS',
      description: 'Membresía DOAPP PRO - Mensual',
      provider: 'mercadopago',
      metadata: {
        userId: userId,
        paymentType: 'membership',
        plan: 'monthly',
        tier: 'pro',
      },
      customerEmail: user.email,
      successUrl: `${process.env.CLIENT_URL}/membership/payment-success?plan=monthly`,
      cancelUrl: `${process.env.CLIENT_URL}/membership/checkout?plan=monthly&error=payment_failed`,
    });

    // Crear registro de pago
    const { Payment } = await import('../models/sql/Payment.model.js');
    const payment = await Payment.create({
      payerId: userId,
      recipientId: null,
      contractId: null,
      amount: finalPrice,
      currency: 'ARS',
      status: 'pending',
      paymentType: 'membership',
      mercadopagoPreferenceId: mpPayment.paymentId,
      description: 'Membresía DOAPP PRO - Mensual',
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
    });

    console.log('✅ Preferencia MercadoPago creada para upgrade a PRO:', mpPayment.paymentId);

    res.status(201).json({
      success: true,
      message: "Actualización a PRO iniciada. Completa el pago para activarla.",
      data: {
        paymentUrl: mpPayment.checkoutUrl,
        preferenceId: mpPayment.paymentId,
        paymentId: payment.id,
      },
    });

    // ========================================
    // LEGACY: Código usando membershipService (comentado)
    // ========================================
    /*
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
    */
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

    // ========================================
    // NUEVO: Calcular precio usando EUR -> ARS (MercadoPago)
    // ========================================
    const currencyExchange = (await import('../services/currencyExchange.js')).default;
    const proPriceEUR = 5.99;
    const superProPriceEUR = 8.99;

    // Convertir EUR a ARS
    const proPriceARS = await currencyExchange.convertEURtoARS(proPriceEUR);
    const superProPriceARS = await currencyExchange.convertEURtoARS(superProPriceEUR);

    let finalPrice = Math.round(proPriceARS);
    let description = 'Membresía DOAPP PRO - Mensual';
    let membershipPlan = 'PRO'; // 'PRO' or 'SUPER_PRO'

    if (plan === 'quarterly') {
      finalPrice = Math.round(proPriceARS * 3 * 0.89); // 11% descuento
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
            const proDailyRate = proPriceARS / 30;
            const proValueRemaining = proDailyRate * daysRemaining;

            // Calcular valor proporcional del plan SUPER PRO por los días restantes
            const superProDailyRate = superProPriceARS / 30;
            const superProValueForRemainingDays = superProDailyRate * daysRemaining;

            // Diferencia a pagar
            const priceDifference = superProValueForRemainingDays - proValueRemaining;

            finalPrice = Math.round(Math.max(priceDifference, 100)); // Mínimo 100 ARS
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
            finalPrice = Math.round(superProPriceARS);
            description = 'Membresía DOAPP SUPER PRO - Mensual';
          }
        } else {
          // No se encontró membresía activa, cobrar precio completo
          finalPrice = Math.round(superProPriceARS);
          description = 'Membresía DOAPP SUPER PRO - Mensual';
        }
      } else {
        // No es upgrade, cobrar precio completo
        finalPrice = Math.round(superProPriceARS);
        description = 'Membresía DOAPP SUPER PRO - Mensual';
      }
      membershipPlan = 'SUPER_PRO';
    }

    console.log('💳 Creando preferencia de pago MercadoPago:', { plan, finalPrice, description });

    // ========================================
    // Crear preferencia de pago con MercadoPago
    // ========================================
    const mercadopagoService = (await import('../services/mercadopago.js')).default;

    console.log('📦 Creando pago MercadoPago:', { plan, finalPrice, description });

    const mpPayment = await mercadopagoService.createPayment({
      amount: finalPrice,
      currency: 'ARS',
      description: description,
      provider: 'mercadopago',
      metadata: {
        userId: userId,
        paymentType: 'membership',
        plan: plan,
        tier: membershipPlan,
      },
      customerEmail: user.email,
      successUrl: `${process.env.CLIENT_URL}/membership/payment-success?plan=${plan}`,
      cancelUrl: `${process.env.CLIENT_URL}/membership/checkout?plan=${plan}&error=payment_failed`,
    });

    console.log('📥 MercadoPago response:', mpPayment);

    if (!mpPayment.checkoutUrl) {
      console.error('❌ No se encontró checkoutUrl en la respuesta de MercadoPago');
      throw new Error('No se pudo obtener el link de pago de MercadoPago');
    }

    console.log('✅ Preferencia MercadoPago creada:', { paymentId: mpPayment.paymentId, checkoutUrl: mpPayment.checkoutUrl });

    // Crear registro de pago
    const { Payment } = await import('../models/sql/Payment.model.js');
    const payment = await Payment.create({
      payerId: userId,
      recipientId: null, // No hay recipiente en pagos de membresía
      contractId: null,
      amount: finalPrice,
      currency: 'ARS',
      status: 'pending',
      paymentType: 'membership',
      mercadopagoPreferenceId: mpPayment.paymentId,
      description: description,
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
    });

    console.log('✅ Registro de pago creado:', payment.id);

    res.json({
      success: true,
      message: "Preferencia de pago creada",
      initPoint: mpPayment.checkoutUrl,
      preferenceId: mpPayment.paymentId,
      paymentId: payment.id,
    });

    // ========================================
    // LEGACY: Código PayPal (comentado para referencia)
    // ========================================
    /*
    const proPriceUSD = 5.99;
    const superProPriceUSD = 8.99;
    let finalPrice = proPriceUSD;

    // ... código de cálculo de precios PayPal ...

    const paypalService = (await import('../services/paypal.js')).default;
    const orderData = {
      amount: finalPrice.toString(),
      currency: 'USD',
      description: description,
      contractId: `membership_${userId}_${plan}_${Date.now()}`,
      returnUrl: `${process.env.CLIENT_URL}/payment/success?type=membership&plan=${plan}`,
      cancelUrl: `${process.env.CLIENT_URL}/payment/cancel`,
    };

    const order = await paypalService.createOrder(orderData);
    const approvalLink = order.links.find((link: any) => link.rel === 'approve')?.href;

    const payment = await Payment.create({
      payerId: userId,
      recipientId: null,
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

    res.json({
      success: true,
      message: "Orden de pago creada",
      initPoint: approvalLink,
      orderId: order.orderId,
      paymentId: payment.id,
    });
    */
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
