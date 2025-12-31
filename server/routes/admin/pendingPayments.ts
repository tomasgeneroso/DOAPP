import express, { Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { User } from "../../models/sql/User.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { Notification } from "../../models/sql/Notification.model.js";
import { Op, literal } from 'sequelize';
import mercadopagoOAuthService from "../../services/mercadopagoOAuth.js";

const router = express.Router();

interface WorkerPaymentInfo {
  workerId: string;
  workerName: string;
  workerEmail: string;
  workerDni: string | null;
  workerPhone: string | null;
  workerAddress: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  bankingInfo: {
    bankName: string | null;
    accountHolder: string | null;
    accountType: string | null;
    cbu: string | null;
    alias: string | null;
  } | null;
  hasBankingInfo: boolean; // Whether worker has CBU/CVU to receive payments
  amountToPay: number;
  commission: number;
  percentageOfBudget: number | null;
  // MercadoPago Split Payment info
  mercadopagoLinked: boolean;
  prefersMercadopagoPayout: boolean;
  mercadopagoEmail: string | null;
  payoutMethod: 'mercadopago_auto' | 'bank_transfer_manual';
}

interface ContractPaymentRow {
  contractId: string;
  contractNumber: number;
  jobId: string;
  jobTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  totalContractAmount: number;
  totalCommission: number;
  completedAt: Date;
  paymentStatus: string;
  workers: WorkerPaymentInfo[];
}

/**
 * Get pending payments report
 * GET /api/admin/pending-payments
 *
 * Query params:
 * - period: 'daily' | 'weekly' | 'monthly' | 'custom'
 * - startDate: ISO date string (for custom period)
 * - endDate: ISO date string (for custom period)
 * - sortBy: 'contractNumber' | 'completedAt' | 'amount' | 'clientName' | 'workerCount'
 * - sortOrder: 'asc' | 'desc'
 * - paymentMethod: 'mercadopago' | 'bank_transfer' | 'all'
 */
router.get("/", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      period = 'daily',
      startDate: customStart,
      endDate: customEnd,
      sortBy = 'completedAt',
      sortOrder = 'desc',
      paymentMethod = 'all'
    } = req.query;

    // Calculate date range based on period
    let startDate = new Date();
    let endDate = new Date();

    switch (period) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        if (customStart && customEnd) {
          startDate = new Date(customStart as string);
          endDate = new Date(customEnd as string);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
    }

    // Query contracts where both parties confirmed and payment is pending
    // paymentStatus NOT 'completed' means payment hasn't been released to worker yet
    const contracts = await Contract.findAll({
      where: {
        status: { [Op.in]: ['completed', 'awaiting_confirmation', 'in_progress'] },
        clientConfirmed: true,
        doerConfirmed: true,
        paymentStatus: { [Op.notIn]: ['completed'] }
      },
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email', 'dni', 'phone', 'address']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'email', 'dni', 'phone', 'address', 'bankingInfo', 'mercadopagoUserId', 'mercadopagoLinkedAt', 'mercadopagoEmail', 'prefersMercadopagoPayout']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title', 'maxWorkers', 'selectedWorkers', 'workerAllocations']
        }
      ],
      order: [[sortBy as string, sortOrder as string]]
    });

    // Group contracts by job for multi-worker jobs
    const jobContractsMap = new Map<string, Contract[]>();

    for (const contract of contracts) {
      const jobId = contract.jobId;
      if (!jobContractsMap.has(jobId)) {
        jobContractsMap.set(jobId, []);
      }
      jobContractsMap.get(jobId)!.push(contract);
    }

    // Build the payment rows
    const paymentRows: ContractPaymentRow[] = [];
    let rowNumber = 1;

    for (const [jobId, jobContracts] of jobContractsMap) {
      const firstContract = jobContracts[0];
      const job = firstContract.job as any;
      const client = firstContract.client as any;

      // Calculate total amounts for this job
      let totalContractAmount = 0;
      let totalCommission = 0;
      const workers: WorkerPaymentInfo[] = [];

      for (const contract of jobContracts) {
        const doer = contract.doer as any;

        // Use allocated amount for multi-worker jobs, otherwise full price
        const amountToPay = contract.allocatedAmount
          ? parseFloat(contract.allocatedAmount.toString())
          : parseFloat(contract.price.toString());

        const commission = parseFloat(contract.commission.toString());

        totalContractAmount += amountToPay;
        totalCommission += commission;

        // Filter by payment method if specified
        if (paymentMethod !== 'all') {
          const bankType = doer?.bankingInfo?.bankType;
          if (paymentMethod === 'mercadopago' && bankType !== 'mercadopago') continue;
          if (paymentMethod === 'bank_transfer' && bankType === 'mercadopago') continue;
        }

        // Determine if worker has MercadoPago linked and prefers automatic payout
        const hasMercadopagoLinked = !!(doer?.mercadopagoUserId && doer?.mercadopagoLinkedAt);
        const prefersMercadopagoPayout = doer?.prefersMercadopagoPayout === true;
        const payoutMethod = (hasMercadopagoLinked && prefersMercadopagoPayout)
          ? 'mercadopago_auto'
          : 'bank_transfer_manual';

        // Check if worker has banking info (CBU/CVU) to receive payments
        const hasBankingInfo = !!(doer?.bankingInfo?.cbu || doer?.bankingInfo?.alias);

        workers.push({
          workerId: doer?.id || '',
          workerName: doer?.name || 'N/A',
          workerEmail: doer?.email || 'N/A',
          workerDni: doer?.dni || null,
          workerPhone: doer?.phone || null,
          workerAddress: doer?.address || null,
          bankingInfo: doer?.bankingInfo ? {
            bankName: doer.bankingInfo.bankName || null,
            accountHolder: doer.bankingInfo.accountHolder || null,
            accountType: doer.bankingInfo.accountType || null,
            cbu: doer.bankingInfo.cbu || null,
            alias: doer.bankingInfo.alias || null,
          } : null,
          hasBankingInfo,
          amountToPay,
          commission,
          percentageOfBudget: contract.percentageOfBudget
            ? parseFloat(contract.percentageOfBudget.toString())
            : null,
          // MercadoPago Split Payment info
          mercadopagoLinked: hasMercadopagoLinked,
          prefersMercadopagoPayout,
          mercadopagoEmail: doer?.mercadopagoEmail || null,
          payoutMethod,
        });
      }

      // Skip if no workers match payment method filter
      if (workers.length === 0) continue;

      paymentRows.push({
        contractId: firstContract.id,
        contractNumber: rowNumber++,
        jobId,
        jobTitle: job?.title || 'N/A',
        clientId: client?.id || '',
        clientName: client?.name || 'N/A',
        clientEmail: client?.email || 'N/A',
        totalContractAmount,
        totalCommission,
        completedAt: firstContract.clientConfirmedAt || firstContract.updatedAt,
        paymentStatus: firstContract.paymentStatus || 'pending',
        escrowStatus: firstContract.escrowStatus || 'held_escrow',
        contractStatus: firstContract.status,
        workers
      });
    }

    // Sort the results
    if (sortBy === 'workerCount') {
      paymentRows.sort((a, b) => {
        const diff = a.workers.length - b.workers.length;
        return sortOrder === 'asc' ? diff : -diff;
      });
    }

    // Calculate summary statistics
    const totalAmountToPay = paymentRows.reduce(
      (sum, row) => sum + row.workers.reduce((wSum, w) => wSum + w.amountToPay, 0),
      0
    );
    const totalCommissionCollected = paymentRows.reduce(
      (sum, row) => sum + row.totalCommission,
      0
    );
    const totalContracts = paymentRows.length;
    const totalWorkers = paymentRows.reduce((sum, row) => sum + row.workers.length, 0);

    // Group by bank for summary
    const bankSummary: Record<string, { count: number; totalAmount: number }> = {};
    // Group by payout method for summary
    const payoutMethodSummary = {
      mercadopago_auto: { count: 0, totalAmount: 0 },
      bank_transfer_manual: { count: 0, totalAmount: 0 },
    };

    for (const row of paymentRows) {
      for (const worker of row.workers) {
        const bankName = worker.bankingInfo?.bankName || 'Sin banco';
        if (!bankSummary[bankName]) {
          bankSummary[bankName] = { count: 0, totalAmount: 0 };
        }
        bankSummary[bankName].count++;
        bankSummary[bankName].totalAmount += worker.amountToPay;

        // Track payout method
        payoutMethodSummary[worker.payoutMethod].count++;
        payoutMethodSummary[worker.payoutMethod].totalAmount += worker.amountToPay;
      }
    }

    res.status(200).json({
      success: true,
      report: {
        period: period as string,
        startDate,
        endDate,
        generatedAt: new Date(),
        summary: {
          totalContracts,
          totalWorkers,
          totalAmountToPay,
          totalCommissionCollected,
          averagePaymentPerWorker: totalWorkers > 0 ? totalAmountToPay / totalWorkers : 0,
          bankBreakdown: bankSummary,
          payoutMethodBreakdown: {
            mercadopagoAuto: payoutMethodSummary.mercadopago_auto,
            bankTransferManual: payoutMethodSummary.bank_transfer_manual,
          },
        },
        data: paymentRows
      }
    });
  } catch (error: any) {
    console.error("Error generating pending payments report:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al generar reporte de pagos pendientes"
    });
  }
});

/**
 * Get detailed payment info for a specific contract
 * GET /api/admin/pending-payments/:contractId
 */
router.get("/:contractId", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;

    const contract = await Contract.findByPk(contractId, {
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email', 'dni', 'phone', 'address', 'legalInfo']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'email', 'dni', 'phone', 'address', 'bankingInfo', 'legalInfo']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title', 'description', 'price', 'maxWorkers', 'selectedWorkers', 'workerAllocations', 'location']
        }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Get associated payment
    const payment = await Payment.findOne({
      where: { contractId }
    });

    const doer = contract.doer as any;
    const client = contract.client as any;
    const job = contract.job as any;

    res.status(200).json({
      success: true,
      paymentDetails: {
        contract: {
          id: contract.id,
          status: contract.status,
          paymentStatus: contract.paymentStatus,
          escrowStatus: contract.escrowStatus,
          price: contract.price,
          commission: contract.commission,
          totalPrice: contract.totalPrice,
          allocatedAmount: contract.allocatedAmount,
          percentageOfBudget: contract.percentageOfBudget,
          startDate: contract.startDate,
          endDate: contract.endDate,
          completedAt: contract.clientConfirmedAt,
        },
        job: {
          id: job?.id,
          title: job?.title,
          description: job?.description,
          totalBudget: job?.price,
          maxWorkers: job?.maxWorkers,
          selectedWorkersCount: job?.selectedWorkers?.length || 0,
          location: job?.location
        },
        client: {
          id: client?.id,
          name: client?.name,
          email: client?.email,
          dni: client?.dni,
          phone: client?.phone,
          address: client?.address,
          legalInfo: client?.legalInfo
        },
        worker: {
          id: doer?.id,
          name: doer?.name,
          email: doer?.email,
          dni: doer?.dni,
          phone: doer?.phone,
          address: doer?.address,
          bankingInfo: doer?.bankingInfo,
          legalInfo: doer?.legalInfo
        },
        payment: payment ? {
          id: payment.id,
          status: payment.status,
          amount: payment.amount,
          workerPaymentAmount: payment.workerPaymentAmount,
          mercadopagoId: payment.mercadopagoPaymentId,
          paidAt: payment.paidAt
        } : null
      }
    });
  } catch (error: any) {
    console.error("Error fetching payment details:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener detalles del pago"
    });
  }
});

/**
 * Export pending payments report as CSV
 * GET /api/admin/pending-payments/export/csv
 */
router.get("/export/csv", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { period = 'monthly' } = req.query;

    // Calculate date range
    let startDate = new Date();
    let endDate = new Date();

    switch (period) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const contracts = await Contract.findAll({
      where: {
        status: 'completed',
        clientConfirmed: true,
        doerConfirmed: true,
        updatedAt: { [Op.between]: [startDate, endDate] }
      },
      include: [
        { model: User, as: 'client', attributes: ['name', 'email'] },
        { model: User, as: 'doer', attributes: ['name', 'email', 'dni', 'phone', 'address', 'bankingInfo'] },
        { model: Job, as: 'job', attributes: ['title'] }
      ]
    });

    // Generate CSV content
    const csvHeaders = [
      'Nro Contrato',
      'Trabajo',
      'Cliente',
      'Email Cliente',
      'Trabajador',
      'Email Trabajador',
      'DNI',
      'Teléfono',
      'Dirección',
      'Banco',
      'CBU',
      'Alias',
      'Monto a Pagar',
      'Comisión',
      'Monto Total',
      'Fecha Completado'
    ].join(',');

    const csvRows = contracts.map((contract, index) => {
      const doer = contract.doer as any;
      const client = contract.client as any;
      const job = contract.job as any;
      const address = doer?.address
        ? `${doer.address.street || ''} ${doer.address.city || ''} ${doer.address.state || ''}`.trim()
        : '';

      return [
        index + 1,
        `"${job?.title || ''}"`,
        `"${client?.name || ''}"`,
        client?.email || '',
        `"${doer?.name || ''}"`,
        doer?.email || '',
        doer?.dni || '',
        doer?.phone || '',
        `"${address}"`,
        doer?.bankingInfo?.bankName || '',
        doer?.bankingInfo?.cbu || '',
        doer?.bankingInfo?.alias || '',
        contract.allocatedAmount || contract.price,
        contract.commission,
        contract.totalPrice,
        contract.clientConfirmedAt?.toISOString().split('T')[0] || ''
      ].join(',');
    });

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=pagos-pendientes-${period}-${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csvContent); // BOM for Excel UTF-8 support
  } catch (error: any) {
    console.error("Error exporting payments CSV:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al exportar CSV"
    });
  }
});

/**
 * Mark payment as processed (manual bank transfer)
 * POST /api/admin/pending-payments/:contractId/mark-paid
 */
router.post("/:contractId/mark-paid", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const { proofOfPayment, adminNotes, paymentMethod } = req.body;
    const adminId = req.user.id;

    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: User, as: 'doer' },
        { model: Job, as: 'job' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    const doer = contract.doer as any;
    const job = contract.job as any;

    // Update contract payment status
    contract.paymentStatus = 'completed';
    contract.paymentDate = new Date();
    await contract.save();

    // Update associated payment if exists
    const payment = await Payment.findOne({ where: { contractId } });
    if (payment) {
      payment.status = 'completed';
      payment.paidAt = new Date();
      if (adminNotes) payment.adminNotes = adminNotes;
      await payment.save();
    }

    // Notify worker about payment
    await Notification.create({
      recipientId: doer?.id,
      type: 'success',
      category: 'payment',
      title: 'Pago recibido',
      message: `Tu pago de $${contract.allocatedAmount || contract.price} ARS por "${job?.title}" ha sido procesado mediante transferencia bancaria.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      sentVia: ['in_app'],
    });

    res.status(200).json({
      success: true,
      message: "Pago marcado como completado",
      paymentMethod: 'bank_transfer_manual',
      contract
    });
  } catch (error: any) {
    console.error("Error marking payment as paid:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al marcar pago"
    });
  }
});

/**
 * Process automatic payment via MercadoPago Split Payment
 * POST /api/admin/pending-payments/:contractId/process-mercadopago
 *
 * This endpoint attempts to automatically transfer funds to the worker
 * via MercadoPago if they have their account linked.
 */
router.post("/:contractId/process-mercadopago", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const { adminNotes } = req.body;
    const adminId = req.user.id;

    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: User, as: 'doer' },
        { model: User, as: 'client' },
        { model: Job, as: 'job' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    const doer = contract.doer as User;
    const job = contract.job as any;

    // Verify worker has MercadoPago linked and prefers automatic payout
    if (!doer.hasMercadopagoLinked()) {
      res.status(400).json({
        success: false,
        message: "El trabajador no tiene cuenta de MercadoPago vinculada. Use el pago manual por transferencia bancaria.",
      });
      return;
    }

    if (!doer.prefersMercadopagoPayout) {
      res.status(400).json({
        success: false,
        message: "El trabajador prefiere pago manual por transferencia bancaria.",
      });
      return;
    }

    // Calculate amounts
    const workerAmount = parseFloat((contract.allocatedAmount || contract.price).toString());
    const commission = parseFloat(contract.commission.toString());
    const description = `Pago por trabajo: ${job?.title || 'Contrato ' + contractId}`;
    const externalReference = `contract-${contractId}`;

    // Attempt split payment via MercadoPago
    console.log(`🔄 Processing MercadoPago split payment for contract ${contractId}`);
    console.log(`   Worker: ${doer.name} (${doer.mercadopagoEmail})`);
    console.log(`   Amount: $${workerAmount} ARS (commission: $${commission})`);

    const result = await mercadopagoOAuthService.transferToBankAccount(
      doer.id,
      workerAmount,
      description,
      externalReference
    );

    if (result.success) {
      // Update contract payment status
      contract.paymentStatus = 'completed';
      contract.paymentDate = new Date();
      contract.escrowStatus = 'released';
      await contract.save();

      // Update associated payment if exists
      const payment = await Payment.findOne({ where: { contractId } });
      if (payment) {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.mercadopagoPaymentId = result.transactionId;
        if (adminNotes) payment.adminNotes = adminNotes;
        await payment.save();
      }

      // Notify worker
      await Notification.create({
        recipientId: doer.id,
        type: 'success',
        category: 'payment',
        title: 'Pago automático recibido',
        message: `Tu pago de $${workerAmount} ARS por "${job?.title}" ha sido enviado automáticamente a tu cuenta de MercadoPago.`,
        relatedModel: 'Contract',
        relatedId: contract.id,
        sentVia: ['in_app'],
      });

      console.log(`✅ MercadoPago split payment completed: ${result.transactionId}`);

      res.status(200).json({
        success: true,
        message: "Pago automático procesado exitosamente",
        paymentMethod: 'mercadopago_auto',
        transactionId: result.transactionId,
        workerAmount: result.workerAmount,
        contract
      });
    } else {
      // Payment failed - log error and return failure message
      console.error(`❌ MercadoPago split payment failed: ${result.error}`);

      res.status(400).json({
        success: false,
        message: `Error procesando pago automático: ${result.error}. Por favor use pago manual por transferencia bancaria.`,
        fallbackToManual: true,
      });
    }
  } catch (error: any) {
    console.error("Error processing MercadoPago payment:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al procesar pago automático",
      fallbackToManual: true,
    });
  }
});

/**
 * Batch process all eligible MercadoPago payments
 * POST /api/admin/pending-payments/process-all-mercadopago
 */
router.post("/process-all-mercadopago", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const adminId = req.user.id;

    // Find all contracts eligible for automatic MercadoPago payment
    const contracts = await Contract.findAll({
      where: {
        status: { [Op.in]: ['completed', 'awaiting_confirmation'] },
        clientConfirmed: true,
        doerConfirmed: true,
        paymentStatus: { [Op.notIn]: ['completed'] }
      },
      include: [
        {
          model: User,
          as: 'doer',
          where: {
            mercadopagoUserId: { [Op.ne]: null },
            mercadopagoLinkedAt: { [Op.ne]: null },
            prefersMercadopagoPayout: true,
          }
        },
        { model: Job, as: 'job' }
      ]
    });

    const results = {
      total: contracts.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const contract of contracts) {
      const doer = contract.doer as User;
      const job = contract.job as any;
      const workerAmount = parseFloat((contract.allocatedAmount || contract.price).toString());
      const description = `Pago por trabajo: ${job?.title || 'Contrato ' + contract.id}`;
      const externalReference = `contract-${contract.id}`;

      try {
        const result = await mercadopagoOAuthService.transferToBankAccount(
          doer.id,
          workerAmount,
          description,
          externalReference
        );

        if (result.success) {
          // Update contract
          contract.paymentStatus = 'completed';
          contract.paymentDate = new Date();
          contract.escrowStatus = 'released';
          await contract.save();

          // Update payment
          const payment = await Payment.findOne({ where: { contractId: contract.id } });
          if (payment) {
            payment.status = 'completed';
            payment.paidAt = new Date();
            payment.mercadopagoPaymentId = result.transactionId;
            await payment.save();
          }

          // Notify worker
          await Notification.create({
            recipientId: doer.id,
            type: 'success',
            category: 'payment',
            title: 'Pago automático recibido',
            message: `Tu pago de $${workerAmount} ARS por "${job?.title}" ha sido enviado automáticamente a tu cuenta de MercadoPago.`,
            relatedModel: 'Contract',
            relatedId: contract.id,
            sentVia: ['in_app'],
          });

          results.success++;
        } else {
          results.failed++;
          results.errors.push(`Contract ${contract.id}: ${result.error}`);
        }
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Contract ${contract.id}: ${err.message}`);
      }
    }

    console.log(`✅ Batch MercadoPago processing complete: ${results.success}/${results.total} successful`);

    res.status(200).json({
      success: true,
      message: `Procesamiento batch completado. ${results.success} exitosos, ${results.failed} fallidos.`,
      results
    });
  } catch (error: any) {
    console.error("Error in batch MercadoPago processing:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error en procesamiento batch"
    });
  }
});

export default router;
