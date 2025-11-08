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
import { Contract } from './Contract.model.js';

/**
 * Review Model - PostgreSQL/Sequelize
 *
 * Modelo de reseñas y ratings con soporte para:
 * - Múltiples categorías de rating (calidad, trabajador, contrato)
 * - Ratings específicos (comunicación, profesionalismo, calidad, puntualidad)
 * - Moderación de contenido
 * - Respuestas del usuario reseñado
 * - Una reseña por usuario por contrato
 */

@Table({
  tableName: 'reviews',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['contract_id'] },
    { fields: ['reviewer_id', 'created_at'] },
    { fields: ['reviewed_id', 'is_visible', 'created_at'] },
    { fields: ['rating'] },
    { fields: ['contract_id', 'reviewer_id'], unique: true }, // Una reseña por usuario por contrato
  ],
})
export class Review extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // ============================================
  // RELATIONSHIPS
  // ============================================

  @ForeignKey(() => Contract)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  contractId!: string;

  @BelongsTo(() => Contract)
  contract!: Contract;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  reviewerId!: string; // Quien hace la reseña

  @BelongsTo(() => User, 'reviewerId')
  reviewer!: User;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  reviewedId!: string; // Quien es reseñado

  @BelongsTo(() => User, 'reviewedId')
  reviewed!: User;

  // ============================================
  // OVERALL RATING
  // ============================================

  @AllowNull(false)
  @Index
  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  rating!: number;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: {
        args: [10, 1000],
        msg: 'El comentario debe tener entre 10 y 1000 caracteres',
      },
    },
  })
  comment!: string;

  // ============================================
  // MULTIPLE RATING CATEGORIES
  // ============================================

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  workQualityRating?: number;

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  workerRating?: number;

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  contractRating?: number;

  // ============================================
  // SPECIFIC RATINGS
  // ============================================

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  communication?: number;

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  professionalism?: number;

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  quality?: number;

  @Column({
    type: DataType.INTEGER,
    validate: {
      min: 1,
      max: 5,
    },
  })
  timeliness?: number;

  // ============================================
  // MODERATION
  // ============================================

  @Default(true)
  @Index
  @Column(DataType.BOOLEAN)
  isVisible!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isFlagged!: boolean;

  @Column(DataType.TEXT)
  flagReason?: string;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  moderatedBy?: string;

  @BelongsTo(() => User, 'moderatedBy')
  moderator?: User;

  @Column(DataType.DATE)
  moderatedAt?: Date;

  // ============================================
  // RESPONSE FROM REVIEWED USER
  // ============================================

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  response?: string;

  @Column(DataType.DATE)
  respondedAt?: Date;

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if review is positive (4-5 stars)
   */
  isPositive(): boolean {
    return this.rating >= 4;
  }

  /**
   * Check if review is negative (1-2 stars)
   */
  isNegative(): boolean {
    return this.rating <= 2;
  }

  /**
   * Check if user can respond
   */
  canRespond(): boolean {
    return !this.response && this.isVisible;
  }

  /**
   * Add response from reviewed user
   */
  async addResponse(responseText: string): Promise<void> {
    if (!this.canRespond()) {
      throw new Error('Cannot respond to this review');
    }

    this.response = responseText;
    this.respondedAt = new Date();
    await this.save();
  }

  /**
   * Flag review for moderation
   */
  async flag(reason: string): Promise<void> {
    this.isFlagged = true;
    this.flagReason = reason;
    await this.save();
  }

  /**
   * Hide review (moderation)
   */
  async hide(moderatorId: string): Promise<void> {
    this.isVisible = false;
    this.moderatedBy = moderatorId;
    this.moderatedAt = new Date();
    await this.save();
  }

  /**
   * Show review (after moderation)
   */
  async show(moderatorId: string): Promise<void> {
    this.isVisible = true;
    this.isFlagged = false;
    this.moderatedBy = moderatorId;
    this.moderatedAt = new Date();
    await this.save();
  }

  /**
   * Calculate average of category ratings
   */
  getCategoryAverage(): number | null {
    const ratings = [
      this.workQualityRating,
      this.workerRating,
      this.contractRating,
    ].filter((r): r is number => r !== null && r !== undefined);

    if (ratings.length === 0) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  /**
   * Calculate average of specific ratings
   */
  getSpecificAverage(): number | null {
    const ratings = [
      this.communication,
      this.professionalism,
      this.quality,
      this.timeliness,
    ].filter((r): r is number => r !== null && r !== undefined);

    if (ratings.length === 0) return null;
    return ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }
}

export default Review;
