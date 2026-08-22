import { Table, Column, Model, DataType } from 'sequelize-typescript';

/**
 * Key/value store for runtime settings the owner can change without a deploy.
 *
 * Distinct from ModuleConfig, which answers "is this feature switched on".
 * This holds values that carry consequences worth auditing — the platform
 * phase is the first one, and it decides whether the app charges commission.
 * Hence updatedBy/updatedAt: for anything touching money, who changed it and
 * when is part of the record, not a nice-to-have.
 */
@Table({ tableName: 'app_settings', timestamps: true, underscored: true })
export class AppSetting extends Model {
  @Column({ type: DataType.STRING(64), primaryKey: true })
  key!: string;

  /** JSON so a setting can grow beyond a scalar without a migration. */
  @Column({ type: DataType.JSONB, allowNull: false })
  value!: any;

  @Column({ type: DataType.UUID })
  updatedBy?: string;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export default AppSetting;
