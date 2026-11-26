import 'reflect-metadata';
import { DataTypes } from 'sequelize';
import { Table, Column, Model, PrimaryKey, AllowNull, Default } from 'sequelize-typescript';

/**
 * Contadores diarios SIN personas: descargas del APK (`apk_download`) y primeras aperturas de la app (`app_first_open`). Con los dos sale la
 * «primera apertura» de `/admin/metricas`. No se guarda quién, ni desde qué teléfono, ni la IP.
 */
@Table({ tableName: 'usage_counters', timestamps: false, underscored: true })
export class UsageCounter extends Model {
  @PrimaryKey
  @AllowNull(false)
  @Column(DataTypes.DATEONLY)
  day!: string;

  @PrimaryKey
  @AllowNull(false)
  @Column(DataTypes.STRING(40))
  name!: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataTypes.INTEGER)
  total!: number;
}
