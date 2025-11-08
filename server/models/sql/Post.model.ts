import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Contract } from './Contract.model.js';
import { PostComment } from './PostComment.model.js';

/**
 * Gallery Item Interface
 */
export interface IGalleryItem {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
  caption?: string;
}

/**
 * Post Model
 *
 * Social network posts for showcasing work, portfolios, or articles.
 * Supports gallery of images/videos, likes, comments, and optional pricing.
 */
@Table({
  tableName: 'posts',
  timestamps: true,
  indexes: [
    {
      fields: ['author', 'createdAt'],
      name: 'idx_post_author_date',
    },
    {
      fields: ['type', 'isPublished', 'createdAt'],
      name: 'idx_post_type_published_date',
    },
    {
      fields: ['tags'],
      name: 'idx_post_tags',
      using: 'gin', // GIN index for array search in PostgreSQL
    },
  ],
})
export class Post extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  author!: string;

  @BelongsTo(() => User, 'author')
  authorUser?: User;

  @Column({
    type: DataType.STRING(200),
    allowNull: false,
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
  })
  gallery!: IGalleryItem[];

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: true,
  })
  price?: number;

  @Column({
    type: DataType.ENUM('ARS', 'USD'),
    allowNull: false,
    defaultValue: 'ARS',
  })
  currency!: 'ARS' | 'USD';

  @Column({
    type: DataType.ENUM('post', 'article'),
    allowNull: false,
    defaultValue: 'post',
  })
  type!: 'post' | 'article';

  @Column({
    type: DataType.ARRAY(DataType.UUID),
    allowNull: false,
    defaultValue: [],
  })
  likes!: string[];

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  likesCount!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  commentsCount!: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  viewsCount!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  isPublished!: boolean;

  @Column({
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
    defaultValue: [],
  })
  tags?: string[];

  @ForeignKey(() => Contract)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  linkedContract?: string;

  @BelongsTo(() => Contract)
  contract?: Contract;

  @HasMany(() => PostComment, 'post')
  comments?: PostComment[];

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Toggle like on post
   */
  async toggleLike(userId: string): Promise<boolean> {
    const likeIndex = this.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      this.likes.splice(likeIndex, 1);
      this.likesCount = Math.max(0, this.likesCount - 1);
      await this.save();
      return false;
    } else {
      // Like
      this.likes.push(userId);
      this.likesCount += 1;
      await this.save();
      return true;
    }
  }

  /**
   * Increment view count
   */
  async incrementViews(): Promise<void> {
    this.viewsCount += 1;
    await this.save();
  }

  /**
   * Increment comment count
   */
  async incrementCommentCount(): Promise<void> {
    this.commentsCount += 1;
    await this.save();
  }

  /**
   * Decrement comment count
   */
  async decrementCommentCount(): Promise<void> {
    this.commentsCount = Math.max(0, this.commentsCount - 1);
    await this.save();
  }

  /**
   * Add gallery item
   */
  async addGalleryItem(item: IGalleryItem): Promise<void> {
    this.gallery = [...this.gallery, item];
    await this.save();
  }

  /**
   * Remove gallery item
   */
  async removeGalleryItem(index: number): Promise<void> {
    if (index >= 0 && index < this.gallery.length) {
      this.gallery.splice(index, 1);
      await this.save();
    }
  }

  /**
   * Check if user has liked the post
   */
  hasUserLiked(userId: string): boolean {
    return this.likes.includes(userId);
  }

  /**
   * Publish/unpublish post
   */
  async setPublishStatus(published: boolean): Promise<void> {
    this.isPublished = published;
    await this.save();
  }
}
