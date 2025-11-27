import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Index,
} from 'sequelize-typescript';

export type ReviewType = 'workQuality' | 'worker' | 'contract';

@Table({
  tableName: 'reviews',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['contract_id'] },
    { fields: ['reviewer_id'] },
    { fields: ['reviewee_id'] },
    { fields: ['type'] },
    { fields: ['rating'] },
    { fields: ['contract_id', 'reviewer_id', 'type'], unique: true },
  ],
})
export class Review extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  contractId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  reviewerId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  revieweeId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(20))
  type!: ReviewType;

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

  @Column({
    type: DataType.TEXT,
    validate: {
      len: [0, 1000],
    },
  })
  comment?: string;

  @Column(DataType.UUID)
  jobId?: string;

  // Methods
  static async getAverageRating(userId: string, type: ReviewType): Promise<number> {
    const result = await Review.findOne({
      where: { revieweeId: userId, type },
      attributes: [
        [Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'avgRating'],
      ],
      raw: true,
    }) as any;

    return result?.avgRating ? parseFloat(result.avgRating) : 0;
  }

  static async getReviewCount(userId: string, type?: ReviewType): Promise<number> {
    const where: any = { revieweeId: userId };
    if (type) where.type = type;

    return Review.count({ where });
  }
}

export default Review;
