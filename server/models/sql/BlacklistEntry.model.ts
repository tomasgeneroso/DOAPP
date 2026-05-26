import 'reflect-metadata';
import {
  Table,
  Column,
  Model,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  AllowNull,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';

export type BlacklistSeverity = 'low' | 'medium' | 'high';
export type BlacklistType = 'fraud' | 'repeated_violations' | 'payment_issues' | 'abuse' | 'spam' | 'other';

@Table({
  tableName: 'blacklist_entries',
  timestamps: true,
  underscored: true,
})
export class BlacklistEntry extends Model {
  @ForeignKey(() => User)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  userId!: string;

  @BelongsTo(() => User, 'userId')
  user?: User;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  addedBy!: string;

  @BelongsTo(() => User, 'addedBy')
  addedByUser?: User;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  type!: BlacklistType;

  @AllowNull(false)
  @Column(DataType.STRING(20))
  severity!: BlacklistSeverity;

  @AllowNull(false)
  @Column(DataType.TEXT)
  reason!: string;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  // Whether this entry was added automatically (infraction threshold exceeded)
  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  autoAdded!: boolean;

  @Column(DataType.DATE)
  expiresAt?: Date;

  @Column(DataType.DATE)
  resolvedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  resolvedBy?: string;

  @BelongsTo(() => User, 'resolvedBy')
  resolvedByUser?: User;

  @Column(DataType.TEXT)
  resolutionNotes?: string;
}

export default BlacklistEntry;
