import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  Index,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Payment } from './Payment.model.js';
import { encryptBinanceId, decryptBinanceId, isEncrypted, maskBinanceId } from '../../utils/encryption.js';

/**
 * PaymentProof Model - PostgreSQL/Sequelize
 *
 * Modelo para comprobantes de pago (transferencias bancarias, efectivo, etc.)
 * Permite a los usuarios subir evidencia de pagos realizados fuera de la plataforma
 */

export type PaymentProofFileType = 'pdf' | 'png' | 'jpeg' | 'jpg';
export type PaymentProofStatus = 'pending' | 'approved' | 'rejected';

@Table({
  tableName: 'payment_proofs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['payment_id'] },
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['is_active'] },
    { fields: ['payment_id', 'is_active'], name: 'payment_active_proof_index' },
  ],
})
export class PaymentProof extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Payment)
  @Index
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  paymentId!: string;

  @BelongsTo(() => Payment, { onDelete: 'CASCADE' })
  payment?: Payment;

  @ForeignKey(() => User)
  @Index
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  userId!: string;

  @BelongsTo(() => User, 'userId')
  user?: User;

  @ForeignKey(() => User)
  @Index
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  verifiedBy?: string;

  @BelongsTo(() => User, 'verifiedBy')
  verifier?: User;

  // ============================================
  // FILE INFORMATION
  // ============================================

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  fileUrl!: string;

  @Column({
    type: DataType.ENUM('pdf', 'png', 'jpeg', 'jpg'),
    allowNull: false,
  })
  fileType!: PaymentProofFileType;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  fileName!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    comment: 'File size in bytes',
  })
  fileSize!: number;

  // ============================================
  // PAYMENT DETAILS (for manual transfers)
  // ============================================

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'Binance nickname for crypto transfers',
  })
  binanceNickname?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'Transaction ID or hash from Binance/blockchain',
  })
  binanceTransactionId?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'Sender Binance ID or nickname (who sent the payment)',
  })
  binanceSenderUserId?: string;

  @Column({
    type: DataType.DECIMAL(20, 8),
    allowNull: true,
    comment: 'Amount transferred (e.g., USDT amount for Binance)',
  })
  transferAmount?: number;

  @Column({
    type: DataType.STRING(10),
    allowNull: true,
    comment: 'Currency of the transfer (e.g., USDT, ARS)',
  })
  transferCurrency?: string;

  // ============================================
  // BANK TRANSFER DETAILS
  // ============================================

  @Default(true)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    comment: 'Whether the bank account belongs to the user or a third party',
  })
  isOwnBankAccount?: boolean;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'Name of the third party account holder if isOwnBankAccount is false',
  })
  thirdPartyAccountHolder?: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    comment: 'Name of the bank from which the transfer was made',
  })
  senderBankName?: string;

  // ============================================
  // STATUS AND VERIFICATION
  // ============================================

  @Default('pending')
  @Column({
    type: DataType.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
  })
  status!: PaymentProofStatus;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  rejectionReason?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: 'Admin notes about the verification',
  })
  notes?: string;

  // ============================================
  // TIMESTAMPS
  // ============================================

  @Default(DataType.NOW)
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  uploadedAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  verifiedAt?: Date;

  // ============================================
  // FLAGS
  // ============================================

  @Default(true)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    comment: 'Only the latest proof for a payment should be active',
  })
  isActive!: boolean;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Get masked Binance nickname for display
   */
  getMaskedBinanceNickname(): string | null {
    if (!this.binanceNickname) return null;
    try {
      const decrypted = isEncrypted(this.binanceNickname)
        ? decryptBinanceId(this.binanceNickname)
        : this.binanceNickname;
      return maskBinanceId(decrypted);
    } catch {
      return '********';
    }
  }

  /**
   * Get masked Binance transaction ID for display
   */
  getMaskedTransactionId(): string | null {
    if (!this.binanceTransactionId) return null;
    try {
      const decrypted = isEncrypted(this.binanceTransactionId)
        ? decryptBinanceId(this.binanceTransactionId)
        : this.binanceTransactionId;
      return maskBinanceId(decrypted);
    } catch {
      return '********';
    }
  }

  /**
   * Get decrypted Binance data (ONLY for admin verification)
   */
  getDecryptedBinanceData(): { nickname?: string; transactionId?: string; senderUserId?: string } {
    try {
      return {
        nickname: this.binanceNickname && isEncrypted(this.binanceNickname)
          ? decryptBinanceId(this.binanceNickname)
          : this.binanceNickname,
        transactionId: this.binanceTransactionId && isEncrypted(this.binanceTransactionId)
          ? decryptBinanceId(this.binanceTransactionId)
          : this.binanceTransactionId,
        senderUserId: this.binanceSenderUserId && isEncrypted(this.binanceSenderUserId)
          ? decryptBinanceId(this.binanceSenderUserId)
          : this.binanceSenderUserId,
      };
    } catch (error) {
      console.error('Error decrypting Binance data:', error);
      return {};
    }
  }

  // ============================================
  // HOOKS
  // ============================================

  /**
   * Encrypt sensitive Binance data before creating
   */
  @BeforeCreate
  static async encryptBinanceDataOnCreate(instance: PaymentProof) {
    try {
      if (instance.binanceNickname && !isEncrypted(instance.binanceNickname)) {
        instance.binanceNickname = encryptBinanceId(instance.binanceNickname);
      }
      if (instance.binanceTransactionId && !isEncrypted(instance.binanceTransactionId)) {
        instance.binanceTransactionId = encryptBinanceId(instance.binanceTransactionId);
      }
      if (instance.binanceSenderUserId && !isEncrypted(instance.binanceSenderUserId)) {
        instance.binanceSenderUserId = encryptBinanceId(instance.binanceSenderUserId);
      }
    } catch (error) {
      console.error('Error encrypting Binance data on create:', error);
      throw new Error('Failed to encrypt payment proof data');
    }
  }

  /**
   * Encrypt sensitive Binance data before updating
   */
  @BeforeUpdate
  static async encryptBinanceDataOnUpdate(instance: PaymentProof) {
    try {
      if (instance.changed('binanceNickname') && instance.binanceNickname && !isEncrypted(instance.binanceNickname)) {
        instance.binanceNickname = encryptBinanceId(instance.binanceNickname);
      }
      if (instance.changed('binanceTransactionId') && instance.binanceTransactionId && !isEncrypted(instance.binanceTransactionId)) {
        instance.binanceTransactionId = encryptBinanceId(instance.binanceTransactionId);
      }
      if (instance.changed('binanceSenderUserId') && instance.binanceSenderUserId && !isEncrypted(instance.binanceSenderUserId)) {
        instance.binanceSenderUserId = encryptBinanceId(instance.binanceSenderUserId);
      }
    } catch (error) {
      console.error('Error encrypting Binance data on update:', error);
      throw new Error('Failed to encrypt payment proof data');
    }
  }
}

export default PaymentProof;
