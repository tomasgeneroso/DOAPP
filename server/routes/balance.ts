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
import { enmascararCbu, etiquetaDelDestino, huellaDelDestino, leerDestinoDelPerfil, validarDestino, type DestinoDeRetiro } from '../../shared/pagos/destinoDeRetiro.js';
import { decryptCBU } from '../utils/encryption.js';

/**
 * El retiro tal como lo ve SU dueño: el monto como número (la base lo devuelve como texto y sumarlo en la pantalla daba «$02407.52») y la cuenta
 * sin el CBU entero. En la base el CBU está cifrado y antes se mandaba así a la pantalla: se veía un código larguísimo en vez de la cuenta.
 */
function retiroParaElUsuario(w: any) {
  const plano = typeof w?.toJSON === 'function' ? w.toJSON() : { ...w };
  const bi = plano.bankingInfo || {};
  let cbuClaro: string | null = null;
  if (typeof bi.cbu === 'string' && bi.cbu) {
    try {
      cbuClaro = /^\d{22}$/.test(bi.cbu) ? bi.cbu : decryptCBU(bi.cbu);
    } catch {
      cbuClaro = null;
    }
  }
  const m = plano.metadata || {};
  return {
    ...plano,
    amount: Number(plano.amount) || 0,
    balanceBeforeWithdrawal: Number(plano.balanceBeforeWithdrawal) || 0,
    balanceAfterWithdrawal: Number(plano.balanceAfterWithdrawal) || 0,
    bankingInfo: {
      accountHolder: bi.accountHolder,
      bankName: bi.bankName,
      accountType: bi.accountType,
      cbu: cbuClaro ? enmascararCbu(cbuClaro) : undefined,
      alias: bi.alias,
      lemonTag: bi.lemonTag,
    },
    // De la metadata, solo lo que le sirve a la persona: la IP y el navegador son del sistema.
    metadata: {
      retencion: m.retencion,
      saldoDebitado: m.saldoDebitado,
      destinoNuevo: m.destinoNuevo === true,
      noSeProcesaAntesDe: m.noSeProcesaAntesDe,
      requiereDueno: m.requiereDueno === true,
    },
  };
}

const router = express.Router();

/**
 * Get user balance
 * GET /api/balance
 */
router.get("/", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['balanceArs', 'name', 'bankingInfo', 'bankingInfoUpdatedAt']
    });

    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    // La cuenta guardada en el perfil, sin el número entero: la pantalla de retiros la ofrece como destino y avisa si el cambio de cuenta todavía enfría.
    const perfil = leerDestinoDelPerfil((user as any).bankingInfo, (c) => { try { return decryptCBU(c); } catch { return null; } }, String((user as any).name || ''));
    const { verificarEnfriamientoCbu, ENFRIAMIENTO_CBU_HORAS } = await import('../services/paymentSafeguards.js');
    const enfriamientoDelPerfil = verificarEnfriamientoCbu((user as any).bankingInfoUpdatedAt);

    // El saldo se suma en el momento del hecho, pero solo se retira desde que Mercado Pago libera ese pago (services/liberacionDeSaldo.ts).
    const { saldoRetirable } = await import('../services/liberacionDeSaldo.js');
    const retirable = await saldoRetirable(String(req.user.id), Number(user.balanceArs) || 0);
    // Lo que sobró de un presupuesto es a favor del cliente, pero PENDIENTE: no está en su saldo hasta que Mercado Pago libera el pago original.
    const { saldoPendienteDeLiquidar, aFavorPendienteDetalle } = await import('../services/liberacionDeSaldo.js');
    const pendiente = await saldoPendienteDeLiquidar(String(req.user.id));
    // Cada cosa que tiene a favor pendiente, con su motivo (sobrante de un presupuesto, cancelación, baja de precio) y la fecha en que pasa a su saldo.
    const detalleDelAFavor = pendiente.monto > 0 ? await aFavorPendienteDetalle(String(req.user.id)) : [];
    // Las tarjetas de «Cobros pendientes»: lo a favor pendiente y lo que está en liberación, cada una con su contrato y su trabajo.
    const { cobrosPendientes } = await import('../services/liberacionDeSaldo.js');
    const cobros = pendiente.monto > 0 || retirable.enLiberacion > 0 ? await cobrosPendientes(String(req.user.id)) : [];
    res.status(200).json({
      success: true,
      cuentaDelPerfil: perfil
        ? { accountHolder: perfil.accountHolder, bankName: perfil.bankName, cbu: perfil.cbu ? enmascararCbu(perfil.cbu) : undefined, alias: perfil.alias, lemonTag: perfil.lemonTag, etiqueta: etiquetaDelDestino(perfil) }
        : null,
      enfriamientoDelPerfil: enfriamientoDelPerfil.permitido ? null : { motivo: enfriamientoDelPerfil.motivo, horasFaltantes: enfriamientoDelPerfil.detalle?.horasFaltantes },
      horasDeEnfriamiento: ENFRIAMIENTO_CBU_HORAS,
      balance: user.balanceArs || 0,
      disponibleParaRetirar: retirable.disponible,
      enLiberacion: retirable.enLiberacion,
      proximaLiberacion: retirable.proximaLiberacion,
      aFavorPendiente: pendiente.monto,
      proximaLiquidacion: pendiente.proximaLiquidacion,
      aFavorPendienteDetalle: detalleDelAFavor,
      cobrosPendientes: cobros,
      // El saldo LIBERADO que puede usar ya para pagar una publicación (T&C 7.9): sin lo que está en liberación ni lo reservado para un retiro.
      saldoParaPagar: await (await import('../services/creditoDePublicacion.js')).saldoLiberadoUsable(String(req.user.id)),
      // Lo pendiente de cada publicación cancelada (`jobId` → monto): se puede usar para volver a publicar ESA publicación y ninguna otra.
      pendientePorPublicacion: await (await import('../services/creditoDePublicacion.js')).pendientesPorPublicacion(String(req.user.id)),
      ...(await (async () => {
        const { desgloseDelSaldo } = await import('../services/creditoDePublicacion.js');
        const d = await desgloseDelSaldo(String(req.user.id), Number(user.balanceArs) || 0);
        return { saldoLibre: d.libre, saldoVinculado: d.vinculado, publicacionesVinculadas: d.publicaciones, saldoReservadoEnRetiro: d.reservadoEnRetiro, saldoEnRetiroPendiente: await (await import('../services/saldoReservado.js')).pendienteEnRetiros(String(req.user.id)), saldoUsable: Math.max(0, Math.round((d.total - d.reservadoEnRetiro) * 100) / 100) };
      })()),
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
 * Cuánto gastó la persona en la plataforma: lo que PAGÓ y ya está acreditado (publicaciones, contratos, aumentos de presupuesto,
 * cotizaciones, órdenes al terminar y membresía), en pesos. Sale de los pagos y no de los contratos: el tablero sumaba solo contratos
 * COMPLETADOS (`totalPrice`), así que quien ya había pagado un trabajo todavía en curso veía «$0 gastado».
 *
 * Cuentan los pagos en que la plata ya entró (verificado, en custodia, esperando confirmación, en disputa, completado). No cuentan los
 * pendientes de comprobar, fallidos, cancelados ni devueltos, ni lo que no es un gasto suyo (la liberación al trabajador y los reembolsos).
 * Un pago en otra moneda cuenta por su equivalente en pesos si lo tiene; si no, no se inventa un tipo de cambio.
 * GET /api/balance/gastado
 */
const ESTADOS_DE_PAGO_ACREDITADO = ['verified', 'held_escrow', 'confirmed_for_payout', 'awaiting_confirmation', 'disputed', 'completed', 'approved'];
const TIPOS_QUE_NO_SON_UN_GASTO = ['escrow_release', 'refund'];

/** Cómo se le dice a la persona cada tipo y estado de pago (nunca el valor de la base, que sale en inglés). */
const ETIQUETA_DEL_TIPO: Record<string, string> = {
  contract_payment: 'Pago de contrato',
  escrow_deposit: 'Pago de contrato',
  contract: 'Pago de contrato',
  job_publication: 'Publicación de trabajo',
  budget_increase: 'Aumento de presupuesto',
  quote_payment: 'Pago de cotización',
  on_completion: 'Pago al terminar el trabajo',
  membership: 'Membresía PRO',
};
const ETIQUETA_DEL_ESTADO: Record<string, string> = {
  verified: 'Acreditado',
  approved: 'Acreditado',
  held_escrow: 'En custodia hasta que se confirme el trabajo',
  confirmed_for_payout: 'Listo para pagarle al trabajador',
  awaiting_confirmation: 'Esperando confirmación',
  disputed: 'En reclamo',
  completed: 'Completado',
};

router.get("/gastado", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pagos = (await Payment.findAll({
      where: {
        payerId: req.user.id,
        status: { [Op.in]: ESTADOS_DE_PAGO_ACREDITADO },
        paymentType: { [Op.notIn]: TIPOS_QUE_NO_SON_UN_GASTO },
      } as any,
      attributes: ['id', 'amount', 'currency', 'amountArs', 'status', 'paymentType', 'description', 'contractId', 'createdAt'],
      order: [['createdAt', 'DESC']],
      raw: true,
    })) as unknown as Array<{
      id: string; amount: string | number; currency: string; amountArs: string | number | null;
      status: string; paymentType: string; description: string | null; contractId: string | null; createdAt: Date;
    }>;

    let total = 0;
    let sinEquivalente = 0;
    const detalle: Array<Record<string, unknown>> = [];
    for (const p of pagos) {
      let enPesos: number | null = null;
      if (String(p.currency).toUpperCase() === 'ARS') enPesos = Number(p.amount) || 0;
      else if (p.amountArs !== null && p.amountArs !== undefined) enPesos = Number(p.amountArs) || 0;
      if (enPesos === null) sinEquivalente += 1;
      else total += enPesos;
      if (detalle.length < 100) {
        detalle.push({
          id: p.id,
          fecha: p.createdAt,
          concepto: ETIQUETA_DEL_TIPO[p.paymentType] || 'Pago',
          descripcion: p.description || null,
          estado: ETIQUETA_DEL_ESTADO[p.status] || 'Acreditado',
          montoEnPesos: enPesos,
          contractId: p.contractId,
        });
      }
    }
    res.json({ success: true, totalGastado: Math.round(total * 100) / 100, pagos: pagos.length, pagosSinEquivalenteEnPesos: sinEquivalente, detalle });
  } catch (error: any) {
    console.error("Error calculando lo gastado:", error);
    res.status(500).json({ success: false, message: error.message || "Error al calcular lo gastado" });
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

    // Calculate totals by type using raw SQL aggregation. Solo lo que ya se movió: un asiento pendiente (a favor pendiente de liquidar) todavía no es saldo.
    const { QueryTypes } = await import('sequelize');
    const stats = await (sequelize as any).query(
      `SELECT type, SUM(amount) as total, COUNT(*) as count
       FROM "balance_transactions"
       WHERE "user_id" = :userId AND "status" = 'completed'
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

    // La base devuelve las sumas como texto («12500.00»): se pasan a número para que la pantalla las pueda formatear y sumar.
    const suma = (tipo: string) => Number(stats.find((s: any) => s.type === tipo)?.total) || 0;
    const summary = {
      currentBalance: Number(user.balanceArs) || 0,
      totalRefunds: suma('refund'),
      totalPayments: Math.abs(suma('payment')),
      totalBonuses: suma('bonus'),
      totalAdjustments: suma('adjustment'),
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
    const { bankingInfo, guardarEnPerfil } = req.body ?? {};

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "Usuario no encontrado" });
      return;
    }

    /**
     * A dónde va el retiro: a la cuenta del PERFIL, o a una cuenta NUEVA que se carga en este mismo formulario (y se puede guardar en el perfil).
     *
     * Lo que protege contra la sesión robada es el TIEMPO, no el formulario. Quien entra con una contraseña ajena y manda su propia cuenta no
     * cobra en el momento: un retiro a una cuenta que no es la del perfil queda pedido pero NO se procesa hasta pasadas ENFRIAMIENTO_CBU_HORAS
     * (administración no lo puede aprobar ni completar antes, ver admin/withdrawals.ts) y el dueño real recibe el aviso para frenarlo. Es el mismo
     * plazo que ya existía al cambiar la cuenta desde el perfil. Antes esta ruta rechazaba cualquier cuenta distinta de la del perfil y, para
     * cobrar en otra, había que ir a Configuración, esperar y volver.
     */
    const destinoDelPerfil = leerDestinoDelPerfil(
      (user as any).bankingInfo,
      (cifrado) => {
        try {
          return decryptCBU(cifrado);
        } catch {
          return null;
        }
      },
      String((user as any).name || ''),
    );
    let destino: DestinoDeRetiro;
    if (bankingInfo === undefined) {
      if (!destinoDelPerfil) {
        res.status(400).json({
          success: false,
          code: 'BANKING_INFO_NOT_SAVED',
          message: "No tenés una cuenta guardada en tu perfil. Cargá los datos de la cuenta donde querés cobrar.",
        });
        return;
      }
      destino = destinoDelPerfil;
    } else {
      const v = validarDestino(bankingInfo);
      if ('message' in v) {
        res.status(400).json({ success: false, message: v.message });
        return;
      }
      destino = v.destino;
    }
    const esDelPerfil = !!destinoDelPerfil && huellaDelDestino(destino) === huellaDelDestino(destinoDelPerfil);

    // La cuenta del perfil pasa por el enfriamiento de siempre (se mide desde que se cambió); una cuenta nueva espera ella misma.
    const salvaguardas = await import('../services/paymentSafeguards.js');
    let noSeProcesaAntesDe: Date | null = null;
    if (esDelPerfil) {
      const enfriamiento = salvaguardas.verificarEnfriamientoCbu((user as any).bankingInfoUpdatedAt);
      if (!enfriamiento.permitido) {
        res.status(403).json({
          success: false,
          message: enfriamiento.motivo,
          enfriamiento: enfriamiento.detalle,
        });
        return;
      }
    } else {
      noSeProcesaAntesDe = new Date(Date.now() + salvaguardas.ENFRIAMIENTO_CBU_HORAS * 3_600_000);
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
          (retirable.enLiberacion > 0 ? ` Otros $${retirable.enLiberacion.toLocaleString("es-AR")} ya están en tu saldo de DOAPP pero Mercado Pago todavía no liberó ese pago.${cuando}` : ''),
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

    // Saldo vinculado a publicaciones canceladas: retirarlo hace que esas publicaciones ya no se puedan reprogramar sin pagar de nuevo.
    // Se gasta primero lo libre; lo vinculado entra recién cuando lo libre no alcanza.
    const { desgloseDelSaldo: desglose } = await import('../services/creditoDePublicacion.js');
    const vinculadoQueSeRetira = await (async () => {
      const d = await desglose(String(userId), saldoTotal, { ignorarReservado: true });
      const sobre = Math.round((amount - d.libre) * 100) / 100;
      return sobre > 0 ? d.publicaciones : [];
    })();
    const avisoVinculado = vinculadoQueSeRetira.length > 0
      ? `Parte de tu saldo está vinculado a publicaciones canceladas (${vinculadoQueSeRetira.map((p) => `"${p.titulo}"`).join(', ')}). Si lo retirás, esas publicaciones ya no se pueden reprogramar: para publicarlas de nuevo vas a tener que pagarlas otra vez.`
      : '';

    if ((retencion > 0 || avisoVinculado) && req.body.aceptaCostoPasarela !== true) {
      res.status(409).json({
        success: false,
        requiereConfirmacion: true,
        publicacionesVinculadas: vinculadoQueSeRetira,
        message:
          retencion <= 0 ? avisoVinculado : avisoVinculado + ' ' +
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

    // Create withdrawal request.
    // Se bloquea la fila de la persona y se vuelve a mirar si ya tiene un retiro abierto: dos pedidos a la vez (dos pestañas, un doble toque) esperan acá y
    // el segundo ve al primero. Mirar y crear por separado dejaba pasar los dos (la mirada de más arriba solo sirve para contestar rápido).
    const withdrawal = await sequelize.transaction(async (t) => {
      await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
      const abiertos = await WithdrawalRequest.count({ where: { userId, status: { [Op.in]: ['pending', 'approved', 'processing'] } }, transaction: t });
      if (abiertos > 0) return null;
      return WithdrawalRequest.create({
      userId,
      // Se transfiere el saldo menos lo retenido sobre la parte devuelta. El
      // saldo se debita completo: la retencion se cobro, no se perdio.
      amount: montoATransferir,
      bankingInfo: {
        accountHolder: destino.accountHolder,
        bankName: destino.bankName,
        accountType: destino.accountType || 'savings',
        cbu: destino.cbu,
        alias: destino.alias,
        ...(destino.lemonTag ? { lemonTag: destino.lemonTag } : {}),
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
        destinoNuevo: !esDelPerfil,
        ...(noSeProcesaAntesDe ? { noSeProcesaAntesDe: noSeProcesaAntesDe.toISOString() } : {}),
        guardadaEnPerfil: !esDelPerfil && guardarEnPerfil === true,
      }
    }, { transaction: t });
    });
    if (!withdrawal) {
      res.status(409).json({ success: false, message: "Ya tienes una solicitud de retiro pendiente. Por favor espera a que se procese." });
      return;
    }

    // El saldo vinculado a publicaciones que se retira ya no está: esas publicaciones se vuelven a publicar pagando de nuevo.
    if (vinculadoQueSeRetira.length > 0) {
      const { consumirCreditosAlRetirar } = await import('../services/creditoDePublicacion.js');
      await consumirCreditosAlRetirar(String(userId), amount, saldoTotal).catch((e: any) => console.error('No se pudo anotar el saldo vinculado retirado:', e?.message));
    }

    // Una cuenta que no es la del perfil: si la persona lo pidió se guarda en el perfil, queda en el registro de dinero y se le avisa para que lo frene si no fue ella.
    if (!esDelPerfil) {
      try {
        if (guardarEnPerfil === true) {
          (user as any).bankingInfo = {
            ...((user as any).bankingInfo || {}),
            accountHolder: destino.accountHolder,
            bankName: destino.bankName,
            accountType: destino.accountType || 'savings',
            cbu: destino.cbu,
            alias: destino.alias,
            lemonTag: destino.lemonTag,
          };
          (user as any).bankingInfoUpdatedAt = new Date();
          await user.save();
        }
        const { logMoneyEvent } = await import('../utils/auditLog.js');
        void logMoneyEvent({
          action: 'WITHDRAWAL_TO_NEW_DESTINATION',
          actor: `user:${userId}`,
          severity: 'high',
          description: `Pidió un retiro a una cuenta que no es la de su perfil (${etiquetaDelDestino(destino)}). No se procesa antes de ${noSeProcesaAntesDe?.toISOString()}.`,
          userId: String(userId),
          monto: montoATransferir,
          cuentas: { cbuUlt4: destino.cbu ? destino.cbu.slice(-4) : null, alias: destino.alias ?? null, lemonTag: destino.lemonTag ?? null },
          metadata: { withdrawalId: withdrawal.id, guardadaEnPerfil: guardarEnPerfil === true, ip: req.ip, userAgent: req.get('user-agent') },
        });
        const { Notification } = await import('../models/sql/Notification.model.js');
        await Notification.create({
          recipientId: userId,
          type: 'warning',
          category: 'payment',
          title: 'Pediste un retiro a una cuenta nueva',
          message: `Pediste retirar $${montoATransferir.toLocaleString('es-AR')} a ${etiquetaDelDestino(destino)}, una cuenta que todavía no estaba en tu perfil. Por seguridad se procesa recién pasadas ${salvaguardas.ENFRIAMIENTO_CBU_HORAS} horas. Si no fuiste vos, cancelá el retiro desde Retiros y escribinos ahora.`,
          relatedModel: 'WithdrawalRequest',
          relatedId: String(withdrawal.id),
          read: false,
        } as any);
      } catch (e: any) {
        // El retiro ya está creado: guardar la cuenta o avisar es secundario y no puede tirarlo abajo.
        console.error('No se pudo registrar el retiro a una cuenta nueva:', e?.message);
      }
    }

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
        : !esDelPerfil
          ? `Solicitud de retiro enviada. Como es una cuenta nueva (${destinoDelPerfil ? 'distinta de la de tu perfil' : 'la primera que cargás'}), por seguridad se procesa recién pasadas ${salvaguardas.ENFRIAMIENTO_CBU_HORAS} horas. Después, un administrador tiene que aprobar el envío del retiro a tu cuenta. Gracias por tu paciencia.`
          : "Solicitud de retiro enviada. Un administrador tiene que aprobar el envío del retiro a tu cuenta: lo hace en 24 a 48 horas hábiles. Gracias por tu paciencia.",
      requiereAprobacionDelDueno: requiereDueno,
      esCuentaNueva: !esDelPerfil,
      noSeProcesaAntesDe: noSeProcesaAntesDe ? noSeProcesaAntesDe.toISOString() : null,
      withdrawal: retiroParaElUsuario(withdrawal),
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
      withdrawals: withdrawals.map(retiroParaElUsuario),
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
      res.status(409).json({
        success: false,
        message: "Solo se cancelan solicitudes pendientes: esta ya la procesó un administrador. Actualizá la pantalla."
      });
      return;
    }

    // De una sola vez: si un administrador la aprobó mientras tanto, ya no se cancela (el estado que se miró arriba pudo haber cambiado).
    const [cancelados] = await WithdrawalRequest.update({ status: 'cancelled' } as any, { where: { id, userId, status: 'pending' } as any });
    if (cancelados === 0) {
      res.status(409).json({ success: false, message: "Esta solicitud ya no está pendiente: un administrador la procesó mientras tanto. Actualizá la pantalla." });
      return;
    }
    await withdrawal.reload();

    res.status(200).json({
      success: true,
      message: "Solicitud de retiro cancelada",
      withdrawal: retiroParaElUsuario(withdrawal)
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
