import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  AllowNull,
  Index,
} from 'sequelize-typescript';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

@Table({
  tableName: 'audit_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['action'] },
    { fields: ['entity'] },
    { fields: ['entity_id'] },
    { fields: ['severity'] },
    { fields: ['created_at'] },
  ],
})
export class AuditLog extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Index
  @Column(DataType.UUID)
  userId?: string;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(100))
  action!: string;

  @Index
  @Column(DataType.STRING(50))
  entity?: string;

  @Index
  @Column(DataType.UUID)
  entityId?: string;

  @Column(DataType.TEXT)
  description?: string;

  @Column(DataType.STRING(45))
  ipAddress?: string;

  @Column(DataType.STRING(500))
  userAgent?: string;

  @Column(DataType.JSONB)
  changes?: Record<string, any>;

  @Column(DataType.JSONB)
  metadata?: Record<string, any>;

  @Index
  @Column(DataType.STRING(20))
  severity?: AuditSeverity;

  static async log(
    action: string,
    options?: {
      userId?: string;
      entity?: string;
      entityId?: string;
      description?: string;
      ipAddress?: string;
      userAgent?: string;
      changes?: Record<string, any>;
      metadata?: Record<string, any>;
      severity?: AuditSeverity;
    }
  ): Promise<AuditLog> {
    return AuditLog.create({
      action,
      ...options,
    });
  }
}

export default AuditLog;
