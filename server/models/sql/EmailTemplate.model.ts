import 'reflect-metadata';
import { Table, Column, Model, DataType, AllowNull, Default } from 'sequelize-typescript';

/**
 * Plantilla de correo del módulo de correos a usuarios (2026-11-11): lo que el equipo escribe y elige al armar una campaña. Es TEXTO con variables ({{saludo}}...), no HTML
 * (`shared/correos/plantillas.ts` lo arma y lo escapa). `category`: `servicio` = recordatorios sobre la propia cuenta (le llegan a quien no se dio de baja);
 * `promocional` = solo a quien aceptó recibir novedades y ofertas.
 */
@Table({ tableName: 'email_templates', timestamps: true, underscored: true })
export class EmailTemplate extends Model {
  @Column({ type: DataType.UUID, defaultValue: DataType.UUIDV4, primaryKey: true })
  declare id: string;

  @AllowNull(false)
  @Column(DataType.STRING(80))
  name!: string;

  @AllowNull(false)
  @Default('servicio')
  @Column(DataType.STRING(20))
  category!: 'servicio' | 'promocional';

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

  @Column({ type: DataType.UUID, field: 'created_by_id' })
  createdById?: string | null;
}

export default EmailTemplate;
