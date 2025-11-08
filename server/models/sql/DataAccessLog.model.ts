import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Op } from 'sequelize';

/**
 * DataAccessLog Model - GDPR Compliance
 *
 * Registra todos los accesos a datos de usuarios para auditoría y cumplimiento GDPR.
 * Incluye TTL automático de 7 años según regulaciones de privacidad.
 */
@Table({
  tableName: 'data_access_logs',
  timestamps: false,
  indexes: [
    {
      fields: ['userId', 'timestamp'],
      name: 'idx_data_access_user_time',
    },
    {
      fields: ['accessedBy', 'timestamp'],
      name: 'idx_data_access_by_time',
    },
    {
      fields: ['accessType', 'dataType', 'timestamp'],
      name: 'idx_data_access_type_datatype_time',
    },
    {
      fields: ['userId'],
      name: 'idx_data_access_userId',
    },
    {
      fields: ['timestamp'],
      name: 'idx_data_access_timestamp',
    },
  ],
})
export class DataAccessLog extends Model {
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

  @BelongsTo(() => User, 'userId')
  user?: User;

  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  accessedBy!: string;

  @BelongsTo(() => User, 'accessedBy')
  accessor?: User;

  @Column({
    type: DataType.ENUM('view', 'export', 'modify', 'delete', 'share', 'download', 'print'),
    allowNull: false,
  })
  accessType!: 'view' | 'export' | 'modify' | 'delete' | 'share' | 'download' | 'print';

  @Column({
    type: DataType.ENUM(
      'profile',
      'personal_info',
      'financial_data',
      'payment_history',
      'contract_history',
      'communication_logs',
      'location_data',
      'device_info',
      'full_account'
    ),
    allowNull: false,
  })
  dataType!:
    | 'profile'
    | 'personal_info'
    | 'financial_data'
    | 'payment_history'
    | 'contract_history'
    | 'communication_logs'
    | 'location_data'
    | 'device_info'
    | 'full_account';

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  reason!: string;

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
    type: DataType.ARRAY(DataType.STRING),
    allowNull: true,
  })
  requestedFields?: string[];

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  })
  success!: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  errorMessage?: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  timestamp!: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  metadata?: any;

  /**
   * Log data access
   */
  static async logAccess(accessData: {
    userId: string;
    accessedBy: string;
    accessType: string;
    dataType: string;
    reason: string;
    ipAddress: string;
    userAgent: string;
    requestedFields?: string[];
    success?: boolean;
    errorMessage?: string;
    metadata?: any;
  }): Promise<DataAccessLog> {
    return await DataAccessLog.create(accessData as any);
  }

  /**
   * Get access history for a user
   */
  static async getUserAccessHistory(
    userId: string,
    options?: {
      limit?: number;
      skip?: number;
      accessType?: string;
      dataType?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<DataAccessLog[]> {
    const where: any = { userId };

    if (options?.accessType) {
      where.accessType = options.accessType;
    }

    if (options?.dataType) {
      where.dataType = options.dataType;
    }

    if (options?.startDate || options?.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        where.timestamp[Op.gte] = options.startDate;
      }
      if (options.endDate) {
        where.timestamp[Op.lte] = options.endDate;
      }
    }

    return await DataAccessLog.findAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: options?.limit || 100,
      offset: options?.skip || 0,
      include: [
        {
          model: User,
          as: 'accessor',
          attributes: ['name', 'email', 'adminRole'],
        },
      ],
    });
  }

  /**
   * Get suspicious access patterns
   */
  static async getSuspiciousAccess(userId: string): Promise<{
    recentExportsCount: number;
    uniqueIPsLastHour: number;
    isSuspicious: boolean;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find multiple export/download attempts in last 24h
    const recentExports = await DataAccessLog.findAll({
      where: {
        userId,
        accessType: { [Op.in]: ['export', 'download'] },
        timestamp: { [Op.gte]: oneDayAgo },
      },
      order: [['timestamp', 'DESC']],
    });

    // Find access from multiple IPs in last hour
    const recentAccess = await DataAccessLog.findAll({
      where: {
        userId,
        timestamp: { [Op.gte]: oneHourAgo },
      },
      attributes: ['ipAddress'],
    });

    const uniqueIPs = new Set(recentAccess.map((log) => log.ipAddress));

    return {
      recentExportsCount: recentExports.length,
      uniqueIPsLastHour: uniqueIPs.size,
      isSuspicious: recentExports.length > 5 || uniqueIPs.size > 3,
    };
  }

  /**
   * Clean up old logs (7 years GDPR compliance)
   * Should be run as a cron job
   */
  static async cleanupOldLogs(): Promise<number> {
    const sevenYearsAgo = new Date(Date.now() - 7 * 365 * 24 * 60 * 60 * 1000);

    const result = await DataAccessLog.destroy({
      where: {
        timestamp: { [Op.lt]: sevenYearsAgo },
      },
    });

    return result;
  }
}
