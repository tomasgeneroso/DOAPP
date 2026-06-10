import { DataTypes } from 'sequelize';
import { Table, Column, Model, Default, CreatedAt, UpdatedAt, Index } from 'sequelize-typescript';

/**
 * ModuleConfig: Controla qué módulos/features están activos en la plataforma.
 * Admin puede desactivar métodos de pago, secciones del dashboard, etc.
 */
@Table({ tableName: 'module_configs', timestamps: true, underscored: true })
export class ModuleConfig extends Model {
  @Column({ type: DataTypes.STRING, primaryKey: true })
  moduleId!: string; // ej: 'payment:mercadopago', 'dashboard:analytics'

  @Column({ type: DataTypes.STRING })
  category!: string; // 'payment', 'dashboard', 'admin', 'feature'

  @Column({ type: DataTypes.STRING })
  name!: string; // ej: 'MercadoPago', 'Analytics'

  @Column({ type: DataTypes.TEXT })
  description?: string; // Descripción de qué hace este módulo

  @Default(true)
  @Column({ type: DataTypes.BOOLEAN })
  isActive!: boolean; // true = activo, false = desactivado

  @Column({ type: DataTypes.JSON })
  config?: Record<string, any>; // Config específica del módulo (opcional)

  @CreatedAt
  @Column({ type: DataTypes.DATE })
  createdAt!: Date;

  @UpdatedAt
  @Column({ type: DataTypes.DATE })
  updatedAt!: Date;
}

export default ModuleConfig;
