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

@Table({
  tableName: 'conversations',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['participant1_id'] },
    { fields: ['participant2_id'] },
    { fields: ['participant1_id', 'participant2_id'], unique: true },
    { fields: ['last_message_at'] },
  ],
})
export class Conversation extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  participant1Id!: string;

  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  participant2Id!: string;

  @Column(DataType.UUID)
  lastMessageId?: string;

  @Column(DataType.TEXT)
  lastMessageContent?: string;

  @Index
  @Column(DataType.DATE)
  lastMessageAt?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  unreadCount1!: number; // Unread for participant1

  @Default(0)
  @Column(DataType.INTEGER)
  unreadCount2!: number; // Unread for participant2

  @Default(false)
  @Column(DataType.BOOLEAN)
  isArchived1!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isArchived2!: boolean;

  @Column(DataType.UUID)
  jobId?: string;

  @Column(DataType.UUID)
  contractId?: string;

  // Methods
  hasParticipant(userId: string): boolean {
    return this.participant1Id === userId || this.participant2Id === userId;
  }

  getOtherParticipant(userId: string): string {
    return userId === this.participant1Id ? this.participant2Id : this.participant1Id;
  }

  async updateLastMessage(messageId: string, content: string, senderId: string): Promise<void> {
    this.lastMessageId = messageId;
    this.lastMessageContent = content.substring(0, 100);
    this.lastMessageAt = new Date();

    // Increment unread count for receiver
    if (senderId === this.participant1Id) {
      this.unreadCount2 += 1;
    } else {
      this.unreadCount1 += 1;
    }

    await this.save();
  }

  async markAsReadFor(userId: string): Promise<void> {
    if (userId === this.participant1Id) {
      this.unreadCount1 = 0;
    } else {
      this.unreadCount2 = 0;
    }
    await this.save();
  }

  getUnreadCountFor(userId: string): number {
    return userId === this.participant1Id ? this.unreadCount1 : this.unreadCount2;
  }

  static async findOrCreateConversation(
    participant1Id: string,
    participant2Id: string,
    options?: { jobId?: string; contractId?: string }
  ): Promise<Conversation> {
    // Ensure consistent ordering
    const [p1, p2] = [participant1Id, participant2Id].sort();

    let conversation = await Conversation.findOne({
      where: {
        participant1Id: p1,
        participant2Id: p2,
      },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participant1Id: p1,
        participant2Id: p2,
        ...options,
      });
    }

    return conversation;
  }
}

export default Conversation;
