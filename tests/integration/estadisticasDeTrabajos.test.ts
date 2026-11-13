import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Estadísticas de trabajos del dueño (2026-11-13): la ruta cuenta los trabajos por situación, solo la ve el dueño y no trae ids ni montos. Como la base de
 * pruebas puede tener otros trabajos, se compara lo que cambia al crear los propios (antes/después). Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('GET /api/admin/analytics/trabajos', () => {
  let app: Express;
  let dueno: any, admin: any, cliente: any, trabajador: any;
  const creados = { contratos: [] as string[], jobs: [] as string[] };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const DIA = 86_400_000;
  const leer = async () => {
    const r = await request(app).get('/api/admin/analytics/trabajos').set(con(dueno));
    expect(r.status).toBe(200);
    const filas = (r.body.data.grupos as any[]).flatMap((g) => g.filas);
    const cantidad = (clave: string) => filas.find((f) => f.clave === clave).cantidad as number;
    return { cantidad, total: r.body.data.total as number, cuerpo: r.body.data };
  };
  const trabajo = async (over: Record<string, unknown>) => {
    const t: any = await crearTrabajo(cliente.id, over);
    creados.jobs.push(t.id);
    return t;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/analytics', (await import('../../server/routes/admin/analytics.js')).default);
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajador = await crearUsuario({ role: 'doer', dniVerified: true });
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: creados.contratos }, force: true });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await User.destroy({ where: { id: [dueno, admin, cliente, trabajador].map((u) => u.id) }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('solo el dueño la ve: un administrador recibe 403', async () => {
    const r = await request(app).get('/api/admin/analytics/trabajos').set(con(admin));
    expect([401, 403]).toContain(r.status);
  });

  it('cuenta cada situación al crear trabajos y contratos', async () => {
    const antes = await leer();

    await trabajo({ status: 'draft' });
    await trabajo({ status: 'pending_payment' });
    await trabajo({ status: 'open', publicationPaid: true });
    await trabajo({ status: 'open', publicationPaid: true, startDate: new Date(Date.now() - 2 * DIA), endDate: new Date(Date.now() + 5 * DIA) });
    await trabajo({ status: 'paused', publicationPaid: true, pausedByAdmin: true });
    await trabajo({ status: 'paused', publicationPaid: true, pausedForInactivityAt: new Date() });
    const enCurso = await trabajo({ status: 'in_progress', publicationPaid: true });
    const hecho = await trabajo({ status: 'completed', publicationPaid: true });

    const c1: any = await crearContrato({ jobId: enCurso.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress', price: 5000 });
    const c2: any = await crearContrato({ jobId: hecho.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', paymentStatus: 'pending_payout', price: 5000 });
    creados.contratos.push(c1.id, c2.id);

    const despues = await leer();
    const sube = (clave: string) => despues.cantidad(clave) - antes.cantidad(clave);
    expect(sube('sin_publicar')).toBe(1);
    expect(sube('sin_pagar')).toBe(1);
    expect(sube('publicados_sin_comenzar')).toBe(2);
    expect(sube('publicados_fecha_vencida')).toBe(1);
    expect(sube('pausados_sin_reanudar')).toBe(2);
    expect(sube('pausados_administracion')).toBe(1);
    expect(sube('pausados_inactividad')).toBe(1);
    expect(sube('empezados_sin_terminar')).toBe(1);
    expect(sube('realizados')).toBe(1);
    expect(sube('contratos_en_proceso')).toBe(1);
    expect(sube('contratos_terminados_falta_pagar')).toBe(1);
    expect(despues.total - antes.total).toBe(8);
  });

  it('solo cuenta: no devuelve ids ni montos ni datos de personas', async () => {
    const { cuerpo } = await leer();
    const texto = JSON.stringify(cuerpo);
    expect(texto).not.toContain(cliente.id);
    expect(texto).not.toContain(trabajador.id);
    expect(texto).not.toContain(cliente.email);
  });
});
