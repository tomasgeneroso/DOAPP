import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * ContactMessage Model
 *
 * Contact form submissions and support requests.
 * Tracks status, assignments, and responses.
 */
@Table({
  tableName: 'contact_messages',
  timestamps: true,
  indexes: [
    {
      fields: ['status', 'createdAt'],
      name: 'idx_contact_status_date',
    },
    {
      fields: ['subject', 'status'],
      name: 'idx_contact_subject_status',
    },
    {
      fields: ['email'],
      name: 'idx_contact_email',
    },
    {
      fields: ['user'],
      name: 'idx_contact_user',
    },
  ],
})
export class ContactMessage extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  name!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  email!: string;

  @Column({
    type: DataType.ENUM('support', 'advertising', 'general', 'complaint', 'other'),
    allowNull: false,
    defaultValue: 'general',
  })
  subject!: 'support' | 'advertising' | 'general' | 'complaint' | 'other';

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  message!: string;

  @Column({
    type: DataType.ENUM('model1', 'model2', 'model3', 'custom'),
    allowNull: true,
  })
  adType?: 'model1' | 'model2' | 'model3' | 'custom';

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  customAdDetails?: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  user?: string;

  @BelongsTo(() => User, 'user')
  userObject?: User;

  @Column({
    type: DataType.ENUM('pending', 'in_progress', 'resolved', 'closed'),
    allowNull: false,
    defaultValue: 'pending',
  })
  status!: 'pending' | 'in_progress' | 'resolved' | 'closed';

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  assignedTo?: string;

  @BelongsTo(() => User, 'assignedTo')
  assignee?: User;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  response?: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  respondedBy?: string;

  @BelongsTo(() => User, 'respondedBy')
  responder?: User;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  respondedAt?: Date;

  @Column({
    type: DataType.STRING(45),
    allowNull: true,
  })
  ipAddress?: string;

  @Column({
    type: DataType.STRING(512),
    allowNull: true,
  })
  userAgent?: string;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Assign to a user
   */
  async assignTo(userId: string): Promise<void> {
    this.assignedTo = userId;
    if (this.status === 'pending') {
      this.status = 'in_progress';
    }
    await this.save();
  }

  /**
   * Add a response
   */
  async addResponse(response: string, userId: string): Promise<void> {
    this.response = response;
    this.respondedBy = userId;
    this.respondedAt = new Date();
    this.status = 'resolved';
    await this.save();
  }

  /**
   * Change status
   */
  async changeStatus(status: 'pending' | 'in_progress' | 'resolved' | 'closed'): Promise<void> {
    this.status = status;
    await this.save();
  }

  /**
   * Close message
   */
  async close(): Promise<void> {
    this.status = 'closed';
    await this.save();
  }

  /**
   * Reopen message
   */
  async reopen(): Promise<void> {
    this.status = 'in_progress';
    await this.save();
  }

  /**
   * Check if message is from a registered user
   */
  isFromRegisteredUser(): boolean {
    return this.user !== null && this.user !== undefined;
  }

  /**
   * Check if message is about advertising
   */
  isAdvertisingInquiry(): boolean {
    return this.subject === 'advertising';
  }

  /**
   * Check if message is resolved
   */
  isResolved(): boolean {
    return this.status === 'resolved' || this.status === 'closed';
  }
}
