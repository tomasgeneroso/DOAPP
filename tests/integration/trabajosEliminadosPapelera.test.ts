import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Trabajos eliminados (pedido del dueño, 2026-11-23): no se borran, se guardan.
 *  - Quien publicó lo ve 30 días en «Ver papelera de trabajos»; después deja de verlo (pero sigue guardado).
 *  - El equipo lo ve siempre, marcado como eliminado.
 *  - Solo se borra de verdad desde el panel, con el nombre exacto del trabajo y un motivo, y con el asiento en el registro ANTES de borrar.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { JobTask } from '../../server/models/sql/JobTask.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('trabajos eliminados: se guardan, la papelera dura 30 días y solo el equipo los borra de verdad', () => {
  let app: Express;
  let duenio: any, otro: any, owner: any, soporte: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const guardado = async (id: string) => (await Job.findByPk(id, { paranoid: false })) as any;
  const borrador = async (over: Record<string, unknown> = {}) => {
    const t: any = await crearTrabajo(duenio.id, { status: 'draft', title: `Trabajo ${Math.random().toString(36).slice(2, 8)}`, ...over });
    jobs.push(t.id);
    return t;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    duenio = await crearUsuario({ role: 'client' });
    otro = await crearUsuario({ role: 'client' });
    owner = await crearUsuario({ role: 'doer', adminRole: 'owner' });
    soporte = await crearUsuario({ role: 'doer', adminRole: 'support' });
  });

  afterAll(async () => {
    try {
      await AuditLog.destroy({ where: { targetModel: 'Job', targetId: jobs } as any });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [duenio.id, otro.id, owner.id, soporte.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('eliminar NO borra: queda guardado con quién y cuándo, sale de «Mis trabajos» y entra en la papelera', async () => {
    const t = await borrador();
    const r = await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));
    expect(r.status).toBe(200);

    expect(await Job.findByPk(t.id)).toBeNull(); // las consultas de siempre ya no lo ven
    const fila = await guardado(t.id);
    expect(fila).not.toBeNull();
    expect(fila.deletedAt).toBeTruthy();
    expect(String(fila.deletedBy)).toBe(String(duenio.id));

    const mis = await request(app).get('/api/jobs/my-jobs').set(con(duenio));
    expect(mis.body.jobs.map((j: any) => j.id)).not.toContain(t.id);

    const papelera = await request(app).get('/api/jobs/my-jobs/papelera').set(con(duenio));
    expect(papelera.status).toBe(200);
    expect(papelera.body.jobs.map((j: any) => j.id)).toContain(t.id);
    // el asiento de lo que se hizo
    expect(await AuditLog.count({ where: { action: 'job.deleted_by_owner', targetId: String(t.id) } as any })).toBe(1);
  });

  it('la papelera es solo de su dueño y a los 30 días el trabajo deja de verse (pero sigue guardado)', async () => {
    const t = await borrador();
    await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));
    const ajena = await request(app).get('/api/jobs/my-jobs/papelera').set(con(otro));
    expect(ajena.body.jobs.map((j: any) => j.id)).not.toContain(t.id);

    // pasan 31 días
    await Job.update({ deletedAt: new Date(Date.now() - 31 * 86_400_000) } as any, { where: { id: t.id }, paranoid: false } as any);
    const vieja = await request(app).get('/api/jobs/my-jobs/papelera').set(con(duenio));
    expect(vieja.body.jobs.map((j: any) => j.id)).not.toContain(t.id);
    expect(await guardado(t.id)).not.toBeNull();
  });

  it('otra persona no puede eliminar el trabajo', async () => {
    const t = await borrador();
    expect((await request(app).delete(`/api/jobs/${t.id}`).set(con(otro))).status).toBe(403);
    expect(await Job.findByPk(t.id)).not.toBeNull();
  });

  it('el equipo los ve siempre, marcados; los demás filtros los dejan afuera', async () => {
    const t = await borrador();
    await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));
    await Job.update({ deletedAt: new Date(Date.now() - 90 * 86_400_000) } as any, { where: { id: t.id }, paranoid: false } as any);

    const todos = await request(app).get(`/api/admin/jobs?search=${String(t.id).slice(0, 8)}&limit=50`).set(con(owner));
    const fila = (todos.body.data || todos.body.jobs || []).find((j: any) => j.id === t.id);
    expect(fila).toBeTruthy();
    expect(fila.deletedAt).toBeTruthy();

    const soloEliminados = await request(app).get('/api/admin/jobs?status=deleted&limit=200').set(con(owner));
    expect((soloEliminados.body.data || soloEliminados.body.jobs || []).map((j: any) => j.id)).toContain(t.id);
    const borradores = await request(app).get(`/api/admin/jobs?status=draft&limit=200`).set(con(owner));
    expect((borradores.body.data || borradores.body.jobs || []).map((j: any) => j.id)).not.toContain(t.id);
  });

  describe('recuperar de la papelera (pedido del dueño, 2026-11-27)', () => {
    it.each([['draft', false], ['pending_payment', false], ['cancelled', true]])('vuelve con el estado que tenía (%s) y con sus tareas', async (status, publicationPaid) => {
      const t = await borrador({ status, publicationPaid });
      await JobTask.create({ jobId: t.id, createdById: duenio.id, title: 'Primer paso', orderIndex: 0, status: 'pending' } as any);
      await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));
      const r = await request(app).post(`/api/jobs/${t.id}/restore`).set(con(duenio));
      expect([r.status, r.body.job?.status]).toEqual([200, status]);
      const fila = await guardado(t.id);
      expect([fila.deletedAt, fila.deletedBy ?? null, fila.status]).toEqual([null, null, status]);
      expect(await JobTask.count({ where: { jobId: t.id } as any })).toBe(1);
      const mis = await request(app).get('/api/jobs/my-jobs').set(con(duenio));
      expect(mis.body.jobs.map((j: any) => j.id)).toContain(t.id);
    });

    it('solo lo recupera su dueño y solo dentro de los 30 días', async () => {
      const t = await borrador();
      await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));
      expect((await request(app).post(`/api/jobs/${t.id}/restore`).set(con(otro))).status).toBe(404);
      await Job.update({ deletedAt: new Date(Date.now() - 31 * 86_400_000) } as any, { where: { id: t.id }, paranoid: false } as any);
      expect((await request(app).post(`/api/jobs/${t.id}/restore`).set(con(duenio))).status).toBe(404);
    });

    it.each(['open', 'pending_approval', 'paused'])('un trabajo pagado que sigue vigente (%s) no se elimina: se cancela, para que la plata se devuelva', async (status) => {
      const t = await borrador({ status, publicationPaid: true });
      const r = await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));
      expect([r.status, r.body.code]).toEqual([409, 'CANCELAR_PRIMERO']);
      expect(await Job.findByPk(t.id)).not.toBeNull();
    });
  });

  describe('borrarlo de verdad', () => {
    it('pide ser admin, que ya esté eliminado, su nombre exacto y un motivo; y deja el asiento antes de borrar', async () => {
      const t = await borrador({ title: 'Pintura del frente' });
      // sin eliminar: no
      expect((await request(app).delete(`/api/admin/jobs/${t.id}/permanent`).set(con(owner)).send({ nombre: 'Pintura del frente', motivo: 'Pedido de baja por el dueño de la cuenta' })).status).toBe(409);

      await request(app).delete(`/api/jobs/${t.id}`).set(con(duenio));

      // soporte no tiene el permiso
      expect((await request(app).delete(`/api/admin/jobs/${t.id}/permanent`).set(con(soporte)).send({ nombre: 'Pintura del frente', motivo: 'Pedido de baja por el dueño de la cuenta' })).status).toBe(403);
      // nombre distinto
      const mal = await request(app).delete(`/api/admin/jobs/${t.id}/permanent`).set(con(owner)).send({ nombre: 'pintura', motivo: 'Pedido de baja por el dueño de la cuenta' });
      expect(mal.status).toBe(400);
      expect(mal.body.code).toBe('NOMBRE_NO_COINCIDE');
      // motivo corto
      const corto = await request(app).delete(`/api/admin/jobs/${t.id}/permanent`).set(con(owner)).send({ nombre: 'Pintura del frente', motivo: 'no' });
      expect(corto.body.code).toBe('MOTIVO_CORTO');
      expect(await guardado(t.id)).not.toBeNull();

      const ok = await request(app).delete(`/api/admin/jobs/${t.id}/permanent`).set(con(owner)).send({ nombre: 'Pintura del frente', motivo: 'Pedido de baja por el dueño de la cuenta' });
      expect(ok.status).toBe(200);
      expect(await guardado(t.id)).toBeNull();
      const asiento: any = await AuditLog.findOne({ where: { action: 'job.permanent_delete', targetId: String(t.id) } as any });
      expect(asiento).toBeTruthy();
      expect(String(asiento.severity)).toBe('critical');
      expect(String(asiento.description)).toContain('Pedido de baja'); // el motivo queda en el asiento
      expect(String(asiento.targetIdentifier)).toBe('Pintura del frente'); // y qué se borró
    });
  });
});
