import { Invoice } from '../models/sql/Invoice.model.js';
import { default as Payment } from '../models/sql/Payment.model.js';
import { default as Contract } from '../models/sql/Contract.model.js';
import { default as WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { User } from '../models/sql/User.model.js';
import { Job } from '../models/sql/Job.model.js';
import pdfGenerator from './pdfGenerator.js';
import { Op } from 'sequelize';

/**
 * Invoice Service
 * Generates automatic invoices/receipts for all platform payments
 */

/**
 * Generate sequential invoice number: DOAPP-YYYY-NNNNNN
 */
async function getNextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `DOAPP-${year}-`;

  const lastInvoice = await Invoice.findOne({
    where: {
      invoiceNumber: { [Op.like]: `${prefix}%` },
    },
    order: [['invoiceNumber', 'DESC']],
  });

  let nextNum = 1;
  if (lastInvoice) {
    const lastNum = parseInt(lastInvoice.invoiceNumber.split('-')[2], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

/**
 * Generate invoice when a client makes a payment (job publication, contract payment)
 */
export async function generateClientPaymentInvoice(paymentId: string): Promise<Invoice | null> {
  try {
    const payment = await Payment.findByPk(paymentId, {
      include: [
        { model: User, as: 'payer', attributes: ['id', 'name', 'email', 'address', 'legalInfo'] },
        { model: Contract, as: 'contract', include: [{ model: Job, as: 'job', attributes: ['id', 'title'] }] },
      ],
    });

    if (!payment) {
      console.error(`[Invoice] Payment ${paymentId} not found`);
      return null;
    }

    // Don't duplicate invoices
    const existing = await Invoice.findOne({ where: { paymentId, type: 'client_payment' } });
    if (existing) return existing;

    const invoiceNumber = await getNextInvoiceNumber();
    const payer = (payment as any).payer;
    const contract = (payment as any).contract;
    const job = contract?.job;

    const amount = parseFloat(payment.amount as any) || 0;
    const platformFee = parseFloat(payment.platformFee as any) || 0;
    const total = amount;

    // Generate PDF
    const pdfPath = await pdfGenerator.generateInvoice({
      invoiceNumber,
      date: new Date(),
      sellerName: 'DOAPP S.R.L.',
      sellerEmail: 'facturacion@doapp.com.ar',
      sellerAddress: 'Argentina',
      sellerCuit: process.env.COMPANY_CUIT || '30-12345678-9',
      buyerName: payer?.name || 'Cliente',
      buyerEmail: payer?.email || '',
      buyerAddress: payer?.address?.city || '',
      buyerCuit: payer?.legalInfo?.vatNumber || payer?.legalInfo?.idNumber || '',
      items: [{
        description: job?.title || payment.description || 'Servicio de publicación',
        quantity: 1,
        unitPrice: amount,
        total: amount,
      }],
      subtotal: amount,
      commission: platformFee,
      commissionRate: parseFloat(payment.platformFeePercentage as any) || 0,
      total,
      currency: payment.currency || 'ARS',
      paymentMethod: payment.paymentMethod || 'mercadopago',
      transactionId: payment.mercadopagoPaymentId || payment.id,
      contractId: payment.contractId || undefined,
      jobTitle: job?.title,
    });

    // Create invoice record
    const invoice = await Invoice.create({
      invoiceNumber,
      type: 'client_payment',
      userId: payment.payerId,
      paymentId: payment.id,
      contractId: payment.contractId || null,
      amount,
      commission: platformFee,
      total,
      currency: payment.currency || 'ARS',
      pdfUrl: pdfPath,
      status: 'generated',
      metadata: {
        jobTitle: job?.title,
        jobId: job?.id,
        paymentMethod: payment.paymentMethod,
        transactionId: payment.mercadopagoPaymentId,
        description: payment.description,
      },
    });

    console.log(`✅ [Invoice] Generated client invoice ${invoiceNumber} for payment ${paymentId}`);
    return invoice;
  } catch (error: any) {
    console.error(`❌ [Invoice] Error generating client invoice:`, error.message);
    return null;
  }
}

/**
 * Generate receipt when platform pays a worker (admin marks payment as completed)
 */
export async function generateWorkerPaymentInvoice(contractId: string): Promise<Invoice | null> {
  try {
    const contract = await Contract.findByPk(contractId, {
      include: [
        { model: User, as: 'doer', attributes: ['id', 'name', 'email', 'address', 'legalInfo'] },
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] },
      ],
    });

    if (!contract) {
      console.error(`[Invoice] Contract ${contractId} not found`);
      return null;
    }

    // Don't duplicate
    const existing = await Invoice.findOne({ where: { contractId, type: 'worker_payment' } });
    if (existing) return existing;

    const invoiceNumber = await getNextInvoiceNumber();
    const doer = (contract as any).doer;
    const client = (contract as any).client;
    const job = (contract as any).job;

    const allocatedAmount = parseFloat(contract.allocatedAmount as any) || parseFloat(contract.price as any) || 0;
    const commission = parseFloat(contract.commission as any) || 0;
    const workerAmount = allocatedAmount - commission;

    // Generate PDF
    const pdfPath = await pdfGenerator.generateInvoice({
      invoiceNumber,
      date: new Date(),
      sellerName: doer?.name || 'Trabajador',
      sellerEmail: doer?.email || '',
      sellerAddress: doer?.address?.city || '',
      sellerCuit: doer?.legalInfo?.vatNumber || doer?.legalInfo?.idNumber || '',
      buyerName: 'DOAPP S.R.L.',
      buyerEmail: 'pagos@doapp.com.ar',
      buyerAddress: 'Argentina',
      buyerCuit: process.env.COMPANY_CUIT || '30-12345678-9',
      items: [{
        description: `Trabajo: ${job?.title || 'Servicio completado'}`,
        quantity: 1,
        unitPrice: allocatedAmount,
        total: allocatedAmount,
      }],
      subtotal: allocatedAmount,
      commission,
      commissionRate: allocatedAmount > 0 ? (commission / allocatedAmount) * 100 : 0,
      total: workerAmount,
      currency: 'ARS',
      paymentMethod: 'Transferencia bancaria',
      contractId: contract.id,
      jobTitle: job?.title,
      notes: `Pago por contrato completado. Cliente: ${client?.name || 'N/A'}`,
    });

    const invoice = await Invoice.create({
      invoiceNumber,
      type: 'worker_payment',
      userId: doer?.id || contract.doerId,
      contractId: contract.id,
      amount: allocatedAmount,
      commission,
      total: workerAmount,
      currency: 'ARS',
      pdfUrl: pdfPath,
      status: 'generated',
      metadata: {
        jobTitle: job?.title,
        jobId: job?.id,
        clientName: client?.name,
        commissionRate: allocatedAmount > 0 ? (commission / allocatedAmount) * 100 : 0,
        paymentMethod: 'bank_transfer',
      },
    });

    console.log(`✅ [Invoice] Generated worker invoice ${invoiceNumber} for contract ${contractId}`);
    return invoice;
  } catch (error: any) {
    console.error(`❌ [Invoice] Error generating worker invoice:`, error.message);
    return null;
  }
}

/**
 * Generate receipt when a withdrawal is completed
 */
export async function generateWithdrawalReceipt(withdrawalId: string): Promise<Invoice | null> {
  try {
    const withdrawal = await WithdrawalRequest.findByPk(withdrawalId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'address', 'legalInfo'] },
      ],
    });

    if (!withdrawal) {
      console.error(`[Invoice] Withdrawal ${withdrawalId} not found`);
      return null;
    }

    // Don't duplicate
    const existing = await Invoice.findOne({ where: { withdrawalId, type: 'withdrawal' } });
    if (existing) return existing;

    const invoiceNumber = await getNextInvoiceNumber();
    const user = (withdrawal as any).user;
    const amount = parseFloat(withdrawal.amount as any) || 0;

    const pdfPath = await pdfGenerator.generateReceipt({
      receiptNumber: invoiceNumber,
      date: new Date(),
      userName: user?.name || 'Usuario',
      userEmail: user?.email || '',
      description: `Retiro de fondos a CBU`,
      amount,
      currency: 'ARS',
      paymentMethod: 'Transferencia bancaria (CBU)',
      transactionId: withdrawal.id,
      status: 'Completado',
      notes: `Retiro procesado el ${new Date().toLocaleDateString('es-AR')}`,
    });

    const invoice = await Invoice.create({
      invoiceNumber,
      type: 'withdrawal',
      userId: user?.id || withdrawal.userId,
      withdrawalId: withdrawal.id,
      amount,
      commission: 0,
      total: amount,
      currency: 'ARS',
      pdfUrl: pdfPath,
      status: 'generated',
      metadata: {
        paymentMethod: 'bank_transfer',
        description: 'Retiro de fondos a CBU',
      },
    });

    console.log(`✅ [Invoice] Generated withdrawal receipt ${invoiceNumber} for withdrawal ${withdrawalId}`);
    return invoice;
  } catch (error: any) {
    console.error(`❌ [Invoice] Error generating withdrawal receipt:`, error.message);
    return null;
  }
}

/**
 * Get all invoices for a user
 */
export async function getUserInvoices(userId: string): Promise<Invoice[]> {
  return Invoice.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
}

/**
 * Get invoice by ID (with ownership check)
 */
export async function getInvoiceById(invoiceId: string, userId: string): Promise<Invoice | null> {
  return Invoice.findOne({
    where: { id: invoiceId, userId },
  });
}

export default {
  generateClientPaymentInvoice,
  generateWorkerPaymentInvoice,
  generateWithdrawalReceipt,
  getUserInvoices,
  getInvoiceById,
};
