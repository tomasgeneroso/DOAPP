import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Pedir un retiro no descuenta el saldo hasta que un administrador lo aprueba.
 *  - Retiro PENDIENTE: el saldo se puede usar, pero se avisa antes y, si se usa, ese retiro se cancela (con aviso).
 *  - Retiro APROBADO: esa plata está comprometida y no se puede gastar en otra cosa; el retiro descuenta de lo suyo.
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

describe('retiros pendientes y aprobados frente al uso del saldo', () => {
  let app: Express;
  let cliente: any;
  const jobs: string[] = [];
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const saldo = async () => Number(((await User.findByPk(cliente.id, { attributes: ['balanceArs'] })) as any).balanceArs) || 0;
  const leerRetiro = async (id: string) => (await WithdrawalRequest.findByPk(id)) as any;

  /** Una publicación reprogramada con 5000 vinculados y 5000 de saldo. */
  async function reprogramada() {
    const { acreditarSaldo } = await import('../../server/services/quotePayment.js');
    await acreditarSaldo(String(cliente.id), 5000, 'Saldo a favor por cancelación', { relatedModel: 'Job', relatedId: cliente.id, tipo: 'refund' });
    const t = await crearTrabajo(cliente.id, { status: 'pending_payment', price: 5000, publicationPaid: false, publicationCredit: 5000 });
    jobs.push(t.id);
    return t;
  }
  const retiro = (status: string) =>
    WithdrawalRequest.create({
      userId: cliente.id,
      amount: 5000,
      bankingInfo: { accountHolder: 'Prueba', bankName: 'Banco', accountType: 'savings', cbu: '0000000000000000000000' },
      status,
      balanceBeforeWithdrawal: 5000,
      balanceAfterWithdrawal: 0,
      metadata: { saldoDebitado: 5000 },
    } as any) as Promise<any>;
  const pagar = (jobId: string, extra: Record<string, unknown> = {}) =>
    request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId, paymentType: 'job_publication', paymentMethod: 'balance', ...extra });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await WithdrawalRequest.destroy({ where: { userId: cliente.id }, force: true } as any);
      await BalanceTransaction.destroy({ where: { userId: cliente.id }, force: true } as any);
      await Notification.destroy({ where: { recipientId: cliente.id } });
      await Job.destroy({ where: { id: jobs }, force: true });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('con un retiro PENDIENTE el saldo se puede usar: antes se avisa, y si se confirma el retiro se cancela con aviso', async () => {
    const t = await reprogramada();
    const w = await retiro('pending');

    const b = await request(app).get('/api/balance').set(con(cliente));
    expect(b.body.saldoReservadoEnRetiro).toBe(0); // lo pendiente NO está reservado
    expect(b.body.saldoEnRetiroPendiente).toBe(5000);
    expect(b.body.saldoUsable).toBe(5000);

    // sin confirmar: no paga y avisa
    const aviso = await pagar(t.id);
    expect(aviso.status).toBe(409);
    expect(aviso.body.code).toBe('RETIRO_PENDIENTE_SE_CANCELA');
    expect(aviso.body.pendiente).toBe(5000);
    expect(await saldo()).toBe(5000);
    expect((await leerRetiro(w.id)).status).toBe('pending');

    // confirmado: paga, el retiro que quedó sin saldo se cancela y se avisa
    const p = await pagar(t.id, { confirmaRetiroPendiente: true });
    expect(p.status).toBe(200);
    if (p.body.paymentId) pagos.push(p.body.paymentId);
    expect(await saldo()).toBe(0);
    expect((await leerRetiro(w.id)).status).toBe('cancelled');
    expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Se canceló tu solicitud de retiro' } })).toBe(1);
  });

  it('con un retiro APROBADO el saldo está reservado: no se gasta en otra cosa, y el retiro descuenta de lo suyo', async () => {
    const t = await reprogramada();
    const w = await retiro('approved');

    const b = await request(app).get('/api/balance').set(con(cliente));
    expect(b.body.saldoReservadoEnRetiro).toBe(5000);
    expect(b.body.saldoUsable).toBe(0);

    const antes = await saldo();
    const p = await pagar(t.id, { confirmaRetiroPendiente: true });
    // Lo reservado para un retiro aprobado no es saldo que se pueda usar: el saldo liberado usable es 0 y no alcanza.
    expect([p.status, p.body.code]).toEqual([402, 'SALDO_INSUFICIENTE']);
    expect(await saldo()).toBe(antes);

    const { debitarSaldo } = await import('../../server/services/quotePayment.js');
    await expect(debitarSaldo(String(cliente.id), 1000, 'otra cosa', {})).rejects.toThrow(/reservados para un retiro ya aprobado/);
    await debitarSaldo(String(cliente.id), 5000, 'retiro aprobado', { tipo: 'withdrawal' });
    expect(await saldo()).toBe(0);
    expect((await leerRetiro(w.id)).status).toBe('approved'); // un retiro aprobado no se cancela
  });

  it('revisión de los que ya quedaron sin saldo: el pendiente se cancela y se avisa; el aprobado solo se informa', async () => {
    const { revisarRetirosSinSaldo } = await import('../../server/services/correccionDeDevoluciones.js');
    const pend = await retiro('pending');
    const apro = await retiro('approved');
    expect(await saldo()).toBe(0);

    const vista = await revisarRetirosSinSaldo(false, () => {});
    expect(vista.find((x) => x.retiroId === String(pend.id))?.estado).toBe('vista_previa');
    expect(vista.find((x) => x.retiroId === String(apro.id))?.estado).toBe('solo_aviso');
    expect((await leerRetiro(pend.id)).status).toBe('pending');

    const r = await revisarRetirosSinSaldo(true, () => {});
    expect(r.find((x) => x.retiroId === String(pend.id))?.estado).toBe('cancelado');
    expect((await leerRetiro(pend.id)).status).toBe('cancelled');
    expect((await leerRetiro(apro.id)).status).toBe('approved');
  });
});
