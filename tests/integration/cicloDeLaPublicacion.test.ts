import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Ciclo de una publicación (pausar → editar → publicar), postulaciones que se pueden repetir y empezar con 1 de 2 trabajadores.
 */
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
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('ciclo de la publicación, postulaciones y equipo', () => {
  let app: Express;
  let cliente: any, a: any, b: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const leer = async (id: string) => (await Job.findByPk(id)) as any;
  const trabajo = async (over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status: 'open', startDate: dias(10), endDate: dias(11), ...over });
    jobs.push(t.id);
    return t;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/proposals', (await import('../../server/routes/proposals.js')).default);
    app.use('/api/quotes', (await import('../../server/routes/quotes.js')).default);
    app.use('/api/contracts', (await import('../../server/routes/contracts.js')).default);
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    a = await crearUsuario({ role: 'doer', dniVerified: true });
    b = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, a.id, b.id] } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Quote.destroy({ where: { jobId: jobs }, force: true });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, a.id, b.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('una publicación en revisión se puede pausar, editar y volver a publicar (vuelve a revisión)', async () => {
    const t = await trabajo({ status: 'pending_approval', publicationPaid: true });
    const p = await request(app).patch(`/api/jobs/${t.id}/pause`).set(con(cliente));
    expect(p.status).toBe(200);
    expect((await leer(t.id)).status).toBe('paused');

    const e = await request(app).put(`/api/jobs/${t.id}`).set(con(cliente)).send({ title: 'Título nuevo para revisar', startDate: dias(10).toISOString(), endDate: dias(11).toISOString() });
    expect(e.status).toBe(200);
    expect((await leer(t.id)).status).toBe('paused'); // editar no la publica sola

    const r = await request(app).patch(`/api/jobs/${t.id}/resume`).set(con(cliente));
    expect(r.status).toBe(200);
    expect(r.body.requiresApproval).toBe(true);
    expect((await leer(t.id)).status).toBe('pending_approval');
  });

  it('una pausada por un administrador NO se reactiva sola: el dueño la edita y la vuelve a publicar (a revisión)', async () => {
    const t = await trabajo({ publicationPaid: true, reviewedAt: new Date() });
    await Job.update({ status: 'paused', pausedByAdmin: true, previousStatus: 'open', rejectedReason: 'Falta una foto' } as any, { where: { id: t.id } });

    const r = await request(app).patch(`/api/jobs/${t.id}/resume`).set(con(cliente));
    expect(r.status).toBe(200);
    const despues = await leer(t.id);
    expect(despues.status).toBe('pending_approval');
    expect(despues.pausedByAdmin).toBe(false);
  });

  it('pausar sin editar y volver a publicar una ya aprobada la deja abierta (no vuelve a revisión)', async () => {
    const t = await trabajo({ publicationPaid: true, reviewedAt: new Date() });
    expect((await request(app).patch(`/api/jobs/${t.id}/pause`).set(con(cliente))).status).toBe(200);
    const r = await request(app).patch(`/api/jobs/${t.id}/resume`).set(con(cliente));
    expect(r.body.requiresApproval).toBe(false);
    expect((await leer(t.id)).status).toBe('open');
  });

  it('al reprogramar se guardan las fechas anteriores (el admin ve de dónde viene la nueva)', async () => {
    const t = await trabajo({ publicationPaid: true });
    const antes = new Date((await leer(t.id)).startDate).getTime();
    const e = await request(app).put(`/api/jobs/${t.id}`).set(con(cliente)).send({ startDate: dias(20).toISOString(), endDate: dias(21).toISOString() });
    expect(e.status).toBe(200);
    const j = await leer(t.id);
    expect(new Date(j.rescheduledFrom.startDate).getTime()).toBe(antes);
    expect(new Date(j.startDate).getTime()).toBeGreaterThan(antes);
  });

  it('si el cliente rechaza la cotización, la postulación queda rechazada y el trabajador puede volver a postularse', async () => {
    const t = await trabajo({ publicationPaid: true });
    const q = await request(app).post('/api/quotes').set(con(a)).send({
      recipientId: cliente.id, jobId: t.id, title: 'Cotización', applyMode: true, status: 'sent', items: [{ description: 'Mano de obra', qty: 1, unitPrice: 800 }],
    });
    expect(q.status).toBe(201);
    const prop: any = await Proposal.findOne({ where: { jobId: t.id, freelancerId: a.id } });
    expect(prop.status).toBe('pending');

    expect((await request(app).get(`/api/proposals/check/${t.id}`).set(con(a))).body.hasApplied).toBe(true);
    expect((await request(app).post(`/api/quotes/${q.body.data.id}/reject`).set(con(cliente)).send({ reason: 'Muy caro' })).status).toBe(200);

    const rechazada: any = await Proposal.findByPk(prop.id);
    expect(rechazada.status).toBe('rejected');
    const chequeo = await request(app).get(`/api/proposals/check/${t.id}`).set(con(a));
    expect(chequeo.body.hasApplied).toBe(false); // ya no figura como «postulado»
    expect(chequeo.body.proposalStatus).toBe('rejected');

    // y puede postularse de nuevo: se reabre la misma postulación, con los datos nuevos
    const nueva = await request(app).post('/api/proposals').set(con(a)).send({ job: t.id, coverLetter: 'Ahora más barato, puedo empezar ya', proposedPrice: 900, estimatedDuration: 2 });
    expect(nueva.status).toBeLessThan(300);
    const reabierta: any = await Proposal.findByPk(prop.id);
    expect(reabierta.status).toBe('pending');
    expect(Number(reabierta.proposedPrice)).toBe(900);
    expect(await Proposal.count({ where: { jobId: t.id, freelancerId: a.id } })).toBe(1);
  });

  it('se puede empezar con 1 de 2 trabajadores cuando el elegido aceptó: se cierran las vacantes y las otras postulaciones', async () => {
    const t = await trabajo({ publicationPaid: true, maxWorkers: 2, selectedWorkers: [a.id] });
    await Proposal.create({ jobId: t.id, freelancerId: b.id, clientId: cliente.id, coverLetter: 'Yo también', estimatedDuration: 2, proposedPrice: 1000, status: 'pending' } as any);

    // sin contrato aceptado todavía: no
    const antes = await request(app).post(`/api/jobs/${t.id}/start-with-current`).set(con(cliente));
    expect(antes.status).toBe(409);

    await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: a.id }, { status: 'accepted' });
    const r = await request(app).post(`/api/jobs/${t.id}/start-with-current`).set(con(cliente));
    expect(r.status).toBe(200);
    const j = await leer(t.id);
    expect(j.status).toBe('in_progress');
    expect(Number(j.maxWorkers)).toBe(1);
    expect((await Proposal.findOne({ where: { jobId: t.id, freelancerId: b.id } }) as any).status).toBe('rejected');

    // otra persona no puede
    const ajeno = await request(app).post(`/api/jobs/${t.id}/start-with-current`).set(con(a));
    expect(ajeno.status).toBe(403);
  });

  it('si la publicación necesita el equipo completo, no se puede empezar con menos (y se le dice al trabajador)', async () => {
    const t = await trabajo({ publicationPaid: true, maxWorkers: 2, selectedWorkers: [a.id], partialStartAllowed: false });
    await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: a.id }, { status: 'accepted' });
    const r = await request(app).post(`/api/jobs/${t.id}/start-with-current`).set(con(cliente));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('EQUIPO_COMPLETO_REQUERIDO');
    expect(((await leer(t.id)).partialStartAllowed)).toBe(false);
    expect(((await leer(t.id)).status)).toBe('open');
  });

  it('confirmar un contrato que todavía no empezó explica en español qué falta (no dice «pending»)', async () => {
    const t = await trabajo({ publicationPaid: true, selectedWorkers: [a.id], doerId: a.id });
    const c: any = await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: a.id }, { status: 'pending' });
    const r = await request(app).post(`/api/contracts/${c.id}/confirm`).set(con(cliente));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONTRACT_NOT_CONFIRMABLE');
    expect(r.body.message).toMatch(/pendiente/);
    expect(r.body.message).not.toMatch(/"pending"/);
  });
});
