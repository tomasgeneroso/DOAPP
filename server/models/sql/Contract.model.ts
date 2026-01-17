import 'reflect-metadata';
import crypto from 'crypto';
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
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Job } from './Job.model.js';

/**
 * Contract Model - PostgreSQL/Sequelize
 *
 * Modelo de contratos con soporte completo para:
 * - Escrow system (retención de fondos)
 * - Sistema de pareamiento (códigos de inicio)
 * - Confirmación bilateral (cliente + doer)
 * - Extensiones de contrato (máx 1)
 * - Modificaciones de precio con historial
 * - Disputas
 * - Entregas múltiples
 * - Soft delete
 */

export type ContractStatus =
  | 'pending'
  | 'ready'           // Listo - aprobado por admin, esperando aceptación de ambas partes
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'awaiting_confirmation'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'in_review';

export type PaymentStatus = 'pending' | 'held' | 'released' | 'refunded' | 'completed' | 'escrow' | 'pending_payout';
export type DeliveryStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected';

interface Delivery {
  id?: string;
  description: string;
  files?: string[];
  startDate?: Date;
  endDate?: Date;
  status: DeliveryStatus;
  completedAt?: Date;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  feedback?: string;
  submittedBy?: string;
  submittedAt?: Date;
}

interface PendingModification {
  startDate?: Date;
  endDate?: Date;
  price?: number;
  notes?: string;
  requestedBy: string; // UUID
  requestedAt: Date;
  clientApproved?: boolean;
  doerApproved?: boolean;
}

interface PriceModification {
  previousPrice: number;
  newPrice: number;
  modifiedBy: string; // UUID
  modifiedAt: Date;
  reason: string;
  paymentDifference: number;
  transactionId?: string; // UUID
}

interface ExtensionRecord {
  previousEndDate: Date;
  newEndDate: Date;
  extensionDays: number;
  extensionAmount?: number;
  requestedBy: string; // UUID
  requestedAt: Date;
  approvedBy?: string; // UUID
  approvedAt?: Date;
  notes?: string;
}

export type { Delivery, PriceModification, ExtensionRecord };

@Table({
  tableName: 'contracts',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['status', 'created_at'] },
    { fields: ['client_id'] },
    { fields: ['doer_id'] },
    { fields: ['job_id'] },
    { fields: ['payment_status'] },
    { fields: ['pairing_code'], unique: true },
    { fields: ['is_deleted'] },
  ],
})
export class Contract extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Job)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  jobId!: string;

  @BelongsTo(() => Job)
  job!: Job;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  clientId!: string;

  @BelongsTo(() => User, 'clientId')
  client!: User;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  doerId!: string;

  @BelongsTo(() => User, 'doerId')
  doer!: User;

  // ============================================
  // BASIC CONTRACT INFO
  // ============================================

  @AllowNull(false)
  @Column(DataType.STRING(20))
  type!: 'trabajo' | 'service';

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  price!: number;

  @Default(0)
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  commission!: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  totalPrice!: number;

  @Default('pending')
  @Index
  @Column(DataType.STRING(30))
  status!: ContractStatus;

  // ============================================
  // TERMS & SIGNATURES
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  termsAccepted!: boolean;

  @Column(DataType.DATE)
  termsAcceptedAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  termsAcceptedByClient!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  termsAcceptedByDoer!: boolean;

  @Column(DataType.TEXT)
  clientSignature?: string;

  @Column(DataType.TEXT)
  doerSignature?: string;

  // ============================================
  // SCHEDULING
  // ============================================

  @AllowNull(false)
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  endDate!: Date;

  @Column(DataType.DATE)
  actualStartDate?: Date;

  @Column(DataType.DATE)
  actualEndDate?: Date;

  // ============================================
  // DELIVERIES (JSONB)
  // ============================================

  @Default([])
  @Column(DataType.JSONB)
  deliveries!: Delivery[];

  // ============================================
  // NOTES & CANCELLATION
  // ============================================

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 1000],
    },
  })
  notes?: string;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  cancellationReason?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  cancelledBy?: string;

  @BelongsTo(() => User, 'cancelledBy')
  canceller?: User;

  // ============================================
  // PAYMENT & ESCROW
  // ============================================

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  paymentStatus!: PaymentStatus;

  @Column(DataType.DATE)
  paymentDate?: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  escrowEnabled!: boolean;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  escrowAmount!: number;

  @Default('pending')
  @Column(DataType.STRING(20))
  escrowStatus!: 'pending' | 'held_escrow' | 'released' | 'refunded';

  @Column(DataType.STRING)
  escrowPaymentId?: string;

  // Payment verification fields (for admin payout)
  @Column(DataType.STRING)
  paymentProofUrl?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  paymentProcessedBy?: string;

  @BelongsTo(() => User, 'paymentProcessedBy')
  paymentProcessor?: User;

  @Column(DataType.DATE)
  paymentProcessedAt?: Date;

  @Column(DataType.TEXT)
  paymentAdminNotes?: string;

  // ============================================
  // PAIRING SYSTEM (Match Code)
  // ============================================

  @Index({ unique: true })
  @Column(DataType.STRING(10))
  pairingCode?: string;

  @Column(DataType.DATE)
  pairingGeneratedAt?: Date;

  @Column(DataType.DATE)
  pairingExpiry?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  clientConfirmedPairing!: boolean;

  @Column(DataType.DATE)
  clientPairingConfirmedAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  doerConfirmedPairing!: boolean;

  @Column(DataType.DATE)
  doerPairingConfirmedAt?: Date;

  // ============================================
  // COMPLETION CONFIRMATION
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  clientConfirmed!: boolean;

  @Column(DataType.DATE)
  clientConfirmedAt?: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  doerConfirmed!: boolean;

  @Column(DataType.DATE)
  doerConfirmedAt?: Date;

  // Timestamp when contract entered awaiting_confirmation status
  // Used for auto-confirm after 2 hours
  @Column(DataType.DATE)
  awaitingConfirmationAt?: Date;

  // Confirmation reminder sent
  @Default(false)
  @Column(DataType.BOOLEAN)
  confirmationReminderSent!: boolean;

  // ============================================
  // MODIFICATION REQUEST (JSONB)
  // ============================================

  @Column(DataType.JSONB)
  pendingModification?: PendingModification;

  // ============================================
  // REVIEWS
  // ============================================

  @Column(DataType.UUID)
  clientReviewId?: string;

  @Column(DataType.UUID)
  doerReviewId?: string;

  // ============================================
  // CONTRACT EXTENSION
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  hasBeenExtended!: boolean;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  extensionRequestedBy?: string;

  @BelongsTo(() => User, 'extensionRequestedBy')
  extensionRequester?: User;

  @Column(DataType.DATE)
  extensionRequestedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  extensionApprovedBy?: string;

  @BelongsTo(() => User, 'extensionApprovedBy')
  extensionApprover?: User;

  @Column(DataType.DATE)
  extensionApprovedAt?: Date;

  @Column(DataType.INTEGER)
  extensionDays?: number;

  @Column(DataType.DECIMAL(12, 2))
  extensionAmount?: number;

  @Column(DataType.TEXT)
  extensionNotes?: string;

  @Column(DataType.DATE)
  originalEndDate?: Date;

  // ============================================
  // PRICE MODIFICATION HISTORY (JSONB Array)
  // ============================================

  @Default([])
  @Column(DataType.JSONB)
  priceModificationHistory!: PriceModification[];

  @Column(DataType.DECIMAL(12, 2))
  originalPrice?: number;

  // ============================================
  // EXTENSION HISTORY (JSONB Array)
  // ============================================

  @Default([])
  @Column(DataType.JSONB)
  extensionHistory!: ExtensionRecord[];

  // Count of total extensions (for display purposes)
  @Default(0)
  @Column(DataType.INTEGER)
  extensionCount!: number;

  // ============================================
  // WORKER PAYMENT ALLOCATION (for multi-worker jobs)
  // ============================================

  // Specific amount allocated to this worker (may differ from equal split)
  @Column(DataType.DECIMAL(12, 2))
  allocatedAmount?: number;

  // Percentage of total job budget allocated to this worker
  @Column(DataType.DECIMAL(5, 2))
  percentageOfBudget?: number;

  // ============================================
  // TASK CLAIM SYSTEM
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  hasPendingTaskClaim!: boolean;

  @Column(DataType.DATE)
  taskClaimRequestedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  taskClaimRequestedBy?: string;

  @BelongsTo(() => User, 'taskClaimRequestedBy')
  taskClaimRequester?: User;

  @Column(DataType.DATE)
  taskClaimNewEndDate?: Date;

  @Column(DataType.TEXT)
  taskClaimReason?: string;

  @Default([])
  @Column(DataType.JSONB)
  claimedTaskIds!: string[];

  @Column(DataType.DATE)
  taskClaimRespondedAt?: Date;

  @Column(DataType.STRING(20))
  taskClaimResponse?: 'pending' | 'accepted' | 'rejected';

  @Column(DataType.TEXT)
  taskClaimRejectionReason?: string;

  @Default([])
  @Column(DataType.JSONB)
  taskClaimHistory!: Array<{
    claimedTaskIds: string[];
    requestedAt: Date;
    requestedBy: string;
    newEndDate: Date;
    reason: string;
    response?: 'accepted' | 'rejected';
    respondedAt?: Date;
    rejectionReason?: string;
  }>;

  // ============================================
  // DISPUTE
  // ============================================

  @Column(DataType.UUID)
  disputeId?: string;

  @Column(DataType.DATE)
  disputedAt?: Date;

  @Column(DataType.DATE)
  disputeResolvedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  disputeResolvedBy?: string;

  @BelongsTo(() => User, 'disputeResolvedBy')
  disputeResolver?: User;

  @Column(DataType.TEXT)
  disputeResolution?: string;

  // ============================================
  // SOFT DELETE
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isDeleted!: boolean;

  @Column(DataType.DATE)
  deletedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  deletedBy?: string;

  @BelongsTo(() => User, 'deletedBy')
  deleter?: User;

  @Column(DataType.TEXT)
  deletionReason?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  infractions!: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isHidden!: boolean;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if both parties confirmed completion
   */
  isBothPartiesConfirmed(): boolean {
    return this.clientConfirmed && this.doerConfirmed;
  }

  /**
   * Check if contract can be extended
   */
  canBeExtended(): boolean {
    return !this.hasBeenExtended && (this.status === 'in_progress' || this.status === 'accepted');
  }

  /**
   * Check if pairing is complete
   */
  isPairingComplete(): boolean {
    return this.clientConfirmedPairing && this.doerConfirmedPairing;
  }

  /**
   * Check if pairing code is valid
   */
  isPairingCodeValid(): boolean {
    if (!this.pairingCode || !this.pairingExpiry) return false;
    return new Date() < this.pairingExpiry;
  }

  /**
   * Generate pairing code
   */
  generatePairingCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.pairingCode = code;
    this.pairingGeneratedAt = new Date();
    this.pairingExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    return code;
  }

  /**
   * Confirm pairing by user
   */
  async confirmPairing(userId: string): Promise<boolean> {
    if (!this.isPairingCodeValid()) return false;

    if (userId === this.clientId) {
      this.clientConfirmedPairing = true;
      this.clientPairingConfirmedAt = new Date();
    } else if (userId === this.doerId) {
      this.doerConfirmedPairing = true;
      this.doerPairingConfirmedAt = new Date();
    } else {
      return false;
    }

    await this.save();
    return this.isPairingComplete();
  }

  /**
   * Add price modification to history
   */
  addPriceModification(
    previousPrice: number,
    newPrice: number,
    modifiedBy: string,
    reason: string,
    transactionId?: string
  ): void {
    if (!this.originalPrice) {
      this.originalPrice = previousPrice;
    }

    this.priceModificationHistory.push({
      previousPrice,
      newPrice,
      modifiedBy,
      modifiedAt: new Date(),
      reason,
      paymentDifference: newPrice - previousPrice,
      transactionId,
    });
  }

  /**
   * Calculate commission
   */
  async calculateCommission(rate: number): Promise<void> {
    const priceNum = typeof this.price === 'string' ? parseFloat(this.price) : this.price;
    this.commission = priceNum * (rate / 100);
    this.totalPrice = priceNum + this.commission;
    await this.save();
  }

  /**
   * Check if contract is active
   */
  isActive(): boolean {
    return this.status === 'in_progress' || this.status === 'accepted';
  }

  /**
   * Check if contract is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if contract is cancelled
   */
  isCancelled(): boolean {
    return this.status === 'cancelled';
  }

  /**
   * Release escrow funds
   */
  async releaseEscrow(paymentId?: string): Promise<void> {
    if (this.escrowStatus !== 'held_escrow') {
      throw new Error('Funds are not in escrow');
    }
    this.escrowStatus = 'released';
    if (paymentId) {
      this.escrowPaymentId = paymentId;
    }
    await this.save();
  }

  /**
   * Refund escrow funds
   */
  async refundEscrow(): Promise<void> {
    if (this.escrowStatus !== 'held_escrow') {
      throw new Error('Funds are not in escrow');
    }
    this.escrowStatus = 'refunded';
    await this.save();
  }

  /**
   * Check if pairing is expired
   */
  isPairingExpired(): boolean {
    if (!this.pairingExpiry) return false;
    return new Date() > this.pairingExpiry;
  }

  /**
   * Check if both parties confirmed pairing
   */
  isBothPartiesConfirmedPairing(): boolean {
    return this.clientConfirmedPairing && this.doerConfirmedPairing;
  }

  /**
   * Confirm completion by client or doer
   */
  async confirmCompletion(userId: string): Promise<boolean> {
    if (userId === this.clientId) {
      this.clientConfirmed = true;
      this.clientConfirmedAt = new Date();
    } else if (userId === this.doerId) {
      this.doerConfirmed = true;
      this.doerConfirmedAt = new Date();
    } else {
      return false;
    }

    // If both confirmed, mark as completed
    if (this.clientConfirmed && this.doerConfirmed) {
      this.status = 'completed';
      this.actualEndDate = new Date();
    }

    await this.save();
    return this.status === 'completed';
  }

  /**
   * Extend contract
   */
  async extendContract(
    newEndDate: Date,
    reason: string,
    additionalPrice?: number
  ): Promise<void> {
    if (this.hasBeenExtended) {
      throw new Error('Contract has already been extended');
    }

    this.originalEndDate = this.endDate;
    this.endDate = newEndDate;
    this.extensionNotes = reason;
    this.hasBeenExtended = true;
    this.extensionRequestedAt = new Date();

    if (additionalPrice) {
      this.extensionAmount = additionalPrice;
    }

    await this.save();
  }

  /**
   * Calculate extension end date
   */
  getExtensionEndDate(days: number): Date {
    const extensionDate = new Date(this.endDate);
    extensionDate.setDate(extensionDate.getDate() + days);
    return extensionDate;
  }

  /**
   * Modify price
   */
  async modifyPrice(newPrice: number, reason: string, modifiedBy: string): Promise<void> {
    const oldPrice = typeof this.price === 'string' ? parseFloat(this.price) : this.price;

    this.addPriceModification(oldPrice, newPrice, modifiedBy, reason);
    this.price = newPrice;

    // Recalculate commission and total if commission rate is set
    if (this.commission) {
      const rate = (parseFloat(this.commission as any) / oldPrice) * 100;
      await this.calculateCommission(rate);
    }

    await this.save();
  }

  /**
   * Get price modification history
   */
  getPriceHistory(): any[] {
    return this.priceModificationHistory || [];
  }

  /**
   * Add delivery
   */
  async addDelivery(
    description: string,
    files: string[],
    submittedBy: string
  ): Promise<void> {
    if (!this.deliveries) {
      this.deliveries = [];
    }

    const newDelivery: Delivery = {
      id: crypto.randomUUID(),
      description,
      files,
      submittedBy,
      submittedAt: new Date(),
      status: 'pending',
    };

    this.deliveries.push(newDelivery);

    await this.save();
  }

  /**
   * Approve delivery
   */
  async approveDelivery(deliveryId: string, approvedBy: string): Promise<void> {
    const delivery = this.deliveries?.find((d: any) => d.id === deliveryId);
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    delivery.status = 'approved';
    delivery.reviewedBy = approvedBy;
    delivery.reviewedAt = new Date();

    await this.save();
  }

  /**
   * Reject delivery
   */
  async rejectDelivery(
    deliveryId: string,
    rejectedBy: string,
    feedback: string
  ): Promise<void> {
    const delivery = this.deliveries?.find((d: any) => d.id === deliveryId);
    if (!delivery) {
      throw new Error('Delivery not found');
    }

    delivery.status = 'rejected';
    delivery.reviewedBy = rejectedBy;
    delivery.reviewedAt = new Date();
    delivery.feedback = feedback;

    await this.save();
  }

  /**
   * Get pending deliveries
   */
  getPendingDeliveries(): any[] {
    return this.deliveries?.filter((d: any) => d.status === 'pending') || [];
  }

  /**
   * Soft delete contract
   */
  async softDelete(deletedBy?: string): Promise<void> {
    this.isDeleted = true;
    this.deletedAt = new Date();
    if (deletedBy) {
      this.deletedBy = deletedBy;
    }
    await this.save();
  }

  /**
   * Restore contract
   */
  async restore(): Promise<void> {
    this.isDeleted = false;
    this.deletedAt = undefined;
    this.deletedBy = undefined;
    await this.save();
  }

  // ============================================
  // HOOKS
  // ============================================

  /**
   * Validate dates before save
   */
  @BeforeValidate
  static validateDates(instance: Contract) {
    if (instance.endDate && instance.startDate && instance.endDate <= instance.startDate) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }
  }

  /**
   * Calculate total price
   */
  @BeforeValidate
  static calculateTotalPrice(instance: Contract) {
    if (instance.price !== undefined && instance.commission !== undefined) {
      const priceNum = typeof instance.price === 'string' ? parseFloat(instance.price) : instance.price;
      const commissionNum = typeof instance.commission === 'string' ? parseFloat(instance.commission) : instance.commission;
      instance.totalPrice = priceNum + commissionNum;
    }
  }
}

export default Contract;
