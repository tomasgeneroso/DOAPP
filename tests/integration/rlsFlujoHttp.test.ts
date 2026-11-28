import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Un flujo de punta a punta por HTTP con RLS encendida donde el pedido es de UN usuario y el dinero que se mueve es de OTRO:
 * la persona elegida acepta una baja de presupuesto y el servidor le deja al CLIENTE un asiento de saldo a favor.
 *
 * Sin declarar esa escritura como operación de sistema, la base la rechazaba («viola la política de seguridad de registros») y la baja se
 * aceptaba a medias en producción. Este test es el que lo habría mostrado.
 */
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/fcm.js', () => ({ __esModule: true, default: { sendToUser: async () => undefined } }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { comoUsuario, conSistema } from '../../server/db/contextoRls.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo, crearContrato, pagarLaPublicacion } from '../helpers/fixtures.js';

describe('RLS por HTTP: el trabajador acepta la baja de presupuesto y el cliente recibe su saldo a favor', () => {
  let app: Express;
  let cliente: any, trabajador: any, trabajo: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    trabajo = await crearTrabajo(cliente.id, { status: 'open', price: 10000, publicationPaid: true, pricingMode: 'fixed', selectedWorkers: [trabajador.id] });
    await pagarLaPublicacion(trabajo);
    await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', price: 10000 });
    const pedido = await request(app).patch(`/api/jobs/${trabajo.id}/budget`).set(con(cliente)).send({ newPrice: 8000, reason: 'Se achicó el trabajo', aceptaEfectos: true });
    expect(pedido.body.esperandoRespuesta).toBe(true);
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id] } as any });
        await BalanceTransaction.destroy({ where: { userId: [cliente.id, trabajador.id] } as any });
        await Proposal.destroy({ where: { jobId: trabajo.id } as any });
        await Contract.destroy({ where: { jobId: trabajo.id } as any, force: true });
        await Payment.destroy({ where: { payerId: cliente.id } as any, force: true } as any);
        await Job.destroy({ where: { id: trabajo.id } as any });
        await User.destroy({ where: { id: [cliente.id, trabajador.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  it('acepta, el precio baja y el asiento del cliente queda escrito (aunque el pedido sea del trabajador)', async () => {
    const r = await request(app).post(`/api/jobs/${trabajo.id}/budget/solicitud/responder`).set(con(trabajador)).send({ acepta: true });
    expect([r.status, r.body.message]).toEqual([200, expect.anything()]);
    const job: any = await conSistema(() => Job.findByPk(trabajo.id));
    expect(Number(job.price)).toBe(8000);
    const asientos = await conSistema(() => BalanceTransaction.findAll({ where: { userId: cliente.id, type: 'refund' } as any }));
    expect(asientos.length).toBe(1);
    expect(Number((asientos[0] as any).amount)).toBe(2000);
    // Y el saldo del cliente subió de verdad (antes el asiento no tocaba el saldo).
    expect(Number(((await conSistema(() => User.findByPk(cliente.id))) as any).balanceArs)).toBe(2000);
    // El cliente ve su asiento; el trabajador, que disparó la acción, NO lo ve (no es suyo).
    expect(await comoUsuario(cliente.id, 'user', () => BalanceTransaction.count({ where: { userId: cliente.id } as any }))).toBe(1);
    expect(await comoUsuario(trabajador.id, 'user', () => BalanceTransaction.count({ where: { userId: cliente.id } as any }))).toBe(0);
  });
});
