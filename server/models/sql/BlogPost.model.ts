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
 * Supports drafts, publishing workflow, categories, tags, and view tracking.
 */
@Table({
  tableName: 'blog_posts',
  timestamps: true,
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
}
