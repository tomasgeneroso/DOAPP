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
import { Post } from './Post.model.js';

/**
 * PostComment Model
 *
 * Comments on posts with support for nested replies, likes, and editing.
 */
@Table({
  tableName: 'post_comments',
  timestamps: true,
  indexes: [
    {
      fields: ['post', 'createdAt'],
      name: 'idx_comment_post_date',
    },
    {
      fields: ['author', 'createdAt'],
      name: 'idx_comment_author_date',
    },
    {
      fields: ['parentComment'],
      name: 'idx_comment_parent',
    },
  ],
})
export class PostComment extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => Post)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  post!: string;

  @BelongsTo(() => Post)
  postObject?: Post;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  author!: string;

  @BelongsTo(() => User, 'author')
  authorUser?: User;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  content!: string;

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

  @ForeignKey(() => PostComment)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  parentComment?: string;

  @BelongsTo(() => PostComment, 'parentComment')
  parent?: PostComment;

  @HasMany(() => PostComment, 'parentComment')
  replies?: PostComment[];

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  isEdited!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Toggle like on comment
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
   * Edit comment content
   */
  async editContent(newContent: string): Promise<void> {
    this.content = newContent;
    this.isEdited = true;
    await this.save();
  }

  /**
   * Check if user has liked the comment
   */
  hasUserLiked(userId: string): boolean {
    return this.likes.includes(userId);
  }

  /**
   * Check if this is a reply
   */
  isReply(): boolean {
    return this.parentComment !== null && this.parentComment !== undefined;
  }

  /**
   * Check if comment belongs to user
   */
  belongsToUser(userId: string): boolean {
    return this.author === userId;
  }
}
