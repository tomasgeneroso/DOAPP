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
import crypto from 'crypto';

/**
 * MatchingCode Model - Secure User Verification
 *
 * Generates temporary codes that expire after 30 minutes.
 * Both parties must exchange codes to verify they're meeting the right person.
 * Codes become valid 10 minutes before scheduled meeting time.
 */
@Table({
  tableName: 'matching_codes',
  timestamps: true,
  indexes: [
    {
      fields: ['contractId', 'userId'],
      name: 'idx_matching_contract_user',
    },
    {
      fields: ['expiresAt'],
      name: 'idx_matching_expires',
    },
    {
      fields: ['userId'],
      name: 'idx_matching_userId',
    },
  ],
})
export class MatchingCode extends Model {
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
  userId!: string;

  @BelongsTo(() => User)
  user?: User;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
    comment: 'SHA256 hash of the actual code for security',
  })
  codeHash!: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    comment: 'Code becomes valid 10 min before meeting',
  })
  validFrom!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    comment: 'Code expires 30 min after validFrom',
  })
  expiresAt!: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  isUsed!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  usedAt?: Date;

  @Column({
    type: DataType.STRING(45),
    allowNull: true,
  })
  usedFromIp?: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  partnerVerified!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  partnerVerifiedAt?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  scheduledMeetingTime!: Date;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  meetingLocation?: string;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Check if code is currently valid
   */
  isValid(): boolean {
    const now = new Date();
    return !this.isUsed && now >= this.validFrom && now <= this.expiresAt;
  }

  /**
   * Verify a code against the stored hash
   */
  verifyCode(code: string): boolean {
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    return this.codeHash === hash;
  }

  /**
   * Generate a new matching code for a contract meeting
   */
  static async generateCode(
    contractId: string,
    userId: string,
    scheduledMeetingTime: Date,
    meetingLocation?: string
  ): Promise<{ code: string; document: MatchingCode }> {
    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the code
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // Calculate valid from (10 minutes before meeting)
    const validFrom = new Date(scheduledMeetingTime.getTime() - 10 * 60 * 1000);

    // Calculate expiry (30 minutes after valid from)
    const expiresAt = new Date(validFrom.getTime() + 30 * 60 * 1000);

    // Create document
    const document = await MatchingCode.create({
      contractId,
      userId,
      codeHash,
      validFrom,
      expiresAt,
      scheduledMeetingTime,
      meetingLocation,
    });

    return { code, document };
  }

  /**
   * Mark code as used
   */
  async markAsUsed(ipAddress: string): Promise<void> {
    this.isUsed = true;
    this.usedAt = new Date();
    this.usedFromIp = ipAddress;
    await this.save();
  }

  /**
   * Mark code as partner verified
   */
  async markPartnerVerified(): Promise<void> {
    this.partnerVerified = true;
    this.partnerVerifiedAt = new Date();
    await this.save();
  }

  /**
   * Clean up expired codes (should be run as cron job)
   */
  static async cleanupExpiredCodes(): Promise<number> {
    const now = new Date();
    const result = await MatchingCode.destroy({
      where: {
        expiresAt: { [require('sequelize').Op.lt]: now },
      },
    });
    return result;
  }
}
