import 'reflect-metadata';
import { Table, Column, Model, DataType, AllowNull, Default } from 'sequelize-typescript';
import type { FiltrosDeGrupo } from '../../../shared/correos/grupos.js';

export type EstadoDeCampana = 'draft' | 'sending' | 'sent' | 'cancelled';
export type RitmoDeEnvio = 'lento' | 'normal' | 'rapido';

/**
 * Campaña de correo (2026-11-11): una tanda de envío a un grupo con una plantilla. Guarda COPIA del texto y de los filtros al crearla: editar o borrar la plantilla o el grupo
 * después no cambia lo que se manda ni deja la campaña sin explicar. Los contadores los lleva el envío (`services/campanasDeCorreo.ts`).
 */
@Table({ tableName: 'email_campaigns', timestamps: true, underscored: true })
export class EmailCampaign extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(120))
  name!: string;

  @AllowNull(false)
  @Default('draft')
  @Column(DataType.STRING(20))
  status!: EstadoDeCampana;

  @AllowNull(false)
  @Default('servicio')
  @Column(DataType.STRING(20))
  category!: 'servicio' | 'promocional';

  @Column({ type: DataType.UUID, field: 'template_id' })
  templateId?: string | null;

  @Column({ type: DataType.UUID, field: 'audience_id' })
  audienceId?: string | null;

  @Column(DataType.STRING(80))
  templateName?: string | null;

  @Column(DataType.STRING(80))
  audienceName?: string | null;

  @AllowNull(false)
  @Column(DataType.STRING(150))
  subject!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  body!: string;

  @Column(DataType.STRING(40))
  buttonLabel?: string | null;

  @Column(DataType.STRING(300))
  buttonUrl?: string | null;

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  filters!: FiltrosDeGrupo;

  @AllowNull(false)
  @Default('normal')
  @Column(DataType.STRING(10))
  pace!: RitmoDeEnvio;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  totalRecipients!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  sentCount!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  failedCount!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  skippedCount!: number;

  @Column({ type: DataType.UUID, field: 'created_by_id' })
  createdById?: string | null;

  @Column(DataType.DATE)
  startedAt?: Date | null;

  @Column(DataType.DATE)
  finishedAt?: Date | null;

  @Column(DataType.DATE)
  cancelledAt?: Date | null;
}

export default EmailCampaign;
