import 'reflect-metadata';
import { Table, Column, Model, DataType, AllowNull, Default } from 'sequelize-typescript';
import type { FiltrosDeGrupo } from '../../../shared/correos/grupos.js';

/**
 * Grupo de destinatarios del módulo de correos (2026-11-11): filtros guardados con un nombre (`shared/correos/grupos.ts`). Se evalúan al armar la campaña, no se guardan personas.
 */
@Table({ tableName: 'email_audiences', timestamps: true, underscored: true })
export class EmailAudience extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(80))
  name!: string;

  @Column(DataType.STRING(300))
  description?: string | null;

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  filters!: FiltrosDeGrupo;

  @Column({ type: DataType.UUID, field: 'created_by_id' })
  createdById?: string | null;
}

export default EmailAudience;
