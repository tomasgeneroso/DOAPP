import express, { Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { WithdrawalRequest } from "../../models/sql/WithdrawalRequest.model.js";
import { User } from "../../models/sql/User.model.js";
import { BalanceTransaction } from "../../models/sql/BalanceTransaction.model.js";
import emailService from "../../services/email.js";
import fcmService from "../../services/fcm.js";
import { Op } from 'sequelize';

const router = express.Router();

/**
 * Get all withdrawal requests (admin)
 * GET /api/admin/withdrawals
 */
router.get("/", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 50, offset = 0, status } = req.query;

    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const { rows: withdrawals, count: totalCount } = await WithdrawalRequest.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['name', 'email', 'avatar', 'balanceArs'] },
        { model: User, as: 'processedBy', attributes: ['name', 'email'] }
      ]
    });

    // Statistics
    const allWithdrawals = await WithdrawalRequest.findAll({
      attributes: ['status', 'amount']
    });

    const stats = allWithdrawals.reduce((acc: any[], w) => {
      const existing = acc.find(s => s._id === w.status);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += w.amount;
      } else {
        acc.push({ _id: w.status, count: 1, totalAmount: w.amount });
      }
      return acc;
    }, []);

    res.status(200).json({
      success: true,
      withdrawals,
      pagination: {
        total: totalCount,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < totalCount
      },
      stats
    });
  } catch (error: any) {
    console.error("Error fetching withdrawals (admin):", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener retiros"
    });
  }
});

/**
 * Approve withdrawal request
 * POST /api/admin/withdrawals/:id/approve
 */
router.post("/:id/approve", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;
    const adminId = req.user.id;

    const withdrawal = await WithdrawalRequest.findByPk(id, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      res.status(404).json({ success: false, message: "Solicitud no encontrada" });
      return;
    }

    if (withdrawal.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: "Solo puedes aprobar solicitudes pendientes"
      });
      return;
    }

    await withdrawal.update({
      status: 'approved',
      processedAt: new Date(),
      processedBy: adminId,
      ...(adminNotes && { adminNotes })
    });

    // Send email notification
    const user = withdrawal.user as any;
    await emailService.sendWithdrawalApproved(user.email, user.name, withdrawal.amount);

    // Send push notification
    const userId = typeof user === 'object' && 'id' in user ? user.id : user;
    await fcmService.sendToUser(userId.toString(), {
      title: 'Retiro Aprobado',
      body: `Tu retiro de $${withdrawal.amount.toLocaleString("es-AR")} ha sido aprobado y será procesado pronto.`,
      data: { type: 'withdrawal_approved', withdrawalId: withdrawal.id.toString() }
    });

    res.status(200).json({
      success: true,
      message: "Retiro aprobado. Procede con la transferencia bancaria.",
      withdrawal
    });
  } catch (error: any) {
    console.error("Error approving withdrawal:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al aprobar retiro"
    });
  }
});

/**
 * Mark withdrawal as processing
 * POST /api/admin/withdrawals/:id/processing
 */
router.post("/:id/processing", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const withdrawal = await WithdrawalRequest.findByPk(id, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      res.status(404).json({ success: false, message: "Solicitud no encontrada" });
      return;
    }

    if (withdrawal.status !== 'approved') {
      res.status(400).json({
        success: false,
        message: "Solo puedes procesar retiros aprobados"
      });
      return;
    }

    await withdrawal.update({
      status: 'processing',
      processedBy: adminId
    });

    res.status(200).json({
      success: true,
      message: "Retiro marcado como en proceso",
      withdrawal
    });
  } catch (error: any) {
    console.error("Error updating withdrawal status:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al actualizar estado"
    });
  }
});

/**
 * Complete withdrawal (mark as transferred)
 * POST /api/admin/withdrawals/:id/complete
 */
router.post("/:id/complete", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { proofOfTransfer, adminNotes } = req.body;
    const adminId = req.user.id;

    const withdrawal = await WithdrawalRequest.findByPk(id, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      res.status(404).json({ success: false, message: "Solicitud no encontrada" });
      return;
    }

    if (!['approved', 'processing'].includes(withdrawal.status)) {
      res.status(400).json({
        success: false,
        message: "Estado inválido para completar"
      });
      return;
    }

    const userId = typeof withdrawal.user === 'object' ? withdrawal.user.id : withdrawal.user;
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    // Deduct balance
    const balanceBefore = parseFloat(user.balanceArs as any) || 0;
    const newBalance = balanceBefore - withdrawal.amount;

    if (newBalance < 0) {
      res.status(400).json({
        success: false,
        message: "Balance insuficiente para completar el retiro"
      });
      return;
    }

    await user.update({ balanceArs: newBalance });

    // Create balance transaction
    const transaction = await BalanceTransaction.create({
      user: user.id,
      type: 'withdrawal',
      amount: -withdrawal.amount,
      balanceBefore,
      balanceAfter: newBalance,
      description: `Retiro a cuenta bancaria (${withdrawal.bankingInfo.bankName})`,
      metadata: {
        withdrawalId: withdrawal.id,
        bankingInfo: withdrawal.bankingInfo,
        proofOfTransfer
      },
      status: 'completed'
    });

    // Update withdrawal
    await withdrawal.update({
      status: 'completed',
      completedAt: new Date(),
      processedBy: adminId,
      transactionId: transaction.id,
      ...(proofOfTransfer && { proofOfTransfer }),
      ...(adminNotes && { adminNotes })
    });

    // Send email notification
    const userObj = withdrawal.user as any;
    await emailService.sendWithdrawalCompleted(userObj.email, userObj.name, withdrawal.amount, newBalance);

    // Send push notification
    await fcmService.sendToUser(userId.toString(), {
      title: 'Retiro Completado',
      body: `Tu retiro de $${withdrawal.amount.toLocaleString("es-AR")} ha sido transferido exitosamente.`,
      data: { type: 'withdrawal_completed', withdrawalId: withdrawal.id.toString() }
    });

    res.status(200).json({
      success: true,
      message: "Retiro completado y balance actualizado",
      withdrawal,
      transaction,
      newBalance
    });
  } catch (error: any) {
    console.error("Error completing withdrawal:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al completar retiro"
    });
  }
});

/**
 * Reject withdrawal request
 * POST /api/admin/withdrawals/:id/reject
 */
router.post("/:id/reject", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.id;

    if (!rejectionReason) {
      res.status(400).json({
        success: false,
        message: "Debes proporcionar una razón de rechazo"
      });
      return;
    }

    const withdrawal = await WithdrawalRequest.findByPk(id, {
      include: [{ model: User, as: 'user' }]
    });

    if (!withdrawal) {
      res.status(404).json({ success: false, message: "Solicitud no encontrada" });
      return;
    }

    if (!['pending', 'approved'].includes(withdrawal.status)) {
      res.status(400).json({
        success: false,
        message: "No puedes rechazar retiros en proceso o completados"
      });
      return;
    }

    await withdrawal.update({
      status: 'rejected',
      rejectionReason,
      processedAt: new Date(),
      processedBy: adminId
    });

    // Send email notification
    const user = withdrawal.user as any;
    await emailService.sendWithdrawalRejected(user.email, user.name, withdrawal.amount, rejectionReason);

    // Send push notification
    const userId = typeof user === 'object' && 'id' in user ? user.id : user;
    await fcmService.sendToUser(userId.toString(), {
      title: 'Retiro Rechazado',
      body: `Tu solicitud de retiro ha sido rechazada. Revisa el motivo en tu perfil.`,
      data: { type: 'withdrawal_rejected', withdrawalId: withdrawal.id.toString() }
    });

    res.status(200).json({
      success: true,
      message: "Retiro rechazado",
      withdrawal
    });
  } catch (error: any) {
    console.error("Error rejecting withdrawal:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al rechazar retiro"
    });
  }
});

/**
 * Get withdrawal statistics
 * GET /api/admin/withdrawals/stats
 */
router.get("/stats", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    const withdrawalsData = await WithdrawalRequest.findAll({
      where: { createdAt: { [Op.gte]: startDate } },
      attributes: ['status', 'amount']
    });

    const stats = withdrawalsData.reduce((acc: any[], w) => {
      const existing = acc.find(s => s._id === w.status);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += w.amount;
        existing.amounts.push(w.amount);
      } else {
        acc.push({
          _id: w.status,
          count: 1,
          totalAmount: w.amount,
          amounts: [w.amount]
        });
      }
      return acc;
    }, []).map(s => ({
      ...s,
      avgAmount: s.totalAmount / s.count,
      amounts: undefined
    }));

    const totalRequests = withdrawalsData.length;
    const totalAmount = stats.reduce((sum, s) => sum + s.totalAmount, 0);

    res.status(200).json({
      success: true,
      stats,
      summary: {
        totalRequests,
        totalAmount,
        period: `${days} días`
      }
    });
  } catch (error: any) {
    console.error("Error fetching withdrawal stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener estadísticas"
    });
  }
});

export default router;
