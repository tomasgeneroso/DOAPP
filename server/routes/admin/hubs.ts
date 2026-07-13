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
    const { Payment } = await import('../../models/sql/Payment.model.js');
    const { WithdrawalRequest } = await import('../../models/sql/WithdrawalRequest.model.js');
    const { Op } = await import('sequelize');
    let Dispute: any = null;
    try { Dispute = (await import('../../models/sql/Dispute.model.js')).Dispute; } catch { /* optional */ }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      paymentsToVerify,
      withdrawalsToProcess,
      workerPayoutsPending,
      openDisputes,
      totalRevenue,
      todayRevenue,
      escrowHeld,
      pendingWithdrawalsAmount,
    ] = await Promise.all([
      Payment.count({ where: { status: { [Op.in]: ['pending_verification', 'pending'] } } }),
      WithdrawalRequest.count({ where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } } }),
      Payment.count({ where: { status: 'confirmed_for_payout' } }),
      Dispute ? Dispute.count({ where: { status: { [Op.in]: ['open', 'in_review', 'awaiting_info'] } } }) : Promise.resolve(0),
      Payment.sum('amount', { where: { status: 'completed' } }),
      Payment.sum('amount', { where: { status: 'completed', createdAt: { [Op.gte]: startOfToday } } }),
      Payment.sum('amount', { where: { status: 'held_escrow' } }),
      WithdrawalRequest.sum('amount', { where: { status: { [Op.in]: ['pending', 'approved', 'processing'] } } }),
    ]);

    res.json({
      success: true,
      financial: {
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
