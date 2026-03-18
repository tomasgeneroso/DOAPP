import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { default as Payment } from './Payment.model.js';
import { default as Contract } from './Contract.model.js';
import { default as WithdrawalRequest } from './WithdrawalRequest.model.js';

// ============================================
// TYPES
// ============================================

export type InvoiceType = 'client_payment' | 'worker_payment' | 'commission' | 'withdrawal';
export type InvoiceStatus = 'generated' | 'sent' | 'void';

export interface InvoiceMetadata {
  jobTitle?: string;
  jobId?: string;
  workerName?: string;
  clientName?: string;
  commissionRate?: number;
  paymentMethod?: string;
  transactionId?: string;
  description?: string;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'invoices',
  timestamps: true,
  underscored: true,
})
export class Invoice extends Model {
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, primaryKey: true })
  id!: string;

  @Index({ unique: true })
  @AllowNull(false)
  @Column(DataType.STRING(30))
  invoiceNumber!: string;

  @AllowNull(false)
  @Column(DataType.ENUM('client_payment', 'worker_payment', 'commission', 'withdrawal'))
  type!: InvoiceType;

  // ============================================
  // RELATIONS
  // ============================================

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User)
  user?: User;

  @ForeignKey(() => Payment)
  @Column(DataType.UUID)
  paymentId?: string;

  @BelongsTo(() => Payment)
  payment?: Payment;

  @ForeignKey(() => Contract)
  @Column(DataType.UUID)
  contractId?: string;

  @BelongsTo(() => Contract)
  contract?: Contract;

  @ForeignKey(() => WithdrawalRequest)
  @Column(DataType.UUID)
  withdrawalId?: string;

  @BelongsTo(() => WithdrawalRequest)
  withdrawal?: WithdrawalRequest;

  // ============================================
  // AMOUNTS
  // ============================================

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  amount!: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  commission!: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  total!: number;

  @Default('ARS')
  @Column(DataType.STRING(5))
  currency!: string;

  // ============================================
  // PDF
  // ============================================

  @Column(DataType.STRING(500))
  pdfUrl?: string;

  // ============================================
  // METADATA
  // ============================================

  @Default({})
  @Column(DataType.JSONB)
  metadata?: InvoiceMetadata;

  @Default('generated')
  @Column(DataType.ENUM('generated', 'sent', 'void'))
  status!: InvoiceStatus;

  // ============================================
  // STATIC METHODS
  // ============================================

  /**
   * Generate next sequential invoice number: DOAPP-YYYY-NNNNNN
   */
  static async generateNextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DOAPP-${year}-`;

    const lastInvoice = await Invoice.findOne({
      where: {
        invoiceNumber: {
          [Symbol.for('startsWith')]: prefix,
        },
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
}

export default Invoice;
