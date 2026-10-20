import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Los padrones se vinculan: cada fila trae los ids para llevar al usuario, al trabajo o al contrato, y se filtran por estado y por fecha
 * (la tabla y el CSV con los mismos filtros).
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('padrones vinculados y filtrables', () => {
  let app: Express;
  let admin: any, cliente: any, trabajador: any, comun: any;
  let trabajo: any, contrato: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/padrones', (await import('../../server/routes/admin/padrones.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    comun = await crearUsuario({ role: 'client' });
    trabajo = await crearTrabajo(cliente.id, { status: 'open', title: 'Padrón vinculado de prueba' });
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'in_progress' });
  });

  afterAll(async () => {
    try {
      await Contract.destroy({ where: { id: contrato.id }, force: true });
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [admin.id, cliente.id, trabajador.id, comun.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('trabajos: la fila trae el id del cliente para enlazar a su gestión', async () => {
    const r = await request(app).get('/api/admin/padrones/jobs?search=vinculado&limit=50').set(con(admin));
    expect(r.status).toBe(200);
    const fila = r.body.data.find((x: any) => x.id === trabajo.id);
    expect(fila).toMatchObject({ clientId: cliente.id, title: 'Padrón vinculado de prueba' });
  });

  it('contratos: trae el trabajo (id y título) y los ids de las dos partes', async () => {
    const r = await request(app).get('/api/admin/padrones/contracts?limit=200').set(con(admin));
    const fila = r.body.data.find((x: any) => x.id === contrato.id);
    expect(fila).toMatchObject({ jobId: trabajo.id, jobTitle: 'Padrón vinculado de prueba', clientId: cliente.id, doerId: trabajador.id });
  });

  it('se filtra por fecha de alta: un rango en el futuro no trae nada, uno que incluye hoy sí', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const futuro = await request(app).get('/api/admin/padrones/contracts?desde=2099-01-01&limit=200').set(con(admin));
    expect(futuro.body.pagination.total).toBe(0);
    const ahora = await request(app).get(`/api/admin/padrones/contracts?desde=${hoy}&hasta=${hoy}&limit=200`).set(con(admin));
    expect(ahora.body.data.map((x: any) => x.id)).toContain(contrato.id);
    // una fecha mal escrita no rompe: se ignora
    expect((await request(app).get('/api/admin/padrones/contracts?desde=mañana&limit=5').set(con(admin))).status).toBe(200);
  });

  it('el CSV lleva los mismos filtros que la tabla', async () => {
    const vacio = await request(app).get('/api/admin/padrones/contracts/export.csv?desde=2099-01-01').set(con(admin));
    expect(vacio.status).toBe(200);
    expect(vacio.text.trim().split('\n')).toHaveLength(1); // solo el encabezado
    const hoy = new Date().toISOString().slice(0, 10);
    const lleno = await request(app).get(`/api/admin/padrones/contracts/export.csv?desde=${hoy}&hasta=${hoy}`).set(con(admin));
    expect(lleno.text.trim().split('\n').length).toBeGreaterThan(1);
  });

  it('filtra por estado y un usuario común no entra', async () => {
    const r = await request(app).get('/api/admin/padrones/contracts?status=cancelled&limit=200').set(con(admin));
    expect(r.body.data.map((x: any) => x.id)).not.toContain(contrato.id);
    expect([401, 403]).toContain((await request(app).get('/api/admin/padrones/contracts').set(con(comun))).status);
  });
});
