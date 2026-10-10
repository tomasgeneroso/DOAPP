import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Durante la beta no se cobra comisión: el cliente paga el monto del trabajo y los gastos de plataforma, nada más.
 *
 * El contrato que se crea al aprobar una propuesta tenía la comisión escrita a mano como un 10% fijo
 * (`workerAllocation * 0.1`) en lugar de pasar por calculateCommission, que es el único lugar que sabe de la beta.
 * Resultado: en la beta el contrato salía con comisión y con `totalPrice = precio + 10%`, y el pago del contrato cobraba
 * ese total. Lo mismo en la selección automática de trabajador y al reajustar las partes de un trabajo.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { isBetaPhase } from '../../server/services/platformPhase.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('en la beta, el contrato que sale de una propuesta aprobada no lleva comisión', () => {
  let app: Express;
  let cliente: any, trabajador: any;
  const jobs: string[] = [];
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      const conv: any[] = await Conversation.findAll({ where: { jobId: jobs }, attributes: ['id'] });
      await ChatMessage.destroy({ where: { conversationId: conv.map((c) => c.id) } });
      await Conversation.destroy({ where: { jobId: jobs } });
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id] } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('la prueba corre dentro de la beta (si la fecha de cierre pasó, esta prueba deja de decir lo que dice)', async () => {
    expect(await isBetaPhase()).toBe(true);
  });

  it('aprobar una propuesta crea el contrato con comisión 0 y total = precio', async () => {
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'open', price: 10000, publicationPaid: true, pricingMode: 'fixed', startDate: new Date(Date.now() + 10 * 86_400_000) });
    jobs.push(trabajo.id);
    const propuesta: any = await Proposal.create({
      jobId: trabajo.id, clientId: cliente.id, freelancerId: trabajador.id, proposedPrice: 10000,
      coverLetter: 'Puedo hacerlo esta semana.', estimatedDuration: 3, status: 'pending',
    } as any);

    const r = await request(app).put(`/api/proposals/${propuesta.id}/approve`).set({ Authorization: `Bearer ${token(cliente)}` }).send({});

    expect(r.status).toBeLessThan(300);
    const contrato: any = await Contract.findOne({ where: { jobId: trabajo.id, doerId: trabajador.id } });
    expect(contrato).not.toBeNull();
    expect(Number(contrato.price)).toBe(10000);
    expect(Number(contrato.commission)).toBe(0);
    expect(Number(contrato.totalPrice)).toBe(10000);
  });
});
