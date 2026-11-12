import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Cotización ligada a un trabajo + contraoferta (pedido del dueño, 2026-11-12):
 *  - por ahora una cotización solo se envía ligada a un trabajo, del trabajador al cliente del trabajo;
 *  - el cliente puede aceptar, rechazar o CONTRAOFERTAR otro total; quien cotizó acepta la contraoferta (la cotización queda con el nuevo total,
 *    pendiente) o la edita;
 *  - las cotizaciones de un trabajo se listan desde el trabajo (el cliente ve todas, cada trabajador las suyas) con el precio acordado;
 *  - un ítem en $0 sirve mientras el total sea mayor que cero.
 */

jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));
jest.mock('../../server/services/pdfGenerator.js', () => ({ __esModule: true, generateQuotePDF: async () => Buffer.from('') }));

import { Quote } from '../../server/models/sql/Quote.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('cotizaciones: siempre con trabajo y contraoferta', () => {
  let app: Express;
  let cliente: any, trabajador: any, otro: any;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const trabajoDe = (dueno: any, over: Record<string, unknown> = {}) => crearTrabajo(dueno.id, { status: 'open', price: 10000, pricingMode: 'fixed', publicationPaid: true, ...over });
  const cotizar = (quien: any, body: Record<string, unknown>) =>
    request(app).post('/api/quotes').set(como(quien)).send({ title: 'Arreglo', items: [{ qty: 1, description: 'Mano de obra', unitPrice: 10000 }], taxRate: 21, ...body });
  const post = (quien: any, ruta: string, body: Record<string, unknown> = {}) => request(app).post(ruta).set(como(quien)).send(body);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/quotes', (await import('../../server/routes/quotes.js')).default);
    cliente = await crearUsuario({ role: 'client', name: 'Cliente', dniVerified: true });
    trabajador = await crearUsuario({ role: 'client', name: 'Trabajador', dniVerified: true });
    otro = await crearUsuario({ role: 'client', name: 'Otro', dniVerified: true });
  });

  describe('solo ligada a un trabajo', () => {
    it('sin trabajo se rechaza con un mensaje claro', async () => {
      const r = await cotizar(trabajador, { recipientId: cliente.id });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('COTIZACION_SIN_TRABAJO');
    });

    it('tiene que ir al cliente del trabajo; el cliente no se cotiza a sí mismo; el trabajo tiene que estar abierto', async () => {
      const trabajo: any = await trabajoDe(cliente);
      expect((await cotizar(trabajador, { recipientId: otro.id, jobId: trabajo.id })).status).toBe(400);
      expect((await cotizar(cliente, { recipientId: trabajador.id, jobId: trabajo.id })).status).toBe(400);
      const cerrado: any = await trabajoDe(cliente, { status: 'in_progress' });
      expect((await cotizar(trabajador, { recipientId: cliente.id, jobId: cerrado.id })).status).toBe(400);
      expect((await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id })).status).toBe(201);
    });

    it('un ítem en $0 sirve si el total es mayor que cero; con todo en $0 no', async () => {
      const trabajo: any = await trabajoDe(cliente);
      const bien = await cotizar(trabajador, {
        recipientId: cliente.id, jobId: trabajo.id,
        items: [{ qty: 1, description: 'Visita', unitPrice: 0 }, { qty: 1, description: 'Cortesía', unitPrice: 0 }, { qty: 1, description: 'Obra', unitPrice: 5000 }],
      });
      expect(bien.status).toBe(201);
      expect(Number(bien.body.data.total)).toBeCloseTo(6050, 2);
      const mal = await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id, items: [{ qty: 1, description: 'Visita', unitPrice: 0 }] });
      expect(mal.status).toBe(400);
      expect(mal.body.code).toBe('COTIZACION_SIN_PRECIO');
    });
  });

  describe('contraoferta', () => {
    const nueva = async (items?: Array<Record<string, unknown>>) => {
      const trabajo: any = await trabajoDe(cliente);
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id, ...(items ? { items } : {}) })).body.data;
      return { trabajo, q };
    };

    it('el cliente contraoferta: la cotización queda «rechazada» con el monto propuesto', async () => {
      const { q } = await nueva();
      const r = await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 9000, note: 'Es lo que puedo pagar' });
      expect(r.status).toBe(200);
      const g: any = await Quote.findByPk(q.id);
      expect(g.status).toBe('rejected');
      expect(Number(g.counterOfferAmount)).toBe(9000);
      expect(g.counterOfferNote).toBe('Es lo que puedo pagar');
    });

    it('solo el destinatario, solo si está pendiente, con un monto mayor que cero y distinto del actual', async () => {
      const { q } = await nueva();
      expect((await post(trabajador, `/api/quotes/${q.id}/counter`, { amount: 9000 })).status).toBe(403);
      expect((await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 0 })).status).toBe(400);
      expect((await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 'abc' })).status).toBe(400);
      expect((await post(cliente, `/api/quotes/${q.id}/counter`, { amount: Number(q.total) })).status).toBe(400);
      expect((await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 9000 })).status).toBe(200);
      expect((await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 8000 })).status).toBe(400); // ya no está pendiente
    });

    it('quien cotizó acepta la contraoferta: vuelve a «enviada» con el nuevo total, y el cliente puede aceptarla', async () => {
      const { q } = await nueva([{ qty: 1, description: 'Obra', unitPrice: 8000 }, { qty: 2, description: 'Materiales', unitPrice: 1000 }]);
      await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 9000 });
      expect((await post(cliente, `/api/quotes/${q.id}/accept-counter`)).status).toBe(403); // solo quien cotizó
      const r = await post(trabajador, `/api/quotes/${q.id}/accept-counter`);
      expect(r.status).toBe(200);
      const g: any = await Quote.findByPk(q.id);
      expect(g.status).toBe('sent');
      expect(Number(g.total)).toBeCloseTo(9000, 1);
      expect(g.counterOfferAmount).toBeNull();
      expect(g.revisionCount).toBe(1);
      expect((await post(cliente, `/api/quotes/${q.id}/accept`)).status).toBe(200);
    });

    it('si la cotización estaba ligada a una propuesta, la contraoferta la deja rechazada y aceptarla la vuelve pendiente con el nuevo precio', async () => {
      const { q } = await nueva();
      const propuesta: any = await Proposal.create({ jobId: q.jobId, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Hola', proposedPrice: 12100, estimatedDuration: 1, status: 'pending' } as any);
      await Quote.update({ proposalId: propuesta.id } as any, { where: { id: q.id } });
      await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 9000 });
      expect(((await Proposal.findByPk(propuesta.id)) as any).status).toBe('rejected');
      await post(trabajador, `/api/quotes/${q.id}/accept-counter`);
      const p: any = await Proposal.findByPk(propuesta.id);
      expect(p.status).toBe('pending');
      expect(Number(p.proposedPrice)).toBeCloseTo(9000, 1);
    });

    it('máximo 2 contraofertas por cotización', async () => {
      const { q } = await nueva();
      for (let i = 0; i < 2; i++) {
        expect((await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 9000 - i * 100 })).status).toBe(200);
        expect((await post(trabajador, `/api/quotes/${q.id}/accept-counter`)).status).toBe(200);
      }
      const r = await post(cliente, `/api/quotes/${q.id}/counter`, { amount: 7000 });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/límite/i);
    });

    it('sin contraoferta pendiente no hay nada que aceptar', async () => {
      const { q } = await nueva();
      expect((await post(trabajador, `/api/quotes/${q.id}/accept-counter`)).status).toBe(400);
    });
  });

  describe('desde el trabajo', () => {
    it('el cliente ve todas las cotizaciones del trabajo y el precio acordado; cada trabajador, solo las suyas; un ajeno ve ninguna', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const mia = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id })).body.data;
      await cotizar(otro, { recipientId: cliente.id, jobId: trabajo.id });
      const delCliente = await request(app).get(`/api/quotes/by-job/${trabajo.id}`).set(como(cliente));
      expect(delCliente.body.data).toHaveLength(2);
      expect(delCliente.body.esElCliente).toBe(true);
      expect(delCliente.body.precioAcordado).toBeNull();

      const delTrabajador = await request(app).get(`/api/quotes/by-job/${trabajo.id}`).set(como(trabajador));
      expect(delTrabajador.body.data).toHaveLength(1);
      expect(delTrabajador.body.esElCliente).toBe(false);

      await post(cliente, `/api/quotes/${mia.id}/accept`);
      const despues = await request(app).get(`/api/quotes/by-job/${trabajo.id}`).set(como(cliente));
      expect(despues.body.precioAcordado).toBeCloseTo(12100, 1);
      expect(despues.body.precioPublicado).toBe(10000);
    });

    it('el detalle de la cotización trae las condiciones del trabajo al que está ligada', async () => {
      const trabajo: any = await trabajoDe(cliente);
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id })).body.data;
      const r = await request(app).get(`/api/quotes/${q.id}`).set(como(cliente));
      expect(r.body.data.job).toMatchObject({ id: trabajo.id });
      expect(r.body.data.job).toHaveProperty('description');
      expect(r.body.data.job).toHaveProperty('startDate');
    });
  });
});
