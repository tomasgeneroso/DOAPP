import 'reflect-metadata';
import { DataTypes } from 'sequelize';
import { Table, Column, Model, PrimaryKey, AllowNull, Default, CreatedAt, UpdatedAt } from 'sequelize-typescript';

export type EstadoDeAntesYDespues = 'pending' | 'published' | 'rejected' | 'withdrawn';

/**
 * Pedido de publicar el «antes y después» de un contrato terminado. Lo propone una parte y SOLO se publica si lo acepta la otra; cualquiera de las dos
 * puede retirarlo. Queda quién propuso, quién respondió y cuándo. Uno por contrato (se reutiliza la fila si se vuelve a proponer).
 */
@Table({ tableName: 'before_after_shares', timestamps: true, underscored: true })
export class BeforeAfterShare extends Model {
  @PrimaryKey
  @Default(DataTypes.UUIDV4)
  @Column(DataTypes.UUID)
  declare id: string;

  @AllowNull(false)
  @Column({ type: DataTypes.UUID, field: 'contract_id', unique: true })
  contractId!: string;

  @AllowNull(false)
  @Column({ type: DataTypes.UUID, field: 'proposed_by' })
  proposedBy!: string;

  @AllowNull(false)
  @Default('pending')
  @Column(DataTypes.STRING(20))
  status!: EstadoDeAntesYDespues;

  /** Rutas elegidas: { antes: string[], despues: string[] } (de las fotos del trabajo y de las fotos de entrega). */
  @AllowNull(false)
  @Column(DataTypes.JSONB)
  photos!: { antes: string[]; despues: string[] };

  @Column(DataTypes.STRING(300))
  caption?: string;

  @Column({ type: DataTypes.UUID, field: 'answered_by' })
  answeredBy?: string | null;

  @Column({ type: DataTypes.DATE, field: 'answered_at' })
  answeredAt?: Date | null;

  @Column({ type: DataTypes.UUID, field: 'post_id' })
  postId?: string | null;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
