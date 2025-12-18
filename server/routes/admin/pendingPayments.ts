import express, { Response } from "express";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { User } from "../../models/sql/User.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { Op, literal } from 'sequelize';

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
  amountToPay: number;
  commission: number;
  percentageOfBudget: number | null;
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

    // Query completed contracts with escrow released or awaiting payment
    const contracts = await Contract.findAll({
      where: {
        status: { [Op.in]: ['completed', 'awaiting_confirmation'] },
        escrowStatus: { [Op.in]: ['released', 'held_escrow'] },
        clientConfirmed: true,
        doerConfirmed: true,
        [Op.or]: [
          { paymentStatus: { [Op.in]: ['pending', 'held', 'escrow'] } },
          {
            paymentStatus: 'released',
            updatedAt: { [Op.between]: [startDate, endDate] }
          }
        ]
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
          attributes: ['id', 'name', 'email', 'dni', 'phone', 'address', 'bankingInfo']
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
          amountToPay,
          commission,
          percentageOfBudget: contract.percentageOfBudget
            ? parseFloat(contract.percentageOfBudget.toString())
            : null
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
        paymentStatus: firstContract.paymentStatus,
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
    for (const row of paymentRows) {
      for (const worker of row.workers) {
        const bankName = worker.bankingInfo?.bankName || 'Sin banco';
        if (!bankSummary[bankName]) {
          bankSummary[bankName] = { count: 0, totalAmount: 0 };
        }
        bankSummary[bankName].count++;
        bankSummary[bankName].totalAmount += worker.amountToPay;
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
          bankBreakdown: bankSummary
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
 * Mark payment as processed
 * POST /api/admin/pending-payments/:contractId/mark-paid
 */
router.post("/:contractId/mark-paid", protect, requireRole(['admin', 'super_admin', 'owner']), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const { proofOfPayment, adminNotes, paymentMethod } = req.body;
    const adminId = req.user.id;

    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: User, as: 'doer' }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    // Update contract payment status
    contract.paymentStatus = 'completed';
    contract.paymentDate = new Date();
    await contract.save();

    // Update associated payment if exists
    const payment = await Payment.findOne({ where: { contractId } });
    if (payment) {
      payment.status = 'completed';
      payment.paidAt = new Date();
      await payment.save();
    }

    res.status(200).json({
      success: true,
      message: "Pago marcado como completado",
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

export default router;
