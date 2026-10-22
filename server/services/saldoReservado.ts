import { Op, type Transaction } from 'sequelize';

/**
 * Saldo RESERVADO para un retiro pendiente.
 *
 * Pedir un retiro no descuenta nada del saldo: el descuento ocurre cuando un administrador lo aprueba. Mientras tanto esa plata ya está
 * comprometida con el retiro, y no se puede usar para pagar otra cosa (una publicación, un aumento de precio): si se gastaba, cuando el
 * administrador aprobaba el retiro no había con qué pagarlo. Cuenta lo que se va a descontar (`metadata.saldoDebitado`, el bruto) de los
 * retiros pendientes, aprobados o en proceso.
 */
export async function reservadoEnRetiros(userId: string, t?: Transaction): Promise<number> {
  const { WithdrawalRequest } = await import('../models/sql/WithdrawalRequest.model.js');
  const filas: any[] = await WithdrawalRequest.findAll({
    where: { userId, status: { [Op.in]: ['pending', 'approved', 'processing'] } } as any,
    attributes: ['amount', 'metadata'],
    transaction: t,
  });
  const total = filas.reduce((s, f) => s + (Number(f.metadata?.saldoDebitado) > 0 ? Number(f.metadata.saldoDebitado) : Number(f.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}
