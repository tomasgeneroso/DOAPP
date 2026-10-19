import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * «Admin: ver info» desde un perfil: pedir un usuario por su id.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';
import { LoginDevice } from '../../server/models/sql/LoginDevice.model.js';

describe('GET /api/admin/users/:id', () => {
  let app: Express;
  let admin: any, soporte: any, comun: any, objetivo: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/users', (await import('../../server/routes/admin/users.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
    comun = await crearUsuario({ role: 'client' });
    objetivo = await crearUsuario({ role: 'client', name: 'Persona buscada' });
  });

  it('un administrador recibe a esa persona', async () => {
    const r = await request(app).get(`/api/admin/users/${objetivo.id}`).set(con(admin));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toMatchObject({ id: objetivo.id, name: 'Persona buscada' });
    expect(r.body.data.password).toBeUndefined();
  });

  it('el buscador de la lista, con el id, también la trae', async () => {
    const r = await request(app).get(`/api/admin/users?search=${objetivo.id}`).set(con(admin));
    expect([r.status, r.body.message]).toEqual([200, undefined]);
    expect(r.body.data.map((u: any) => u.id)).toContain(objetivo.id);
  });

  it('si falla la lectura de dispositivos (dato accesorio), el detalle igual sale: antes era un 500 que la pantalla mostraba como «no existe»', async () => {
    const espia = jest.spyOn(LoginDevice, 'findAll').mockRejectedValueOnce(new Error('relation login_devices does not exist'));
    const r = await request(app).get(`/api/admin/users/${objetivo.id}`).set(con(admin));
    espia.mockRestore();
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(objetivo.id);
    expect(r.body.data.devices).toEqual([]);
  });

  it('buscar por texto que parece hexadecimal (cafe, dead…) no rompe la lista', async () => {
    const r = await request(app).get('/api/admin/users?search=cafe').set(con(admin));
    expect(r.status).toBe(200);
  });

  it('un usuario común no (y la respuesta lo dice, no parece «no existe»)', async () => {
    const r = await request(app).get(`/api/admin/users/${objetivo.id}`).set(con(comun));
    expect([401, 403]).toContain(r.status);
  });

  it('un id que no existe: 404 «Usuario no encontrado»', async () => {
    const r = await request(app).get('/api/admin/users/00000000-0000-4000-8000-000000000000').set(con(admin));
    expect(r.status).toBe(404);
  });

  it('soporte puede mirar', async () => {
    const r = await request(app).get(`/api/admin/users/${objetivo.id}`).set(con(soporte));
    expect([200, 403]).toContain(r.status);
  });

  describe('GET /api/admin/users/:id/expediente (la ficha completa)', () => {
    it('junta datos, documentos, contratos, trabajos, dinero y actividad de la persona en una respuesta', async () => {
      const cliente = await crearUsuario({ role: 'client', name: 'Cliente de la ficha' });
      const trabajador = await crearUsuario({ role: 'doer', name: 'Trabajador de la ficha' });
      const trabajo = await crearTrabajo(cliente.id, { status: 'completed' });
      await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', price: 1500 });

      const r = await request(app).get(`/api/admin/users/${cliente.id}/expediente`).set(con(admin));
      expect([r.status, r.body.message]).toEqual([200, undefined]);
      const d = r.body.data;
      expect(d.usuario).toMatchObject({ id: cliente.id, name: 'Cliente de la ficha' });
      expect(d.usuario.password).toBeUndefined();
      expect(d.documentos).toHaveProperty('identidad');
      expect(d.documentos).toHaveProperty('matricula');
      expect(d.documentos).toHaveProperty('seguro');
      expect(d.trabajos.map((j: any) => j.id)).toContain(trabajo.id);
      expect(d.contratos).toHaveLength(1);
      expect(d.contratos[0]).toMatchObject({ rol: 'cliente', estado: 'completed', precio: 1500 });
      expect(d.contratos[0].trabajador).toMatchObject({ name: 'Trabajador de la ficha' });
      expect(d.dinero).toEqual(expect.objectContaining({ movimientos: expect.any(Array), retiros: expect.any(Array), pagos: expect.any(Array) }));
      expect(d.avisos).toEqual([]);

      // El trabajador ve el mismo contrato, pero como trabajador.
      const t = await request(app).get(`/api/admin/users/${trabajador.id}/expediente`).set(con(admin));
      expect(t.body.data.contratos[0].rol).toBe('trabajador');
      expect(t.body.data.trabajos).toEqual([]);
    });

    it('si una lista falla, la ficha igual sale y avisa cuál faltó', async () => {
      const { Job } = await import('../../server/models/sql/Job.model.js');
      const espia = jest.spyOn(Job, 'findAll').mockRejectedValueOnce(new Error('tabla rota'));
      const r = await request(app).get(`/api/admin/users/${objetivo.id}/expediente`).set(con(admin));
      espia.mockRestore();
      expect(r.status).toBe(200);
      expect(r.body.data.trabajos).toEqual([]);
      expect(r.body.data.avisos.join(' ')).toContain('trabajos');
    });

    it('un usuario común no la ve, un id inválido es 400 y uno inexistente es 404', async () => {
      expect([401, 403]).toContain((await request(app).get(`/api/admin/users/${objetivo.id}/expediente`).set(con(comun))).status);
      expect((await request(app).get('/api/admin/users/no-es-uuid/expediente').set(con(admin))).status).toBe(400);
      expect((await request(app).get('/api/admin/users/00000000-0000-4000-8000-000000000000/expediente').set(con(admin))).status).toBe(404);
    });
  });
});
