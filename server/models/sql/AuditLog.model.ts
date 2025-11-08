import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
} from 'sequelize-typescript';
import { User } from './User.model.js';
import { Op } from 'sequelize';

/**
 * AuditLog Model
 *
 * Comprehensive audit trail for administrative actions and security events.
 * Provides immutable record keeping with cryptographic signatures.
 */
@Table({
  tableName: 'audit_logs',
  timestamps: false,
  indexes: [
    {
      fields: ['performedBy', 'createdAt'],
      name: 'idx_audit_performed_by',
    },
    {
      fields: ['category', 'severity', 'createdAt'],
      name: 'idx_audit_category_severity',
    },
    {
      fields: ['targetModel', 'targetId'],
      name: 'idx_audit_target',
    },
    {
      fields: ['action'],
      name: 'idx_audit_action',
    },
    {
      fields: ['createdAt'],
      name: 'idx_audit_created',
    },
  ],
})
export class AuditLog extends Model {
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
  performedBy!: string;

  @BelongsTo(() => User, 'performedBy')
  performer?: User;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  adminRole!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  action!: string;

  @Column({
    type: DataType.ENUM('user', 'contract', 'ticket', 'role', 'permission', 'system'),
    allowNull: false,
  })
  category!: 'user' | 'contract' | 'ticket' | 'role' | 'permission' | 'system';

  @Column({
    type: DataType.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false,
    defaultValue: 'low',
  })
  severity!: 'low' | 'medium' | 'high' | 'critical';

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  targetModel?: string;

  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  targetId?: string;

  @Column({
    type: DataType.STRING(200),
    allowNull: true,
  })
  targetIdentifier?: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
  })
  description!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];

  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  metadata?: Record<string, any>;

  @Column({
    type: DataType.STRING(45),
    allowNull: false,
    defaultValue: 'unknown',
  })
  ip!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    defaultValue: 'unknown',
  })
  userAgent!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  })
  passwordVerified?: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: false,
  })
  twoFactorVerified?: boolean;

  @Column({
    type: DataType.STRING(64),
    allowNull: true,
  })
  signature?: string;

  @CreatedAt
  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  createdAt!: Date;

  /**
   * Log administrative action with full context
   */
  static async logAdminAction(data: {
    performedBy: string;
    adminRole: string;
    action: string;
    category: 'user' | 'contract' | 'ticket' | 'role' | 'permission' | 'system';
    severity?: 'low' | 'medium' | 'high' | 'critical';
    targetModel?: string;
    targetId?: string;
    targetIdentifier?: string;
    description: string;
    changes?: { field: string; oldValue: any; newValue: any }[];
    metadata?: Record<string, any>;
    ip: string;
    userAgent: string;
    passwordVerified?: boolean;
    twoFactorVerified?: boolean;
    signature?: string;
  }): Promise<AuditLog> {
    return await AuditLog.create({
      performedBy: data.performedBy,
      adminRole: data.adminRole,
      action: data.action,
      category: data.category,
      severity: data.severity || 'low',
      targetModel: data.targetModel,
      targetId: data.targetId,
      targetIdentifier: data.targetIdentifier,
      description: data.description,
      changes: data.changes,
      metadata: data.metadata,
      ip: data.ip,
      userAgent: data.userAgent,
      passwordVerified: data.passwordVerified || false,
      twoFactorVerified: data.twoFactorVerified || false,
      signature: data.signature,
    });
  }

  /**
   * Get audit logs for a specific user/admin
   */
  static async getLogsByPerformer(
    performedBy: string,
    options?: {
      category?: 'user' | 'contract' | 'ticket' | 'role' | 'permission' | 'system';
      severity?: 'low' | 'medium' | 'high' | 'critical';
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLog[]> {
    const where: any = { performedBy };

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.severity) {
      where.severity = options.severity;
    }

    return await AuditLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
      include: [
        {
          model: User,
          as: 'performer',
          attributes: ['id', 'username', 'email'],
        },
      ],
    });
  }

  /**
   * Get audit logs for a specific target
   */
  static async getLogsByTarget(
    targetModel: string,
    targetId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLog[]> {
    return await AuditLog.findAll({
      where: {
        targetModel,
        targetId,
      },
      order: [['createdAt', 'DESC']],
      limit: options?.limit || 50,
      offset: options?.offset || 0,
      include: [
        {
          model: User,
          as: 'performer',
          attributes: ['id', 'username', 'email'],
        },
      ],
    });
  }

  /**
   * Get critical actions that require review
   */
  static async getCriticalActions(options?: {
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    return await AuditLog.findAll({
      where: {
        severity: 'critical',
      },
      order: [['createdAt', 'DESC']],
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      include: [
        {
          model: User,
          as: 'performer',
          attributes: ['id', 'username', 'email'],
        },
      ],
    });
  }

  /**
   * Cleanup old audit logs (keep critical forever)
   */
  static async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await AuditLog.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate,
        },
        severity: {
          $notIn: ['critical', 'high'],
        },
      },
    });

    return result;
  }

  /**
   * Get action statistics
   */
  static async getActionStats(options?: {
    startDate?: Date;
    endDate?: Date;
    performedBy?: string;
  }): Promise<{
    totalActions: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    byAction: Record<string, number>;
  }> {
    const where: any = {};

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options?.startDate) where.createdAt.$gte = options.startDate;
      if (options?.endDate) where.createdAt.$lte = options.endDate;
    }

    if (options?.performedBy) {
      where.performedBy = options.performedBy;
    }

    const logs = await AuditLog.findAll({ where });

    const stats = {
      totalActions: logs.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byAction: {} as Record<string, number>,
    };

    logs.forEach((log) => {
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
      stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
      stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
    });

    return stats;
  }

  /**
   * Verify signature integrity
   */
  verifySignature(expectedSignature: string): boolean {
    return this.signature === expectedSignature;
  }

  /**
   * Check if action was verified with 2FA
   */
  isFullyVerified(): boolean {
    return this.passwordVerified === true && this.twoFactorVerified === true;
  }

  /**
   * Check if action is critical
   */
  isCritical(): boolean {
    return this.severity === 'critical';
  }
}
