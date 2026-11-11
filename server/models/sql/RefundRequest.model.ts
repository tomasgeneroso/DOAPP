import 'reflect-metadata';
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Default, AllowNull, Index } from 'sequelize-typescript';
import { User } from './User.model.js';
import { Payment } from './Payment.model.js';

/**
 * Pedido de reembolso de un pago hecho por TRANSFERENCIA bancaria.
 *
 * El cliente pide que le devuelvan lo que pagó (un pago duplicado, un monto equivocado, una publicación que no se usó) y una persona del equipo lo resuelve:
 * aprueba (la devolución va al SALDO del cliente, o se transfiere a su banco y se sube el comprobante) o rechaza con un motivo. Un pago de Mercado Pago no pasa por
 * acá: se devuelve con «Devolver» (Mercado Pago). Solo hay UN pedido pendiente por pago (índice único parcial en la migración 20261109130000).
 */
export type EstadoDelPedidoDeReembolso = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type DestinoDelReembolso = 'saldo' | 'banco';

@Table({
  tableName: 'refund_requests',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['payment_id'] },
    { fields: ['requested_by'] },
    { fields: ['status'] },
    // Un solo pedido pendiente por pago (mismo índice que la migración): la última defensa si dos pedidos llegan juntos.
    { name: 'refund_requests_one_pending', unique: true, fields: ['payment_id'], where: { status: 'pending' } },
  ],
})
export class RefundRequest extends Model {
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @ForeignKey(() => Payment)
  @AllowNull(false)
  @Index
  @Column(DataType.UUID)
  paymentId!: string;

  @BelongsTo(() => Payment)
  payment?: Payment;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  requestedBy!: string;

  @BelongsTo(() => User, 'requestedBy')
  requester?: User;

  /** Cuánto pide que le devuelvan. Vacío = todo lo que quede por devolver del pago. */
  @Column(DataType.DECIMAL(12, 2))
  amount?: number | null;

  @AllowNull(false)
  @Column(DataType.TEXT)
  reason!: string;

  @Default('pending')
  @Column(DataType.STRING(20))
  status!: EstadoDelPedidoDeReembolso;

  @Column(DataType.STRING(10))
  destination?: DestinoDelReembolso | null;

  @Column(DataType.DECIMAL(12, 2))
  resolvedAmount?: number | null;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  resolvedBy?: string | null;

  @BelongsTo(() => User, 'resolvedBy')
  resolver?: User;

  @Column(DataType.DATE)
  resolvedAt?: Date | null;

  @Column(DataType.TEXT)
  resolutionNote?: string | null;

  /** Comprobante de la transferencia al banco del cliente (cuando el reembolso salió por el banco). */
  @Column(DataType.TEXT)
  proofUrl?: string | null;
}

export default RefundRequest;
