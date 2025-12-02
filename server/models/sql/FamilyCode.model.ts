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
  HasMany,
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * FamilyCode Model - PostgreSQL/Sequelize
 *
 * Códigos especiales para familia y amigos del owner.
 * Los usuarios con un código familia activo:
 * - No pagan comisiones en contratos
 * - Tienen badge "Plan Familia" visible
 */

@Table({
  tableName: 'family_codes',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['code'], unique: true },
    { fields: ['is_active'] },
    { fields: ['expires_at'] },
  ],
})
export class FamilyCode extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  // Nombre del beneficiario
  @AllowNull(false)
  @Column(DataType.STRING(100))
  firstName!: string;

  // Apellido del beneficiario
  @AllowNull(false)
  @Column(DataType.STRING(100))
  lastName!: string;

  // Código único generado
  @AllowNull(false)
  @Unique
  @Index
  @Column(DataType.STRING(20))
  code!: string;

  // Notas adicionales (opcional)
  @Column(DataType.TEXT)
  notes?: string;

  // Si el código está activo
  @Default(true)
  @Index
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  // Fecha de expiración (opcional, null = sin expiración)
  @Index
  @Column(DataType.DATE)
  expiresAt?: Date;

  // Usuario que usó este código (si ya fue usado)
  @ForeignKey(() => User)
  @Column(DataType.UUID)
  usedById?: string;

  @BelongsTo(() => User, 'usedById')
  usedBy?: User;

  // Fecha en que se usó el código
  @Column(DataType.DATE)
  usedAt?: Date;

  // Creado por (siempre será el owner)
  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  createdById!: string;

  @BelongsTo(() => User, 'createdById')
  createdBy?: User;

  // Métodos helper
  get isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  }

  get isAvailable(): boolean {
    return this.isActive && !this.usedById && !this.isExpired;
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  // Generar código único
  static generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusión
    let code = 'FAM-';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export default FamilyCode;
