import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * El retiro tiene que sacar del saldo lo que se comprometió, no lo que se
 * transfirió.
 *
 * Son dos números distintos cuando el saldo viene de una devolución: se
 * transfiere el neto y se retiene una parte de la comisión por la revisión ya
 * hecha (T&C 9.1). Debitando solo lo transferido, esa retención le quedaba al
 * usuario como saldo: se le cobraba y se la devolvíamos en el mismo
 * movimiento, y como el asiento decía lo mismo que el saldo, la auditoría de
 * saldos (que compara saldo contra libro) no lo veía. Un error que cierra
 * consigo mismo es el que más tarda en aparecer.
 */
describe('retiros: se debita el saldo comprometido, no el transferido', () => {
  let usuario: any;
  let debitarSaldo: any;

  beforeAll(async () => {
    ({ debitarSaldo } = await import('../../server/services/quotePayment.js'));
    usuario = await crearUsuario({ balanceArs: 0 });
  });

  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: usuario.id } });
      await WithdrawalRequest.destroy({ where: { userId: usuario.id } });
      await User.destroy({ where: { id: usuario.id } });
    } catch { /* el próximo DROP SCHEMA limpia lo que quede */ }
  });

  const saldo = async () =>
    Number((await User.findByPk(usuario.id, { attributes: ['balanceArs'] }) as any).balanceArs) || 0;

  it('el saldo queda en cero: la retención no vuelve al usuario', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    // Devolución de una publicación cancelada sin trabajador: al retirar se
    // retienen $2.178 de comisión.
    await acreditarSaldo(String(usuario.id), 40356, 'Saldo por cancelación', {
      tipo: 'refund',
      metadata: { origen: 'cancelacion', alRetirar: { comision: 2178 } },
    });
    expect(await saldo()).toBe(40356);

    // Lo que hace la ruta de retiro: se transfieren 38.178 y se debita el
    // saldo completo.
    const saldoComprometido = 40356;
    const transferido = 40356 - 2178;

    await debitarSaldo(String(usuario.id), saldoComprometido, 'Retiro a cuenta bancaria', {
      tipo: 'withdrawal',
      metadata: { transferido, retencion: 2178 },
    });

    expect(await saldo()).toBe(0);

    const asiento: any = await BalanceTransaction.findOne({
      where: { userId: usuario.id, type: 'withdrawal' } as any,
      order: [['createdAt', 'DESC']],
    });
    expect(asiento).toBeTruthy();
    // El asiento tiene que decir el saldo que salió, no el que se transfirió:
    // si dijera -38.178 el libro cerraría con un saldo que ya no existe.
    expect(Number(asiento.amount)).toBe(-saldoComprometido);
    expect(asiento.metadata.transferido).toBe(transferido);
    expect(asiento.metadata.retencion).toBe(2178);
  });

  it('no se puede retirar más de lo que hay', async () => {
    await expect(
      debitarSaldo(String(usuario.id), 1000, 'Retiro imposible', { tipo: 'withdrawal' }),
    ).rejects.toThrow(/insuficiente/i);
  });

  it('el asiento de un retiro se distingue de un pago con saldo', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(usuario.id), 500, 'Saldo de prueba', { tipo: 'bonus' });
    await debitarSaldo(String(usuario.id), 200, 'Pago con saldo dentro de la app');

    const ultimo: any = await BalanceTransaction.findOne({
      where: { userId: usuario.id } as any,
      order: [['createdAt', 'DESC']],
    });
    // Sin `tipo`, un débito es un pago dentro de la app: no salió plata de la
    // plataforma y el resumen del usuario no tiene que contarlo como retiro.
    expect(ultimo.type).toBe('adjustment');
    expect(ultimo.metadata.origen).toBe('pago_con_saldo');
  });
});
