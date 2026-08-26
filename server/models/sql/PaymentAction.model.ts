import {
  Table,
  Column,
  Model,
  DataType,
  Default,
  AllowNull,
  PrimaryKey,
  Index,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Op } from 'sequelize';
import { Contract } from './Contract.model.js';
import { User } from './User.model.js';

/** Movimientos irreversibles de dinero hacia afuera de la plataforma. */
export type PaymentActionType = 'PAYOUT' | 'REFUND_TOTAL' | 'REFUND_PARTIAL';

/**
 * CREATED  la reservamos en la base, todavia no se llamo al proveedor
 * SENT     se llamo y no sabemos el resultado (timeout, respuesta perdida)
 * SUCCEEDED / FAILED  resultado conocido
 *
 * SENT es el estado importante: es el unico desde el que hay que consultarle al
 * proveedor que paso antes de decidir nada. Tratarlo como fracaso es como se
 * paga dos veces.
 */
export type PaymentActionStatus = 'CREATED' | 'SENT' | 'SUCCEEDED' | 'FAILED';

/** Acciones que consumen el resultado final del contrato: solo puede haber una. */
export const TERMINAL_ACTION_TYPES: PaymentActionType[] = [
  'PAYOUT',
  'REFUND_TOTAL',
  'REFUND_PARTIAL',
];

@Table({
  tableName: 'payment_actions',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      // La regla del negocio vive acá, no en TypeScript.
      //
      // Un chequeo en JS antes de insertar no sobrevive a dos procesos
      // concurrentes: los dos leen "no hay nada" y los dos insertan. Solo la
      // base puede arbitrar eso, y solo si el indice existe -- por eso se
      // declara en el modelo ademas de en la migracion: sync() arma el schema
      // de los tests y sin esto los tests pasarian sin la garantia puesta.
      //
      // Parcial y no unique(contract_id, action_type): ese permitiria un PAYOUT
      // y ademas un REFUND sobre el mismo contrato, que es justo lo que hay que
      // impedir. FAILED se excluye para que una operacion rechazada no deje el
      // contrato trabado para siempre.
      name: 'payment_actions_one_terminal_per_contract',
      unique: true,
      fields: ['contract_id'],
      where: {
        action_type: ['PAYOUT', 'REFUND_TOTAL', 'REFUND_PARTIAL'],
        status: { [Op.ne]: 'FAILED' },
      },
    },
  ],
})
export class PaymentAction extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @ForeignKey(() => Contract)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  contractId!: string;

  @BelongsTo(() => Contract)
  contract!: Contract;

  @AllowNull(true)
  @Column(DataType.UUID)
  paymentId?: string;

  @AllowNull(false)
  @Column(DataType.STRING(24))
  provider!: string;

  @AllowNull(false)
  @Column(DataType.STRING(24))
  actionType!: PaymentActionType;

  @Default('CREATED')
  @AllowNull(false)
  @Column(DataType.STRING(16))
  status!: PaymentActionStatus;

  @AllowNull(false)
  @Column(DataType.DECIMAL(14, 2))
  amount!: number;

  @Default('ARS')
  @AllowNull(false)
  @Column(DataType.STRING(8))
  currency!: string;

  @AllowNull(true)
  @Column(DataType.STRING(120))
  externalReference?: string;

  /** Estable por operacion: el reintento de un timeout reusa esta misma clave. */
  @AllowNull(false)
  @Index({ unique: true })
  @Column(DataType.STRING(160))
  idempotencyKey!: string;

  @Default({})
  @AllowNull(false)
  @Column(DataType.JSONB)
  requestPayload!: any;

  @AllowNull(true)
  @Column(DataType.STRING(120))
  providerResourceId?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  errorDetail?: string;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column(DataType.UUID)
  executedById?: string;
}

export default PaymentAction;
