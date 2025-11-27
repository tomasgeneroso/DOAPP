import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';

export type PortfolioType = 'image' | 'video' | 'document' | 'link';

@Table({
  tableName: 'portfolios',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['type'] },
    { fields: ['is_featured'] },
    { fields: ['linked_contract_id'] },
  ],
})
export class Portfolio extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @AllowNull(false)
  @Column({
    type: DataType.STRING(100),
    validate: {
      len: [1, 100],
    },
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 500],
    },
  })
  description?: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  type!: PortfolioType;

  @AllowNull(false)
  @Column(DataType.TEXT)
  url!: string;

  @Column(DataType.TEXT)
  thumbnailUrl?: string;

  @Default(false)
  @Index
  @Column(DataType.BOOLEAN)
  isFeatured!: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  order!: number;

  @Index
  @Column(DataType.UUID)
  linkedContractId?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  likes!: number;

  @Default([])
  @Column(DataType.ARRAY(DataType.UUID))
  likedBy!: string[];

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  tags!: string[];

  // Methods
  async addLike(userId: string): Promise<boolean> {
    if (this.likedBy.includes(userId)) return false;
    this.likedBy.push(userId);
    this.likes += 1;
    await this.save();
    return true;
  }

  async removeLike(userId: string): Promise<boolean> {
    const index = this.likedBy.indexOf(userId);
    if (index === -1) return false;
    this.likedBy.splice(index, 1);
    this.likes = Math.max(0, this.likes - 1);
    await this.save();
    return true;
  }

  hasLiked(userId: string): boolean {
    return this.likedBy.includes(userId);
  }
}

export default Portfolio;
