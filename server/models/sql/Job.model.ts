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

export type JobStatus = 'draft' | 'pending_payment' | 'pending_approval' | 'open' | 'in_progress' | 'completed' | 'cancelled';
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

  @AllowNull(false)
  @Column(DataType.DATE)
  endDate!: Date;

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

  @Column(DataType.DATE)
  reviewedAt?: Date;

  // ============================================
  // CANCELLATION
  // ============================================

  @Column(DataType.TEXT)
  cancellationReason?: string;

  @Column(DataType.DATE)
  cancelledAt?: Date;

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
    return this.status === 'open' && this.publicationPaid;
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
