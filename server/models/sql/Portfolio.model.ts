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
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Contract } from './Contract.model.js';
import { Job } from './Job.model.js';

/**
 * Portfolio Model - PostgreSQL/Sequelize
 *
 * Sistema de portfolio para freelancers con:
 * - Soporte multimedia (imágenes, videos, PDFs)
 * - Vinculación con contratos/trabajos reales
 * - Sistema de likes y views
 * - Featured items
 * - Categorización y tags
 */

@Table({
  tableName: 'portfolio_items',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id', 'created_at'] },
    { fields: ['category', 'featured'] },
    { fields: ['views'] },
    { fields: ['featured', 'created_at'] },
    { fields: ['user_id', 'category'] },
  ],
})
export class Portfolio extends Model {
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

  @BelongsTo(() => User)
  user!: User;

  @ForeignKey(() => Contract)
  @Column(DataType.UUID)
  linkedContract?: string;

  @BelongsTo(() => Contract)
  contract?: Contract;

  @ForeignKey(() => Job)
  @Column(DataType.UUID)
  linkedJob?: string;

  @BelongsTo(() => Job)
  job?: Job;

  // ============================================
  // BASIC INFO
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
    type: DataType.TEXT,
    validate: {
      len: {
        args: [1, 1000],
        msg: 'La descripción no puede exceder 1000 caracteres',
      },
    },
  })
  description!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(50))
  category!: string;

  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  price?: number; // Optional: precio del trabajo realizado

  // ============================================
  // MULTIMEDIA CONTENT
  // ============================================

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  images!: string[]; // Max 10 imágenes

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  videos!: string[]; // Max 3 videos

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  documents!: string[]; // Max 5 documentos (PDFs)

  // ============================================
  // CATEGORIZATION
  // ============================================

  @Default([])
  @Index
  @Column(DataType.ARRAY(DataType.STRING))
  tags!: string[];

  // ============================================
  // PROJECT DETAILS
  // ============================================

  @Column(DataType.DATE)
  completedAt?: Date;

  @Column(DataType.STRING(100))
  clientName?: string;

  @Column(DataType.STRING(100))
  projectDuration?: string; // e.g., "2 semanas", "1 mes"

  // ============================================
  // ENGAGEMENT METRICS
  // ============================================

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  featured!: boolean; // Item destacado (admin o PRO)

  @Default(0)
  @Index
  @Column(DataType.INTEGER)
  views!: number;

  @Default([])
  @Column(DataType.ARRAY(DataType.UUID))
  likes!: string[]; // Array of User UUIDs who liked

  // ============================================
  // CONTRACT/JOB LINK DATA
  // ============================================

  @Column({
    type: DataType.DECIMAL(3, 2),
    validate: {
      min: 0,
      max: 5,
    },
  })
  contractRating?: number;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  contractReview?: string;

  // ============================================
  // VALIDATION HOOKS
  // ============================================

  @BeforeValidate
  static validateMultimedia(instance: Portfolio) {
    // Validate images limit
    if (instance.images && instance.images.length > 10) {
      throw new Error('No puedes subir más de 10 imágenes');
    }

    // Validate videos limit
    if (instance.videos && instance.videos.length > 3) {
      throw new Error('No puedes subir más de 3 videos');
    }

    // Validate documents limit
    if (instance.documents && instance.documents.length > 5) {
      throw new Error('No puedes subir más de 5 documentos');
    }

    // Trim strings
    if (instance.title) {
      instance.title = instance.title.trim();
    }
    if (instance.description) {
      instance.description = instance.description.trim();
    }
    if (instance.category) {
      instance.category = instance.category.trim();
    }
    if (instance.clientName) {
      instance.clientName = instance.clientName.trim();
    }
    if (instance.projectDuration) {
      instance.projectDuration = instance.projectDuration.trim();
    }
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if item has multimedia content
   */
  hasMultimedia(): boolean {
    return (
      this.images.length > 0 ||
      this.videos.length > 0 ||
      this.documents.length > 0
    );
  }

  /**
   * Check if user has liked this item
   */
  isLikedBy(userId: string): boolean {
    return this.likes.includes(userId);
  }

  /**
   * Like this portfolio item
   */
  async like(userId: string): Promise<void> {
    if (this.isLikedBy(userId)) {
      throw new Error('Ya has dado like a este item');
    }

    this.likes.push(userId);
    await this.save();
  }

  /**
   * Unlike this portfolio item
   */
  async unlike(userId: string): Promise<void> {
    if (!this.isLikedBy(userId)) {
      throw new Error('No has dado like a este item');
    }

    this.likes = this.likes.filter((id) => id !== userId);
    await this.save();
  }

  /**
   * Increment view count
   */
  async incrementViews(): Promise<void> {
    this.views += 1;
    await this.save();
  }

  /**
   * Get total likes count
   */
  getLikesCount(): number {
    return this.likes.length;
  }

  /**
   * Check if item is complete (has all basic info)
   */
  isComplete(): boolean {
    return !!(
      this.title &&
      this.description &&
      this.category &&
      (this.images.length > 0 || this.videos.length > 0 || this.documents.length > 0)
    );
  }

  /**
   * Check if item is linked to real work
   */
  isLinkedToWork(): boolean {
    return !!(this.linkedContract || this.linkedJob);
  }

  /**
   * Add image to portfolio
   */
  async addImage(imageUrl: string): Promise<void> {
    if (this.images.length >= 10) {
      throw new Error('No puedes subir más de 10 imágenes');
    }

    this.images.push(imageUrl);
    await this.save();
  }

  /**
   * Remove image from portfolio
   */
  async removeImage(imageUrl: string): Promise<void> {
    this.images = this.images.filter((img) => img !== imageUrl);
    await this.save();
  }

  /**
   * Add video to portfolio
   */
  async addVideo(videoUrl: string): Promise<void> {
    if (this.videos.length >= 3) {
      throw new Error('No puedes subir más de 3 videos');
    }

    this.videos.push(videoUrl);
    await this.save();
  }

  /**
   * Remove video from portfolio
   */
  async removeVideo(videoUrl: string): Promise<void> {
    this.videos = this.videos.filter((vid) => vid !== videoUrl);
    await this.save();
  }

  /**
   * Add document to portfolio
   */
  async addDocument(documentUrl: string): Promise<void> {
    if (this.documents.length >= 5) {
      throw new Error('No puedes subir más de 5 documentos');
    }

    this.documents.push(documentUrl);
    await this.save();
  }

  /**
   * Remove document from portfolio
   */
  async removeDocument(documentUrl: string): Promise<void> {
    this.documents = this.documents.filter((doc) => doc !== documentUrl);
    await this.save();
  }

  /**
   * Add tag
   */
  async addTag(tag: string): Promise<void> {
    const normalizedTag = tag.trim().toLowerCase();
    if (!this.tags.includes(normalizedTag)) {
      this.tags.push(normalizedTag);
      await this.save();
    }
  }

  /**
   * Remove tag
   */
  async removeTag(tag: string): Promise<void> {
    const normalizedTag = tag.trim().toLowerCase();
    this.tags = this.tags.filter((t) => t !== normalizedTag);
    await this.save();
  }

  /**
   * Set as featured (admin only)
   */
  async setFeatured(featured: boolean): Promise<void> {
    this.featured = featured;
    await this.save();
  }

  /**
   * Get engagement score
   */
  getEngagementScore(): number {
    // Simple score: views + likes * 10
    return this.views + this.getLikesCount() * 10;
  }

  /**
   * Get total media count
   */
  getTotalMediaCount(): number {
    return this.images.length + this.videos.length + this.documents.length;
  }
}

export default Portfolio;
