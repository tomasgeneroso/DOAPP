import { Router, Response } from "express";
import { protect, AuthRequest } from "../middleware/auth.js";
import membershipService from "../services/membershipService.js";
import currencyExchange from "../services/currencyExchange.js";
import { body, validationResult } from "express-validator";

// Membresías cotizadas en USD, cobradas en ARS al dólar blue del día (dolarhoy.com).
const PRO_PRICE_USD = 6;
const SUPER_PRO_PRICE_USD = 8;
async function getProPriceARS(): Promise<number> {
  return Math.round(await currencyExchange.convertUSDtoARS(PRO_PRICE_USD));
}
async function getSuperProPriceARS(): Promise<number> {
  return Math.round(await currencyExchange.convertUSDtoARS(SUPER_PRO_PRICE_USD));
}

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
    const proPriceARS = await getProPriceARS();
    const superProPriceARS = await getSuperProPriceARS();

    res.json({
      success: true,
      pricing: {
        free: {
          name: 'Free',
          price: 0,
          currency: 'ARS',
          commissionRate: 8,
          benefits: [
            '3 publicaciones libres de comisión (primeros 1000 usuarios)',
            'Comisión fija del 8%',
            '3 códigos de invitación',
          ],
        },
        pro: {
          name: 'PRO Mensual',
          price: proPriceARS,
          priceARS: proPriceARS,
          priceUSD: PRO_PRICE_USD,
          currency: 'ARS',
          commissionRate: 3,
          benefits: [
            '1 contrato mensual sin comisión (0%)',
            '2 publicaciones iniciales libres de comisión',
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
          price: superProPriceARS,
          priceARS: superProPriceARS,
          priceUSD: SUPER_PRO_PRICE_USD,
          currency: 'ARS',
          commissionRate: 1,
          benefits: [
            'Todos los beneficios de PRO',
            '2 publicaciones mensuales sin comisión (0%)',
            'Contratos adicionales: 1% de comisión',
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
    const finalPrice = await getProPriceARS(); // 6 USD al dólar blue, cobrado en ARS

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
    // PRO: 6 USD / SUPER PRO: 8 USD, al dólar blue del día (cobrado en ARS).
    // ========================================
    const proPriceARS = await getProPriceARS();
    const superProPriceARS = await getSuperProPriceARS();

    let finalPrice = proPriceARS;
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

/**
 * GET /api/membership/analytics
 * Panel financiero/fiscal exclusivo de miembros SUPER PRO (adaptado a Argentina).
 * Agrega la facturación del usuario como trabajador (contratos completados como `doer`).
 * Query: ?year=YYYY (default año actual), ?limit=<tope anual monotributo> (opcional).
 */
router.get("/analytics", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Gating: solo SUPER PRO
    if (req.user.membershipTier !== 'super_pro') {
      res.status(403).json({
        success: false,
        code: 'SUPER_PRO_REQUIRED',
        message: 'El panel financiero es exclusivo de miembros SUPER PRO',
      });
      return;
    }

    const userId = req.user.id || req.user._id?.toString();
    const { Contract } = await import('../models/sql/Contract.model.js');
    const { User } = await import('../models/sql/User.model.js');
    const { Job } = await import('../models/sql/Job.model.js');

    const now = new Date();
    const year = parseInt(String(req.query.year || now.getFullYear()), 10) || now.getFullYear();
    const num = (v: any): number => (typeof v === 'string' ? parseFloat(v) : Number(v)) || 0;

    // Contratos completados donde el usuario fue el trabajador
    const contracts: any[] = await Contract.findAll({
      where: { doerId: userId, status: 'completed' },
      include: [
        { model: User, as: 'client', attributes: ['id', 'name'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] },
      ],
      order: [['updatedAt', 'DESC']],
    });

    // Facturación del trabajador por contrato = allocatedAmount (multi-worker) ?? price
    const facturado = (c: any): number => num(c.allocatedAmount) || num(c.price);
    // Contract no tiene completedAt como columna → usamos updatedAt (cuando pasó a 'completed')
    const fechaDe = (c: any): Date => new Date(c.updatedAt || c.createdAt);

    let facturacionTotal = 0, comisionesTotal = 0;
    let facturacionAnual = 0, facturacionAnualPrevia = 0, totalAnual = 0;
    const byMonth: Record<string, { total: number; count: number }> = {};
    const byQuarter: Record<number, { total: number; count: number }> = {
      1: { total: 0, count: 0 }, 2: { total: 0, count: 0 }, 3: { total: 0, count: 0 }, 4: { total: 0, count: 0 },
    };
    const byClient: Record<string, { name: string; total: number; count: number }> = {};
    const facturas: any[] = [];

    for (const c of contracts) {
      const monto = facturado(c);
      const com = num(c.commission);
      const d = fechaDe(c);
      const y = d.getFullYear();
      facturacionTotal += monto;
      comisionesTotal += com;

      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[mk]) byMonth[mk] = { total: 0, count: 0 };
      byMonth[mk].total += monto; byMonth[mk].count += 1;

      if (y === year) {
        facturacionAnual += monto; totalAnual += 1;
        const q = Math.floor(d.getMonth() / 3) + 1;
        byQuarter[q].total += monto; byQuarter[q].count += 1;
        const cid = c.clientId || 'unknown';
        if (!byClient[cid]) byClient[cid] = { name: c.client?.name || 'Cliente', total: 0, count: 0 };
        byClient[cid].total += monto; byClient[cid].count += 1;
      }
      if (y === year - 1) facturacionAnualPrevia += monto;

      if (facturas.length < 200) {
        facturas.push({
          id: c.id,
          fecha: d.toISOString(),
          cliente: c.client?.name || 'Cliente',
          trabajo: c.job?.title || '',
          monto,
          comision: com,
          currency: c.currency || 'ARS',
        });
      }
    }

    // Evolución últimos 12 meses (rellena huecos en 0)
    const evolucionMensual = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      evolucionMensual.push({
        month: mk,
        label: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
        total: byMonth[mk]?.total || 0,
        count: byMonth[mk]?.count || 0,
      });
    }

    const desgloseTrimestral = [1, 2, 3, 4].map((q) => ({
      quarter: `Q${q}`, total: byQuarter[q].total, count: byQuarter[q].count,
    }));

    const topClientes = Object.entries(byClient)
      .map(([id, v]) => ({ clientId: id, name: v.name, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const ticketPromedio = totalAnual > 0 ? facturacionAnual / totalAnual : 0;

    // Clientes y recompra (del año)
    const clientesUnicos = Object.keys(byClient).length;
    const clientesRecurrentes = Object.values(byClient).filter((v) => v.count >= 2).length;
    const tasaRecompra = clientesUnicos > 0 ? clientesRecurrentes / clientesUnicos : 0;
    const ticketPromedioCliente = clientesUnicos > 0 ? facturacionAnual / clientesUnicos : 0;

    // Pipeline: contratos activos como trabajador (ingresos futuros estimados)
    const activos: any[] = await Contract.findAll({
      where: { doerId: userId, status: ['accepted', 'in_progress', 'awaiting_confirmation'] as any },
      attributes: ['id', 'price', 'allocatedAmount'],
    });
    const pipelineActivo = activos.reduce((s, c) => s + facturado(c), 0);

    // Proyección de cierre de año (solo año actual): promedio mensual YTD * 12
    const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const proyeccionAnual = year === now.getFullYear()
      ? (facturacionAnual / Math.max(1, monthsElapsed)) * 12
      : facturacionAnual;

    // Reputación (ratings del usuario + tasa de finalización / disputas)
    const disputedAsDoer = await Contract.count({ where: { doerId: userId, status: 'disputed' } });
    const cancelledAsDoer = await Contract.count({ where: { doerId: userId, status: 'cancelled' } });
    const completedCount = contracts.length;
    const finalizables = completedCount + cancelledAsDoer + disputedAsDoer;
    const tasaFinalizacion = finalizables > 0 ? completedCount / finalizables : 0;
    const u: any = req.user;
    const r1 = (v: any) => Math.round(((typeof v === 'string' ? parseFloat(v) : Number(v)) || 0) * 10) / 10;
    const insignias: string[] = [];
    if (completedCount >= 100) insignias.push('100+ trabajos');
    else if (completedCount >= 50) insignias.push('50+ trabajos');
    else if (completedCount >= 10) insignias.push('10+ trabajos');
    if (r1(u.rating) >= 4.8 && (Number(u.reviewsCount) || 0) >= 5) insignias.push('Calificación 5★');
    if (disputedAsDoer === 0 && completedCount >= 5) insignias.push('Sin disputas');
    if (tasaFinalizacion >= 0.95 && finalizables >= 5) insignias.push('Cumplidor');
    const reputacion = {
      overall: r1(u.rating),
      reviewsCount: Number(u.reviewsCount) || 0,
      completados: completedCount,
      tasaFinalizacion,
      disputas: disputedAsDoer,
      ratings: {
        calidad: r1(u.calidadTrabajoRating || u.workQualityRating),
        puntualidad: r1(u.puntualidadRating),
        profesionalidad: r1(u.profesionalidadRating),
        precioJusto: r1(u.precioJustoRating),
        comoPersona: r1(u.comoPersonaRating),
      },
      insignias,
    };

    // Crecimiento (embudo de propuestas + win rate + recomendaciones)
    const { Proposal } = await import('../models/sql/Proposal.model.js');
    const propEnviadas = await Proposal.count({ where: { freelancerId: userId } });
    const propAprobadas = await Proposal.count({ where: { freelancerId: userId, status: 'approved' } });
    const propPendientes = await Proposal.count({ where: { freelancerId: userId, status: 'pending' } });
    const propRechazadas = await Proposal.count({ where: { freelancerId: userId, status: 'rejected' } });
    const winRate = propEnviadas > 0 ? propAprobadas / propEnviadas : 0;
    const conversion = propAprobadas > 0 ? completedCount / propAprobadas : 0;

    const recomendaciones: { type: string; message: string }[] = [];
    if (propEnviadas >= 5 && winRate < 0.3) recomendaciones.push({ type: 'low_winrate', message: 'Tu tasa de propuestas aceptadas es baja. Probá personalizar más tus propuestas y revisá que tu precio sea competitivo.' });
    if (propPendientes >= 5) recomendaciones.push({ type: 'many_pending', message: 'Tenés varias propuestas esperando respuesta. Contestá rápido los mensajes para mejorar tus chances.' });
    if (reputacion.reviewsCount < 3) recomendaciones.push({ type: 'few_reviews', message: 'Tenés pocas reseñas. Completá más trabajos y pedí feedback para generar confianza.' });
    if (!u.avatar || !u.bio) recomendaciones.push({ type: 'profile_incomplete', message: 'Completá tu perfil (foto y descripción) para generar más confianza y recibir más contrataciones.' });
    if (recomendaciones.length === 0 && propEnviadas > 0) recomendaciones.push({ type: 'good', message: '¡Vas muy bien! Seguí completando trabajos y manteniendo tu reputación alta.' });

    const crecimiento = {
      propuestasEnviadas: propEnviadas,
      propuestasAprobadas: propAprobadas,
      propuestasPendientes: propPendientes,
      propuestasRechazadas: propRechazadas,
      contratosCompletados: completedCount,
      winRate,
      conversion,
      recomendaciones,
    };

    // Alertas (adaptadas a Argentina)
    const alertas: { type: string; severity: 'info' | 'warning' | 'danger'; message: string }[] = [];
    const curMk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (year === now.getFullYear() && !(byMonth[curMk]?.total)) {
      alertas.push({ type: 'no_billing_month', severity: 'info', message: 'Todavía no facturaste este mes.' });
    }
    if (facturacionAnual > 0 && topClientes[0] && topClientes[0].total / facturacionAnual > 0.5) {
      const pct = Math.round((topClientes[0].total / facturacionAnual) * 100);
      alertas.push({ type: 'client_dependency', severity: 'warning', message: `${topClientes[0].name} representa el ${pct}% de tu facturación anual. Conviene diversificar tus clientes.` });
    }
    // Tope anual de monotributo (configurable por el usuario)
    const annualLimit = num((req.user as any).monotributoAnnualLimit) || (req.query.limit ? num(req.query.limit) : 0);
    if (annualLimit > 0) {
      const pct = Math.round((facturacionAnual / annualLimit) * 100);
      if (pct >= 100) alertas.push({ type: 'monotributo_over', severity: 'danger', message: `Superaste el tope anual de tu categoría de monotributo (${pct}%). Considerá recategorizarte o consultá con tu contador.` });
      else if (pct >= 80) alertas.push({ type: 'monotributo_near', severity: 'warning', message: `Llevás el ${pct}% del tope anual de monotributo. Vigilá la recategorización.` });
    }
    // Vencimiento de matrícula
    if (u.licenseExpiresAt) {
      const days = Math.ceil((new Date(u.licenseExpiresAt).getTime() - now.getTime()) / 86400000);
      if (days < 0) alertas.push({ type: 'license_expired', severity: 'danger', message: `Tu matrícula venció hace ${Math.abs(days)} día(s). Renovala para seguir habilitado.` });
      else if (days <= 60) alertas.push({ type: 'license_expiring', severity: 'warning', message: `Tu matrícula vence en ${days} día(s). Acordate de renovarla a tiempo.` });
    }

    res.json({
      success: true,
      data: {
        year,
        currency: 'ARS',
        facturacionTotal,
        facturacionAnual,
        facturacionAnualPrevia,
        comisionesTotal,
        totalTrabajos: contracts.length,
        totalTrabajosAnual: totalAnual,
        ticketPromedio,
        ticketPromedioCliente,
        clientesUnicos,
        clientesRecurrentes,
        tasaRecompra,
        pipelineActivo,
        proyeccionAnual,
        facturacionMesActual: byMonth[`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`]?.total || 0,
        monthlyGoal: num((req.user as any).monthlyBillingGoal) || null,
        annualLimit: annualLimit || null,
        fiscalCondition: (req.user as any).fiscalCondition || null,
        monotributoCategory: (req.user as any).monotributoCategory || null,
        evolucionMensual,
        desgloseTrimestral,
        topClientes,
        reputacion,
        crecimiento,
        profesional: {
          profession: u.profession || null,
          licenseNumber: u.licenseNumber || null,
          licenseCategory: u.licenseCategory || null,
          licenseVerified: !!u.licenseVerified,
          licenseVerificationStatus: u.licenseVerificationStatus || null,
          licenseExpiresAt: u.licenseExpiresAt || null,
        },
        alertas,
        facturas,
      },
    });
  } catch (error: any) {
    console.error('Error fetching membership analytics:', error);
    res.status(500).json({ success: false, message: error.message || 'Error al obtener analíticas' });
  }
});

/**
 * PUT /api/membership/fiscal
 * Guarda la condición fiscal del usuario (para el panel "Impuestos y Obligaciones").
 * Body: { fiscalCondition?, monotributoCategory?, monotributoAnnualLimit? }
 */
router.put("/fiscal", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      fiscalCondition, monotributoCategory, monotributoAnnualLimit,
      profession, licenseNumber, licenseCategory, licenseExpiresAt,
      monthlyBillingGoal,
    } = req.body || {};
    const validConditions = ['monotributo', 'responsable_inscripto', 'particular'];
    if (fiscalCondition && !validConditions.includes(fiscalCondition)) {
      res.status(400).json({ success: false, message: 'Condición fiscal inválida' });
      return;
    }

    const { User } = await import('../models/sql/User.model.js');
    const userId = req.user.id || req.user._id?.toString();
    const user: any = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    if (fiscalCondition !== undefined) user.fiscalCondition = fiscalCondition || null;
    if (monotributoCategory !== undefined) {
      user.monotributoCategory = monotributoCategory ? String(monotributoCategory).toUpperCase().slice(0, 2) : null;
    }
    if (monotributoAnnualLimit !== undefined) {
      const lim = Number(monotributoAnnualLimit);
      user.monotributoAnnualLimit = (!isFinite(lim) || lim <= 0) ? null : lim;
    }
    if (profession !== undefined) user.profession = profession || null;
    if (licenseNumber !== undefined) user.licenseNumber = licenseNumber || null;
    if (licenseCategory !== undefined) user.licenseCategory = licenseCategory || null;
    if (licenseExpiresAt !== undefined) {
      const d = licenseExpiresAt ? new Date(licenseExpiresAt) : null;
      user.licenseExpiresAt = d && !isNaN(d.getTime()) ? d : null;
    }
    if (monthlyBillingGoal !== undefined) {
      const goal = Number(monthlyBillingGoal);
      user.monthlyBillingGoal = (!isFinite(goal) || goal <= 0) ? null : goal;
    }
    await user.save();

    res.json({
      success: true,
      data: {
        fiscalCondition: user.fiscalCondition || null,
        monotributoCategory: user.monotributoCategory || null,
        monotributoAnnualLimit: user.monotributoAnnualLimit ? Number(user.monotributoAnnualLimit) : null,
        profession: user.profession || null,
        licenseNumber: user.licenseNumber || null,
        licenseCategory: user.licenseCategory || null,
        licenseExpiresAt: user.licenseExpiresAt || null,
        monthlyBillingGoal: user.monthlyBillingGoal ? Number(user.monthlyBillingGoal) : null,
      },
    });
  } catch (error: any) {
    console.error('Error saving fiscal config:', error);
    res.status(500).json({ success: false, message: error.message || 'Error al guardar la configuración fiscal' });
  }
});

/**
 * GET /api/membership/analytics/export.csv?year=YYYY
 * Exporta la facturación del año como CSV (para el contador). Solo SUPER PRO.
 */
router.get("/analytics/export.csv", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user.membershipTier !== 'super_pro') {
      res.status(403).json({ success: false, message: 'Exclusivo de miembros SUPER PRO' });
      return;
    }
    const userId = req.user.id || req.user._id?.toString();
    const { Contract } = await import('../models/sql/Contract.model.js');
    const { User } = await import('../models/sql/User.model.js');
    const { Job } = await import('../models/sql/Job.model.js');

    const now = new Date();
    const year = parseInt(String(req.query.year || now.getFullYear()), 10) || now.getFullYear();
    const num = (v: any): number => (typeof v === 'string' ? parseFloat(v) : Number(v)) || 0;

    const contracts: any[] = await Contract.findAll({
      where: { doerId: userId, status: 'completed' },
      include: [
        { model: User, as: 'client', attributes: ['id', 'name'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] },
      ],
      order: [['updatedAt', 'DESC']],
    });

    const facturado = (c: any): number => num(c.allocatedAmount) || num(c.price);
    const fechaDe = (c: any): Date => new Date(c.updatedAt || c.createdAt);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const header = ['Fecha', 'Cliente', 'Trabajo', 'Monto (ARS)', 'Comisión (ARS)'].map(esc).join(',');
    const lines = contracts
      .filter((c) => fechaDe(c).getFullYear() === year)
      .map((c) => {
        const d = fechaDe(c);
        return [
          esc(d.toLocaleDateString('es-AR')),
          esc(c.client?.name || 'Cliente'),
          esc(c.job?.title || ''),
          facturado(c).toFixed(2),
          num(c.commission).toFixed(2),
        ].join(',');
      });

    // UTF-8 BOM so Excel reads the accents correctly
    const csv = '﻿' + [header, ...lines].join('\r\n') + '\r\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="doapp-facturacion-${year}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ success: false, message: error.message || 'Error al exportar' });
  }
});

export default router;
