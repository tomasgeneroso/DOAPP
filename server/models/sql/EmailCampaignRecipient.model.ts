import 'reflect-metadata';
import { Table, Column, Model, DataType, AllowNull, Default } from 'sequelize-typescript';

export type EstadoDeDestinatario = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

/**
 * Una persona en una campaña (2026-11-11). Solo guarda el id de la persona —no su correo—: el correo se lee en el momento de mandar, así una baja o un cambio de correo
 * posterior se respeta. Una fila por persona y campaña (índice único): una persona no recibe dos veces la misma campaña.
 */
@Table({ tableName: 'email_campaign_recipients', timestamps: true, underscored: true })
export class EmailCampaignRecipient extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'campaign_id' })
  campaignId!: string;

  @AllowNull(false)
  @Column({ type: DataType.UUID, field: 'user_id' })
  userId!: string;

  @AllowNull(false)
  @Default('pending')
  @Column(DataType.STRING(10))
  status!: EstadoDeDestinatario;

  @Column(DataType.STRING(300))
  error?: string | null;

  @Column(DataType.DATE)
  sentAt?: Date | null;
}

export default EmailCampaignRecipient;
