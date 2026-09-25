import express, { Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { WithdrawalRequest } from "../../models/sql/WithdrawalRequest.model.js";
import { User } from "../../models/sql/User.model.js";
import { BalanceTransaction } from "../../models/sql/BalanceTransaction.model.js";
import emailService from "../../services/email.js";
import fcmService from "../../services/fcm.js";
import { Op, cast, col, where as sqlWhere } from 'sequelize';

/** ILIKE against a column that is not text: uuid, numeric, jsonb. */
const asText = (column: string, matcher: any) => sqlWhere(cast(col(column), 'text'), matcher);
import { generateWithdrawalReceipt } from "../../services/invoiceService.js";
import { logAudit } from "../../utils/auditLog.js";

const router = express.Router();

/**
 * Get all withdrawal requests (admin)
 * GET /api/admin/withdrawals
 */
router.get("/", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 50, offset = 0, status, search } = req.query;

    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }

    // The search has to run in SQL, not in the browser. The list is paginated
    // (50 rows), so filtering only the page that arrived meant a retiro that
    // matched but sat outside that page simply did not exist as far as the
    // admin was concerned -- and the narrower the status filter, the more
    // often that happened.
    const q = typeof search === 'string' ? search.trim() : '';
    if (q) {
      const like = { [Op.iLike]: `%${q}%` };
      const or: any[] = [
        asText('WithdrawalRequest.banking_info', like),
        asText('WithdrawalRequest.amount', like),
        { '$user.name$': like },
        { '$user.email$': like },
      ];

      // Ids are UUIDs, so a CAST is the only way to match a fragment of one.
      // The term is reduced to hex and dashes; nothing else reaches the query.
      const uuidish = q.toLowerCase().replace(/[^0-9a-f-]/g, '');
      if (uuidish.length >= 4 && uuidish.length === q.length) {
        const idLike = { [Op.iLike]: `%${uuidish}%` };
        or.push(asText('WithdrawalRequest.id', idLike));
        or.push(asText('WithdrawalRequest.user_id', idLike));
      }

      where[Op.or] = or;
    }

    const { rows: withdrawals, count: totalCount } = await WithdrawalRequest.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar', 'balanceArs'] },
        { model: User, as: 'processor', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Statistics
    const allWithdrawals = await WithdrawalRequest.findAll({
      attributes: ['status', 'amount']
    });

    const stats = allWithdrawals.reduce((acc: any[], w) => {
      const existing = acc.find(s => s.clave === w.status);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += w.amount;
      } else {
        acc.push({ clave: w.status, count: 1, totalAmount: w.amount });
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
router.post("/:id/approve", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
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

    void logAudit({
      req, action: 'withdrawal.approve', category: 'payment', severity: 'high',
      description: `Aprobó el retiro ${withdrawal.id} por $${Number(withdrawal.amount).toLocaleString('es-AR')}`,
      targetModel: 'WithdrawalRequest', targetId: withdrawal.id, metadata: { amount: Number(withdrawal.amount) || null },
    });

    // Send email notification
    const user = withdrawal.user as any;
    await emailService.sendWithdrawalApproved(user.email, user.name, withdrawal.amount);

    // Send push notification
    const userId = typeof user === 'object' && 'id' in user ? user.id : user;
    await fcmService.sendToUser({ userId: userId.toString(),
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
router.post("/:id/processing", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
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

    void logAudit({
      req, action: 'withdrawal.processing', category: 'payment', severity: 'medium',
      description: `Marcó el retiro ${withdrawal.id} como en proceso`,
      targetModel: 'WithdrawalRequest', targetId: withdrawal.id,
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
router.post("/:id/complete", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
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

    /**
     * Controles antes de que salga la plata.
     *
     * Van acá y no en el frontend porque acá es donde el dinero efectivamente
     * se va: un control que sólo vive en la pantalla lo saltea cualquiera que
     * llame a la API.
     */
    const {
      verificarTopeDiario,
      requiereDobleConfirmacion,
      MONTO_DOBLE_CONFIRMACION_ARS,
    } = await import('../../services/paymentSafeguards.js');

    const monto = Number(withdrawal.amount) || 0;
    const rol = String((req.user as any).adminRole || req.user.role || '');

    // Los montos grandes piden contraseña y 2FA otra vez. La sesión abierta
    // prueba que alguien entró alguna vez; no prueba quién está tecleando ahora.
    if (requiereDobleConfirmacion(monto) && !(req as any).passwordVerified) {
      res.status(403).json({
        success: false,
        requiereVerificacion: true,
        message:
          `Los egresos de $${MONTO_DOBLE_CONFIRMACION_ARS.toLocaleString('es-AR')} o más piden ` +
          'confirmar tu contraseña y tu código de 2FA antes de ejecutarse.',
        monto,
      });
      return;
    }

    const tope = await verificarTopeDiario(adminId, rol, monto);
    if (!tope.permitido) {
      res.status(403).json({
        success: false,
        message: tope.motivo,
        topeDiario: tope.detalle,
      });
      return;
    }

    const userId = typeof withdrawal.user === 'object' ? withdrawal.user.id : withdrawal.user;
    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    /**
     * Se debita el SALDO COMPROMETIDO, no el monto transferido.
     *
     * Son dos números distintos cuando el saldo venía de una devolución: el
     * retiro transfiere `amount` (neto) pero el saldo que sale de la cuenta es
     * `metadata.saldoDebitado` (bruto), porque la diferencia es la parte de la
     * comisión que se retiene al sacar la plata de la plataforma (T&C 9.1).
     *
     * Debitando solo lo transferido, esa retención le quedaba al usuario como
     * saldo: se le cobraba y se la devolvíamos en el mismo movimiento. Los
     * retiros viejos sin esa metadata debitan el monto, que es lo que valía
     * cuando se crearon.
     */
    const saldoADebitar = Number((withdrawal as any).metadata?.saldoDebitado) || Number(withdrawal.amount) || 0;
    const balanceBefore = parseFloat(user.balanceArs as any) || 0;

    if (balanceBefore - saldoADebitar < 0) {
      res.status(400).json({
        success: false,
        message: "Balance insuficiente para completar el retiro"
      });
      return;
    }

    /**
     * debitarSaldo bloquea la fila y escribe el asiento en la MISMA
     * transacción. Acá se hacía a mano: leer el saldo, restarle, guardar, y
     * recién después crear el asiento. Dos problemas que ya pasaron: dos
     * retiros concurrentes leían el mismo saldo y el segundo pisaba al primero,
     * y el asiento se creaba con `user:` en vez de `userId:` —un campo que el
     * modelo no tiene— así que Sequelize lo descartaba y el asiento quedaba
     * huérfano o fallaba, con el saldo ya descontado.
     */
    const { debitarSaldo } = await import('../../services/quotePayment.js');
    await debitarSaldo(
      String(user.id),
      saldoADebitar,
      `Retiro a cuenta bancaria (${withdrawal.bankingInfo?.bankName || 'CBU'})`,
      {
        tipo: 'withdrawal',
        metadata: {
          withdrawalId: withdrawal.id,
          transferido: Number(withdrawal.amount) || 0,
          retencion: Math.round((saldoADebitar - (Number(withdrawal.amount) || 0)) * 100) / 100,
          bankingInfo: withdrawal.bankingInfo,
          proofOfTransfer,
        },
      },
    );

    await user.reload();
    const newBalance = parseFloat(user.balanceArs as any) || 0;
    const transaction = await BalanceTransaction.findOne({
      where: { userId: user.id, type: 'withdrawal' },
      order: [['createdAt', 'DESC']],
    });

    // Update withdrawal
    await withdrawal.update({
      status: 'completed',
      completedAt: new Date(),
      processedBy: adminId,
      ...(transaction ? { transactionId: transaction.id } : {}),
      ...(proofOfTransfer && { proofOfTransfer }),
      ...(adminNotes && { adminNotes })
    });

    // Además del audit log de admin, queda el asiento de dinero con las
    // cuentas: es el que sirve cuando hay que reconstruir a dónde fue la plata.
    const { logMoneyEvent } = await import('../../utils/auditLog.js');
    void logMoneyEvent({
      action: 'WITHDRAWAL_COMPLETED',
      actor: `admin:${adminId}`,
      severity: 'critical',
      description: `Se transfirió $${monto.toLocaleString('es-AR')} a la cuenta del usuario.`,
      userId: String(user.id),
      monto,
      cuentas: {
        banco: withdrawal.bankingInfo?.bankName,
        titular: withdrawal.bankingInfo?.accountHolder,
        cbuUlt4: withdrawal.bankingInfo?.cbu ? String(withdrawal.bankingInfo.cbu).slice(-4) : null,
        alias: withdrawal.bankingInfo?.alias,
      },
      metadata: {
        withdrawalId: withdrawal.id,
        transactionId: transaction?.id ?? null,
        saldoAntes: balanceBefore,
        saldoDebitado: saldoADebitar,
        saldoDespues: newBalance,
        comprobante: proofOfTransfer || null,
        topeDiario: tope.detalle,
        rol,
      },
    });

    void logAudit({
      req, action: 'withdrawal.complete', category: 'payment', severity: 'high',
      description: `Completó el retiro ${withdrawal.id} por $${Number(withdrawal.amount).toLocaleString('es-AR')} (saldo del usuario: $${newBalance.toLocaleString('es-AR')})`,
      targetModel: 'WithdrawalRequest', targetId: withdrawal.id,
      metadata: { amount: Number(withdrawal.amount) || null, newBalance, saldoDebitado: saldoADebitar, transactionId: transaction?.id ?? null },
    });

    // Send email notification
    const userObj = withdrawal.user as any;
    await emailService.sendWithdrawalCompleted(userObj.email, userObj.name, withdrawal.amount, newBalance);

    // Send push notification
    await fcmService.sendToUser({ userId: userId.toString(),
      title: 'Retiro Completado',
      body: `Tu retiro de $${withdrawal.amount.toLocaleString("es-AR")} ha sido transferido exitosamente.`,
      data: { type: 'withdrawal_completed', withdrawalId: withdrawal.id.toString() }
    });

    // Generate withdrawal receipt (async, don't block)
    generateWithdrawalReceipt(withdrawal.id).catch(err =>
      console.error('[Invoice] Failed to generate withdrawal receipt:', err.message)
    );

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
router.post("/:id/reject", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
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

    void logAudit({
      req, action: 'withdrawal.reject', category: 'payment', severity: 'high',
      description: `Rechazó el retiro ${withdrawal.id}. Motivo: ${rejectionReason}`,
      targetModel: 'WithdrawalRequest', targetId: withdrawal.id, metadata: { rejectionReason },
    });

    // Send email notification
    const user = withdrawal.user as any;
    await emailService.sendWithdrawalRejected(user.email, user.name, withdrawal.amount, rejectionReason);

    // Send push notification
    const userId = typeof user === 'object' && 'id' in user ? user.id : user;
    await fcmService.sendToUser({ userId: userId.toString(),
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
router.get("/stats", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    const withdrawalsData = await WithdrawalRequest.findAll({
      where: { createdAt: { [Op.gte]: startDate } },
      attributes: ['status', 'amount']
    });

    const stats = withdrawalsData.reduce((acc: any[], w) => {
      const existing = acc.find(s => s.clave === w.status);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += w.amount;
        existing.amounts.push(w.amount);
      } else {
        acc.push({
          clave: w.status,
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
