import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/** Si la contraoferta/cotización aceptada es menor a lo que se pagó por la publicación, la diferencia queda a favor del cliente y se le avisa. */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('aceptar una propuesta por menos de lo pagado: saldo a favor avisado', () => {
  let app: Express;
  let cliente: any, trabajador: any, trabajo: any, propuesta: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
    trabajo = await crearTrabajo(cliente.id, { status: 'open', price: 5000, publicationPaid: true, startDate: new Date(Date.now() + 10 * 86_400_000) });
    propuesta = await Proposal.create({ jobId: trabajo.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Lo hago por menos', estimatedDuration: 3, proposedPrice: 3000, status: 'pending' } as any);
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id] } });
      await Contract.destroy({ where: { jobId: trabajo.id }, force: true });
      await Proposal.destroy({ where: { jobId: trabajo.id }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('acepta, acredita la diferencia, la informa en la respuesta y deja un aviso al cliente', async () => {
    const r = await request(app).put(`/api/proposals/${propuesta.id}/approve`).set(con(cliente));
    expect(r.status).toBe(200);
    expect(r.body.saldoAFavor).toBe(2000);
    expect(r.body.message).toContain('a favor');

    const aviso: any = await Notification.findOne({ where: { recipientId: cliente.id, title: 'Te quedó saldo a favor' } });
    expect(aviso).toBeTruthy();
    expect(aviso.message).toContain('2.000');

    const c: any = await User.findByPk(cliente.id);
    expect(Number(c.balanceArs ?? c.balance ?? 0)).toBeGreaterThanOrEqual(2000);
  });
});
