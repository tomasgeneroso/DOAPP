import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/** Quien recibe una propuesta con cotización ve también lo que se cotizó: conceptos, impuestos, total (antes veía la propuesta pero no la cotización). */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Quote } from '../../server/models/sql/Quote.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('propuestas con el detalle de su cotización', () => {
  let app: Express;
  let cliente: any, trabajador: any, ajeno: any, trabajo: any, propuestaId: string;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/quotes', (await import('../../server/routes/quotes.js')).default);
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
    ajeno = await crearUsuario({ role: 'client' });
    trabajo = await crearTrabajo(cliente.id, { status: 'open', price: 5000 });
    const r = await request(app).post('/api/quotes').set(con(trabajador)).send({
      recipientId: cliente.id, jobId: trabajo.id, title: 'Reparar cocina', applyMode: true, status: 'sent',
      items: [{ description: 'Mano de obra', qty: 2, unitPrice: 1500 }, { description: 'Materiales', qty: 1, unitPrice: 1000 }],
      taxRate: 21, otherTaxes: [{ name: 'IIBB', rate: 3 }], notes: 'Incluye limpieza', paymentTerms: '50% al empezar',
    });
    expect(r.status).toBe(201);
    propuestaId = (await Proposal.findOne({ where: { jobId: trabajo.id, freelancerId: trabajador.id } }) as any).id;
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id] } });
      await Quote.destroy({ where: { jobId: trabajo.id }, force: true });
      await Proposal.destroy({ where: { jobId: trabajo.id }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, ajeno.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  const verificar = (q: any) => {
    expect(q).toMatchObject({ title: 'Reparar cocina', notes: 'Incluye limpieza', paymentTerms: '50% al empezar', status: 'sent' });
    expect(q.items.map((i: any) => i.description)).toEqual(['Mano de obra', 'Materiales']);
    expect(Number(q.subtotal)).toBe(4000);
    expect(Number(q.taxRate)).toBe(21);
    expect(Number(q.taxAmount)).toBeGreaterThan(0);
    expect(q.otherTaxes[0]).toMatchObject({ name: 'IIBB' });
    expect(Number(q.total)).toBeGreaterThan(4000);
  };

  it('la lista de propuestas recibidas trae la cotización completa', async () => {
    const r = await request(app).get('/api/proposals?type=received').set(con(cliente));
    expect(r.status).toBe(200);
    verificar(r.body.proposals.find((p: any) => p.id === propuestaId).quote);
  });

  it('la lista de las enviadas (la del trabajador) y el detalle de la propuesta también', async () => {
    const enviadas = await request(app).get('/api/proposals?type=sent').set(con(trabajador));
    verificar(enviadas.body.proposals.find((p: any) => p.id === propuestaId).quote);
    const detalle = await request(app).get(`/api/proposals/${propuestaId}`).set(con(cliente));
    expect(detalle.status).toBe(200);
    verificar(detalle.body.proposal.quote);
  });

  it('una persona ajena no ve ni la propuesta ni su cotización', async () => {
    expect((await request(app).get(`/api/proposals/${propuestaId}`).set(con(ajeno))).status).toBeGreaterThanOrEqual(403);
    const lista = await request(app).get('/api/proposals').set(con(ajeno));
    expect(lista.body.proposals.find((p: any) => p.id === propuestaId)).toBeUndefined();
  });
});
