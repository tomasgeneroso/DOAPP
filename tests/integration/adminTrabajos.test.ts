import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Administración de publicaciones (PUT /api/admin/jobs/:id/status) y el alcance del rol "analista".
 *
 * Lo que había:
 *  - Cualquier rol administrativo (marketing, soporte, dpo y el "analista", que sólo colabora con el plan de
 *    negocio) podía aprobar, rechazar y dar de baja publicaciones, y la baja liquida plata.
 *  - El "analista" pasaba por `requireAdminRole` ("tener algún rol de administración") y llegaba a los
 *    listados del panel, que traen nombres y correos.
 *  - Se podía "aprobar" cualquier publicación sin importar su estado: un borrador o un trabajo sin pagar la
 *    publicación quedaba en 'open'.
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
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('admin/jobs: quién puede mover una publicación y desde qué estado', () => {
  let app: Express;
  let cliente: any;
  const roles: Record<string, any> = {};
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const estado = async (id: string) => ((await Job.findByPk(id)) as any).status as string;
  let dia = 30;
  const trabajo = async (status: string, over: Record<string, unknown> = {}) => {
    const t = await crearTrabajo(cliente.id, { status, startDate: new Date(Date.now() + (dia++) * 86_400_000), ...over });
    jobs.push(t.id);
    return t;
  };
  const cambiar = (quien: any, id: string, body: Record<string, unknown>) =>
    request(app).put(`/api/admin/jobs/${id}/status`).set(con(quien)).send(body);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    for (const r of ['owner', 'super_admin', 'admin', 'support', 'marketing', 'dpo', 'analista']) {
      roles[r] = await crearUsuario({ role: 'doer', adminRole: r });
    }
    roles.comun = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    try {
      const ids = [cliente.id, ...Object.values(roles).map((u: any) => u.id)];
      await Notification.destroy({ where: { recipientId: ids } });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* ok */ }
  });

  it.each(['owner', 'super_admin', 'admin'])('un %s aprueba una publicación pendiente de aprobación', async (rol) => {
    const t = await trabajo('pending_approval');
    const r = await cambiar(roles[rol], t.id, { status: 'approved' });
    expect([rol, r.status]).toEqual([rol, 200]);
    expect(await estado(t.id)).toBe('open');
  });

  it.each(['support', 'marketing', 'dpo', 'analista', 'comun'])('un %s NO puede aprobar, rechazar ni cancelar (403) y el trabajo no cambia', async (rol) => {
    const t = await trabajo('pending_approval');
    for (const cuerpo of [{ status: 'approved' }, { status: 'rejected', rejectedReason: 'Motivo suficientemente largo' }, { status: 'cancelled' }]) {
      const r = await cambiar(roles[rol], t.id, cuerpo);
      expect([rol, JSON.stringify(cuerpo), r.status]).toEqual([rol, JSON.stringify(cuerpo), 403]);
    }
    expect(await estado(t.id)).toBe('pending_approval');
  });

  it.each(['draft', 'pending_payment', 'paused', 'open', 'in_progress', 'completed', 'cancelled'])(
    'no se "aprueba" una publicación en "%s" (quedaría publicada sin pasar por la revisión)',
    async (st) => {
      const t = await trabajo(st);
      const r = await cambiar(roles.admin, t.id, { status: 'approved' });
      expect([st, r.status]).toEqual([st, 409]);
      expect(r.body.code).toBe('JOB_NOT_PENDING_APPROVAL');
      expect(await estado(t.id)).toBe(st);
    },
  );

  it('rechazar una publicación pendiente, con motivo, la da de baja', async () => {
    const t = await trabajo('pending_approval');
    const r = await cambiar(roles.admin, t.id, { status: 'rejected', rejectedReason: 'Contiene datos de contacto en el título' });
    expect(r.status).toBe(200);
    expect(await estado(t.id)).toBe('cancelled');
  });

  it('rechazar sin motivo suficiente es un 400', async () => {
    const t = await trabajo('pending_approval');
    const r = await cambiar(roles.admin, t.id, { status: 'rejected', rejectedReason: 'no' });
    expect(r.status).toBe(400);
    expect(await estado(t.id)).toBe('pending_approval');
  });

  it.each(['completed', 'cancelled'])('una publicación "%s" ya no se rechaza (409)', async (st) => {
    const t = await trabajo(st);
    const r = await cambiar(roles.admin, t.id, { status: 'rejected', rejectedReason: 'Motivo suficientemente largo' });
    expect([st, r.status]).toEqual([st, 409]);
    expect(await estado(t.id)).toBe(st);
  });

  describe('el rol analista no entra al panel de administración', () => {
    it.each(['/', '/stats', '/board'])('GET %s: 403 para el analista, 200 para un admin', async (ruta) => {
      const ana = await request(app).get(`/api/admin/jobs${ruta}`).set(con(roles.analista));
      expect([ruta, ana.status]).toEqual([ruta, 403]);
      const adm = await request(app).get(`/api/admin/jobs${ruta}`).set(con(roles.admin));
      expect([ruta, adm.status]).toEqual([ruta, 200]);
    });

    it('soporte y marketing siguen pudiendo LEER los listados (no se les quitó lo que tenían)', async () => {
      expect((await request(app).get('/api/admin/jobs').set(con(roles.support))).status).toBe(200);
      expect((await request(app).get('/api/admin/jobs').set(con(roles.marketing))).status).toBe(200);
    });

    it('un usuario común sigue recibiendo 403 en todo', async () => {
      expect((await request(app).get('/api/admin/jobs').set(con(roles.comun))).status).toBe(403);
    });
  });
});
