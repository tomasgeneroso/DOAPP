import express, { Response } from "express";
import { protect, requireKyc, AuthRequest } from "../middleware/auth.js";
import { MINIMUM_WITHDRAWAL_ARS } from "../../shared/pricing/minimums.js";
import { BalanceTransaction } from "../models/sql/BalanceTransaction.model.js";
import { User } from "../models/sql/User.model.js";
import { WithdrawalRequest } from "../models/sql/WithdrawalRequest.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Payment } from "../models/sql/Payment.model.js";
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { getProcessingFeeRate } from '../../shared/pricing/processingCost.js';

const router = express.Router();

/**
 * Get user balance
 * GET /api/balance
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['balanceArs']
    });

    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    res.status(200).json({
      success: true,
      balance: user.balanceArs || 0
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
          attributes: ['amount', 'status', 'paymentTypeId', 'paymentMethodId', 'cardLastFourDigits', 'cardBrand', 'paymentMethod']
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
      attributes: ['balanceArs']
    });
    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    // Calculate totals by type using raw SQL aggregation
    const { QueryTypes } = await import('sequelize');
    const stats = await (sequelize as any).query(
      `SELECT type, SUM(amount) as total, COUNT(*) as count
       FROM "balance_transactions"
       WHERE "user_id" = :userId
       GROUP BY type`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
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
      currentBalance: user.balanceArs,
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
router.post("/withdraw", protect, requireKyc, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { bankingInfo } = req.body;

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

    // Retiro "todo o nada": se retira SIEMPRE el saldo completo disponible (mín $1,000 ARS).
    const amount = Number(user.balanceArs) || 0;
    if (amount < MINIMUM_WITHDRAWAL_ARS) {
      res.status(400).json({
        success: false,
        message: `El monto mínimo de retiro es $${MINIMUM_WITHDRAWAL_ARS.toLocaleString("es-AR")} ARS. Tu saldo disponible es $${amount.toLocaleString("es-AR")}.`
      });
      return;
    }

    // ============================================
    // COSTO DE PASARELA SOBRE EL SALDO DEVUELTO
    // ============================================
    // El saldo que viene de una cotización menor al precio publicado no se ganó
    // trabajando: es plata que el cliente ya pagó y que vuelve. Sacarla de la
    // Plataforma cuesta una operación en la pasarela, y ese costo no lo puede
    // absorber DOAPP: no cobró comisión alguna sobre esa diferencia.
    //
    // Usarla dentro de la app es gratis. Retirarla tiene este costo, y el
    // usuario decide.
    //
    // El retiro es todo o nada, así que vacía el saldo: los créditos posteriores
    // al último retiro son exactamente la porción devuelta del saldo actual.
    const ultimoRetiro = await WithdrawalRequest.findOne({
      where: { userId, status: { [Op.in]: ['completed', 'processing', 'approved'] } },
      order: [['createdAt', 'DESC']],
    });

    const creditosDevueltos = await BalanceTransaction.sum('amount', {
      where: {
        userId,
        type: 'refund',
        ...(ultimoRetiro ? { createdAt: { [Op.gt]: (ultimoRetiro as any).createdAt } } : {}),
        [Op.and]: [{ 'metadata.origen': 'cotizacion_menor' } as any],
      },
    });

    // No puede superar el saldo: si el usuario ya gastó parte del crédito dentro
    // de la app, esa parte no se retira y no puede cobrar costo.
    const porcionDevuelta = Math.min(Number(creditosDevueltos) || 0, amount);
    const costoPasarela =
      porcionDevuelta > 0
        ? Math.round(porcionDevuelta * getProcessingFeeRate() * 100) / 100
        : 0;

    if (costoPasarela > 0 && req.body.aceptaCostoPasarela !== true) {
      res.status(409).json({
        success: false,
        requiereConfirmacion: true,
        message:
          `De tu saldo, $${porcionDevuelta.toLocaleString('es-AR')} corresponden a una devolución por ` +
          `una cotización menor al precio publicado. Transferirlos al banco tiene un costo de ` +
          `$${costoPasarela.toLocaleString('es-AR')} que cobra la pasarela de pago. ` +
          `Si preferís, ese saldo queda disponible en la app sin costo alguno.`,
        detalle: {
          saldoTotal: amount,
          porcionDevuelta,
          costoPasarela,
          recibirias: Math.round((amount - costoPasarela) * 100) / 100,
        },
      });
      return;
    }

    const montoATransferir = Math.round((amount - costoPasarela) * 100) / 100;

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
      // Se transfiere el saldo menos el costo de pasarela sobre la parte
      // devuelta. El saldo se debita completo: el costo se pagó, no se perdió.
      amount: montoATransferir,
      bankingInfo: {
        accountHolder: bankingInfo.accountHolder,
        bankName: bankingInfo.bankName,
        accountType: bankingInfo.accountType || 'savings',
        cbu: bankingInfo.cbu,
        alias: bankingInfo.alias,
      },
      status: 'pending',
      balanceBeforeWithdrawal: user.balanceArs,
      balanceAfterWithdrawal: 0,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        saldoDebitado: amount,
        porcionDevuelta,
        costoPasarela,
      }
    });

    // Send email notification
    const emailService = (await import('../services/email.js')).default;
    await emailService.sendWithdrawalRequested(user.email, user.name, amount);

    // Send push notification
    const fcmService = (await import('../services/fcm.js')).default;
    await fcmService.sendToUser({
      userId: userId.toString(),
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
          as: 'processor',
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
