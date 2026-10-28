import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Panel de publicaciones de administración (`GET /api/admin/jobs/board`): muestra las publicaciones vivas (abiertas, pausadas y esperando aprobación) con su
 * estado. Corre con Row Level Security encendida como todos los tests de integración: el panel cuenta las cotizaciones de TODOS los trabajos, no las del
 * administrador que mira.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import { conSistema } from '../../server/db/contextoRls.js';

describe('panel de publicaciones (administración)', () => {
  let app: Express;
  let dueno: any, soporte: any, cliente: any, trabajador: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/jobs', (await import('../../server/routes/admin/jobs.js')).default);
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await Proposal.destroy({ where: { jobId: jobs }, force: true } as any);
        await Job.destroy({ where: { id: jobs }, force: true });
        await User.destroy({ where: { id: [dueno.id, soporte.id, cliente.id, trabajador.id] }, force: true });
      });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('muestra las publicaciones abiertas, pausadas y esperando aprobación, con las cotizaciones de cada una', async () => {
    const abierta: any = await crearTrabajo(cliente.id, { status: 'open', title: 'Abierta con una cotización' });
    const pendiente: any = await crearTrabajo(cliente.id, { status: 'pending_approval', title: 'Esperando aprobación' });
    const pausada: any = await crearTrabajo(cliente.id, { status: 'paused', title: 'Pausada' });
    const terminada: any = await crearTrabajo(cliente.id, { status: 'completed', title: 'Terminada (no va en el panel)' });
    jobs.push(abierta.id, pendiente.id, pausada.id, terminada.id);
    await Proposal.create({ jobId: abierta.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Puedo hacerlo', proposedPrice: 1000, estimatedDuration: 1, status: 'pending' } as any);

    const r = await request(app).get('/api/admin/jobs/board').set(con(dueno));

    expect([r.status, r.body.success]).toEqual([200, true]);
    const titulos = r.body.data.map((f: any) => f.titulo);
    expect(titulos).toEqual(expect.arrayContaining(['Abierta con una cotización', 'Esperando aprobación', 'Pausada']));
    expect(titulos).not.toContain('Terminada (no va en el panel)');
    // Las cotizaciones son las de ese trabajo, aunque las haya hecho otra persona y no quien mira el panel.
    expect(r.body.data.find((f: any) => f.titulo === 'Abierta con una cotización').cotizaciones).toBe(1);
    expect(Object.values(r.body.resumen as Record<string, number>).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3);
  });

  it('soporte también lo ve completo, con las cotizaciones contadas', async () => {
    const r = await request(app).get('/api/admin/jobs/board').set(con(soporte));
    expect([r.status, r.body.success]).toEqual([200, true]);
    expect(r.body.data.find((f: any) => f.titulo === 'Abierta con una cotización')?.cotizaciones).toBe(1);
  });
});
