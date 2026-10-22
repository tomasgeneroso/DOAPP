import { Op, type Transaction } from 'sequelize';
import { conSistema } from '../db/contextoRls.js';

/**
 * Saldo y retiros.
 *
 * Pedir un retiro no descuenta nada del saldo: el descuento ocurre cuando un administrador lo aprueba. Por eso hay DOS casos:
 *
 *  - Retiro APROBADO o en proceso (`reservadoEnRetiros`): un administrador ya lo dio por bueno y va a salir plata de la plataforma. Esa plata
 *    está comprometida y NO se puede usar en otra cosa.
 *  - Retiro PENDIENTE (`pendienteEnRetiros`): todavía no lo miró nadie. El saldo se puede usar, pero se le AVISA a la persona antes y, si lo
 *    usa, el retiro pendiente que se queda sin saldo se cancela (con aviso) en vez de quedar sin con qué pagarse (`cancelarRetirosSinSaldo`).
 *
 * Cuenta lo que se va a descontar (`metadata.saldoDebitado`, el bruto) y no el neto a transferir.
 */
const montoDelRetiro = (f: any) => (Number(f.metadata?.saldoDebitado) > 0 ? Number(f.metadata.saldoDebitado) : Number(f.amount) || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function sumar(userId: string, estados: string[], t?: Transaction): Promise<number> {
  const { WithdrawalRequest } = await import('../models/sql/WithdrawalRequest.model.js');
  const filas: any[] = await WithdrawalRequest.findAll({
    where: { userId, status: { [Op.in]: estados } } as any,
    attributes: ['amount', 'metadata'],
    transaction: t,
  });
  return r2(filas.reduce((s, f) => s + montoDelRetiro(f), 0));
}

/** Lo ya APROBADO (o en proceso) para retirar: no se puede gastar en otra cosa. */
export const reservadoEnRetiros = (userId: string, t?: Transaction) => sumar(userId, ['approved', 'processing'], t);

/** Lo pedido para retirar y todavía sin aprobar: se puede usar, avisando que el retiro se cancela. */
export const pendienteEnRetiros = (userId: string, t?: Transaction) => sumar(userId, ['pending'], t);

export interface RetiroCancelado {
  id: string;
  monto: number;
}

/**
 * Después de usar saldo en otra cosa: los retiros PENDIENTES que ya no tienen con qué pagarse se cancelan y se avisa. Se conservan, del más
 * viejo al más nuevo, los que todavía alcanzan (descontando lo aprobado).
 */
export async function cancelarRetirosSinSaldo(userId: string): Promise<RetiroCancelado[]> {
  return conSistema(async () => {
    const { WithdrawalRequest } = await import('../models/sql/WithdrawalRequest.model.js');
    const { User } = await import('../models/sql/User.model.js');
    const { Notification } = await import('../models/sql/Notification.model.js');

    const u: any = await User.findByPk(userId, { attributes: ['id', 'balanceArs'] });
    let disponible = r2((Number(u?.balanceArs) || 0) - (await reservadoEnRetiros(userId)));
    const pendientes: any[] = await WithdrawalRequest.findAll({ where: { userId, status: 'pending' } as any, order: [['createdAt', 'ASC']] });
    const cancelados: RetiroCancelado[] = [];
    for (const w of pendientes) {
      const monto = montoDelRetiro(w);
      if (monto <= disponible + 0.005) {
        disponible = r2(disponible - monto);
        continue;
      }
      w.status = 'cancelled';
      w.metadata = { ...(w.metadata || {}), canceladoPor: 'sistema', motivo: 'saldo_usado' };
      if (typeof w.changed === 'function') w.changed('metadata', true);
      await w.save();
      cancelados.push({ id: String(w.id), monto });
      await Notification.create({
        recipientId: userId,
        type: 'warning',
        category: 'payment',
        title: 'Se canceló tu solicitud de retiro',
        message: `Usaste saldo que tenías pedido para retirar ($${monto.toLocaleString('es-AR')}): tu solicitud de retiro se canceló. Si querés retirar lo que te queda, pedilo de nuevo desde Retiros.`,
        relatedModel: 'WithdrawalRequest',
        relatedId: String(w.id),
        read: false,
      } as any).catch(() => {
        /* el aviso es secundario */
      });
    }
    return cancelados;
  });
}
