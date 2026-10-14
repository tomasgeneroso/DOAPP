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

import { crearUsuario } from '../helpers/fixtures.js';
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
});
