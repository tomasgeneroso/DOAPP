import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Postularse con una cotización a un trabajo de VARIOS lugares (maxWorkers 2): tiene que responder (nunca quedar «enviando»).
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('cotización a un trabajo de dos lugares', () => {
  let app: Express;
  let cliente: any, trabajador: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/quotes', (await import('../../server/routes/quotes.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id] } });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it.each([1, 2])('con %i lugar(es) la postulación con cotización responde y deja la propuesta', async (lugares) => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'open', price: 5000, maxWorkers: lugares });
    jobs.push(trabajo.id);
    const r = await request(app)
      .post('/api/quotes')
      .set(con(trabajador))
      .timeout({ response: 15000, deadline: 20000 })
      .send({
        recipientId: cliente.id, jobId: trabajo.id, title: 'Cotización', applyMode: true, status: 'sent',
        items: [{ description: 'Mano de obra', qty: 1, unitPrice: 5000 }], taxRate: 0, otherTaxes: [],
      });
    expect([r.status, r.body.message]).toEqual([201, expect.any(String)]);
    expect(await Proposal.count({ where: { jobId: trabajo.id, freelancerId: trabajador.id } })).toBe(1);
  });
});

describe('«válida hasta» de una cotización', () => {
  it('una fecha anterior a hoy se rechaza con el motivo; hoy o más adelante, no', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/quotes', (await import('../../server/routes/quotes.js')).default);
    const cliente: any = await crearUsuario({ role: 'client', dniVerified: true });
    const trabajador: any = await crearUsuario({ role: 'doer', dniVerified: true });
    const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
    const cuerpo = (validUntil: string) => ({ recipientId: cliente.id, title: 'Cotización', status: 'sent', items: [{ description: 'Mano de obra', qty: 1, unitPrice: 100 }], taxRate: 0, otherTaxes: [], validUntil });
    try {
      const vieja = await request(app).post('/api/quotes').set(con(trabajador)).send(cuerpo('2020-01-01'));
      expect(vieja.status).toBe(400);
      expect(vieja.body.code).toBe('FECHA_ANTERIOR_A_HOY');
      expect(vieja.body.message).toContain('anterior a hoy');
      const manana = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await request(app).post('/api/quotes').set(con(trabajador)).send(cuerpo(manana))).status).toBe(201);
    } finally {
      await User.destroy({ where: { id: [cliente.id, trabajador.id] }, force: true }).catch(() => {});
    }
  });
});
