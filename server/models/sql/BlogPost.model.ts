import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  BeforeCreate,
  BeforeUpdate,
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * BlogPost Model
 *
 * Blog articles for content marketing and SEO.
 * Supports posts from both admins (official/SEO optimized) and users.
 * Includes SEO fields for better search engine visibility.
 */
@Table({
  tableName: 'blog_posts',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['slug'],
      unique: true,
      name: 'idx_blog_slug',
    },
    {
      fields: ['status', 'publishedAt'],
      name: 'idx_blog_status_published',
    },
    {
      fields: ['category', 'status'],
      name: 'idx_blog_category_status',
    },
    {
      fields: ['tags'],
      name: 'idx_blog_tags',
      using: 'gin',
    },
    {
      fields: ['createdAt'],
      name: 'idx_blog_created',
    },
    {
      fields: ['postType'],
      name: 'idx_blog_post_type',
    },
    {
      fields: ['createdBy'],
      name: 'idx_blog_created_by',
    },
  ],
})
export class BlogPost extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.STRING(300),
    allowNull: false,
  })
  subtitle!: string;

  @Column({
    type: DataType.STRING(250),
    allowNull: false,
    unique: true,
  })
  slug!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  content!: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  excerpt!: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  author!: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  coverImage?: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
    defaultValue: [],
  })
  tags!: string[];

  @Column({
    type: DataType.ENUM(
      'Limpieza',
      'Reparaciones',
      'Mantenimiento',
      'Productos Ecológicos',
      'Hogar',
      'Jardín',
      'Tips',
      'Otros'
    ),
    allowNull: false,
  })
  category!: string;

  @Column({
    type: DataType.ENUM('draft', 'published', 'archived'),
    allowNull: false,
    defaultValue: 'draft',
  })
  status!: 'draft' | 'published' | 'archived';

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  views!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  publishedAt?: Date;

  // Post type: 'official' (admin/platform) or 'user' (community)
  @Column({
    type: DataType.ENUM('official', 'user'),
    allowNull: false,
    defaultValue: 'user',
  })
  postType!: 'official' | 'user';

  // SEO Fields
  @Column({
    type: DataType.STRING(70),
    allowNull: true,
    comment: 'SEO meta title (max 70 chars for Google)',
  })
  metaTitle?: string;

  @Column({
    type: DataType.STRING(160),
    allowNull: true,
    comment: 'SEO meta description (max 160 chars for Google)',
  })
  metaDescription?: string;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: false,
    defaultValue: [],
    comment: 'SEO keywords for search engines',
  })
  metaKeywords!: string[];

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
    comment: 'Canonical URL for SEO',
  })
  canonicalUrl?: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
    comment: 'Open Graph image for social sharing',
  })
  ogImage?: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Allow search engines to index this post',
  })
  indexable!: boolean;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: 'Estimated reading time in minutes',
  })
  readingTime?: number;

  // Featured/Highlighted post
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  featured!: boolean;

  // SEO Score (0-100) - calculated based on SEO best practices
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'SEO score from 0-100',
  })
  seoScore!: number;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  createdBy!: string;

  @BelongsTo(() => User, 'createdBy')
  creator?: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  updatedBy?: string;

  @BelongsTo(() => User, 'updatedBy')
  updater?: User;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Generate slug from title
   */
  @BeforeCreate
  @BeforeUpdate
  static generateSlug(instance: BlogPost) {
    if (instance.changed('title') && !instance.slug) {
      instance.slug = instance.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/-+/g, '-') // Replace multiple - with single -
        .replace(/^-|-$/g, ''); // Remove leading/trailing -
    }
  }

  /**
   * Set publishedAt when status changes to published
   */
  @BeforeCreate
  @BeforeUpdate
  static setPublishedAt(instance: BlogPost) {
    if (instance.changed('status') && instance.status === 'published' && !instance.publishedAt) {
      instance.publishedAt = new Date();
    }
  }

  /**
   * Increment view count
   */
  async incrementViews(): Promise<void> {
    this.views += 1;
    await this.save();
  }

  /**
   * Publish blog post
   */
  async publish(userId: string): Promise<void> {
    this.status = 'published';
    this.publishedAt = new Date();
    this.updatedBy = userId;
    await this.save();
  }

  /**
   * Archive blog post
   */
  async archive(userId: string): Promise<void> {
    this.status = 'archived';
    this.updatedBy = userId;
    await this.save();
  }

  /**
   * Unpublish (back to draft)
   */
  async unpublish(userId: string): Promise<void> {
    this.status = 'draft';
    this.updatedBy = userId;
    await this.save();
  }

  /**
   * Update content
   */
  async updateContent(
    data: {
      title?: string;
      subtitle?: string;
      content?: string;
      excerpt?: string;
      author?: string;
      coverImage?: string;
      tags?: string[];
      category?: string;
    },
    userId: string
  ): Promise<void> {
    if (data.title) this.title = data.title;
    if (data.subtitle) this.subtitle = data.subtitle;
    if (data.content) this.content = data.content;
    if (data.excerpt) this.excerpt = data.excerpt;
    if (data.author) this.author = data.author;
    if (data.coverImage !== undefined) this.coverImage = data.coverImage;
    if (data.tags) this.tags = data.tags;
    if (data.category) this.category = data.category;

    this.updatedBy = userId;
    await this.save();
  }

  /**
   * Check if published
   */
  isPublished(): boolean {
    return this.status === 'published';
  }

  /**
   * Check if draft
   */
  isDraft(): boolean {
    return this.status === 'draft';
  }

  /**
   * Calculate reading time based on content length
   * Average reading speed: 200 words per minute
   */
  calculateReadingTime(): number {
    const wordsPerMinute = 200;
    const wordCount = this.content.split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Calculate SEO score based on best practices
   * Returns a score from 0-100
   */
  calculateSeoScore(): number {
    let score = 0;
    const maxScore = 100;

    // Title checks (25 points max)
    if (this.title) {
      score += 5; // Has title
      if (this.title.length >= 30 && this.title.length <= 60) score += 10; // Optimal length
      if (this.title.length > 10) score += 5; // Not too short
      if (/^[A-ZÁÉÍÓÚÑ]/.test(this.title)) score += 5; // Starts with capital
    }

    // Meta description (20 points max)
    if (this.metaDescription) {
      score += 5; // Has meta description
      if (this.metaDescription.length >= 120 && this.metaDescription.length <= 160) score += 15; // Optimal length
      else if (this.metaDescription.length >= 50) score += 8; // Acceptable length
    }

    // Meta title (10 points max)
    if (this.metaTitle) {
      score += 5;
      if (this.metaTitle.length >= 30 && this.metaTitle.length <= 70) score += 5;
    }

    // Content checks (25 points max)
    if (this.content) {
      const wordCount = this.content.split(/\s+/).length;
      if (wordCount >= 300) score += 5; // Minimum content
      if (wordCount >= 600) score += 5; // Good content length
      if (wordCount >= 1000) score += 5; // Great content length
      if (this.content.includes('<h2') || this.content.includes('<h3')) score += 5; // Has headings
      if (this.content.includes('<img') || this.coverImage) score += 5; // Has images
    }

    // Tags and keywords (10 points max)
    if (this.tags && this.tags.length > 0) score += 5;
    if (this.metaKeywords && this.metaKeywords.length >= 3) score += 5;

    // Cover image (5 points)
    if (this.coverImage) score += 5;

    // Slug optimization (5 points)
    if (this.slug && this.slug.length <= 50 && !this.slug.includes('--')) score += 5;

    return Math.min(score, maxScore);
  }

  /**
   * Get SEO suggestions for improvement
   */
  getSeoSuggestions(): string[] {
    const suggestions: string[] = [];

    // Title suggestions
    if (!this.title || this.title.length < 30) {
      suggestions.push('📝 El título debería tener al menos 30 caracteres para mejor SEO');
    }
    if (this.title && this.title.length > 60) {
      suggestions.push('📝 El título es muy largo (máx. 60 caracteres). Google lo cortará');
    }

    // Meta description suggestions
    if (!this.metaDescription) {
      suggestions.push('📋 Agrega una meta descripción para mejorar el CTR en Google');
    } else if (this.metaDescription.length < 120) {
      suggestions.push('📋 La meta descripción es muy corta. Apunta a 120-160 caracteres');
    } else if (this.metaDescription.length > 160) {
      suggestions.push('📋 La meta descripción es muy larga. Google la cortará después de 160 caracteres');
    }

    // Content suggestions
    const wordCount = this.content?.split(/\s+/).length || 0;
    if (wordCount < 300) {
      suggestions.push('📄 El contenido es muy corto. Apunta a al menos 300 palabras');
    }
    if (!this.content?.includes('<h2') && !this.content?.includes('<h3')) {
      suggestions.push('🔤 Usa subtítulos (H2, H3) para estructurar mejor el contenido');
    }

    // Image suggestions
    if (!this.coverImage) {
      suggestions.push('🖼️ Agrega una imagen de portada para mayor engagement');
    }

    // Tags suggestions
    if (!this.tags || this.tags.length < 3) {
      suggestions.push('🏷️ Agrega al menos 3 etiquetas relevantes');
    }

    // Keywords suggestions
    if (!this.metaKeywords || this.metaKeywords.length < 3) {
      suggestions.push('🔑 Agrega al menos 3 palabras clave para SEO');
    }

    return suggestions;
  }

  /**
   * Update SEO score and reading time before saving
   */
  @BeforeCreate
  @BeforeUpdate
  static updateSeoMetrics(instance: BlogPost) {
    instance.readingTime = instance.calculateReadingTime();
    instance.seoScore = instance.calculateSeoScore();
  }
}
