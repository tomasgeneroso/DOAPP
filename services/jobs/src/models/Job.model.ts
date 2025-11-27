import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  Index,
  BeforeValidate,
} from 'sequelize-typescript';

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
  ],
})
export class Job extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // Basic Information
  @AllowNull(false)
  @Column({
    type: DataType.STRING(100),
    validate: {
      len: [1, 100],
    },
  })
  title!: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(200),
    validate: {
      len: [1, 200],
    },
  })
  summary!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: [1, 2000],
    },
  })
  description!: string;

  // Pricing
  @AllowNull(false)
  @Index
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  price!: number;

  // Categorization
  @AllowNull(false)
  @Index
  @Column(DataType.STRING(100))
  category!: string;

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  tags!: string[];

  // Location
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

  // Scheduling
  @AllowNull(false)
  @Column(DataType.DATE)
  startDate!: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  endDate!: Date;

  // Status
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

  // Admin Review
  @Column(DataType.TEXT)
  rejectedReason?: string;

  @Column(DataType.UUID)
  reviewedBy?: string;

  @Column(DataType.DATE)
  reviewedAt?: Date;

  // Relationships (IDs only - no User import)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  clientId!: string;

  @Index
  @Column(DataType.UUID)
  doerId?: string;

  // Media
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  images!: string[];

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  toolsRequired!: string[];

  @Default(false)
  @Column(DataType.BOOLEAN)
  materialsProvided!: boolean;

  // Rating
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
      len: [0, 500],
    },
  })
  review?: string;

  // Analytics
  @Default(0)
  @Column(DataType.INTEGER)
  views!: number;

  // Publication Payment
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

  // Methods
  isPublished(): boolean {
    return this.publicationPaid && (this.status === 'open' || this.status === 'in_progress');
  }

  isAvailable(): boolean {
    return this.status === 'open' && this.publicationPaid;
  }

  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isDraft(): boolean {
    return this.status === 'draft' || this.status === 'pending_payment';
  }

  getDurationDays(): number {
    const diff = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  async incrementViews(): Promise<void> {
    this.views += 1;
    await this.save();
  }

  async markAsPublished(paymentId: string, amount: number): Promise<void> {
    this.publicationPaymentId = paymentId;
    this.publicationPaid = true;
    this.publicationPaidAt = new Date();
    this.publicationAmount = amount;
    this.status = 'open';
    await this.save();
  }

  // Hooks
  @BeforeValidate
  static validateDates(instance: Job) {
    if (instance.endDate && instance.startDate && instance.endDate <= instance.startDate) {
      throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    }
  }

  @BeforeValidate
  static normalizeFields(instance: Job) {
    if (instance.location) instance.location = instance.location.trim();
    if (instance.title) instance.title = instance.title.trim();
    if (instance.summary) instance.summary = instance.summary.trim();
    if (instance.category) instance.category = instance.category.trim();
  }
}

export default Job;
