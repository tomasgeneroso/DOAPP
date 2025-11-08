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
import { Contract } from './Contract.model.js';

/**
 * NegotiationMessage Interface
 * Represents a single message/proposal in the negotiation
 */
export interface INegotiationMessage {
  userId: string;
  message: string;
  proposedPrice?: number;
  proposedStartDate?: Date;
  proposedEndDate?: Date;
  proposedTerms?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CurrentProposal Interface
 * Represents the current active proposal in negotiation
 */
export interface ICurrentProposal {
  price?: number;
  startDate?: Date;
  endDate?: Date;
  terms?: string;
  proposedBy?: string;
}

/**
 * ContractNegotiation Model
 *
 * Tracks proposals, counter-proposals, and negotiation history for contracts.
 * Allows back-and-forth negotiation before contract finalization.
 */
@Table({
  tableName: 'contract_negotiations',
  timestamps: true,
  indexes: [
    {
      fields: ['contractId'],
      name: 'idx_negotiation_contract',
    },
    {
      fields: ['clientId', 'status'],
      name: 'idx_negotiation_client_status',
    },
    {
      fields: ['doerId', 'status'],
      name: 'idx_negotiation_doer_status',
    },
  ],
})
export class ContractNegotiation extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => Contract)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  contractId!: string;

  @BelongsTo(() => Contract)
  contract?: Contract;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  clientId!: string;

  @BelongsTo(() => User, 'clientId')
  client?: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  doerId!: string;

  @BelongsTo(() => User, 'doerId')
  doer?: User;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    defaultValue: [],
    comment: 'Array of negotiation messages and proposals',
  })
  messages!: INegotiationMessage[];

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: 'Current active proposal in negotiation',
  })
  currentProposal?: ICurrentProposal;

  @Column({
    type: DataType.ENUM('negotiating', 'agreed', 'cancelled'),
    allowNull: false,
    defaultValue: 'negotiating',
  })
  status!: 'negotiating' | 'agreed' | 'cancelled';

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  agreedAt?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  cancelledAt?: Date;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  cancelledBy?: string;

  @BelongsTo(() => User, 'cancelledBy')
  canceller?: User;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Add a new message to the negotiation
   */
  async addMessage(messageData: {
    userId: string;
    message: string;
    proposedPrice?: number;
    proposedStartDate?: Date;
    proposedEndDate?: Date;
    proposedTerms?: string;
    status?: 'pending' | 'accepted' | 'rejected' | 'countered';
  }): Promise<void> {
    const newMessage: INegotiationMessage = {
      userId: messageData.userId,
      message: messageData.message,
      proposedPrice: messageData.proposedPrice,
      proposedStartDate: messageData.proposedStartDate,
      proposedEndDate: messageData.proposedEndDate,
      proposedTerms: messageData.proposedTerms,
      status: messageData.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.messages = [...this.messages, newMessage];

    // Update current proposal if new values provided
    if (
      messageData.proposedPrice ||
      messageData.proposedStartDate ||
      messageData.proposedEndDate ||
      messageData.proposedTerms
    ) {
      this.currentProposal = {
        price: messageData.proposedPrice,
        startDate: messageData.proposedStartDate,
        endDate: messageData.proposedEndDate,
        terms: messageData.proposedTerms,
        proposedBy: messageData.userId,
      };
    }

    await this.save();
  }

  /**
   * Accept the current proposal
   */
  async acceptProposal(): Promise<void> {
    this.status = 'agreed';
    this.agreedAt = new Date();
    await this.save();
  }

  /**
   * Cancel the negotiation
   */
  async cancelNegotiation(userId: string): Promise<void> {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    this.cancelledBy = userId;
    await this.save();
  }

  /**
   * Get latest message
   */
  getLatestMessage(): INegotiationMessage | null {
    if (this.messages.length === 0) return null;
    return this.messages[this.messages.length - 1];
  }

  /**
   * Count messages by user
   */
  getMessageCountByUser(userId: string): number {
    return this.messages.filter((msg) => msg.userId === userId).length;
  }

  /**
   * Check if user is participant
   */
  isParticipant(userId: string): boolean {
    return this.clientId === userId || this.doerId === userId;
  }
}
