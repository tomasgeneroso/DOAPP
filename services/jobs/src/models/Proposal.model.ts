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

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

@Table({
  tableName: 'proposals',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['job_id'] },
    { fields: ['doer_id'] },
    { fields: ['status'] },
    { fields: ['job_id', 'doer_id'], unique: true },
  ],
})
export class Proposal extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  jobId!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  doerId!: string;

  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    validate: {
      len: [10, 1000],
    },
  })
  message!: string;

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    validate: {
      min: 0,
    },
  })
  proposedPrice!: number;

  @Column(DataType.INTEGER)
  estimatedDays?: number;

  @Default('pending')
  @Index
  @Column(DataType.STRING(20))
  status!: ProposalStatus;

  @Column(DataType.TEXT)
  rejectionReason?: string;

  @Column(DataType.DATE)
  respondedAt?: Date;

  // Methods
  isPending(): boolean {
    return this.status === 'pending';
  }

  isAccepted(): boolean {
    return this.status === 'accepted';
  }

  async accept(): Promise<void> {
    this.status = 'accepted';
    this.respondedAt = new Date();
    await this.save();
  }

  async reject(reason?: string): Promise<void> {
    this.status = 'rejected';
    this.rejectionReason = reason;
    this.respondedAt = new Date();
    await this.save();
  }

  async withdraw(): Promise<void> {
    this.status = 'withdrawn';
    await this.save();
  }
}

export default Proposal;
