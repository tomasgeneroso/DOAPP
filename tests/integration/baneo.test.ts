import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { User } from '../../server/models/sql/User.model.js';
import { protect, estaBaneadoAhora } from '../../server/middleware/auth.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * Una cuenta baneada no opera.
 *
 * Lo que había: el baneo sólo lo hacía cumplir la pantalla (Layout.tsx mandaba a /banned al ver
 * `user.isBanned`). `protect` no lo miraba, así que un baneado con su token seguía pudiendo retirar saldo,
 * tomar trabajos, pagar o escribir por la API, y su token seguía valiendo en el chat en tiempo real.
 */

describe('protect y las cuentas baneadas', () => {
  let app: Express;
  let normal: any, baneado: any, vencido: any, temporal: any;
  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret');
  const con = (u: any) => ({ Authorization: `Bearer ${token(u)}` });
  const ok = (_req: any, res: any) => res.json({ success: true });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    // Rutas de prueba con las mismas direcciones que las reales.
    app.get('/api/auth/me', protect, ok);
    app.get('/api/auth/profile', protect, ok);
    app.post('/api/auth/logout', protect, ok);
    app.post('/api/auth/logout-all', protect, ok);
    app.get('/api/tickets', protect, ok);
    app.post('/api/tickets', protect, ok);
    app.get('/api/tickets/:id', protect, ok);
    app.post('/api/tickets/:id/messages', protect, ok);
    app.post('/api/balance/withdraw', protect, ok);
    app.get('/api/jobs/my-jobs', protect, ok);
    app.post('/api/proposals', protect, ok);
    app.put('/api/auth/me', protect, ok);
    app.get('/api/auth/mex', protect, ok);
    app.delete('/api/tickets/:id', protect, ok);

    normal = await crearUsuario();
    baneado = await crearUsuario({ isBanned: true, banReason: 'Fraude comprobado' });
    vencido = await crearUsuario({ isBanned: true, banReason: 'Suspensión de prueba', banExpiresAt: new Date(Date.now() - 86_400_000) });
    temporal = await crearUsuario({ isBanned: true, banReason: 'Suspensión temporal', banExpiresAt: new Date(Date.now() + 86_400_000) });
  });

  afterAll(async () => {
    try { await User.destroy({ where: { id: [normal.id, baneado.id, vencido.id, temporal.id] }, force: true }); } catch { /* ok */ }
  });

  const UUID = '123e4567-e89b-12d3-a456-426614174000';

  it('un usuario normal pasa por todas las rutas', async () => {
    for (const [m, p] of [['get', '/api/auth/me'], ['post', '/api/balance/withdraw'], ['get', '/api/jobs/my-jobs'], ['post', '/api/proposals']] as const) {
      const r = await (request(app) as any)[m](p).set(con(normal)).send({});
      expect([m, p, r.status]).toEqual([m, p, 200]);
    }
  });

  it.each([
    ['post', '/api/balance/withdraw'],
    ['get', '/api/jobs/my-jobs'],
    ['post', '/api/proposals'],
    ['post', '/api/auth/logout-all'],
    ['put', '/api/auth/me'],
    ['get', '/api/auth/mex'],
    ['delete', `/api/tickets/${UUID}`],
  ])('una cuenta baneada NO puede %s %s: 403 ACCOUNT_BANNED con el motivo', async (m, p) => {
    const r = await (request(app) as any)[m](p).set(con(baneado)).send({});
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('ACCOUNT_BANNED');
    expect(r.body.banned).toBe(true);
    expect(r.body.message).toContain('Fraude comprobado');
  });

  it.each([
    ['get', '/api/auth/me'],
    ['get', '/api/auth/profile'],
    ['post', '/api/auth/logout'],
    ['get', '/api/tickets'],
    ['post', '/api/tickets'],
    ['get', `/api/tickets/${UUID}`],
    ['post', `/api/tickets/${UUID}/messages`],
  ])('...pero sí puede %s %s (ver su estado, cerrar sesión y apelar)', async (m, p) => {
    const r = await (request(app) as any)[m](p).set(con(baneado)).send({});
    expect([m, p, r.status]).toEqual([m, p, 200]);
  });

  it('un parámetro de consulta no abre una ruta cerrada', async () => {
    const r = await request(app).post('/api/balance/withdraw?x=/api/auth/me').set(con(baneado)).send({});
    expect(r.status).toBe(403);
  });

  it('un baneo con vencimiento ya pasado no cuenta; uno con vencimiento futuro sí', async () => {
    expect((await request(app).get('/api/jobs/my-jobs').set(con(vencido))).status).toBe(200);
    const r = await request(app).get('/api/jobs/my-jobs').set(con(temporal));
    expect(r.status).toBe(403);
    expect(r.body.banExpiresAt).toBeTruthy();
  });

  it('el baneo vale de inmediato aunque el token se haya emitido antes (se lee de la base en cada pedido)', async () => {
    const u = await crearUsuario();
    const antes = con(u);
    expect((await request(app).get('/api/jobs/my-jobs').set(antes)).status).toBe(200);
    await User.update({ isBanned: true, banReason: 'Baneo posterior' } as any, { where: { id: u.id } });
    expect((await request(app).get('/api/jobs/my-jobs').set(antes)).status).toBe(403);
    await User.update({ isBanned: false } as any, { where: { id: u.id } });
    expect((await request(app).get('/api/jobs/my-jobs').set(antes)).status).toBe(200);
    await User.destroy({ where: { id: u.id }, force: true });
  });

  it('sin token sigue siendo 401 (no se confunde con baneo)', async () => {
    expect((await request(app).get('/api/jobs/my-jobs')).status).toBe(401);
  });

  describe('estaBaneadoAhora', () => {
    it('contempla el vencimiento y los datos ausentes', () => {
      expect(estaBaneadoAhora(null)).toBe(false);
      expect(estaBaneadoAhora(undefined)).toBe(false);
      expect(estaBaneadoAhora({ isBanned: false })).toBe(false);
      expect(estaBaneadoAhora({ isBanned: true })).toBe(true);
      expect(estaBaneadoAhora({ isBanned: true, banExpiresAt: null })).toBe(true);
      expect(estaBaneadoAhora({ isBanned: true, banExpiresAt: new Date(Date.now() - 1000) })).toBe(false);
      expect(estaBaneadoAhora({ isBanned: true, banExpiresAt: new Date(Date.now() + 60_000) })).toBe(true);
      expect(estaBaneadoAhora({ isBanned: true, banExpiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
    });
  });
});
