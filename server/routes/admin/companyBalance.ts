import express, { Response } from "express";
import { protect, authorize } from "../../middleware/auth.js";
import { AuthRequest } from "../../types/index.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Membership } from "../../models/sql/Membership.model.js";
import { WithdrawalRequest } from "../../models/sql/WithdrawalRequest.model.js";
import { Advertisement } from "../../models/sql/Advertisement.model.js";
import { Promoter } from "../../models/sql/Promoter.model.js";
import { Op } from 'sequelize';

const router = express.Router();

// Get company balance overview (Owner only)
router.get(
  "/overview",
  protect,
  authorize("owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Total revenue from commissions (all in ARS for Argentina)
      const completedContracts = await Contract.findAll({
        where: { status: "completed" },
        attributes: ["price", "commission", "updatedAt"],
      });

      let totalRevenueARS = 0;
      let monthlyRevenueARS = 0;

      for (const contract of completedContracts) {
        const commission = Number(contract.commission) || 0;
        totalRevenueARS += commission;
        if (contract.updatedAt && contract.updatedAt >= startOfMonth) {
          monthlyRevenueARS += commission;
        }
      }

      // Membership revenue
      const membershipPayments = await Payment.findAll({
        where: {
          status: "approved",
          [Op.or]: [
            { description: { [Op.iLike]: '%membership%' } },
            { description: { [Op.iLike]: '%membresía%' } },
            { paymentType: 'membership' }
          ]
        },
        attributes: ["amount", "currency", "amountUsd", "amountArs", "createdAt"],
      });

      let totalMembershipRevenueARS = 0;
      let totalMembershipRevenueUSD = 0;
      let monthlyMembershipRevenueARS = 0;
      let monthlyMembershipRevenueUSD = 0;

      for (const payment of membershipPayments) {
        // Use amountArs/amountUsd if available, otherwise use amount with currency
        const arsAmount = Number(payment.amountArs) || (payment.currency === 'ARS' ? Number(payment.amount) || 0 : 0);
        const usdAmount = Number(payment.amountUsd) || (payment.currency === 'USD' ? Number(payment.amount) || 0 : 0);

        totalMembershipRevenueARS += arsAmount;
        totalMembershipRevenueUSD += usdAmount;

        if (payment.createdAt >= startOfMonth) {
          monthlyMembershipRevenueARS += arsAmount;
          monthlyMembershipRevenueUSD += usdAmount;
        }
      }

      // Advertisement revenue
      const promoters = await Promoter.findAll({
        where: { status: { [Op.in]: ["active", "ended"] } },
        attributes: ["pricing", "analytics"],
      });

      let totalAdRevenueARS = 0;
      let totalAdRevenueUSD = 0;

      for (const promoter of promoters) {
        const totalPaid = Number(promoter.pricing?.totalPaid) || 0;
        if (promoter.pricing?.currency === "USD") {
          totalAdRevenueUSD += totalPaid;
        } else {
          totalAdRevenueARS += totalPaid;
        }
      }

      // Pending withdrawals (all in ARS)
      const pendingWithdrawals = await WithdrawalRequest.findAll({
        where: { status: { [Op.in]: ["pending", "approved", "processing"] } },
        attributes: ["amount"],
      });

      let pendingWithdrawalsARS = 0;

      for (const withdrawal of pendingWithdrawals) {
        pendingWithdrawalsARS += Number(withdrawal.amount) || 0;
      }

      // Active memberships count
      const activeMemberships = await Membership.count({
        where: { status: "active" },
      });

      const proMemberships = await Membership.count({
        where: { status: "active", plan: "PRO" },
      });

      const superProMemberships = await Membership.count({
        where: { status: "active", plan: "SUPER_PRO" },
      });

      // Active promoters
      const activePromoters = await Promoter.count({
        where: { status: "active", isEnabled: true },
      });

      // Calculate net balance (revenue - pending withdrawals)
      const netBalanceARS = totalRevenueARS + totalMembershipRevenueARS + totalAdRevenueARS - pendingWithdrawalsARS;
      const netBalanceUSD = totalMembershipRevenueUSD + totalAdRevenueUSD;

      res.json({
        revenue: {
          commissions: {
            totalARS: totalRevenueARS,
            totalUSD: 0,
            monthlyARS: monthlyRevenueARS,
            monthlyUSD: 0,
          },
          memberships: {
            totalARS: totalMembershipRevenueARS,
            totalUSD: totalMembershipRevenueUSD,
            monthlyARS: monthlyMembershipRevenueARS,
            monthlyUSD: monthlyMembershipRevenueUSD,
            activeCount: activeMemberships,
            proCount: proMemberships,
            superProCount: superProMemberships,
          },
          advertisements: {
            totalARS: totalAdRevenueARS,
            totalUSD: totalAdRevenueUSD,
            activePromotersCount: activePromoters,
          },
          total: {
            ARS: totalRevenueARS + totalMembershipRevenueARS + totalAdRevenueARS,
            USD: totalMembershipRevenueUSD + totalAdRevenueUSD,
          },
        },
        expenses: {
          pendingWithdrawals: {
            ARS: pendingWithdrawalsARS,
            USD: 0,
          },
        },
        netBalance: {
          ARS: netBalanceARS,
          USD: netBalanceUSD,
        },
      });
    } catch (error) {
      console.error("Error fetching company balance:", error);
      res.status(500).json({ message: "Error al obtener balance de empresa" });
    }
  }
);

// Get detailed revenue breakdown (Owner only)
router.get(
  "/revenue-breakdown",
  protect,
  authorize("owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      const where: any = { status: "completed" };

      if (startDate || endDate) {
        where.updatedAt = {};
        if (startDate) where.updatedAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.updatedAt[Op.lte] = new Date(endDate as string);
      }

      const contracts = await Contract.findAll({
        where,
        attributes: ["id", "price", "commission", "updatedAt"],
        include: [
          { association: "client", attributes: ["name", "email"] },
          { association: "doer", attributes: ["name", "email"] },
          { association: "job", attributes: ["title"] },
        ],
        order: [["updatedAt", "DESC"]],
      });

      const breakdown = contracts.map((contract: any) => ({
        contractId: contract.id,
        title: contract.job?.title || 'Sin título',
        client: contract.client,
        doer: contract.doer,
        contractValue: contract.price,
        currency: 'ARS',
        commission: contract.commission,
        commissionPercentage: ((contract.commission || 0) / contract.price) * 100,
        completedAt: contract.updatedAt,
      }));

      res.json({ breakdown });
    } catch (error) {
      console.error("Error fetching revenue breakdown:", error);
      res.status(500).json({ message: "Error al obtener desglose de ingresos" });
    }
  }
);

// Get monthly revenue trends (Owner only)
router.get(
  "/trends",
  protect,
  authorize("owner"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { months = 12 } = req.query;

      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - Number(months));

      // Aggregate contracts by month - TODO: implement with Sequelize raw query
      const contractRevenue: any[] = [];

      // Aggregate membership payments by month - TODO: implement with Sequelize raw query
      const membershipRevenue: any[] = [];

      res.json({
        contractRevenue,
        membershipRevenue,
      });
    } catch (error) {
      console.error("Error fetching revenue trends:", error);
      res.status(500).json({ message: "Error al obtener tendencias de ingresos" });
    }
  }
);

// Get all financial transactions/movements (Owner/Admin only)
router.get(
  "/transactions",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { page = 1, limit = 50, type, status, startDate, endDate } = req.query;

      // Build query
      const query: any = {};

      if (type && type !== 'all') {
        query.paymentType = type;
      }

      if (status && status !== 'all') {
        query.status = status;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate as string);
        if (endDate) query.createdAt.$lte = new Date(endDate as string);
      }

      const offset = (Number(page) - 1) * Number(limit);

      // Build where clause
      const where: any = {};
      if (type && type !== 'all') where.paymentType = type;
      if (status && status !== 'all') where.status = status;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
      }

      // Get payments with contract and user details
      const payments = await Payment.findAll({
        where,
        include: [
          { association: 'payer', attributes: ['name', 'email'] },
          { association: 'recipient', attributes: ['name', 'email'] },
          {
            association: 'contract',
            attributes: ['price', 'commission', 'status'],
            include: [
              { association: 'client', attributes: ['name', 'email'] },
              { association: 'doer', attributes: ['name', 'email'] },
              { association: 'job', attributes: ['title'] }
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        offset,
        limit: Number(limit),
      });

      // Filter out mockup transactions (exclude @example.com and @test.com emails)
      const realPayments = payments.filter((payment: any) => {
        const payerEmail = payment.payer?.email || '';
        const recipientEmail = payment.recipient?.email || '';

        const isMockup =
          payerEmail.endsWith('@example.com') ||
          payerEmail.endsWith('@test.com') ||
          recipientEmail.endsWith('@example.com') ||
          recipientEmail.endsWith('@test.com');

        return !isMockup;
      });

      const total = realPayments.length;

      // Format transactions (only real user transactions)
      const transactions = realPayments.map((payment: any) => {
        const contract = payment.contract;

        return {
          id: payment.id,
          date: payment.createdAt,
          type: payment.paymentType,
          status: payment.status,

          // Amounts
          totalAmount: payment.amount || payment.amountARS || payment.amountUSD || 0,
          currency: payment.currency || 'ARS',

          // Commission details
          platformFee: payment.platformFee || 0,
          platformFeePercentage: payment.platformFeePercentage || 0,

          // Contract details
          contract: contract ? {
            id: contract.id,
            title: contract.job?.title || 'Sin título',
            price: contract.price,
            currency: 'ARS',
            commission: contract.commission,
            status: contract.status,
            client: contract.client,
            doer: contract.doer
          } : null,

          // Payment details
          payer: payment.payer,
          recipient: payment.recipient,

          // Escrow details
          isEscrow: payment.isEscrow,
          escrowReleased: payment.status === 'released' || payment.status === 'completed',

          // Payment IDs
          paypalOrderId: payment.paypalOrderId,
          paypalCaptureId: payment.paypalCaptureId,
          mercadopagoPaymentId: payment.mercadopagoPaymentId,

          // Description
          description: payment.description,

          // Refund info
          refundedAt: payment.refundedAt,
          refundAmount: payment.refundAmount
        };
      });

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener transacciones"
      });
    }
  }
);

// Get transaction statistics (Owner/Admin only)
router.get(
  "/transaction-stats",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Total transactions by type - TODO: implement with Sequelize raw query
      const totalByType: any[] = [];

      // Escrow stats
      const escrowHeld = await Payment.count({
        where: { isEscrow: true, status: "held_escrow" }
      });

      // Escrow total - TODO: implement with Sequelize raw query
      const escrowTotal: any[] = [];

      // Recent activity (last 30 days)
      const recentTransactions = await Payment.count({
        where: { createdAt: { [Op.gte]: thirtyDaysAgo } }
      });

      // Recent revenue - TODO: implement with Sequelize raw query
      const recentRevenue: any[] = [];

      res.json({
        success: true,
        data: {
          totalByType,
          escrow: {
            held: escrowHeld,
            totals: escrowTotal
          },
          recent: {
            transactions: recentTransactions,
            revenue: recentRevenue[0]?.total || 0
          }
        }
      });
    } catch (error) {
      console.error("Error fetching transaction stats:", error);
      res.status(500).json({
        success: false,
        message: "Error al obtener estadísticas"
      });
    }
  }
);

export default router;
