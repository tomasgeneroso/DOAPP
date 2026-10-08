import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/proposals/apply-and-accept — "aplicar y quedarse con el trabajo".
 *
 * Lo que había: la ruta crea la propuesta ya APROBADA y pisa `job.doerId` con quien llama, sin mirar si el
 * trabajo ya tenía trabajador (el último en llamar se lo quedaba, sin que el cliente eligiera, y el
 * anterior quedaba con una propuesta "aprobada" y sin trabajo), sin importar cuántos trabajadores admite, y
 * sin ninguno de los controles de la postulación normal (identidad verificada, puntuación pendiente,
 * suspensión por cancelar trabajos aceptados).
 */

// socketService.getIO().to(sala).emit(...) se encadena: el simulacro devuelve siempre otro simulacro.
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
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('apply-and-accept: no se le saca un trabajo a quien ya lo tiene, ni sin identidad verificada', () => {
  let app: Express;
  let cliente: any, a: any, b: any, sinKyc: any, duenoVerificado: any;
  const jobs: string[] = [];
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const aplicar = (jobId: string, quien: any) =>
    request(app).post('/api/proposals/apply-and-accept').set({ Authorization: `Bearer ${token(quien)}` }).send({ jobId });
  const leer = async (id: string) => (await Job.findByPk(id)) as any;
  const propuestas = (jobId: string) => Proposal.count({ where: { jobId } });
  let dia = 20;
  const trabajo = async (over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status: 'open', startDate: new Date(Date.now() + (dia += 3) * 86_400_000), ...over });
    jobs.push(t.id);
    return t;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/proposals.js');
    app.use('/api/proposals', rutas.default);
    cliente = await crearUsuario({ role: 'client' });
    a = await crearUsuario({ role: 'doer', dniVerified: true });
    b = await crearUsuario({ role: 'doer', dniVerified: true });
    sinKyc = await crearUsuario({ role: 'doer', dniVerified: false });
    duenoVerificado = await crearUsuario({ role: 'client', dniVerified: true });
  });

  afterAll(async () => {
    try {
      const ids = [cliente.id, a.id, b.id, sinKyc.id, duenoVerificado.id];
      const conv: any[] = await Conversation.findAll({ where: { jobId: jobs }, attributes: ['id'] });
      await ChatMessage.destroy({ where: { conversationId: conv.map((c) => c.id) } });
      await Conversation.destroy({ where: { jobId: jobs } });
      await Notification.destroy({ where: { recipientId: ids } });
      await Proposal.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('un trabajador con identidad verificada toma un trabajo abierto y libre', async () => {
    const t = await trabajo();
    const r = await aplicar(t.id, a);
    expect(r.status).toBeLessThan(300);
    expect(String((await leer(t.id)).doerId)).toBe(String(a.id));
    expect(await propuestas(t.id)).toBe(1);
  });

  it('el segundo en llamar NO le saca el trabajo al primero', async () => {
    const t = await trabajo();
    expect((await aplicar(t.id, a)).status).toBeLessThan(300);

    const r = await aplicar(t.id, b);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('JOB_ALREADY_TAKEN');
    expect(String((await leer(t.id)).doerId)).toBe(String(a.id));
    expect(await propuestas(t.id)).toBe(1); // y no se creó la propuesta "aprobada" de b
  });

  it('un trabajo que ya tiene trabajador asignado (por el camino que sea) no se toma', async () => {
    const t = await trabajo({ doerId: a.id });
    const r = await aplicar(t.id, b);
    expect(r.status).toBe(409);
    expect(String((await leer(t.id)).doerId)).toBe(String(a.id));
    expect(await propuestas(t.id)).toBe(0);
  });

  it('un trabajo con trabajadores ya elegidos tampoco', async () => {
    const t = await trabajo({ selectedWorkers: [a.id] });
    const r = await aplicar(t.id, b);
    expect(r.status).toBe(409);
    expect((await leer(t.id)).doerId ?? null).toBeNull();
  });

  it('un trabajo de varios trabajadores se postula por el camino normal, no se toma directo', async () => {
    const t = await trabajo({ maxWorkers: 3 });
    const r = await aplicar(t.id, a);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('JOB_REQUIRES_PROPOSAL');
    expect((await leer(t.id)).doerId ?? null).toBeNull();
    expect(await propuestas(t.id)).toBe(0);
  });

  it('sin identidad verificada no se puede tomar un trabajo (igual que la postulación normal)', async () => {
    const t = await trabajo();
    const r = await aplicar(t.id, sinKyc);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('KYC_REQUIRED');
    expect((await leer(t.id)).doerId ?? null).toBeNull();
    expect(await propuestas(t.id)).toBe(0);
  });

  it('el dueño no puede tomar su propio trabajo', async () => {
    const t = await crearTrabajo(duenoVerificado.id, { status: 'open', startDate: new Date(Date.now() + (dia += 3) * 86_400_000) });
    jobs.push(t.id);
    const r = await aplicar(t.id, duenoVerificado);
    expect(r.status).toBe(400);
    expect((await leer(t.id)).doerId ?? null).toBeNull();
  });

  it('un trabajo que no está abierto (borrador, pausado, cancelado) no se toma', async () => {
    for (const st of ['draft', 'pending_payment', 'pending_approval', 'paused', 'cancelled', 'completed']) {
      const t = await trabajo({ status: st });
      const r = await aplicar(t.id, a);
      expect([st, r.status]).toEqual([st, 400]);
      expect((await leer(t.id)).doerId ?? null).toBeNull();
    }
  });
});
