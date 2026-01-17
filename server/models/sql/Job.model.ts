import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  Default,
  AllowNull,
  Index,
  BeforeValidate,
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * Job Model - PostgreSQL/Sequelize
 *
 * Modelo de trabajos publicados con soporte para:
 * - Borradores y publicación con pago
 * - Búsqueda por ubicación, categoría, precio
 * - Estados de trabajo (draft, open, in_progress, completed, cancelled)
 * - Imágenes y herramientas requeridas
 * - Sistema de ratings y reviews
 */

export type JobStatus = 'draft' | 'pending_payment' | 'pending_approval' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'suspended' | 'paused';
export type JobUrgency = 'low' | 'medium' | 'high';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'expert';

@Table({
  tableName: 'jobs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['status', 'created_at'] },
    { fields: ['client_id'] },
    { fields: ['doer_id'] },
    { fields: ['category'] },
    { fields: ['location'] },
    { fields: ['price'] },
    { fields: ['latitude', 'longitude'] },
    { fields: ['remote_ok'] },
    { fields: ['urgency'] },
    { fields: ['experience_level'] },
    { fields: ['publication_paid'] },
    // Full-text search index en PostgreSQL
    {
      name: 'jobs_search_idx',
      fields: ['title', 'description', 'summary'],
      type: 'FULLTEXT' as any, // PostgreSQL: usar tsvector
    },
  ],
})
export class Job extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // BASIC INFORMATION
  // ============================================

  @AllowNull(false)
  @Column({
    type: DataType.STRING(100),
    validate: {
      len: {
        args: [1, 100],
        msg: 'El título no puede exceder 100 caracteres',
      },
    },
  })
  title!: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: {
        args: [1, 200],
        msg: 'El resumen no puede exceder 200 caracteres',
      },
    },
  })
  summary!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 2000],
        msg: 'La descripción no puede exceder 2000 caracteres',
      },
    },
  })
  description!: string;

  // ============================================
  // PRICING
  // ============================================

  @AllowNull(false)
  @Index
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: {
        args: [0],
        msg: 'El precio no puede ser negativo',
      },
    },
  })
  price!: number;

  // ============================================
  // CATEGORIZATION
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(100))
  category!: string;

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  tags!: string[];

  // ============================================
  // LOCATION
  // ============================================

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(255))
  location!: string;

  // Neighborhood - shown publicly in job listing (e.g., "Palermo", "Belgrano")
  @Column(DataType.STRING(100))
  neighborhood?: string;

  // Address fields for precise location - only shown to assigned worker
  @Column(DataType.STRING(200))
  addressStreet?: string;

  @Column(DataType.STRING(50))
  addressNumber?: string;

  @Column(DataType.STRING(255))
  addressDetails?: string;

  @Index
  @Column(DataType.DECIMAL(10, 8))
  latitude?: number;

  @Index
  @Column(DataType.DECIMAL(11, 8))
  longitude?: number;

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  remoteOk!: boolean;

  // ============================================
  // SCHEDULING
  // ============================================

  @AllowNull(false)
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(true) // Now optional - can be null if endDateFlexible is true
  @Column(DataType.DATE)
  endDate?: Date;

  // If true, end date is not yet determined ("Todavía no lo sé")
  // Job will be suspended 24h before start if still true
  @Default(false)
  @Column(DataType.BOOLEAN)
  endDateFlexible!: boolean;

  // If true, the job has a single delivery (no per-task deadlines)
  // If false, each task can have its own due date as a guide
  @Default(true)
  @Column(DataType.BOOLEAN)
  singleDelivery!: boolean;

  // ============================================
  // STATUS & PRIORITY
  // ============================================

  @Default('draft')
  @Index
  @Column(DataType.STRING(20))
  status!: JobStatus;

  @Default('medium')
  @Index
  @Column(DataType.STRING(20))
  urgency!: JobUrgency;

  @Default('intermediate')
  @Index
  @Column(DataType.STRING(20))
  experienceLevel!: ExperienceLevel;

  // ============================================
  // ADMIN REVIEW
  // ============================================

  @Column(DataType.TEXT)
  rejectedReason?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  reviewedBy?: string;

  @BelongsTo(() => User, 'reviewedBy')
  reviewer?: User;

  @Column(DataType.DATE)
  reviewedAt?: Date;

  // ============================================
  // CANCELLATION
  // ============================================

  @Column(DataType.TEXT)
  cancellationReason?: string;

  @Column(DataType.DATE)
  cancelledAt?: Date;

  @Column(DataType.UUID)
  cancelledById?: string; // User ID of who cancelled the job

  @Column(DataType.STRING)
  cancelledByRole?: string; // 'owner' (job owner) or 'admin' (admin user)

  @Default(false)
  @Column(DataType.BOOLEAN)
  permanentlyCancelled!: boolean; // When true, user cannot edit/resubmit this job

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  clientId!: string;

  @BelongsTo(() => User, 'clientId')
  client!: User;

  @ForeignKey(() => User)
  @Index
  @Column(DataType.UUID)
  doerId?: string;

  @BelongsTo(() => User, 'doerId')
  doer?: User;

  // ============================================
  // MEDIA & REQUIREMENTS
  // ============================================

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  images!: string[];

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  toolsRequired!: string[];

  @Default(false)
  @Column(DataType.BOOLEAN)
  materialsProvided!: boolean;

  // ============================================
  // RATING & REVIEW
  // ============================================

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  rating?: number;

  @Column({
    type: DataType.STRING(500),
    validate: {
      len: {
        args: [0, 500],
        msg: 'La reseña no puede exceder 500 caracteres',
      },
    },
  })
  review?: string;

  // ============================================
  // ANALYTICS
  // ============================================

  @Default(0)
  @Column(DataType.INTEGER)
  views!: number;

  // ============================================
  // MULTIPLE WORKERS SUPPORT
  // ============================================

  @Default(1)
  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  maxWorkers!: number;

  @Default([])
  @Column(DataType.ARRAY(DataType.UUID))
  selectedWorkers!: string[];

  @Column(DataType.UUID)
  groupChatId?: string;

  // Worker payment allocations - stores {workerId, allocatedAmount, percentage} for each worker
  @Default([])
  @Column(DataType.JSONB)
  workerAllocations!: Array<{
    workerId: string;
    allocatedAmount: number;
    percentage: number;
    allocatedAt: Date;
  }>;

  // Sum of all allocated amounts
  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  allocatedTotal!: number;

  // Budget remaining to allocate to workers
  @Column(DataType.DECIMAL(12, 2))
  remainingBudget?: number;

  // ============================================
  // REMINDER NOTIFICATIONS
  // ============================================

  @Default(false)
  @Column(DataType.BOOLEAN)
  reminder12hSent!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  reminder6hSent!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  reminder2hSent!: boolean;

  // ============================================
  // BUDGET CHANGE HISTORY
  // ============================================

  @Column(DataType.DECIMAL(12, 2))
  originalPrice?: number;

  @Column(DataType.TEXT)
  priceChangeReason?: string;

  @Column(DataType.DATE)
  priceChangedAt?: Date;

  @Default([])
  @Column(DataType.JSONB)
  priceHistory!: Array<{
    oldPrice: number;
    newPrice: number;
    reason: string;
    changedAt: Date;
    refundedToBalance?: number;
    paidFromBalance?: number;
  }>;

  // ============================================
  // PUBLICATION PAYMENT
  // ============================================

  @Column(DataType.UUID)
  publicationPaymentId?: string;

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  publicationPaid!: boolean;

  @Column(DataType.DATE)
  publicationPaidAt?: Date;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  publicationAmount!: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  pendingPaymentAmount!: number;

  // Nuevo precio propuesto (solo se aplica después del pago exitoso)
  @Column(DataType.DECIMAL(12, 2))
  pendingNewPrice?: number;

  // Estado anterior del job (para restaurar si se cancela el pago)
  @Column(DataType.STRING(50))
  previousStatus?: string;

  // ============================================
  // PENDING PRICE DECREASE (requires worker approval)
  // ============================================

  // Proposed new price (pending worker approval)
  @Column(DataType.DECIMAL(12, 2))
  pendingPriceDecrease?: number;

  // Reason for the price decrease (required)
  @Column(DataType.TEXT)
  pendingPriceDecreaseReason?: string;

  // When the price decrease was proposed
  @Column(DataType.DATE)
  pendingPriceDecreaseAt?: Date;

  // Workers who have accepted the price decrease [{workerId, acceptedAt}]
  @Default([])
  @Column(DataType.JSONB)
  priceDecreaseAcceptances!: Array<{
    workerId: string;
    acceptedAt: Date;
  }>;

  // Workers who have rejected the price decrease [{workerId, rejectedAt}]
  @Default([])
  @Column(DataType.JSONB)
  priceDecreaseRejections!: Array<{
    workerId: string;
    rejectedAt: Date;
  }>;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if job is published (paid and open)
   */
  isPublished(): boolean {
    return this.publicationPaid && (this.status === 'open' || this.status === 'in_progress');
  }

  /**
   * Check if job is available for applications
   */
  isAvailable(): boolean {
    // Job is available if it's open, paid, and hasn't reached max workers
    const currentWorkers = this.selectedWorkers?.length || 0;
    return this.status === 'open' && this.publicationPaid && currentWorkers < this.maxWorkers;
  }

  /**
   * Check if job needs more workers
   */
  needsMoreWorkers(): boolean {
    const currentWorkers = this.selectedWorkers?.length || 0;
    return currentWorkers < this.maxWorkers;
  }

  /**
   * Check if all worker positions are filled
   */
  isFullyStaffed(): boolean {
    const currentWorkers = this.selectedWorkers?.length || 0;
    return currentWorkers >= this.maxWorkers;
  }

  /**
   * Check if job is completed
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Check if job is in draft state
   */
  isDraft(): boolean {
    return this.status === 'draft' || this.status === 'pending_payment';
  }

  /**
   * Calculate duration in days
   */
  getDurationDays(): number {
    if (!this.endDate || !this.startDate) return 0;
    const diff = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Increment view counter
   */
  async incrementViews(): Promise<void> {
    this.views += 1;
    await this.save();
  }

  /**
   * Mark as published
   */
  async markAsPublished(paymentId: string, amount: number): Promise<void> {
    this.publicationPaymentId = paymentId;
    this.publicationPaid = true;
    this.publicationPaidAt = new Date();
    this.publicationAmount = amount;
    this.status = 'open';
    await this.save();
  }

  // ============================================
  // HOOKS
  // ============================================

  /**
   * Validate date range before save
   */
  @BeforeValidate
  static validateDates(instance: Job) {
    if (instance.endDate && instance.startDate && instance.endDate <= instance.startDate) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }
  }

  /**
   * Normalize location string
   */
  @BeforeValidate
  static normalizeLocation(instance: Job) {
    if (instance.location) {
      instance.location = instance.location.trim();
    }
    if (instance.title) {
      instance.title = instance.title.trim();
    }
    if (instance.summary) {
      instance.summary = instance.summary.trim();
    }
    if (instance.category) {
      instance.category = instance.category.trim();
    }
  }
}

export default Job;
