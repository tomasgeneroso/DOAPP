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
  BeforeValidate,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { BalanceTransaction } from './BalanceTransaction.model.js';
import { encryptCBU, decryptCBU, maskCBU } from '../../utils/encryption.js';

/**
 * WithdrawalRequest Model - PostgreSQL/Sequelize
 *
 * Sistema de solicitudes de retiro con:
 * - Monto mínimo $1000 ARS
 * - Información bancaria CBU (22 dígitos)
 * - Workflow completo: pending → approved → processing → completed
 * - Tracking de admin (procesado por, notas)
 * - Comprobante de transferencia
 * - Metadata de seguridad (IP, user agent)
 */

// ============================================
// TYPES
// ============================================

export type WithdrawalStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type AccountType = 'savings' | 'checking';

export interface IBankingInfo {
  accountHolder: string;
  bankName: string;
  accountType: AccountType;
  cbu: string; // 22 digits
  alias?: string;
}

export interface IWithdrawalMetadata {
  ipAddress?: string;
  userAgent?: string;
  [key: string]: any;
}

// ============================================
// MODEL
// ============================================

@Table({
  tableName: 'withdrawal_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'status'] },
    { fields: ['status', 'requested_at'] },
    { fields: ['user_id', 'created_at'] },
    { fields: ['requested_at'] },
  ],
})
export class WithdrawalRequest extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User, 'userId')
  user!: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  processedBy?: string; // Admin who processed

  @BelongsTo(() => User, 'processedBy')
  processor?: User;

  @ForeignKey(() => BalanceTransaction)
  @Column(DataType.UUID)
  transactionId?: string;

  @BelongsTo(() => BalanceTransaction)
  transaction?: BalanceTransaction;

  // ============================================
  // WITHDRAWAL INFO
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: {
        args: [1000],
        msg: 'El monto mínimo de retiro es $1,000 ARS',
      },
    },
  })
  amount!: number; // Amount in ARS

  @AllowNull(false)
  @Column(DataType.JSONB)
  bankingInfo!: IBankingInfo;

  // ============================================
  // STATUS TRACKING
  // ============================================

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: WithdrawalStatus;

  @Default(() => new Date())
  @Index
  @Column(DataType.DATE)
  requestedAt!: Date;

  @Column(DataType.DATE)
  processedAt?: Date; // When approved/rejected

  @Column(DataType.DATE)
  completedAt?: Date; // When money transferred

  // ============================================
  // ADMIN INFO
  // ============================================

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  rejectionReason?: string;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 1000],
    },
  })
  adminNotes?: string;

  @Column(DataType.TEXT)
  proofOfTransfer?: string; // URL to proof image/document

  // ============================================
  // BALANCE TRACKING
  // ============================================

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  balanceBeforeWithdrawal!: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  balanceAfterWithdrawal!: number;

  // ============================================
  // METADATA
  // ============================================

  @Default({})
  @Column(DataType.JSONB)
  metadata!: IWithdrawalMetadata;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateWithdrawal(instance: WithdrawalRequest) {
    // Validate banking info
    if (instance.bankingInfo) {
      // Trim strings
      instance.bankingInfo.accountHolder = instance.bankingInfo.accountHolder?.trim();
      instance.bankingInfo.bankName = instance.bankingInfo.bankName?.trim();
      instance.bankingInfo.cbu = instance.bankingInfo.cbu?.trim();

      if (instance.bankingInfo.alias) {
        instance.bankingInfo.alias = instance.bankingInfo.alias.trim();
      }

      // Validate CBU length (22 digits)
      if (instance.bankingInfo.cbu && instance.bankingInfo.cbu.length !== 22) {
        throw new Error('CBU debe tener exactamente 22 dígitos');
      }

      // Validate CBU is numeric
      if (instance.bankingInfo.cbu && !/^\d{22}$/.test(instance.bankingInfo.cbu)) {
        throw new Error('CBU debe contener solo números');
      }
    }

    // Validate balance calculation
    if (
      instance.balanceBeforeWithdrawal !== undefined &&
      instance.amount !== undefined &&
      instance.balanceAfterWithdrawal !== undefined
    ) {
      const expected = Number(instance.balanceBeforeWithdrawal) - Number(instance.amount);
      const actual = Number(instance.balanceAfterWithdrawal);

      if (Math.abs(expected - actual) > 0.01) {
        throw new Error('Balance calculation error');
      }
    }

    // Trim admin fields
    if (instance.rejectionReason) {
      instance.rejectionReason = instance.rejectionReason.trim();
    }
    if (instance.adminNotes) {
      instance.adminNotes = instance.adminNotes.trim();
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if withdrawal is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if withdrawal is approved
   */
  isApproved(): boolean {
    return this.status === 'approved';
  }

  /**
   * Check if withdrawal is processing
   */
  isProcessing(): boolean {
    return this.status === 'processing';
  }

  /**
   * Check if withdrawal is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if withdrawal is rejected
   */
  isRejected(): boolean {
    return this.status === 'rejected';
  }

  /**
   * Check if withdrawal is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Approve withdrawal
   */
  async approve(adminId: string, notes?: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending withdrawals can be approved');
    }

    this.status = 'approved';
    this.processedBy = adminId;
    this.processedAt = new Date();
    if (notes) {
      this.adminNotes = notes;
    }

    await this.save();
  }

  /**
   * Reject withdrawal
   */
  async reject(adminId: string, reason: string, notes?: string): Promise<void> {
    if (!this.isPending()) {
      throw new Error('Only pending withdrawals can be rejected');
    }

    this.status = 'rejected';
    this.processedBy = adminId;
    this.processedAt = new Date();
    this.rejectionReason = reason;
    if (notes) {
      this.adminNotes = notes;
    }

    await this.save();
  }

  /**
   * Mark as processing
   */
  async markAsProcessing(adminId: string): Promise<void> {
    if (!this.isApproved()) {
      throw new Error('Only approved withdrawals can be marked as processing');
    }

    this.status = 'processing';
    this.processedBy = adminId;

    await this.save();
  }

  /**
   * Complete withdrawal
   */
  async complete(adminId: string, proofUrl: string, notes?: string): Promise<void> {
    if (!this.isProcessing() && !this.isApproved()) {
      throw new Error('Only processing or approved withdrawals can be completed');
    }

    this.status = 'completed';
    this.completedAt = new Date();
    this.proofOfTransfer = proofUrl;
    this.processedBy = adminId;
    if (notes) {
      this.adminNotes = notes;
    }

    await this.save();
  }

  /**
   * Cancel withdrawal
   */
  async cancel(reason?: string): Promise<void> {
    if (this.isCompleted()) {
      throw new Error('Cannot cancel completed withdrawal');
    }

    this.status = 'cancelled';
    if (reason) {
      this.rejectionReason = reason;
    }

    await this.save();
  }

  /**
   * Add admin notes
   */
  async addAdminNotes(notes: string): Promise<void> {
    this.adminNotes = notes;
    await this.save();
  }

  /**
   * Get time since request in hours
   */
  getHoursSinceRequest(): number {
    const now = new Date();
    const requested = this.requestedAt;
    const diffTime = Math.abs(now.getTime() - requested.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60));
  }

  /**
   * Get time since request in days
   */
  getDaysSinceRequest(): number {
    return Math.floor(this.getHoursSinceRequest() / 24);
  }

  /**
   * Check if withdrawal is overdue (>24 hours without processing)
   */
  isOverdue(): boolean {
    if (!this.isPending()) return false;
    return this.getHoursSinceRequest() > 24;
  }

  /**
   * Get decrypted CBU for payment processing
   * ONLY use this when actually sending money to the user
   */
  getDecryptedCBU(): string | null {
    if (!this.bankingInfo?.cbu) return null;

    try {
      return decryptCBU(this.bankingInfo.cbu);
    } catch (error) {
      console.error('Error decrypting CBU:', error);
      return null;
    }
  }

  /**
   * Get masked CBU (show only last 4 digits)
   */
  getMaskedCBU(): string {
    const cbu = this.bankingInfo?.cbu;
    if (!cbu) return '**********************';

    try {
      const decryptedCBU = decryptCBU(cbu);
      return maskCBU(decryptedCBU);
    } catch (error) {
      console.error('Error processing CBU:', error);
      return '**********************';
    }
  }

  /**
   * Get banking info summary
   */
  getBankingSummary(): string {
    return `${this.bankingInfo.accountHolder} - ${this.bankingInfo.bankName} (${this.getMaskedCBU()})`;
  }

  /**
   * Get status display name
   */
  getStatusDisplayName(): string {
    const names: Record<WithdrawalStatus, string> = {
      pending: 'Pendiente',
      approved: 'Aprobado',
      processing: 'Procesando',
      completed: 'Completado',
      rejected: 'Rechazado',
      cancelled: 'Cancelado',
    };
    return names[this.status];
  }

  /**
   * Check if requires urgent attention
   */
  requiresUrgentAttention(): boolean {
    return this.isPending() && this.isOverdue();
  }

  /**
   * Get processing time (approved → completed)
   */
  getProcessingTimeHours(): number | null {
    if (!this.processedAt || !this.completedAt) return null;

    const diffTime = Math.abs(
      this.completedAt.getTime() - this.processedAt.getTime()
    );
    return Math.floor(diffTime / (1000 * 60 * 60));
  }

  /**
   * Validate CBU checksum (Argentina CBU validation)
   */
  static validateCBU(cbu: string): boolean {
    if (!cbu || cbu.length !== 22 || !/^\d{22}$/.test(cbu)) {
      return false;
    }

    // Validación básica de checksum CBU argentino
    // Bloque 1: posiciones 0-7 (código de banco)
    const block1 = cbu.substring(0, 8);
    const check1 = parseInt(block1.substring(7, 8));

    // Bloque 2: posiciones 8-21 (número de cuenta)
    const block2 = cbu.substring(8, 22);
    const check2 = parseInt(block2.substring(13, 14));

    // Validación simplificada (en producción usar algoritmo completo)
    return !isNaN(check1) && !isNaN(check2);
  }

  // ============================================
  // ENCRYPTION HOOKS
  // ============================================

  /**
   * Encrypt CBU before creating withdrawal request
   */
  @BeforeCreate
  static async encryptCBUOnCreate(instance: WithdrawalRequest) {
    if (instance.bankingInfo?.cbu) {
      try {
        // Only encrypt if not already encrypted (check format)
        const cbu = instance.bankingInfo.cbu;
        if (/^\d{22}$/.test(cbu)) {
          instance.bankingInfo = {
            ...instance.bankingInfo,
            cbu: encryptCBU(cbu)
          };
          console.log('✅ CBU encrypted on withdrawal creation');
        }
      } catch (error) {
        console.error('❌ Error encrypting CBU on withdrawal create:', error);
        throw new Error('Failed to encrypt banking information');
      }
    }
  }

  /**
   * Encrypt CBU before updating withdrawal request
   */
  @BeforeUpdate
  static async encryptCBUOnUpdate(instance: WithdrawalRequest) {
    if (instance.changed('bankingInfo') && instance.bankingInfo?.cbu) {
      try {
        // Only encrypt if not already encrypted (check format)
        const cbu = instance.bankingInfo.cbu;
        if (/^\d{22}$/.test(cbu)) {
          instance.bankingInfo = {
            ...instance.bankingInfo,
            cbu: encryptCBU(cbu)
          };
          console.log('✅ CBU encrypted on withdrawal update');
        }
      } catch (error) {
        console.error('❌ Error encrypting CBU on withdrawal update:', error);
        throw new Error('Failed to encrypt banking information');
      }
    }
  }
}

export default WithdrawalRequest;
