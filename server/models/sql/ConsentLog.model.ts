import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Index,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * ConsentLog Model - GDPR Compliance
 *
 * Registra todos los consentimientos del usuario para cumplimiento GDPR.
 * Incluye historial completo de aceptaciones, rechazos y revocaciones.
 */
@Table({
  tableName: 'consent_logs',
  timestamps: false, // Usamos timestamp personalizado
  indexes: [
    {
      fields: ['userId', 'consentType', 'timestamp'],
      name: 'idx_consent_user_type_time',
    },
    {
      fields: ['userId'],
      name: 'idx_consent_userId',
    },
    {
      fields: ['consentType'],
      name: 'idx_consent_type',
    },
    {
      fields: ['timestamp'],
      name: 'idx_consent_timestamp',
    },
  ],
})
export class ConsentLog extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  userId!: string;

  @BelongsTo(() => User)
  user?: User;

  @Column({
    type: DataType.ENUM(
      'terms_and_conditions',
      'privacy_policy',
      'data_processing',
      'marketing_emails',
      'push_notifications',
      'cookies',
      'data_sharing',
      'analytics'
    ),
    allowNull: false,
  })
  consentType!:
    | 'terms_and_conditions'
    | 'privacy_policy'
    | 'data_processing'
    | 'marketing_emails'
    | 'push_notifications'
    | 'cookies'
    | 'data_sharing'
    | 'analytics';

  @Column({
    type: DataType.ENUM('accepted', 'rejected', 'updated', 'revoked'),
    allowNull: false,
  })
  action!: 'accepted' | 'rejected' | 'updated' | 'revoked';

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  version!: string;

  @Column({
    type: DataType.STRING(45),
    allowNull: false,
  })
  ipAddress!: string;

  @Column({
    type: DataType.STRING(512),
    allowNull: false,
  })
  userAgent!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  consentData?: any;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
  })
  previousValue?: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
  })
  newValue!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  timestamp!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expiresAt?: Date;

  /**
   * Log a consent action
   */
  static async logConsent(consentData: {
    userId: string;
    consentType: string;
    action: string;
    version: string;
    ipAddress: string;
    userAgent: string;
    newValue: boolean;
    previousValue?: boolean;
    expiresAt?: Date;
    consentData?: any;
  }): Promise<ConsentLog> {
    return await ConsentLog.create(consentData as any);
  }

  /**
   * Get user's consent history
   */
  static async getUserConsents(
    userId: string,
    consentType?: string
  ): Promise<ConsentLog[]> {
    const where: any = { userId };
    if (consentType) {
      where.consentType = consentType;
    }

    return await ConsentLog.findAll({
      where,
      order: [['timestamp', 'DESC']],
    });
  }

  /**
   * Get latest consent for a specific type
   */
  static async getLatestConsent(
    userId: string,
    consentType: string
  ): Promise<ConsentLog | null> {
    return await ConsentLog.findOne({
      where: { userId, consentType },
      order: [['timestamp', 'DESC']],
    });
  }

  /**
   * Check if user has valid consent
   */
  static async hasValidConsent(
    userId: string,
    consentType: string,
    requiredVersion?: string
  ): Promise<boolean> {
    const latestConsent = await ConsentLog.getLatestConsent(userId, consentType);

    if (!latestConsent) return false;

    // Check if consent is not expired
    if (latestConsent.expiresAt && latestConsent.expiresAt < new Date()) {
      return false;
    }

    // Check if consent is accepted
    if (!latestConsent.newValue) return false;

    // Check version if required
    if (requiredVersion && latestConsent.version !== requiredVersion) {
      return false;
    }

    return true;
  }
}
