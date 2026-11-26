import 'reflect-metadata';
import { DataTypes } from 'sequelize';
import { Table, Column, Model, PrimaryKey, AllowNull, ForeignKey } from 'sequelize-typescript';
import { User } from './User.model.js';

/** Qué cartel o tarjeta ya vio cada persona, y cuándo (una fila por persona y clave). Claves: shared/momentos y shared/legal/cambiosDePoliticas. */
@Table({ tableName: 'user_moments', timestamps: false, underscored: true })
export class UserMoment extends Model {
  @PrimaryKey
  @ForeignKey(() => User)
  @AllowNull(false)
  @Column({ type: DataTypes.UUID, field: 'user_id', onDelete: 'CASCADE' } as any)
  userId!: string;

  @PrimaryKey
  @AllowNull(false)
  @Column({ type: DataTypes.STRING(80), field: 'moment_key' })
  momentKey!: string;

  @AllowNull(false)
  @Column({ type: DataTypes.DATE, field: 'seen_at' })
  seenAt!: Date;
}
