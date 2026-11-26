import 'reflect-metadata';
import { DataTypes } from 'sequelize';
import { Table, Column, Model, ForeignKey, PrimaryKey, AllowNull, Default } from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * Registro de uso PROPIO de DOAPP: una fila por persona, día (hora argentina) y plataforma, con cuántas visitas hizo y cuánto duraron.
 * No guarda pantallas, textos, direcciones ni IP. Alimenta los índices de `/admin/metricas` y se borra a los 400 días.
 */
@Table({ tableName: 'activity_days', timestamps: false, underscored: true, indexes: [{ fields: ['day'] }] })
export class ActivityDay extends Model {
  @PrimaryKey
  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataTypes.UUID, field: 'user_id', onDelete: 'CASCADE' } as any)
  userId!: string;

  @PrimaryKey
  @AllowNull(false)
  @Column(DataTypes.DATEONLY)
  day!: string;

  @PrimaryKey
  @AllowNull(false)
  @Column(DataTypes.STRING(10))
  platform!: string;

  @Default(1)
  @AllowNull(false)
  @Column(DataTypes.INTEGER)
  sessions!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataTypes.INTEGER)
  seconds!: number;

  @AllowNull(false)
  @Column({ type: DataTypes.DATE, field: 'first_seen_at' })
  firstSeenAt!: Date;

  @AllowNull(false)
  @Column({ type: DataTypes.DATE, field: 'last_seen_at' })
  lastSeenAt!: Date;
}
