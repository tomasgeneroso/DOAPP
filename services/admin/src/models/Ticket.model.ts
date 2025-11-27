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

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'technical' | 'billing' | 'dispute' | 'account' | 'other';

@Table({
  tableName: 'tickets',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { fields: ['category'] },
    { fields: ['assigned_to'] },
    { fields: ['created_at'] },
  ],
})
export class Ticket extends Model {
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
  @Column(DataType.STRING(200))
  subject!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  description!: string;

  @Default('open')
  @Index
  @Column(DataType.STRING(20))
  status!: TicketStatus;

  @Default('medium')
  @Index
  @Column(DataType.STRING(20))
  priority!: TicketPriority;

  @Default('other')
  @Index
  @Column(DataType.STRING(20))
  category!: TicketCategory;

  @Index
  @Column(DataType.UUID)
  assignedTo?: string;

  @Column(DataType.DATE)
  assignedAt?: Date;

  @Column(DataType.DATE)
  resolvedAt?: Date;

  @Column(DataType.DATE)
  closedAt?: Date;

  @Column(DataType.TEXT)
  resolution?: string;

  @Column(DataType.UUID)
  relatedContractId?: string;

  @Column(DataType.UUID)
  relatedJobId?: string;

  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  // Ticket responses stored as JSONB array
  @Default([])
  @Column(DataType.JSONB)
  responses!: Array<{
    id: string;
    userId: string;
    content: string;
    isAdmin: boolean;
    createdAt: string;
  }>;

  async addResponse(
    userId: string,
    content: string,
    isAdmin: boolean = false
  ): Promise<void> {
    const response = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      content,
      isAdmin,
      createdAt: new Date().toISOString(),
    };
    this.responses = [...this.responses, response];
    await this.save();
  }

  async assign(adminId: string): Promise<void> {
    this.assignedTo = adminId;
    this.assignedAt = new Date();
    this.status = 'in_progress';
    await this.save();
  }

  async resolve(resolution: string): Promise<void> {
    this.status = 'resolved';
    this.resolution = resolution;
    this.resolvedAt = new Date();
    await this.save();
  }

  async close(): Promise<void> {
    this.status = 'closed';
    this.closedAt = new Date();
    await this.save();
  }

  async reopen(): Promise<void> {
    this.status = 'open';
    this.resolvedAt = undefined;
    this.closedAt = undefined;
    await this.save();
  }
}

export default Ticket;
