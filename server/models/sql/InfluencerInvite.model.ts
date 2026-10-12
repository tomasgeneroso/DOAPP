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
  Unique,
  Index,
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * InfluencerInvite — invitaciones de creadores de contenido.
 *
 * Cada creador recibe un lote de invitaciones (POLITICAS.INVITACIONES_POR_INFLUENCER, 5). Cada una es un enlace de UN
 * solo uso: quien la canjea (al registrarse o desde su cuenta) no paga la comisión de la Plataforma por sus contratos
 * como Cliente durante `freeDays` días corridos desde el canje (T&C 7.11).
 *
 * Los días se guardan en la propia invitación (`freeDays`) para que una invitación ya emitida conserve lo que prometió
 * aunque después cambie la política.
 */
@Table({
  tableName: 'influencer_invites',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['batch_id'] },
    { fields: ['redeemed_by_id'] },
    { fields: ['is_active'] },
  ],
})
export class InfluencerInvite extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  // Código del enlace. Largo y al azar (criptográfico): no se puede adivinar.
  @AllowNull(false)
  @Unique
  @Column(DataType.STRING(24))
  code!: string;

  // Las invitaciones de un mismo creador comparten lote.
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  batchId!: string;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  influencerName!: string;

  // Usuario en la red social (@algo) o contacto.
  @Column(DataType.STRING(160))
  influencerHandle?: string;

  // Días sin comisión que da esta invitación (copia de la política al emitirla).
  @AllowNull(false)
  @Column(DataType.INTEGER)
  freeDays!: number;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  // Fecha límite para canjearla (opcional).
  @Column(DataType.DATE)
  expiresAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  redeemedById?: string;

  @BelongsTo(() => User, 'redeemedById')
  redeemedBy?: User;

  @Column(DataType.DATE)
  redeemedAt?: Date;

  // Hasta cuándo dura el beneficio de quien la canjeó.
  @Column(DataType.DATE)
  benefitEndsAt?: Date;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  createdById!: string;

  @BelongsTo(() => User, 'createdById')
  createdBy?: User;

  @Column(DataType.TEXT)
  notes?: string;

  // Por qué se dio de baja (si se dio).
  @Column(DataType.TEXT)
  deactivatedReason?: string;

  @Column(DataType.DATE)
  deactivatedAt?: Date;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  deactivatedById?: string;
}

export default InfluencerInvite;
