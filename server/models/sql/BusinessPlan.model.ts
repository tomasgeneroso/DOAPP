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
} from 'sequelize-typescript';
import { User } from './User.model.js';

/**
 * BusinessPlan — proyección de gastos y hoja de ruta de constitución.
 *
 * Es una herramienta del panel de owner: se guarda en la base y no en el
 * navegador, así el plan es el mismo desde cualquier dispositivo y queda
 * registrado quién lo editó por última vez.
 */
@Table({ tableName: 'business_plans', timestamps: true, underscored: true })
export class BusinessPlan extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  /** Identificador del plan; hoy sólo existe 'constitucion' */
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(60))
  slug!: string;

  /** Estado completo: tablas, supuestos, checklist e hitos */
  @Default({})
  @AllowNull(false)
  @Column(DataType.JSONB)
  data!: any;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  updatedById?: string;

  @BelongsTo(() => User, 'updatedById')
  updatedBy?: User;
}

export default BusinessPlan;
