import { Router, Response } from 'express';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';

const router = Router();

// Protección: solo admin/owner
router.use(protect, authorize('admin', 'owner', 'support'));

/**
 * HUB STRUCTURE (sin perder funciones, agrupando por contexto):
 *
 * 1. MODERATION HUB (/admin/hubs/moderation)
 *    - Disputes (open, in_review, awaiting_info)
 *    - Tickets (open, pending)
 *    - User Reports (banned, flagged content)
 *    - Quick actions: Ban user, Close ticket, Resolve dispute
 *
 * 2. FINANCIAL HUB (/admin/hubs/financial)
 *    - Payments (pending → verified → held_escrow → confirmed)
 *    - Withdrawals (pending → approved → processing → completed)
 *    - Balance (daily, transactions, summary)
 *    - Company Balance (revenue breakdown)
 *
 * 3. GROWTH HUB (/admin/hubs/growth)
 *    - Analytics (overview, users, contracts, tickets)
 *    - Marketing (campaigns, ads, referrals)
 *    - Search trends (top jobs, skills)
 *    - Blog/Content moderation
 *
 * 4. SETTINGS (unchanged routes, grouped)
 *    - Users management
 *    - Roles & Permissions
 *    - Security
 *    - Modules
 */

/**
 * GET /api/admin/hubs/moderation/overview
 * Dashboard rápido: disputas/tickets urgentes
 */
router.get('/moderation/overview', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { Dispute } = await import('../../models/sql/Dispute.model.js');
    const { Ticket } = await import('../../models/sql/Ticket.model.js');

    const [disputes, tickets] = await Promise.all([
      Dispute.findAll({ where: { status: ['open', 'in_review', 'awaiting_info'] }, limit: 10 }),
      Ticket.findAll({ where: { status: ['open', 'pending'] }, limit: 10 }),
    ]);

    res.json({
      success: true,
      moderation: {
        disputeCount: disputes.length,
        ticketCount: tickets.length,
        disputes: disputes.map((d: any) => ({
          id: d.id,
          status: d.status,
          createdAt: d.createdAt,
          category: d.category,
        })),
        tickets: tickets.map((t: any) => ({
          id: t.id,
          status: t.status,
          createdAt: t.createdAt,
          category: t.category,
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/hubs/financial/overview
 * Dashboard rápido: pagos, retiros, balance
 */
router.get('/financial/overview', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { Payment, RESOLVED_PAYMENT_STATUSES } = await import('../../models/sql/Payment.model.js');
    const { WithdrawalRequest } = await import('../../models/sql/WithdrawalRequest.model.js');
    const { Op } = await import('sequelize');
    let Dispute: any = null;
    try { Dispute = (await import('../../models/sql/Dispute.model.js')).Dispute; } catch { /* optional */ }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { Contract } = await import('../../models/sql/Contract.model.js');

    const [
      paymentsToVerify,
      withdrawalsToProcess,
      workerPayoutsPending,
      openDisputes,
      totalRevenue,
      todayRevenue,
      escrowHeld,
      pendingWithdrawalsAmount,
      // Contracargos abiertos y retenciones por fraude. Van primero en la
      // respuesta porque son lo único de este panel que tiene reloj: un
      // contracargo vence, y vencido no se puede hacer nada.
      contracargosAbiertos,
      montoEnContracargo,
      retencionesPorFraude,
    ] = await Promise.all([
      // Same rule as the Pendiente Verificacion tab, or the badge and the
      // list it points at report different numbers.
      Payment.count({ where: { status: { [Op.notIn]: RESOLVED_PAYMENT_STATUSES } } }),
      WithdrawalRequest.count({ where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } } }),
      Payment.count({ where: { status: 'confirmed_for_payout' } }),
      Dispute ? Dispute.count({ where: { status: { [Op.in]: ['open', 'in_review', 'awaiting_info'] } } }) : Promise.resolve(0),
      Payment.sum('amount', { where: { status: 'completed' } }),
      Payment.sum('amount', { where: { status: 'completed', createdAt: { [Op.gte]: startOfToday } } }),
      Payment.sum('amount', { where: { status: 'held_escrow' } }),
      WithdrawalRequest.sum('amount', { where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } } }),
      Payment.count({ where: { status: 'disputed' } }),
      Payment.sum('amount', { where: { status: 'disputed' } }),
      Contract.count({
        where: { fraudHoldAt: { [Op.ne]: null }, fraudHoldClearedAt: { [Op.is]: null } } as any,
      }),
    ]);

    res.json({
      success: true,
      /**
       * Lo urgente va aparte del resto, no mezclado entre los contadores.
       *
       * Un pago por verificar espera; un contracargo, no. MercadoPago da una
       * fecha límite para presentar el descargo y vencida no hay nada que
       * hacer: se pierde el dinero aunque el trabajo se haya hecho y aunque la
       * evidencia esté completa.
       *
       * Por eso sale como bloque propio y con `hayUrgente`, para que la
       * interfaz pueda mostrarlo arriba de todo en vez de dejarlo como un
       * número más entre ocho.
       */
      urgente: {
        hayUrgente: contracargosAbiertos > 0 || retencionesPorFraude > 0,
        contracargosAbiertos,
        montoEnContracargoARS: montoEnContracargo || 0,
        retencionesPorFraude,
      },
      financial: {
        contracargosAbiertos,
        retencionesPorFraude,
        // Bandeja de pendientes (counts)
        paymentsToVerify,
        withdrawalsToProcess,
        workerPayoutsPending,
        openDisputes,
        // KPIs (amounts)
        totalRevenueARS: totalRevenue || 0,
        todayRevenue: todayRevenue || 0,
        escrowHeldARS: escrowHeld || 0,
        pendingWithdrawalsARS: pendingWithdrawalsAmount || 0,
        // Back-compat
        pendingPayments: paymentsToVerify,
        pendingWithdrawals: withdrawalsToProcess,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/hubs/growth/overview
 * Dashboard rápido: usuarios, contratos, tendencias
 */
/**
 * GET /api/admin/hubs/chargebacks
 * Los contracargos y retenciones abiertos, ordenados por urgencia.
 *
 * Es el único panel de la plataforma donde el orden lo decide un vencimiento y
 * no una fecha de creación. Un contracargo que vence mañana va arriba de uno
 * que entró antes pero vence la semana que viene: lo que importa no es hace
 * cuánto llegó, es cuánto queda.
 */
router.get('/chargebacks', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { Payment } = await import('../../models/sql/Payment.model.js');
    const { Contract } = await import('../../models/sql/Contract.model.js');
    const { AuditLog } = await import('../../models/sql/AuditLog.model.js');
    const { leerMetadata } = await import('../../utils/auditLog.js');
    const { Op } = await import('sequelize');

    const pagos = await Payment.findAll({
      where: { status: 'disputed' },
      order: [['updatedAt', 'DESC']],
      limit: 200,
    });

    // La fecha límite la guardó el webhook en el asiento del contracargo: es
    // el único lugar donde vive, porque MercadoPago la da por caso y no por pago.
    const asientos = await AuditLog.findAll({
      where: { action: { [Op.in]: ['CHARGEBACK_RECEIVED', 'FRAUD_ALERT_RECEIVED'] } } as any,
      order: [['createdAt', 'DESC']],
      limit: 500,
    });

    const infoPorPago = new Map<string, any>();
    for (const a of asientos as any[]) {
      const m = leerMetadata(a) || {};
      const idPago = m.paymentId ? String(m.paymentId) : null;
      // Se queda con el más reciente de cada pago: los asientos vienen
      // ordenados, así que el primero que aparece es el que vale.
      if (idPago && !infoPorPago.has(idPago)) {
        infoPorPago.set(idPago, {
          fechaLimite: m.fechaLimite || null,
          idExterno: m.idExterno || null,
          tipo: m.tipo || null,
          recibidoEl: a.createdAt,
        });
      }
    }

    const ahora = Date.now();

    const filas = pagos.map((p: any) => {
      const info = infoPorPago.get(String(p.id)) || {};
      const limite = info.fechaLimite ? new Date(info.fechaLimite) : null;
      const horasRestantes = limite
        ? Math.round((limite.getTime() - ahora) / 3_600_000)
        : null;

      return {
        paymentId: p.id,
        contractId: p.contractId,
        monto: Number(p.amount) || 0,
        moneda: p.currency || 'ARS',
        idPagoMercadoPago: p.mercadopagoPaymentId,
        idContracargo: info.idExterno || null,
        tipo: info.tipo || 'contracargo',
        recibidoEl: info.recibidoEl || p.updatedAt,
        fechaLimite: info.fechaLimite || null,
        horasRestantes,
        // Sin fecha conocida se trata como urgente: no saber cuánto queda es
        // peor que saber que queda poco.
        vencido: horasRestantes !== null && horasRestantes <= 0,
        urgente: horasRestantes === null || horasRestantes <= 48,
        evidencia: p.contractId ? `/api/contracts/${p.contractId}/evidence?format=pdf` : null,
      };
    });

    // Primero lo que vence antes. Lo que no tiene fecha va al frente porque
    // hay que averiguarla antes de que sea tarde.
    filas.sort((a, b) => {
      if (a.horasRestantes === null) return -1;
      if (b.horasRestantes === null) return 1;
      return a.horasRestantes - b.horasRestantes;
    });

    const retenciones = await Contract.findAll({
      where: { fraudHoldAt: { [Op.ne]: null }, fraudHoldClearedAt: { [Op.is]: null } } as any,
      order: [['fraudHoldAt', 'ASC']],
      limit: 100,
    });

    res.json({
      success: true,
      contracargos: filas,
      retencionesPorFraude: retenciones.map((c: any) => ({
        contractId: c.id,
        monto: Number(c.price) || 0,
        retenidoEl: c.fraudHoldAt,
        motivo: c.fraudHoldReason,
      })),
      resumen: {
        total: filas.length,
        urgentes: filas.filter((f) => f.urgente && !f.vencido).length,
        vencidos: filas.filter((f) => f.vencido).length,
        montoTotal: filas.reduce((t, f) => t + f.monto, 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/growth/overview', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { User } = await import('../../models/sql/User.model.js');
    const { Contract } = await import('../../models/sql/Contract.model.js');
    const { Job } = await import('../../models/sql/Job.model.js');

    const [userCount, contractCount, jobCount] = await Promise.all([
      User.count(),
      Contract.count({ where: { status: 'completed' } }),
      Job.count({ where: { status: 'open' } }),
    ]);

    res.json({
      success: true,
      growth: {
        totalUsers: userCount,
        completedContracts: contractCount,
        openJobs: jobCount,
        thisMonthSignups: 0, // TODO: calculate
        conversionRate: contractCount > 0 ? ((contractCount / jobCount) * 100).toFixed(1) : 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/admin/hubs/structure
 * Devuelve la estructura de rutas para renderizar sidebar dinámicamente
 */
router.get('/structure', (_req: AuthRequest, res: Response): void => {
  const structure = {
    hubs: [
      {
        id: 'moderation',
        label: '🚨 Moderation Hub',
        icon: 'AlertTriangle',
        sections: [
          { path: '/admin/disputes', label: 'Disputes', icon: 'AlertCircle' },
          { path: '/admin/tickets', label: 'Tickets', icon: 'MessageSquare' },
          // Original routes, just grouped
        ],
      },
      {
        id: 'financial',
        label: '💰 Financial Hub',
        icon: 'DollarSign',
        sections: [
          { path: '/admin/payments', label: 'Payments', icon: 'CreditCard' },
          { path: '/admin/withdrawals', label: 'Withdrawals', icon: 'Send' },
          { path: '/admin/company-balance', label: 'Company Balance', icon: 'TrendingUp' },
          { path: '/admin/financial-transactions', label: 'Transactions', icon: 'Activity' },
        ],
      },
      {
        id: 'growth',
        label: '📈 Growth Hub',
        icon: 'TrendingUp',
        sections: [
          { path: '/admin/analytics', label: 'Analytics', icon: 'BarChart3' },
          { path: '/admin/marketing', label: 'Marketing', icon: 'Zap' },
          { path: '/admin/blogs', label: 'Content', icon: 'FileText' },
        ],
      },
    ],
    settings: [
      { path: '/admin/users', label: 'Users', icon: 'Users' },
      { path: '/admin/roles', label: 'Roles & Permissions', icon: 'Shield' },
      { path: '/admin/security', label: 'Security', icon: 'Lock' },
      { path: '/admin/modules', label: 'Modules', icon: 'Sliders' },
    ],
  };

  res.json({ success: true, structure });
});

export default router;
