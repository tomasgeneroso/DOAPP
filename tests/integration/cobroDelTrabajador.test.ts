import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El trabajador de un trabajo de UN solo lugar ve su cobro en espera de liberación (con los días que faltan) y, ya liberado, lo PIDE (pedido del dueño, 2026-11-13).
 * El pedido no mueve plata: deja una marca y avisa al equipo; el pago sigue siendo manual. Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('cobro de un trabajo de un solo lugar: en espera y pedido', () => {
  let app: Express;
  let cliente: any, trabajador: any, equipo: any, sinCuenta: any;
  const creados = { pagos: [] as string[], contratos: [] as string[], jobs: [] as string[] };
  const ids = () => [cliente, trabajador, equipo, sinCuenta].map((u) => u.id);
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const DIA = 86_400_000;

  /** Un contrato terminado que espera que el equipo le pague al trabajador, terminado hace `hace` días. */
  const contratoTerminado = async (haceDias: number, trabajoOver: Record<string, unknown> = {}) => {
    const fin = new Date(Date.now() - haceDias * DIA);
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 5000, amountArs: 5000, currency: 'ARS',
      status: 'completed', paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
      approvedAt: new Date(fin.getTime() - 30 * DIA),
    } as any);
    creados.pagos.push(pago.id);
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'completed', publicationPaid: true, publicationPaymentId: pago.id, ...trabajoOver });
    creados.jobs.push(trabajo.id);
    const contrato: any = await crearContrato(
      { jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id },
      { status: 'completed', paymentStatus: 'pending_payout', price: 5000, clientConfirmed: true, doerConfirmed: true, clientConfirmedAt: fin, completedAt: fin },
    );
    creados.contratos.push(contrato.id);
    return contrato;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({
      role: 'doer', dniVerified: true,
      bankingInfo: { accountHolder: 'Usuario de prueba', bankName: 'Banco Prueba', accountType: 'savings', cbu: '0170099220000067797370' },
      bankingInfoUpdatedAt: new Date(Date.now() - 10 * DIA),
    });
    equipo = await crearUsuario({ role: 'client', adminRole: 'admin' });
    sinCuenta = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: ids() } });
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('terminó hace 2 minutos: figura EN ESPERA con los días que faltan y NO se puede pedir', async () => {
    const c = await contratoTerminado(0);
    const r = await request(app).get('/api/balance').set(con(trabajador));
    expect(r.status).toBe(200);
    const tarjeta = (r.body.cobrosPendientes as any[]).find((x) => x.contrato?.id === c.id);
    expect(tarjeta).toMatchObject({ tipo: 'cobro_del_trabajo', liberado: false, monto: 5000 });
    expect(new Date(tarjeta.disponibleDesde).getTime()).toBeGreaterThan(Date.now() + 5 * DIA);
    expect(r.body.cobroDelTrabajoEnEspera).toBeGreaterThanOrEqual(5000);

    const pedir = await request(app).post('/api/balance/request-payout').set(con(trabajador)).send({ contractId: c.id });
    expect(pedir.status).toBe(409);
    expect(pedir.body.code).toBe('COBRO_EN_ESPERA');
    expect(pedir.body.message).toContain('Faltan');
    expect((await Contract.findByPk(c.id) as any).payoutRequestedAt).toBeNull();
  });

  it('ya liberado: lo pide UNA sola vez, queda la marca y se avisa al equipo y a la persona', async () => {
    const c = await contratoTerminado(40);
    const antes = await request(app).get('/api/balance').set(con(trabajador));
    const t = (antes.body.cobrosPendientes as any[]).find((x) => x.contrato?.id === c.id);
    expect(t).toMatchObject({ liberado: true, pedidoEl: null });

    const uno = await request(app).post('/api/balance/request-payout').set(con(trabajador)).send({ contractId: c.id });
    expect(uno.status).toBe(200);
    expect((await Contract.findByPk(c.id) as any).payoutRequestedAt).not.toBeNull();
    expect(await Notification.count({ where: { recipientId: trabajador.id, relatedId: c.id } as any })).toBe(1);
    expect(await Notification.count({ where: { recipientId: equipo.id, relatedId: c.id } as any })).toBe(1);

    const dos = await request(app).post('/api/balance/request-payout').set(con(trabajador)).send({ contractId: c.id });
    expect(dos.status).toBe(409);
    expect(dos.body.code).toBe('COBRO_YA_PEDIDO');
    expect(await Notification.count({ where: { recipientId: equipo.id, relatedId: c.id } as any })).toBe(1);

    const despues = await request(app).get('/api/balance').set(con(trabajador));
    expect((despues.body.cobrosPendientes as any[]).find((x) => x.contrato?.id === c.id).pedidoEl).toBeTruthy();
    // No tocó el saldo: el pago lo hace el equipo.
    expect(Number(despues.body.balance)).toBe(0);
  });

  it('un contrato ajeno no se puede pedir; un trabajo de varios lugares cobra por saldo y tampoco', async () => {
    const ajeno = await contratoTerminado(40);
    const intento = await request(app).post('/api/balance/request-payout').set(con(cliente)).send({ contractId: ajeno.id });
    expect(intento.status).toBe(404);
    expect((await Contract.findByPk(ajeno.id) as any).payoutRequestedAt).toBeNull();

    const varios = await contratoTerminado(40, { maxWorkers: 2 });
    const r = await request(app).post('/api/balance/request-payout').set(con(trabajador)).send({ contractId: varios.id });
    expect(r.status).toBe(404);
    const lista = await request(app).get('/api/balance').set(con(trabajador));
    expect((lista.body.cobrosPendientes as any[]).some((x) => x.contrato?.id === varios.id)).toBe(false);
  });

  it('sin cuenta cargada no se puede pedir (no habría adónde transferir)', async () => {
    const c: any = await contratoTerminado(40);
    await Contract.update({ doerId: sinCuenta.id } as any, { where: { id: c.id } });
    const r = await request(app).post('/api/balance/request-payout').set(con(sinCuenta)).send({ contractId: c.id });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('BANKING_INFO_NOT_SAVED');
  });

  it('el pedido pide un contrato válido', async () => {
    const r = await request(app).post('/api/balance/request-payout').set(con(trabajador)).send({ contractId: 'no-es-un-id' });
    expect(r.status).toBe(400);
  });
});
