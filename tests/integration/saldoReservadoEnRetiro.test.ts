import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Pedir un retiro no descuenta el saldo hasta que un administrador lo aprueba, pero esa plata ya está comprometida: no se puede gastar en otra
 * cosa (publicar con saldo, un aumento de precio). Antes se podía, y el retiro quedaba sin con qué pagarse.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('el saldo reservado para un retiro no se gasta en otra cosa', () => {
  let app: Express;
  let cliente: any, trabajo: any, retiro: any;
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(cliente.id), 5000, 'Saldo a favor por cancelación', { relatedModel: 'Job', relatedId: cliente.id, tipo: 'refund' });
    // una publicación reprogramada con 5000 vinculados (como dejó la migración del saldo heredado)
    trabajo = await crearTrabajo(cliente.id, { status: 'pending_payment', price: 5000, publicationPaid: false, publicationCredit: 5000 });
    // y un retiro pedido por esos 5000, todavía sin descontar
    retiro = await WithdrawalRequest.create({
      userId: cliente.id,
      amount: 5000,
      bankingInfo: { accountHolder: 'Prueba', bankName: 'Banco', accountType: 'savings', cbu: '0000000000000000000000' },
      status: 'pending',
      balanceBeforeWithdrawal: 5000,
      balanceAfterWithdrawal: 0,
      metadata: { saldoDebitado: 5000 },
    } as any);
  });

  afterAll(async () => {
    try {
      await WithdrawalRequest.destroy({ where: { userId: cliente.id }, force: true } as any);
      await BalanceTransaction.destroy({ where: { userId: cliente.id }, force: true } as any);
      await Notification.destroy({ where: { recipientId: cliente.id } });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('el saldo muestra lo reservado y no ofrece el crédito vinculado (esa plata ya está pedida)', async () => {
    const b = await request(app).get('/api/balance').set(con(cliente));
    expect(b.body.saldoReservadoEnRetiro).toBe(5000);
    expect(b.body.saldoUsable).toBe(0);
    expect(b.body.saldoVinculado).toBe(0);
  });

  it('no se puede pagar la publicación con saldo reservado para un retiro', async () => {
    const antes = await saldo();
    const p = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: trabajo.id, paymentType: 'job_publication', paymentMethod: 'balance' });
    expect(p.status).toBe(409);
    expect(await saldo()).toBe(antes);
    expect(((await Job.findByPk(trabajo.id)) as any).status).toBe('pending_payment');
  });

  it('tampoco se gasta por otro camino (debitarSaldo), pero un retiro sí descuenta de lo suyo', async () => {
    const { debitarSaldo } = await import('../../server/services/quotePayment.js');
    await expect(debitarSaldo(String(cliente.id), 1000, 'otra cosa', {})).rejects.toThrow(/reservados para un retiro/);
    await debitarSaldo(String(cliente.id), 5000, 'retiro aprobado', { tipo: 'withdrawal' });
    expect(await saldo()).toBe(0);
  });

  it('un retiro pedido que ya no tiene saldo se cancela y se avisa (revisión de los que quedaron así)', async () => {
    const { revisarRetirosSinSaldo } = await import('../../server/services/correccionDeDevoluciones.js');
    const vista = await revisarRetirosSinSaldo(false, () => {});
    expect(vista.find((x) => x.retiroId === String(retiro.id))?.estado).toBe('vista_previa');
    expect(((await WithdrawalRequest.findByPk(retiro.id)) as any).status).toBe('pending');

    const r = await revisarRetirosSinSaldo(true, () => {});
    expect(r.find((x) => x.retiroId === String(retiro.id))?.estado).toBe('cancelado');
    expect(((await WithdrawalRequest.findByPk(retiro.id)) as any).status).toBe('cancelled');
    expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Cancelamos tu solicitud de retiro' } })).toBe(1);
  });

  it('liberado el retiro, el crédito vuelve a poder usarse para pagar la publicación', async () => {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(cliente.id), 5000, 'saldo', { relatedModel: 'Job', relatedId: cliente.id, tipo: 'refund' });
    const p = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: trabajo.id, paymentType: 'job_publication', paymentMethod: 'balance' });
    expect(p.status).toBe(200);
    if (p.body.paymentId) pagos.push(p.body.paymentId);
    expect(await saldo()).toBe(0);
  });
});
