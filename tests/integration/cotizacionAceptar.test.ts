import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Aceptar una cotización NO crea el contrato (y no se puede aceptar la de un trabajo ajeno).
 *
 * Lo que había: `POST /api/quotes/:id/accept`, si la cotización estaba ligada a un trabajo, armaba el contrato, ponía
 * el trabajo «en curso» con el trabajador asignado y daba la propuesta por aprobada, sin cobrar nada. Eso:
 *  - se saltaba la regla del resto de la plataforma, «primero se paga, después se selecciona al trabajador» (el contrato
 *    lo crea el cobro confirmado) y la cuenta de lo que falta pagar: el contrato salía por el total de la cotización con
 *    el trabajo cobrado por otro monto;
 *  - no miraba de quién era el trabajo (la cotización llevaba el `jobId` que quisiera quien la mandaba): el destinatario
 *    podía quedarse con el trabajo de otra persona y dejarlo «en curso» sin que su dueño supiera;
 *  - no era atómica ni idempotente, y cuando la propuesta no existía fallaba a medias (el modelo exige el cliente)
 *    dejando contrato y trabajo movidos con una respuesta que decía «aceptada, sin contrato».
 * Ahora acepta la cotización, deja la propuesta pendiente y dice cuánto falta pagar; contratar se hace por la propuesta.
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

import { Contract } from '../../server/models/sql/Contract.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { Quote } from '../../server/models/sql/Quote.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import { ESTADO_PARA_UN_AJENO } from '../helpers/ajeno.js';

describe('cotizaciones: aceptar y crear', () => {
  let app: Express;
  let cliente: any, trabajador: any, otroCliente: any, intruso: any;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const cotizar = (quien: any, body: Record<string, unknown>) =>
    request(app).post('/api/quotes').set(como(quien)).send({ title: 'Arreglo', items: [{ qty: 1, description: 'Mano de obra', unitPrice: 10000 }], taxRate: 0, ...body });
  const aceptar = (quien: any, id: string) => request(app).post(`/api/quotes/${id}/accept`).set(como(quien)).send({});
  const cotizacionDirecta = (senderId: string, recipientId: string, jobId: string | null, over: Record<string, unknown> = {}) =>
    Quote.create({
      senderId, recipientId, jobId, title: 'Directa', items: [{ qty: 1, description: 'x', unitPrice: 10000, amount: 10000 }],
      subtotal: 10000, taxRate: 0, taxAmount: 0, otherTaxes: [], total: 10000, status: 'sent',
      senderInfo: { name: 'a', email: 'a@a.a' }, recipientInfo: { name: 'b', email: 'b@b.b' }, ...over,
    } as any);
  const trabajoDe = (dueno: any, over: Record<string, unknown> = {}) => crearTrabajo(dueno.id, { status: 'open', price: 10000, pricingMode: 'fixed', publicationPaid: true, ...over });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/quotes', (await import('../../server/routes/quotes.js')).default);
    cliente = await crearUsuario({ role: 'client', name: 'Cliente', dniVerified: true });
    trabajador = await crearUsuario({ role: 'client', name: 'Trabajador', dniVerified: true });
    otroCliente = await crearUsuario({ role: 'client', name: 'Otro cliente', dniVerified: true });
    intruso = await crearUsuario({ role: 'client', name: 'Intruso', dniVerified: false });
  });
  beforeEach(() => undefined);

  describe('aceptar', () => {
    it('con trabajo: acepta la cotización pero NO crea contrato ni toca el trabajo', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id })).body.data;
      const r = await aceptar(cliente, q.id);

      expect(r.status).toBe(200);
      expect(r.body.contractId).toBeNull();
      expect(r.body.proposalId).toBeTruthy();
      expect(((await Quote.findByPk(q.id)) as any).status).toBe('accepted');

      expect(await Contract.count({ where: { jobId: trabajo.id } })).toBe(0);
      const despues: any = await Job.findByPk(trabajo.id);
      expect(despues.status).toBe('open'); // no queda «en curso»
      expect(despues.doerId ?? null).toBeNull(); // sin trabajador asignado
      expect(despues.selectedWorkers ?? []).toEqual([]);
    });

    it('deja la propuesta PENDIENTE (no aprobada), con el cliente del trabajo y el precio acordado', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id, items: [{ qty: 1, description: 'x', unitPrice: 12000 }] })).body.data;
      const r = await aceptar(cliente, q.id);
      const p: any = await Proposal.findByPk(r.body.proposalId);
      expect(p).toMatchObject({ status: 'pending', jobId: trabajo.id });
      expect(String(p.clientId)).toBe(String(cliente.id));
      expect(String(p.freelancerId)).toBe(String(trabajador.id));
      expect(Number(p.proposedPrice)).toBe(12000);
    });

    it('dice cuánto falta pagar: cotizó más de lo publicado → hay que pagar la diferencia', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id, items: [{ qty: 1, description: 'x', unitPrice: 12000 }] })).body.data;
      const r = await aceptar(cliente, q.id);
      expect(r.body.requierePago).toBe(true);
      expect(r.body.liquidacion.aPagar).toBe(2000);
      expect(r.body.message).toMatch(/abonar/i);
    });

    it('cotizó igual o menos de lo pagado → no hay que pagar nada más', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id, items: [{ qty: 1, description: 'x', unitPrice: 8000 }] })).body.data;
      const r = await aceptar(cliente, q.id);
      expect(r.body.requierePago).toBe(false);
      expect(r.body.liquidacion.aFavor).toBe(2000);
    });

    it('si el trabajador ya tenía una propuesta pendiente, la usa (no duplica) y le pone el precio de la cotización', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const previa: any = await Proposal.create({ jobId: trabajo.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Hola', proposedPrice: 9000, estimatedDuration: 2, status: 'pending' } as any);
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id })).body.data;
      const r = await aceptar(cliente, q.id);
      expect(r.body.proposalId).toBe(previa.id);
      expect(await Proposal.count({ where: { jobId: trabajo.id, freelancerId: trabajador.id } })).toBe(1);
      expect(Number(((await Proposal.findByPk(previa.id)) as any).proposedPrice)).toBe(10000);
    });

    it('si esa propuesta ya no está pendiente, no se acepta y la cotización queda como estaba', async () => {
      const trabajo: any = await trabajoDe(cliente);
      await Proposal.create({ jobId: trabajo.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Hola', proposedPrice: 9000, estimatedDuration: 2, status: 'rejected' } as any);
      const q: any = await cotizacionDirecta(trabajador.id, cliente.id, trabajo.id);
      const r = await aceptar(cliente, q.id);
      expect(r.status).toBe(400);
      expect(((await Quote.findByPk(q.id)) as any).status).toBe('sent');
    });

    it('el trabajo de OTRA persona no se puede quedar: 403 y nada cambia', async () => {
      const ajeno: any = await trabajoDe(otroCliente);
      // Una cotización armada antes de esta regla: el destinatario no es el dueño del trabajo.
      const q: any = await cotizacionDirecta(trabajador.id, cliente.id, ajeno.id);
      const r = await aceptar(cliente, q.id);
      expect(r.status).toBe(403);
      expect(((await Quote.findByPk(q.id)) as any).status).toBe('sent');
      expect(await Contract.count({ where: { jobId: ajeno.id } })).toBe(0);
      const intacto: any = await Job.findByPk(ajeno.id);
      expect(intacto.status).toBe('open');
      expect(intacto.doerId ?? null).toBeNull();
    });

    it('tampoco se acepta una cotización que el propio cliente del trabajo mandó', async () => {
      const trabajo: any = await trabajoDe(cliente);
      const q: any = await cotizacionDirecta(cliente.id, trabajador.id, trabajo.id);
      expect((await aceptar(trabajador, q.id)).status).toBe(403);
    });

    it('con el trabajo ya cerrado o cancelado, no', async () => {
      for (const estado of ['in_progress', 'completed', 'cancelled', 'paused', 'draft']) {
        const trabajo: any = await trabajoDe(cliente, { status: estado });
        const q: any = await cotizacionDirecta(trabajador.id, cliente.id, trabajo.id);
        const r = await aceptar(cliente, q.id);
        expect([estado, r.status]).toEqual([estado, 400]);
        expect(((await Quote.findByPk(q.id)) as any).status).toBe('sent');
      }
    });

    it('dos aceptaciones a la vez: una sola pasa y no se duplica la propuesta', async () => {
      const trabajo: any = await trabajoDe(cliente);
      const q = (await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id })).body.data;
      const [a, b] = await Promise.all([aceptar(cliente, q.id), aceptar(cliente, q.id)]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
      expect(await Proposal.count({ where: { jobId: trabajo.id } })).toBe(1);
    });

    it('sin trabajo: solo se acepta (no hay propuesta ni contrato)', async () => {
      const q = (await cotizar(trabajador, { recipientId: cliente.id })).body.data;
      const r = await aceptar(cliente, q.id);
      expect(r.status).toBe(200);
      expect(r.body.proposalId).toBeNull();
      expect(r.body.requierePago).toBe(false);
      expect(r.body.message).toBe('Cotización aceptada');
    });

    it('las reglas de siempre: solo el destinatario, y solo una pendiente', async () => {
      const q = (await cotizar(trabajador, { recipientId: cliente.id })).body.data;
      expect((await aceptar(trabajador, q.id)).status).toBe(403);
      expect((await aceptar(intruso, q.id)).status).toBe(ESTADO_PARA_UN_AJENO);
      expect((await aceptar(cliente, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await aceptar(cliente, q.id)).status).toBe(200);
      expect((await aceptar(cliente, q.id)).status).toBe(400);
    });
  });

  describe('crear', () => {
    it('una cotización de un trabajo ajeno ya no se puede ni mandar', async () => {
      const ajeno: any = await trabajoDe(otroCliente);
      const r = await cotizar(trabajador, { recipientId: cliente.id, jobId: ajeno.id });
      expect(r.status).toBe(400);
      expect(await Quote.count({ where: { jobId: ajeno.id } })).toBe(0);
    });

    it('trabajo inexistente: 404; cotizarse a uno mismo: 400', async () => {
      expect((await cotizar(trabajador, { recipientId: cliente.id, jobId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
      const trabajo: any = await trabajoDe(trabajador);
      expect((await cotizar(trabajador, { recipientId: trabajador.id, jobId: trabajo.id })).status).toBe(400);
    });

    it('postularse con una cotización: pasa por la puerta de identidad', async () => {
      const trabajo: any = await trabajoDe(cliente);
      const r = await cotizar(intruso, { recipientId: cliente.id, jobId: trabajo.id, applyMode: true });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('KYC_REQUIRED');
      expect(await Quote.count({ where: { senderId: intruso.id } })).toBe(0); // ni siquiera se guarda
      expect(await Proposal.count({ where: { freelancerId: intruso.id } })).toBe(0);
    });

    it('postularse con una cotización: crea la propuesta (con el cliente del trabajo) y la deja pendiente', async () => {
      const trabajo: any = await trabajoDe(cliente, { price: 10000 });
      const r = await cotizar(trabajador, { recipientId: cliente.id, jobId: trabajo.id, applyMode: true });
      expect(r.status).toBe(201);
      const p: any = await Proposal.findOne({ where: { jobId: trabajo.id, freelancerId: trabajador.id } });
      expect(p).toMatchObject({ status: 'pending' });
      expect(String(p.clientId)).toBe(String(cliente.id));
      expect(Number(p.proposedPrice)).toBe(10000);
    });

    it('postularse a un trabajo cerrado, o al que ya tiene una propuesta cerrada: no', async () => {
      const cerrado: any = await trabajoDe(cliente, { status: 'in_progress' });
      expect((await cotizar(trabajador, { recipientId: cliente.id, jobId: cerrado.id, applyMode: true })).status).toBe(400);

      const abierto: any = await trabajoDe(cliente);
      await Proposal.create({ jobId: abierto.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Hola', proposedPrice: 9000, estimatedDuration: 2, status: 'approved' } as any);
      const r = await cotizar(trabajador, { recipientId: cliente.id, jobId: abierto.id, applyMode: true });
      expect(r.status).toBe(400);
      expect(Number(((await Proposal.findOne({ where: { jobId: abierto.id } })) as any).proposedPrice)).toBe(9000); // no se pisó el precio acordado
    });
  });
});
