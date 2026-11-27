import 'reflect-metadata';
import { DataTypes } from 'sequelize';
import { Table, Column, Model, PrimaryKey, AllowNull, Default, CreatedAt, UpdatedAt } from 'sequelize-typescript';

/**
 * Clave de panel de una persona con rol. Solo se guarda el hash. `stamp` cambia con cada clave nueva: los pases emitidos con la anterior dejan de valer.
 * La fila existe aunque todavía no haya clave (`keyHash` vacío): ahí se cuentan los intentos fallidos de crearla.
 */
@Table({ tableName: 'admin_panel_keys', timestamps: true, underscored: true })
export class AdminPanelKey extends Model {
  @PrimaryKey
  @Column({ type: DataTypes.UUID, field: 'user_id' })
  userId!: string;

  @Column({ type: DataTypes.STRING(100), field: 'key_hash' })
  keyHash?: string | null;

  @Column(DataTypes.STRING(32))
  stamp?: string | null;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataTypes.INTEGER, field: 'failed_attempts' })
  failedAttempts!: number;

  @Column({ type: DataTypes.DATE, field: 'locked_until' })
  lockedUntil?: Date | null;

  @Column({ type: DataTypes.STRING(64), field: 'reset_code_hash' })
  resetCodeHash?: string | null;

  @Column({ type: DataTypes.DATE, field: 'reset_expires_at' })
  resetExpiresAt?: Date | null;

  @Column({ type: DataTypes.DATE, field: 'key_set_at' })
  keySetAt?: Date | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
