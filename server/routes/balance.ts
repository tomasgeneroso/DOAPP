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
import { respuestaDeErrorDeDinero } from '../services/controlesDeDinero.js';

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

    // El saldo se suma en el momento del hecho, pero solo se retira desde que Mercado Pago libera ese pago (services/liberacionDeSaldo.ts).
    const { saldoRetirable } = await import('../services/liberacionDeSaldo.js');
    const retirable = await saldoRetirable(String(req.user.id), Number(user.balanceArs) || 0);
    res.status(200).json({
      success: true,
      balance: user.balanceArs || 0,
      disponibleParaRetirar: retirable.disponible,
      enLiberacion: retirable.enLiberacion,
      proximaLiberacion: retirable.proximaLiberacion,
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

    // 22 DÍGITOS: antes sólo se medía el largo, y una cadena de 22 letras pasaba.
    if (typeof bankingInfo.cbu !== 'string' || !/^\d{22}$/.test(bankingInfo.cbu)) {
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

    /**
     * El destino del retiro es la cuenta que está guardada en el PERFIL, no la que mande el pedido.
     *
     * El enfriamiento de abajo mide hace cuánto se cambió el CBU DEL PERFIL (bankingInfoUpdatedAt). Pero esta
     * ruta aceptaba cualquier CBU en el cuerpo, que nunca toca esa fecha: una sesión robada retiraba todo el
     * saldo a una cuenta nueva en una sola llamada y el enfriamiento no se enteraba. Cambiar de cuenta pasa
     * por el perfil (que fija la fecha y activa el enfriamiento), no por el formulario de retiro.
     */
    const { decryptCBU } = await import('../utils/encryption.js');
    let cbuDelPerfil: string | null = null;
    const guardado = (user as any).bankingInfo?.cbu;
    if (typeof guardado === 'string' && guardado) {
      try {
        cbuDelPerfil = /^\d{22}$/.test(guardado) ? guardado : decryptCBU(guardado);
      } catch {
        cbuDelPerfil = null;
      }
    }
    if (!cbuDelPerfil) {
      res.status(400).json({
        success: false,
        code: 'BANKING_INFO_NOT_SAVED',
        message: "Primero guardá tu cuenta bancaria en tu perfil. Por seguridad, los retiros se habilitan unas horas después de cargarla o cambiarla.",
      });
      return;
    }
    if (cbuDelPerfil !== bankingInfo.cbu) {
      res.status(403).json({
        success: false,
        code: 'CBU_DIFFERS_FROM_PROFILE',
        message: "El CBU del retiro tiene que ser el de tu perfil. Si querés cobrar en otra cuenta, cambiala desde tu perfil (por seguridad, los retiros se habilitan unas horas después del cambio).",
      });
      return;
    }

    /**
     * Enfriamiento posterior a un cambio de cuenta bancaria.
     *
     * Va antes que cualquier otra validación porque es la única que protege
     * contra una cuenta tomada, y las demás no tienen sentido si la cuenta de
     * destino no es del dueño real.
     */
    const { verificarEnfriamientoCbu } = await import('../services/paymentSafeguards.js');
    const enfriamiento = verificarEnfriamientoCbu((user as any).bankingInfoUpdatedAt);
    if (!enfriamiento.permitido) {
      res.status(403).json({
        success: false,
        message: enfriamiento.motivo,
        enfriamiento: enfriamiento.detalle,
      });
      return;
    }

    // Retiro "todo o nada": se retira SIEMPRE todo lo que está DISPONIBLE (mín $1,000 ARS). Lo que está en la cuenta pero todavía no se libera
    // (Mercado Pago no liberó ese pago, o el trabajo está en plazo de reclamo) se suma al saldo ya, pero se retira cuando llegue su fecha.
    const saldoTotal = Number(user.balanceArs) || 0;
    const { saldoRetirable } = await import('../services/liberacionDeSaldo.js');
    const retirable = await saldoRetirable(String(userId), saldoTotal);
    const amount = retirable.disponible;
    if (amount < MINIMUM_WITHDRAWAL_ARS) {
      const cuando = retirable.proximaLiberacion ? ` Se libera el ${retirable.proximaLiberacion.toLocaleDateString('es-AR')}.` : '';
      res.status(400).json({
        success: false,
        message:
          `El monto mínimo de retiro es $${MINIMUM_WITHDRAWAL_ARS.toLocaleString("es-AR")} ARS. Tu saldo disponible para retirar es $${amount.toLocaleString("es-AR")}.` +
          (retirable.enLiberacion > 0 ? ` Otros $${retirable.enLiberacion.toLocaleString("es-AR")} ya están en tu cuenta pero Mercado Pago todavía no liberó ese pago.${cuando}` : ''),
        disponibleParaRetirar: amount,
        enLiberacion: retirable.enLiberacion,
        proximaLiberacion: retirable.proximaLiberacion,
      });
      return;
    }

    // Antes de sacar plata de la plataforma: el saldo tiene que ser la suma de los movimientos del usuario. Si alguien lo tocó sin dejar
    // asiento, el retiro agrandaría un descuadre que después nadie puede reconstruir. El error trae saldo, libro y diferencia.
    {
      const { comprobarSaldoContraLibro, detalleDeSaldoContraLibro, ErrorDeDinero } = await import('../services/controlesDeDinero.js');
      const cuadre = await comprobarSaldoContraLibro(String(userId), saldoTotal);
      if (!cuadre.cierra) throw new ErrorDeDinero('SALDO-NO-CIERRA-LIBRO', detalleDeSaldoContraLibro(String(userId), cuadre));
    }

    // ============================================
    // LO QUE SE RETIENE AL RETIRAR SALDO DEVUELTO
    // ============================================
    // El saldo que no se gano trabajando -- una publicacion cancelada sin
    // trabajador -- es plata que el cliente pago y que vuelve, comision
    // incluida. Dentro de la app se usa gratis. Sacarla a un CBU descuenta la
    // mitad de esa comision, por la revision que ya se hizo (T&C 9.1). Cada
    // credito de devolucion trae anotado en su metadata (`alRetirar`) cuanto
    // le toca. Transferir a un CBU no tiene costo de pasarela: el costo de
    // procesamiento lo pago el cliente al pagar, una sola vez. (Los creditos
    // anteriores a ese cambio pueden traer `alRetirar.pasarela`; se respeta.)
    //
    // El retiro es todo o nada, asi que vacia el saldo: los creditos posteriores
    // al ultimo retiro son exactamente la porcion devuelta del saldo actual. Si
    // gasto parte dentro de la app, la retencion se prorratea a lo que retira.
    const ultimoRetiro = await WithdrawalRequest.findOne({
      where: { userId, status: { [Op.in]: ['completed', 'processing', 'approved'] } },
      order: [['createdAt', 'DESC']],
    });

    // Las devoluciones que componen LO QUE SE RETIRA AHORA: las acreditadas después del último retiro y las que seguían bloqueadas en ese
    // momento, siempre que ya estén liberadas. Las que todavía no se liberan se quedan en la cuenta y se cuentan cuando se retiren.
    const { QueryTypes } = await import('sequelize');
    const devoluciones = (await (sequelize as any).query(
      `SELECT amount, metadata FROM balance_transactions
        WHERE user_id = :userId AND type = 'refund' AND status = 'completed'
          AND (CAST(:ultimo AS timestamptz) IS NULL
               OR created_at > CAST(:ultimo AS timestamptz)
               OR (metadata ? 'disponibleDesde' AND (metadata->>'disponibleDesde')::timestamptz > CAST(:ultimo AS timestamptz)))
          AND NOT (metadata ? 'disponibleDesde' AND (metadata->>'disponibleDesde')::timestamptz > now())`,
      { replacements: { userId, ultimo: ultimoRetiro ? new Date((ultimoRetiro as any).createdAt).toISOString() : null }, type: QueryTypes.SELECT },
    )) as Array<{ amount: number; metadata: any }>;

    let creditosDevueltos = 0;
    let retencionComision = 0;
    let retencionPasarela = 0;
    for (const d of devoluciones) {
      const monto = Number((d as any).amount) || 0;
      creditosDevueltos += monto;
      const meta: any = (d as any).metadata || {};
      retencionComision += Number(meta.alRetirar?.comision) || 0;
      retencionPasarela += Number(meta.alRetirar?.pasarela) || 0;
    }

    // No puede superar el saldo: si el usuario ya gasto parte del credito dentro
    // de la app, esa parte no se retira y no puede cobrar costo.
    const porcionDevuelta = Math.min(creditosDevueltos, amount);
    const factor = creditosDevueltos > 0 ? porcionDevuelta / creditosDevueltos : 0;
    const costoComision = Math.round(retencionComision * factor * 100) / 100;
    const costoPasarela = Math.round(retencionPasarela * factor * 100) / 100;
    const retencion = Math.round((costoComision + costoPasarela) * 100) / 100;

    if (retencion > 0 && req.body.aceptaCostoPasarela !== true) {
      res.status(409).json({
        success: false,
        requiereConfirmacion: true,
        message:
          `De tu saldo, $${porcionDevuelta.toLocaleString('es-AR')} son devoluciones de publicaciones canceladas. ` +
          `Dentro de la app los usás sin costo. Transferirlos al banco descuenta ` +
          [
            costoComision > 0 ? `$${costoComision.toLocaleString('es-AR')} de la comisión por la revisión que ya se hizo` : '',
            costoPasarela > 0 ? `$${costoPasarela.toLocaleString('es-AR')} del costo de la pasarela de pago` : '',
          ].filter(Boolean).join(' y ') +
          `. Recibirías $${(amount - retencion).toLocaleString('es-AR')}.`,
        detalle: {
          saldoTotal: amount,
          porcionDevuelta,
          costoComision,
          costoPasarela,
          retencion,
          recibirias: Math.round((amount - retencion) * 100) / 100,
        },
      });
      return;
    }

    const montoATransferir = Math.round((amount - retencion) * 100) / 100;

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

    // Tope diario por usuario: lo que supere $200.000 en el día no se rechaza, pero lo tiene que aprobar el DUEÑO antes de que salga la plata.
    const { TOPE_DIARIO_RETIRO_USUARIO_ARS, retiradoHoyPorElUsuario } = await import('../services/paymentSafeguards.js');
    const retiradoHoy = await retiradoHoyPorElUsuario(String(userId));
    const requiereDueno = retiradoHoy + montoATransferir > TOPE_DIARIO_RETIRO_USUARIO_ARS;

    // Create withdrawal request
    const withdrawal = await WithdrawalRequest.create({
      userId,
      // Se transfiere el saldo menos lo retenido sobre la parte devuelta. El
      // saldo se debita completo: la retencion se cobro, no se perdio.
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
      // Lo que queda en la cuenta: 0 si todo estaba disponible; si parte del saldo todavía no se liberó, queda eso.
      balanceAfterWithdrawal: Math.round((saldoTotal - amount) * 100) / 100,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        saldoDebitado: amount,
        enLiberacion: retirable.enLiberacion,
        requiereDueno,
        topeDiario: TOPE_DIARIO_RETIRO_USUARIO_ARS,
        retiradoHoy,
        porcionDevuelta,
        costoComision,
        costoPasarela,
        retencion,
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
      message: requiereDueno
        ? `Solicitud de retiro creada. Supera el tope diario de $${TOPE_DIARIO_RETIRO_USUARIO_ARS.toLocaleString("es-AR")}, así que tiene que aprobarla el dueño de la plataforma antes de procesarse: puede demorar un poco más de 24-48 horas.`
        : "Solicitud de retiro creada exitosamente. Será procesada en 24-48 horas.",
      requiereAprobacionDelDueno: requiereDueno,
      withdrawal
    });
  } catch (error: any) {
    console.error("Error creating withdrawal request:", error);
    // Un problema de dinero con código: el usuario ve qué le pasó a su plata y el código; administración recibe los números exactos y la guía.
    const deDinero = respuestaDeErrorDeDinero(error, false);
    if (deDinero) {
      const { ErrorDeDinero, avisarProblemasDeDinero } = await import('../services/controlesDeDinero.js');
      if (error instanceof ErrorDeDinero) {
        void avisarProblemasDeDinero([{ codigo: error.codigo, detalle: error.detalle }], { titulo: 'Un retiro no se pudo crear', userId: String(req.user?.id), actor: `user:${req.user?.id}` });
      }
      res.status(deDinero.status).json(deDinero.body);
      return;
    }
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
