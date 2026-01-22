import express, { Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { protect, AuthRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { User } from "../../models/sql/User.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { Payment } from "../../models/sql/Payment.model.js";
import { PaymentProof } from "../../models/sql/PaymentProof.model.js";
import { Notification } from "../../models/sql/Notification.model.js";
import { Op } from 'sequelize';
import { isValidUUID } from "../../utils/sanitizer.js";

const router = express.Router();

// Configure multer for worker payment proof uploads (admin uploads proof of bank transfer to worker)
const workerPaymentProofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/worker-payment-proofs';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `worker-payment-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const workerPaymentProofUpload = multer({
  storage: workerPaymentProofStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes y PDFs.'));
    }
  }
});

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
  hasBankingInfo: boolean;
  amountToPay: number;
  commission: number;
  percentageOfBudget: number | null;
}

interface PaymentProofInfo {
  id: string;
  fileUrl: string;
  status: string;
  uploadedAt: Date;
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
  escrowStatus: string;
  contractStatus: string;
  // Payment record status (for admin verification tracking)
  paymentRecordStatus: string;
  commissionVerified: boolean;
  workers: WorkerPaymentInfo[];
  // Payment proof info (client's payment proof)
  paymentId?: string;
  proofs?: PaymentProofInfo[];
  // Worker payment proof (admin's proof of transfer to worker)
  workerPaymentProofUrl?: string | null;
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
 */
router.get("/", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      period = 'daily',
      startDate: customStart,
      endDate: customEnd,
      sortBy = 'completedAt',
      sortOrder = 'desc',
      onlyVerified = 'true', // Only show contracts where commission is verified (Payment in held_escrow)
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

    // Map sortBy to actual column names (completedAt doesn't exist, use updatedAt instead)
    const sortByColumnMap: Record<string, string> = {
      'completedAt': 'updatedAt',
      'contractNumber': 'id',
      'amount': 'price',
      'clientName': 'clientId', // Will be sorted in-memory later
    };
    const actualSortBy = sortByColumnMap[sortBy as string] || sortBy as string;

    // First, find all payments that are confirmed for payout
    const confirmedPayments = await Payment.findAll({
      where: {
        status: 'confirmed_for_payout',
        paymentType: { [Op.in]: ['contract_payment', 'escrow_deposit'] }
      },
      attributes: ['contractId']
    });

    const confirmedContractIds = confirmedPayments.map(p => p.contractId).filter(Boolean) as string[];

    // If no confirmed payments, return empty result early (prevents UUID error)
    if (confirmedContractIds.length === 0) {
      res.status(200).json({
        success: true,
        report: {
          period: period as string,
          startDate,
          endDate,
          generatedAt: new Date(),
          summary: {
            totalContracts: 0,
            totalWorkers: 0,
            totalAmountToPay: 0,
            totalCommissionCollected: 0,
            averagePaymentPerWorker: 0,
            bankBreakdown: {},
          },
          data: []
        }
      });
      return;
    }

    // Query contracts that are ready for worker payout
    // Show contracts where the Payment is in 'confirmed_for_payout' status
    const contracts = await Contract.findAll({
      where: {
        id: { [Op.in]: confirmedContractIds },
        // Worker hasn't been paid yet (not 'completed')
        status: { [Op.notIn]: ['cancelled', 'rejected'] }
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
      order: [[actualSortBy, sortOrder as string]]
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
        });
      }

      // Skip if no workers match payment method filter
      if (workers.length === 0) continue;

      // Get the Payment record for this contract to check commission verification
      const paymentRecord = await Payment.findOne({
        where: { contractId: firstContract.id },
        attributes: ['id', 'status', 'amount', 'platformFee'],
        include: [
          {
            model: PaymentProof,
            as: 'proofs',
            where: { isActive: true },
            required: false,
            attributes: ['id', 'fileUrl', 'status', 'uploadedAt']
          }
        ]
      });

      // Commission is verified if Payment status is 'held_escrow', 'confirmed_for_payout', 'completed', or 'awaiting_confirmation'
      const commissionVerifiedStatuses = ['held_escrow', 'confirmed_for_payout', 'completed', 'awaiting_confirmation', 'released'];
      const commissionVerified = paymentRecord
        ? commissionVerifiedStatuses.includes(paymentRecord.status)
        : false;

      // Skip if onlyVerified=true and commission is not verified
      // This ensures contracts only appear in "Pagos a Trabajadores" after admin verified the payment
      if (onlyVerified === 'true' && !commissionVerified) {
        continue;
      }

      // Get proofs from the payment record
      const paymentProofs: PaymentProofInfo[] = (paymentRecord as any)?.proofs?.map((p: any) => ({
        id: p.id,
        fileUrl: p.fileUrl,
        status: p.status,
        uploadedAt: p.uploadedAt
      })) || [];

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
        escrowStatus: firstContract.escrowStatus || 'pending',
        contractStatus: firstContract.status,
        paymentRecordStatus: paymentRecord?.status || 'no_payment_record',
        commissionVerified,
        workers,
        paymentId: paymentRecord?.id,
        proofs: paymentProofs,
        // Worker payment proof (admin's proof of transfer to worker)
        workerPaymentProofUrl: firstContract.paymentProofUrl || null,
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
          bankBreakdown: bankSummary,
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
 * Export pending payments report as CSV
 * GET /api/admin/pending-payments/export/csv
 */
router.get("/export/csv", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
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
 * Get completed payments history
 * GET /api/admin/pending-payments/completed
 */
router.get("/completed/list", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      period = 'monthly',
      sortBy = 'paymentProcessedAt',
      sortOrder = 'desc',
    } = req.query;

    // Calculate date range based on period
    let startDate = new Date();
    const endDate = new Date();

    switch (period) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'all':
        startDate = new Date(0); // All time
        break;
    }

    // Query contracts where payment is completed
    const contracts = await Contract.findAll({
      where: {
        paymentStatus: 'completed',
        paymentProcessedAt: { [Op.gte]: startDate }
      },
      include: [
        {
          model: User,
          as: 'client',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'doer',
          attributes: ['id', 'name', 'email', 'bankingInfo']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title']
        },
        {
          model: User,
          as: 'paymentProcessor',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [[sortBy as string === 'paymentProcessedAt' ? 'paymentProcessedAt' : 'updatedAt', sortOrder as string]]
    });

    // Build payment rows
    const completedPayments = contracts.map((contract, index) => {
      const doer = contract.doer as any;
      const client = contract.client as any;
      const job = contract.job as any;
      const processor = (contract as any).paymentProcessor as any;

      const workerAmount = contract.allocatedAmount || contract.price;
      const commission = contract.commission || 0;
      const netAmount = parseFloat(workerAmount.toString()) - parseFloat(commission.toString());

      return {
        contractId: contract.id,
        rowNumber: index + 1,
        jobId: job?.id,
        jobTitle: job?.title || 'N/A',
        clientName: client?.name || 'N/A',
        clientEmail: client?.email || 'N/A',
        workerName: doer?.name || 'N/A',
        workerEmail: doer?.email || 'N/A',
        bankName: doer?.bankingInfo?.bankName || 'N/A',
        cbu: doer?.bankingInfo?.cbu || 'N/A',
        grossAmount: parseFloat(workerAmount.toString()),
        commission: parseFloat(commission.toString()),
        netAmount,
        paymentProofUrl: contract.paymentProofUrl,
        paymentAdminNotes: contract.paymentAdminNotes,
        processedBy: processor?.name || 'Sistema',
        processedByEmail: processor?.email,
        processedAt: contract.paymentProcessedAt,
        completedAt: contract.clientConfirmedAt,
      };
    });

    // Calculate summary
    const totalPayments = completedPayments.length;
    const totalGrossAmount = completedPayments.reduce((sum, p) => sum + p.grossAmount, 0);
    const totalCommission = completedPayments.reduce((sum, p) => sum + p.commission, 0);
    const totalNetPaid = completedPayments.reduce((sum, p) => sum + p.netAmount, 0);

    res.status(200).json({
      success: true,
      data: completedPayments,
      summary: {
        totalPayments,
        totalGrossAmount,
        totalCommission,
        totalNetPaid,
      },
      period,
    });
  } catch (error: any) {
    console.error("Error fetching completed payments:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener pagos completados"
    });
  }
});

/**
 * Upload worker payment proof (comprobante de transferencia al trabajador)
 * POST /api/admin/pending-payments/upload-proof
 *
 * IMPORTANT: This route MUST be defined BEFORE parameterized routes like /:contractId
 */
router.post("/upload-proof", protect, requireRole('admin', 'super_admin', 'owner'), workerPaymentProofUpload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No se subió ningún archivo" });
      return;
    }

    const fileUrl = `/uploads/worker-payment-proofs/${req.file.filename}`;

    res.status(200).json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error: any) {
    console.error("Error uploading worker payment proof:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al subir comprobante"
    });
  }
});

/**
 * Get detailed payment info for a specific contract
 * GET /api/admin/pending-payments/:contractId
 *
 * IMPORTANT: This route MUST be defined AFTER all static routes like /export/csv, /completed/list, and /upload-proof
 * to prevent Express from matching "export" or "completed" as a contractId
 */
router.get("/:contractId", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(contractId)) {
      res.status(400).json({ success: false, message: "ID de contrato inválido" });
      return;
    }

    const contract = await Contract.findByPk(contractId, {
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
          attributes: ['id', 'title', 'description', 'price', 'maxWorkers', 'selectedWorkers', 'workerAllocations', 'location']
        }
      ]
    });

    if (!contract) {
      res.status(404).json({ success: false, message: "Contrato no encontrado" });
      return;
    }

    const doer = contract.doer as any;
    const client = contract.client as any;
    const job = contract.job as any;

    // Get associated payment
    const payment = await Payment.findOne({
      where: { contractId }
    });

    // Get proofs separately to avoid query issues
    let proofs: any[] = [];
    if (payment) {
      const paymentProofs = await PaymentProof.findAll({
        where: { paymentId: payment.id, isActive: true },
        attributes: ['id', 'fileUrl', 'status', 'uploadedAt']
      });
      proofs = paymentProofs.map(p => p.toJSON());
    }

    // Calculate amounts
    const workerAmount = contract.allocatedAmount || contract.price;
    const commission = contract.commission || 0;
    const netAmount = parseFloat(workerAmount.toString()) - parseFloat(commission.toString());

    // Build detailed payment info
    const paymentInfo = {
      contract: {
        id: contract.id,
        status: contract.status,
        paymentStatus: contract.paymentStatus,
        escrowStatus: contract.escrowStatus,
        price: parseFloat(contract.price.toString()),
        allocatedAmount: contract.allocatedAmount ? parseFloat(contract.allocatedAmount.toString()) : null,
        percentageOfBudget: contract.percentageOfBudget ? parseFloat(contract.percentageOfBudget.toString()) : null,
        commission: parseFloat(commission.toString()),
        netAmount,
        createdAt: contract.createdAt,
        completedAt: contract.clientConfirmedAt || contract.updatedAt,
        paymentProcessedAt: contract.paymentProcessedAt,
        paymentProofUrl: contract.paymentProofUrl,
        paymentAdminNotes: contract.paymentAdminNotes,
      },
      job: job ? {
        id: job.id,
        title: job.title,
        description: job.description,
        totalBudget: parseFloat(job.price.toString()),
        maxWorkers: job.maxWorkers || 1,
        selectedWorkersCount: Array.isArray(job.selectedWorkers) ? job.selectedWorkers.length : 1,
        location: job.location || 'No especificada',
      } : null,
      client: client ? {
        id: client.id,
        name: client.name,
        email: client.email,
        dni: client.dni,
        phone: client.phone,
        address: client.address,
      } : null,
      worker: doer ? {
        id: doer.id,
        name: doer.name,
        email: doer.email,
        dni: doer.dni,
        phone: doer.phone,
        address: doer.address,
        bankingInfo: doer.bankingInfo ? {
          bankName: doer.bankingInfo.bankName || null,
          accountHolder: doer.bankingInfo.accountHolder || null,
          accountType: doer.bankingInfo.accountType || null,
          cbu: doer.bankingInfo.cbu || null,
          alias: doer.bankingInfo.alias || null,
        } : null,
        hasBankingInfo: !!(doer.bankingInfo?.cbu || doer.bankingInfo?.alias),
      } : null,
      payment: payment ? {
        id: payment.id,
        status: payment.status,
        amount: parseFloat(payment.amount.toString()),
        platformFee: payment.platformFee ? parseFloat(payment.platformFee.toString()) : null,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt,
        proofs: proofs,
      } : null,
    };

    res.status(200).json({
      success: true,
      data: paymentInfo
    });
  } catch (error: any) {
    console.error("Error fetching contract payment details:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener detalles del pago"
    });
  }
});

/**
 * Mark payment as processed (manual bank transfer)
 * POST /api/admin/pending-payments/:contractId/mark-paid
 */
router.post("/:contractId/mark-paid", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const { proofOfPayment, adminNotes, paymentMethod, deductions } = req.body;
    const adminId = req.user.id;

    // Validate UUID to prevent PostgreSQL errors
    if (!isValidUUID(contractId)) {
      res.status(400).json({ success: false, message: "ID de contrato inválido" });
      return;
    }

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

    // Calculate amount after fees (for reference)
    const workerAmount = contract.allocatedAmount || contract.price;
    const commission = contract.commission || 0;
    const netBeforeDeductions = parseFloat(workerAmount.toString()) - parseFloat(commission.toString());

    // Apply deductions if provided
    const bankFee = deductions?.bankFee || 0;
    const taxAmount = deductions?.taxAmount || 0;
    const otherDeductions = deductions?.otherDeductions || 0;
    const finalAmountPaid = deductions?.finalAmountPaid || netBeforeDeductions;

    // Use the final amount with all deductions for the worker's balance
    const netAmount = finalAmountPaid;

    // Update contract payment status with proof and admin info
    contract.paymentStatus = 'completed';
    contract.paymentDate = new Date();
    contract.paymentProcessedBy = adminId;
    contract.paymentProcessedAt = new Date();
    if (proofOfPayment) contract.paymentProofUrl = proofOfPayment;
    // Store admin notes with deductions info
    const fullNotes = [
      adminNotes,
      deductions ? `Deducciones: Comisión bancaria: $${bankFee}, Impuestos: $${taxAmount.toFixed(2)} (${deductions.taxPercentage || 0}%), Otras: $${otherDeductions}${deductions.otherDeductionsDescription ? ` (${deductions.otherDeductionsDescription})` : ''}. Monto final: $${finalAmountPaid.toFixed(2)}` : ''
    ].filter(Boolean).join(' | ');
    if (fullNotes) contract.paymentAdminNotes = fullNotes;
    await contract.save();

    // Update worker's balance with the payment
    if (doer) {
      const currentBalance = parseFloat(doer.balance || 0);
      const newBalance = currentBalance + netAmount;
      await User.update(
        { balance: newBalance, availableBalance: newBalance },
        { where: { id: doer.id } }
      );

      // Update or create the balance transaction as completed
      const BalanceTransaction = (await import('../../models/sql/BalanceTransaction.model.js')).default;
      const existingTransaction = await BalanceTransaction.findOne({
        where: { relatedContractId: contract.id, type: 'payment' }
      });

      if (existingTransaction) {
        existingTransaction.status = 'completed';
        existingTransaction.balanceAfter = newBalance;
        existingTransaction.metadata = {
          ...(existingTransaction.metadata || {}),
          processedBy: adminId,
          processedAt: new Date(),
          proofOfPayment,
          deductions: deductions || null,
          grossAmount: netBeforeDeductions,
          finalAmount: netAmount,
        };
        await existingTransaction.save();
      } else {
        await BalanceTransaction.create({
          userId: doer.id,
          type: 'payment',
          amount: netAmount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description: `Pago por contrato - ${job?.title || 'Trabajo'}`,
          status: 'completed',
          relatedContractId: contract.id,
          metadata: {
            processedBy: adminId,
            processedAt: new Date(),
            proofOfPayment,
            deductions: deductions || null,
            grossAmount: netBeforeDeductions,
            finalAmount: netAmount,
          },
        });
      }
    }

    // Update associated payment if exists and create proof record
    // Look for the payment that is in confirmed_for_payout status (ready for worker payout)
    const payment = await Payment.findOne({
      where: {
        contractId,
        status: 'confirmed_for_payout'
      }
    });

    // If not found, try to find any payment associated with this contract
    const anyPayment = payment || await Payment.findOne({ where: { contractId } });
    console.log(`[mark-paid] Contract ${contractId}: Payment (confirmed_for_payout) found = ${!!payment}, Any payment found = ${!!anyPayment}, current status = ${anyPayment?.status}`);

    // Use the confirmed_for_payout payment if found, otherwise use any payment
    const paymentToUpdate = payment || anyPayment;

    if (paymentToUpdate) {
      const previousStatus = paymentToUpdate.status;
      paymentToUpdate.status = 'completed';
      paymentToUpdate.paidAt = new Date();
      if (adminNotes) paymentToUpdate.adminNotes = adminNotes;
      await paymentToUpdate.save();
      console.log(`[mark-paid] Payment ${paymentToUpdate.id}: status changed from ${previousStatus} to ${paymentToUpdate.status}`);

      // Verify the change was persisted
      const verifyPayment = await Payment.findByPk(paymentToUpdate.id);
      console.log(`[mark-paid] VERIFICATION: Payment ${paymentToUpdate.id} status in DB = ${verifyPayment?.status}`);
      if (verifyPayment?.status !== 'completed') {
        console.error(`[mark-paid] ERROR: Payment status was not updated! Expected 'completed', got '${verifyPayment?.status}'`);
      }

      // Also update any other payments for this contract that might be in confirmed_for_payout
      const otherPayments = await Payment.findAll({
        where: {
          contractId,
          status: 'confirmed_for_payout',
          id: { [Op.ne]: paymentToUpdate.id }
        }
      });

      for (const otherPayment of otherPayments) {
        const otherPrevStatus = otherPayment.status;
        otherPayment.status = 'completed';
        otherPayment.paidAt = new Date();
        await otherPayment.save();
        console.log(`[mark-paid] Additional payment ${otherPayment.id}: status changed from ${otherPrevStatus} to completed`);
      }

      // Create a PaymentProof record if proof was uploaded
      if (proofOfPayment) {
        const proof = await PaymentProof.create({
          paymentId: paymentToUpdate.id,
          fileUrl: proofOfPayment,
          status: 'approved',
          uploadedAt: new Date(),
          verifiedBy: adminId,
          verifiedAt: new Date(),
          isActive: true,
          notes: `Comprobante de pago al trabajador - ${job?.title || 'Contrato'}`,
        });
        console.log(`[mark-paid] PaymentProof created: ${proof.id} for payment ${paymentToUpdate.id}`);
      }
    } else {
      console.log(`[mark-paid] WARNING: No Payment record found for contract ${contractId}`);
    }

    // Notify worker about payment
    await Notification.create({
      recipientId: doer?.id,
      type: 'success',
      category: 'payment',
      title: '¡Pago recibido!',
      message: `Has recibido $${netAmount.toLocaleString('es-AR')} ARS por "${job?.title}". El pago ha sido transferido a tu cuenta bancaria.`,
      relatedModel: 'Contract',
      relatedId: contract.id,
      sentVia: ['in_app', 'email', 'push'],
      data: {
        amount: netAmount,
        contractId: contract.id,
        jobTitle: job?.title,
      },
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
 * Fix stuck payment - marks all payments for a contract as completed
 * POST /api/admin/pending-payments/:contractId/fix-status
 */
router.post("/:contractId/fix-status", protect, requireRole('admin', 'super_admin', 'owner'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { contractId } = req.params;
    const adminId = req.user.id;

    // Validate UUID
    if (!isValidUUID(contractId)) {
      res.status(400).json({ success: false, message: "ID de contrato inválido" });
      return;
    }

    // Find all payments for this contract
    const allPayments = await Payment.findAll({ where: { contractId } });

    console.log(`[fix-status] Contract ${contractId}: Found ${allPayments.length} payments`);
    allPayments.forEach(p => {
      console.log(`[fix-status] - Payment ${p.id}: status=${p.status}, type=${p.paymentType}`);
    });

    // Check the contract
    const contract = await Contract.findByPk(contractId);
    console.log(`[fix-status] Contract status: ${contract?.status}, paymentStatus: ${contract?.paymentStatus}, paymentProofUrl: ${contract?.paymentProofUrl ? 'YES' : 'NO'}`);

    // Update all payments to completed
    let updatedCount = 0;
    for (const payment of allPayments) {
      if (payment.status !== 'completed') {
        const prevStatus = payment.status;
        payment.status = 'completed';
        payment.paidAt = new Date();
        await payment.save();
        console.log(`[fix-status] Payment ${payment.id}: ${prevStatus} -> completed`);
        updatedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Fixed ${updatedCount} payments for contract ${contractId}`,
      paymentsFound: allPayments.length,
      paymentsUpdated: updatedCount,
      contractStatus: contract?.status,
      contractPaymentStatus: contract?.paymentStatus,
    });
  } catch (error: any) {
    console.error("Error fixing payment status:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al corregir estado del pago"
    });
  }
});

export default router;
