import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  Index,
  ForeignKey,
  BelongsTo,
  BeforeCreate,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Job } from './Job.model.js';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

export interface QuoteItem {
  qty: number;
  description: string;
  unitPrice: number;
  amount: number;
}

export interface QuotePartyInfo {
  name: string;
  address?: string;
  city?: string;
  cuit?: string;
  email?: string;
  phone?: string;
}

@Table({
  tableName: 'quotes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['sender_id', 'status'] },
    { fields: ['recipient_id', 'status'] },
    { fields: ['job_id'] },
    { fields: ['conversation_id'] },
    { fields: ['status'] },
  ],
})
export class Quote extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(20), unique: true })
  quoteNumber!: string;

  @Default('sent')
  @Column(DataType.STRING(20))
  status!: QuoteStatus;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  senderId!: string;

  @BelongsTo(() => User, 'senderId')
  sender!: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  recipientId!: string;

  @BelongsTo(() => User, 'recipientId')
  recipient!: User;

  @AllowNull(true)
  @ForeignKey(() => Job)
  @Column(DataType.UUID)
  jobId?: string;

  @BelongsTo(() => Job)
  job?: Job;

  @AllowNull(true)
  @Column(DataType.UUID)
  proposalId?: string;

  @AllowNull(true)
  @Column(DataType.UUID)
  conversationId?: string;

  @Column(DataType.STRING(200))
  title!: string;

  @Default([])
  @Column(DataType.JSONB)
  items!: QuoteItem[];

  @Column(DataType.DECIMAL(12, 2))
  subtotal!: number;

  @Default(21)
  @Column(DataType.DECIMAL(5, 2))
  taxRate!: number;

  @Column(DataType.DECIMAL(12, 2))
  taxAmount!: number;

  @Default([])
  @Column(DataType.JSONB)
  otherTaxes!: Array<{ name: string; rate: number; amount: number }>;

  @Column(DataType.DECIMAL(12, 2))
  total!: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  notes?: string;

  @AllowNull(true)
  @Column(DataType.STRING(200))
  paymentTerms?: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  validUntil?: Date;

  @AllowNull(true)
  @Column(DataType.TEXT)
  rejectionReason?: string;

  @Default(0)
  @Column(DataType.INTEGER)
  revisionCount!: number;

  @AllowNull(true)
  @Column(DataType.JSONB)
  senderInfo?: QuotePartyInfo;

  @AllowNull(true)
  @Column(DataType.JSONB)
  recipientInfo?: QuotePartyInfo;

  @BeforeCreate
  static async generateQuoteNumber(instance: Quote): Promise<void> {
    const count = await Quote.count();
    instance.quoteNumber = `COT-${String(count + 1).padStart(6, '0')}`;
  }
}

export default Quote;
