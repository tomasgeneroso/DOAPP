import express, { Response } from "express";
import { protect, AuthRequest } from "../middleware/auth.js";
import { BalanceTransaction } from "../models/sql/BalanceTransaction.model.js";
import { User } from "../models/sql/User.model.js";
import { WithdrawalRequest } from "../models/sql/WithdrawalRequest.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';

const router = express.Router();

/**
 * Get user balance
 * GET /api/balance
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['balance']
    });

    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    res.status(200).json({
      success: true,
      balance: user.balance || 0
    });
  } catch (error: any) {
    console.error("Error fetching balance:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener saldo"
    });
  }
});

/**
 * Get balance transaction history
 * GET /api/balance/transactions
 * Query params: limit, offset, type
 */
router.get("/transactions", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, type } = req.query;

    const where: any = { userId };

    if (type && typeof type === 'string') {
      where.type = type;
    }

    const transactions = await BalanceTransaction.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
      include: [
        {
          model: Contract,
          as: 'relatedContract',
          attributes: ['price', 'status']
        },
        {
          model: Payment,
          as: 'relatedPayment',
          attributes: ['amount', 'status']
        }
      ]
    });

    const totalCount = await BalanceTransaction.count({ where });

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        total: totalCount,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < totalCount
      }
    });
  } catch (error: any) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener transacciones"
    });
  }
});

/**
 * Get balance summary stats
 * GET /api/balance/summary
 */
router.get("/summary", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['balance']
    });
    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    // Calculate totals by type using raw SQL aggregation
    const stats = await sequelize.query(
      `SELECT type, SUM(amount) as total, COUNT(*) as count
       FROM "BalanceTransactions"
       WHERE "userId" = :userId
       GROUP BY type`,
      {
        replacements: { userId },
        type: sequelize.QueryTypes.SELECT as any
      }
    ) as Array<{ type: string; total: number; count: number }>;

    // Get recent transactions (last 5)
    const recentTransactions = await BalanceTransaction.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 5,
      include: [
        {
          model: Contract,
          as: 'relatedContract',
          attributes: ['price', 'status']
        }
      ]
    });

    const summary = {
      currentBalance: user.balance,
      totalRefunds: stats.find((s: any) => s.type === 'refund')?.total || 0,
      totalPayments: Math.abs(stats.find((s: any) => s.type === 'payment')?.total || 0),
      totalBonuses: stats.find((s: any) => s.type === 'bonus')?.total || 0,
      totalAdjustments: stats.find((s: any) => s.type === 'adjustment')?.total || 0,
      transactionCount: stats.reduce((sum: number, s: any) => sum + Number(s.count), 0),
      recentTransactions
    };

    res.status(200).json({
      success: true,
      summary
    });
  } catch (error: any) {
    console.error("Error fetching balance summary:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener resumen"
    });
  }
});

/**
 * Request withdrawal
 * POST /api/balance/withdraw
 */
router.post("/withdraw", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { amount, bankingInfo } = req.body;

    // Validations
    if (!amount || amount < 1000) {
      res.status(400).json({
        success: false,
        message: "El monto mínimo de retiro es $1,000 ARS"
      });
      return;
    }

    if (!bankingInfo || !bankingInfo.accountHolder || !bankingInfo.bankName || !bankingInfo.cbu) {
      res.status(400).json({
        success: false,
        message: "Información bancaria incompleta"
      });
      return;
    }

    if (bankingInfo.cbu.length !== 22) {
      res.status(400).json({
        success: false,
        message: "El CBU debe tener exactamente 22 dígitos"
      });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    // Check balance
    if (user.balance < amount) {
      res.status(400).json({
        success: false,
        message: `Saldo insuficiente. Saldo disponible: $${user.balance.toLocaleString("es-AR")}`
      });
      return;
    }

    // Check for pending withdrawals
    const pendingWithdrawals = await WithdrawalRequest.count({
      where: {
        userId,
        status: { [Op.in]: ['pending', 'approved', 'processing'] }
      }
    });

    if (pendingWithdrawals > 0) {
      res.status(400).json({
        success: false,
        message: "Ya tienes una solicitud de retiro pendiente. Por favor espera a que se procese."
      });
      return;
    }

    // Create withdrawal request
    const withdrawal = await WithdrawalRequest.create({
      userId,
      amount,
      bankingInfo: {
        accountHolder: bankingInfo.accountHolder,
        bankName: bankingInfo.bankName,
        accountType: bankingInfo.accountType || 'savings',
        cbu: bankingInfo.cbu,
        alias: bankingInfo.alias,
      },
      status: 'pending',
      balanceBeforeWithdrawal: user.balance,
      balanceAfterWithdrawal: user.balance - amount,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    });

    // Send email notification
    const emailService = (await import('../services/email.js')).default;
    await emailService.sendWithdrawalRequested(user.email, user.name, amount);

    // Send push notification
    const fcmService = (await import('../services/fcm.js')).default;
    await fcmService.sendToUser(userId.toString(), {
      title: 'Solicitud de Retiro Recibida',
      body: `Tu solicitud de retiro por $${amount.toLocaleString("es-AR")} está siendo procesada.`,
      data: { type: 'withdrawal_requested', withdrawalId: withdrawal.id.toString() }
    });

    res.status(201).json({
      success: true,
      message: "Solicitud de retiro creada exitosamente. Será procesada en 24-48 horas.",
      withdrawal
    });
  } catch (error: any) {
    console.error("Error creating withdrawal request:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear solicitud de retiro"
    });
  }
});

/**
 * Get user's withdrawal requests
 * GET /api/balance/withdrawals
 */
router.get("/withdrawals", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, status } = req.query;

    const where: any = { userId };
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const withdrawals = await WithdrawalRequest.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
      include: [
        {
          model: User,
          as: 'processedBy',
          attributes: ['name', 'email']
        }
      ]
    });

    const totalCount = await WithdrawalRequest.count({ where });

    res.status(200).json({
      success: true,
      withdrawals,
      pagination: {
        total: totalCount,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < totalCount
      }
    });
  } catch (error: any) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener retiros"
    });
  }
});

/**
 * Cancel withdrawal request
 * POST /api/balance/withdrawals/:id/cancel
 */
router.post("/withdrawals/:id/cancel", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const withdrawal = await WithdrawalRequest.findOne({
      where: { id, userId }
    });

    if (!withdrawal) {
      res.status(404).json({ success: false, message: "Solicitud de retiro no encontrada" });
      return;
    }

    if (withdrawal.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: "Solo puedes cancelar solicitudes pendientes"
      });
      return;
    }

    withdrawal.status = 'cancelled';
    await withdrawal.save();

    res.status(200).json({
      success: true,
      message: "Solicitud de retiro cancelada",
      withdrawal
    });
  } catch (error: any) {
    console.error("Error cancelling withdrawal:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al cancelar retiro"
    });
  }
});

export default router;
