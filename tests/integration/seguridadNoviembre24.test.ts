import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Auditoría de seguridad del 2026-11-24, por la puerta pública (las rutas):
 *  - sesiones: «cerrar todas» y restablecer la clave cierran de verdad los tokens ya emitidos; un token de otro propósito (vincular cuenta) no es una sesión;
 *  - el token de restablecer contraseña se guarda solo como hash y se gasta una vez;
 *  - publicaciones: sin contrato ajeno, borradores solo del autor, ids inválidos y listados acotados;
 *  - tickets: nadie ata un contrato ajeno ni crea un ticket en nombre de otra persona;
 *  - permisos del panel: un super_admin no se da «*», ni se cambia el rol o los permisos a sí mismo ni a un igual;
 *  - la contraseña nueva pide al menos un símbolo.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { PasswordResetToken } from '../../server/models/sql/PasswordResetToken.model.js';
import { revokeAllUserTokens, generateRefreshToken, refreshAccessToken, hashDelRefresh } from '../../server/utils/tokens.js';
import { RefreshToken } from '../../server/models/sql/RefreshToken.model.js';
import crypto from 'crypto';
import { acotarPaginacion } from '../../server/middleware/paginacion.js';
import { idDelDuenoDelCalendario, generateCalendarToken } from '../../server/utils/calendarIcs.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const SECRETO = process.env.JWT_SECRET || 'test-secret';
const firmar = (u: any, extra: Record<string, unknown> = {}) => jwt.sign({ id: u.id, email: u.email, ...extra }, SECRETO);
const como = (u: any, extra: Record<string, unknown> = {}) => ({ Authorization: `Bearer ${firmar(u, extra)}` });

describe('auditoría de seguridad del 24 de noviembre', () => {
  let app: Express;
  let ana: any, beto: any, carla: any, superUno: any, superDos: any, admin: any, dueno: any;
  let trabajoDeBeto = '', contratoDeBeto = '';
  const usuarios: string[] = [];
  const posts: string[] = [];
  const trabajos: string[] = [];
  const contratos: string[] = [];
  const tickets: string[] = [];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', acotarPaginacion);
    const { protect } = await import('../../server/middleware/auth.js');
    app.get('/api/_ping', protect, (req: any, res) => { res.json({ success: true, id: req.user.id }); });
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    app.use('/api/posts', (await import('../../server/routes/posts.js')).default);
    app.use('/api/admin/tickets', (await import('../../server/routes/admin/tickets.js')).default);
    app.use('/api/admin/roles', (await import('../../server/routes/admin/roles.js')).default);

    ana = await crearUsuario({ role: 'client' });
    beto = await crearUsuario({ role: 'client' });
    carla = await crearUsuario({ role: 'doer' });
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
    // Sin ningún permiso cargado a mano: así queda quien recibe el rol sin pasar por el panel, y la puerta (que va por rol) lo deja pasar igual.
    superUno = await crearUsuario({ role: 'client', adminRole: 'super_admin', permissions: [] });
    superDos = await crearUsuario({ role: 'client', adminRole: 'super_admin' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    usuarios.push(ana.id, beto.id, carla.id, dueno.id, superUno.id, superDos.id, admin.id);
    const t: any = await crearTrabajo(beto.id, { status: 'completed' });
    trabajoDeBeto = t.id;
    trabajos.push(t.id);
    const c: any = await crearContrato({ jobId: t.id, clientId: beto.id, doerId: carla.id }, { status: 'completed' });
    contratoDeBeto = c.id;
    contratos.push(c.id);
  });

  afterAll(async () => {
    try {
      await Ticket.destroy({ where: { id: tickets }, force: true } as any);
      await Post.destroy({ where: { author: usuarios } });
      await PasswordResetToken.destroy({ where: { userId: usuarios } });
      await RefreshToken.destroy({ where: { userId: usuarios } } as any);
      await Contract.destroy({ where: { id: contratos }, force: true } as any);
      await Job.destroy({ where: { id: trabajos }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  describe('sesiones', () => {
    it('un token normal entra', async () => {
      const r = await request(app).get('/api/_ping').set(como(ana));
      expect(r.status).toBe(200);
      expect(r.body.id).toBe(ana.id);
    });

    it('un token de otro propósito (vincular cuenta, descargar factura) NO es una sesión, aunque lleve el id y la misma firma', async () => {
      expect((await request(app).get('/api/_ping').set(como(ana, { proposito: 'vincular-cuenta', proveedor: 'google' }))).status).toBe(401);
      expect((await request(app).get('/api/_ping').set(como(ana, { typ: 'descarga-de-factura' }))).status).toBe(401);
    });

    it('«cerrar todas las sesiones» cierra los tokens ya emitidos y deja entrar a los nuevos', async () => {
      const viejo = firmar(beto, { iat: Math.floor(Date.now() / 1000) - 30 });
      expect((await request(app).get('/api/_ping').set({ Authorization: `Bearer ${viejo}` })).status).toBe(200);
      await revokeAllUserTokens(beto.id, 'prueba');
      expect((await request(app).get('/api/_ping').set({ Authorization: `Bearer ${viejo}` })).status).toBe(401);
      // uno emitido ahora (mismo segundo o después) entra: iniciar sesión justo después de cambiar la clave no se rechaza
      expect((await request(app).get('/api/_ping').set(como(beto))).status).toBe(200);
    });

    it('cerrar las sesiones de una persona no toca las de otra', async () => {
      expect((await request(app).get('/api/_ping').set(como(carla, { iat: Math.floor(Date.now() / 1000) - 30 }))).status).toBe(200);
    });
  });

  describe('tokens de renovación', () => {
    it('se guardan como hash, y renovar entrega un par nuevo', async () => {
      const crudo = await generateRefreshToken(ana.id, '127.0.0.1');
      expect(await RefreshToken.findOne({ where: { token: crudo } })).toBeNull();
      expect(await RefreshToken.findOne({ where: { token: hashDelRefresh(crudo) } })).toBeTruthy();
      const nuevo = await refreshAccessToken(crudo, '127.0.0.1');
      expect(nuevo?.accessToken).toBeTruthy();
      expect(nuevo?.refreshToken).toBeTruthy();
    });

    it('uno que ya estaba guardado en claro (de antes del cambio) sigue sirviendo hasta que vence', async () => {
      const viejo = crypto.randomBytes(40).toString('hex');
      await RefreshToken.create({ userId: ana.id, token: viejo, expiresAt: new Date(Date.now() + 3_600_000), createdByIp: '127.0.0.1' } as any);
      expect((await refreshAccessToken(viejo, '1.1.1.1'))?.accessToken).toBeTruthy();
    });

    it('dos renovaciones a la vez con el mismo token: una sola pasa (antes salían dos sesiones)', async () => {
      const crudo = await generateRefreshToken(ana.id, '127.0.0.1');
      const [a, b] = await Promise.all([refreshAccessToken(crudo, '1.1.1.1'), refreshAccessToken(crudo, '1.1.1.1')]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
      expect(await refreshAccessToken(crudo, '1.1.1.1')).toBeNull();
    });
  });

  describe('restablecer contraseña', () => {
    it('en la base se guarda solo el hash del token, y el token en claro sigue sirviendo para verificarlo', async () => {
      const { token } = await (PasswordResetToken as any).generateToken(ana.id, '127.0.0.1', 'prueba');
      const fila: any = await PasswordResetToken.findOne({ where: { userId: ana.id, used: false } });
      expect(fila.token).not.toBe(token);
      expect(fila.token).toBe((PasswordResetToken as any).hashDelToken(token));
      expect(await (PasswordResetToken as any).verifyToken(token)).toBeTruthy();
      // el hash guardado NO es un token válido (quien viera la base no podría usarlo)
      expect(await (PasswordResetToken as any).verifyToken(fila.token)).toBeNull();
    });

    it('el enlace vale 1 hora, no 24', async () => {
      const { expiresAt } = await (PasswordResetToken as any).generateToken(ana.id);
      const horas = (new Date(expiresAt).getTime() - Date.now()) / 3_600_000;
      expect(horas).toBeGreaterThan(0.9);
      expect(horas).toBeLessThanOrEqual(1.01);
    });

    it('con el mismo enlace a la vez, solo uno cambia la clave (el segundo recibe «inválido o expirado»)', async () => {
      const { token } = await (PasswordResetToken as any).generateToken(ana.id);
      const [a, b] = await Promise.all([
        request(app).post('/api/auth/reset-password').send({ token, newPassword: 'ClaveNueva#1' }),
        request(app).post('/api/auth/reset-password').send({ token, newPassword: 'ClaveNueva#2' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
    });

    it('la contraseña nueva pide un símbolo: sin símbolo es 400 con el motivo; con símbolo pasa', async () => {
      const { token } = await (PasswordResetToken as any).generateToken(ana.id);
      const sin = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'SinSimbolo123' });
      expect(sin.status).toBe(400);
      expect(sin.body.message).toContain('símbolo');
      expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'ConSimbolo123!' })).status).toBe(200);
    });
  });

  describe('registro: contraseña con símbolo', () => {
    it('una contraseña sin símbolo se rechaza al registrarse', async () => {
      const r = await request(app).post('/api/auth/register').send({
        name: 'Persona Nueva', username: `sinsim${Date.now().toString(36)}`, email: `sinsim${Date.now().toString(36)}@clave.test`, password: 'password123', dni: '40111222', termsAccepted: true, sinSesion: true,
      });
      expect(r.status).toBe(400);
      expect(String(r.body.message)).toContain('símbolo');
    });
  });

  describe('publicaciones', () => {
    it('el contrato de la publicación lo calcula el servidor: uno ajeno que manda el cuerpo se ignora', async () => {
      const r = await request(app).post('/api/posts').set(como(ana)).field('title', 'Mi día').field('description', 'Hoy trabajé').field('type', 'post').field('linkedContract', contratoDeBeto);
      expect(r.status).toBe(201);
      const id = r.body.post?.id ?? r.body.data?.id;
      posts.push(id);
      expect(((await Post.findByPk(id)) as any).linkedContract ?? null).toBeNull();
    });

    it('el detalle no devuelve el contrato (ruta pública)', async () => {
      const creada = await request(app).post('/api/posts').set(como(ana)).field('title', 'Otra').field('description', 'Texto').field('type', 'post');
      const id = creada.body.post?.id ?? creada.body.data?.id;
      posts.push(id);
      const r = await request(app).get(`/api/posts/${id}`);
      expect(r.status).toBe(200);
      expect(r.body.post.contract).toBeUndefined();
    });

    it('una publicación sin publicar solo la ve quien la escribió', async () => {
      const p: any = await Post.create({ author: ana.id, title: 'Borrador', description: 'x', type: 'post', gallery: [], isPublished: false } as any);
      posts.push(p.id);
      expect((await request(app).get(`/api/posts/${p.id}`)).status).toBe(404);
      expect((await request(app).get(`/api/posts/${p.id}`).set(como(beto))).status).toBe(404);
      expect((await request(app).get(`/api/posts/${p.id}`).set(como(ana))).status).toBe(200);
    });

    it('un id que no es un id da 404 y un filtro inválido da una lista vacía (antes eran 500 con el texto de la base)', async () => {
      expect((await request(app).get('/api/posts/no-es-un-uuid')).status).toBe(404);
      const r = await request(app).get('/api/posts?userId=abc');
      expect(r.status).toBe(200);
      expect(r.body.posts).toEqual([]);
    });

    it('?page=0 y ?limit=1000000 se acotan: no hay OFFSET negativo y el listado no baja de 50', async () => {
      const r = await request(app).get('/api/posts?page=0&limit=1000000');
      expect(r.status).toBe(200);
      expect(r.body.pagination.page).toBe(1);
      expect(r.body.pagination.limit).toBeLessThanOrEqual(50);
    });

    it('las vistas se suman en la base (dos visitas seguidas = +2)', async () => {
      const p: any = await Post.create({ author: ana.id, title: 'Vistas', description: 'x', type: 'post', gallery: [] } as any);
      posts.push(p.id);
      await Promise.all([request(app).get(`/api/posts/${p.id}`), request(app).get(`/api/posts/${p.id}`)]);
      expect(Number(((await Post.findByPk(p.id)) as any).viewsCount)).toBe(2);
    });
  });

  describe('tickets del panel', () => {
    it('un ticket propio no puede atar el contrato de otra persona (404, igual que en /api/tickets)', async () => {
      const r = await request(app).post('/api/admin/tickets').set(como(ana)).send({ subject: 'Hola', category: 'support', message: 'Quiero ver ese contrato', relatedContract: contratoDeBeto });
      expect(r.status).toBe(404);
    });

    it('con un contrato propio sí se ata', async () => {
      const r = await request(app).post('/api/admin/tickets').set(como(carla)).send({ subject: 'Mi contrato', category: 'support', message: 'Una duda', relatedContract: contratoDeBeto });
      expect(r.status).toBe(201);
      const id = r.body.data?.id ?? r.body.ticket?.id;
      if (id) tickets.push(id);
    });

    it('crear un ticket EN NOMBRE de otra persona es solo del equipo: una persona común recibe 403', async () => {
      const r = await request(app).post('/api/admin/tickets/create').set(como(ana)).send({ userId: beto.id, subject: 'Falso', category: 'support', priority: 'high', message: 'Escrito como si fuera Beto' });
      expect(r.status).toBe(403);
      expect(await Ticket.count({ where: { createdBy: beto.id } as any })).toBe(0);
    });
  });

  describe('permisos del panel', () => {
    it('un super_admin NO puede darse a sí mismo el permiso «*» (todo)', async () => {
      const r = await request(app).put(`/api/admin/roles/users/${superUno.id}/permissions`).set(como(superUno)).send({ permissions: ['*'] });
      expect(r.status).toBe(403);
      expect(((await User.findByPk(superUno.id)) as any).permissions ?? []).not.toContain('*');
    });

    it('ni a un igual: otro super_admin está al mismo nivel', async () => {
      const r = await request(app).put(`/api/admin/roles/users/${superDos.id}/permissions`).set(como(superUno)).send({ permissions: [] });
      expect(r.status).toBe(403);
    });

    it('ni cambiarse el rol ni cambiárselo a un igual', async () => {
      expect((await request(app).put(`/api/admin/roles/users/${superUno.id}/role`).set(como(superUno)).send({ adminRole: 'support' })).status).toBe(403);
      expect((await request(app).put(`/api/admin/roles/users/${superDos.id}/role`).set(como(superUno)).send({ adminRole: 'none' })).status).toBe(403);
      expect(((await User.findByPk(superDos.id)) as any).adminRole).toBe('super_admin');
    });

    it('un permiso que no existe se rechaza, y «*» a alguien de menor nivel también si no es el owner', async () => {
      expect((await request(app).put(`/api/admin/roles/users/${admin.id}/permissions`).set(como(superUno)).send({ permissions: ['hackear:todo'] })).status).toBe(400);
      expect((await request(app).put(`/api/admin/roles/users/${admin.id}/permissions`).set(como(superUno)).send({ permissions: ['*'] })).status).toBe(403);
    });

    it('un permiso real a alguien de menor nivel sí se puede dar (lo normal sigue andando)', async () => {
      const r = await request(app).put(`/api/admin/roles/users/${admin.id}/permissions`).set(como(superUno)).send({ permissions: ['tickets:update'] });
      expect(r.status).toBe(200);
    });

    it('cada rol da solo roles de un nivel más bajo: el owner llega hasta super_admin (nunca owner) y un super_admin no crea otro super_admin', async () => {
      const nuevo: any = await crearUsuario({ role: 'client' });
      usuarios.push(nuevo.id);
      const dar = (quien: any, rol: string) => request(app).put(`/api/admin/roles/users/${nuevo.id}/role`).set(como(quien)).send({ adminRole: rol });
      const aOwner = await dar(dueno, 'owner');
      expect([aOwner.status, aOwner.body.code]).toEqual([403, 'ROL_NO_ASIGNABLE']);
      const deSuper = await dar(superUno, 'super_admin');
      expect([deSuper.status, deSuper.body.code]).toEqual([403, 'ROL_NO_ASIGNABLE']);
      expect(((await User.findByPk(nuevo.id)) as any).adminRole ?? null).toBeNull();
      // lo que sí: el owner da super_admin, y el super_admin da support (un nivel más bajo)
      expect((await dar(dueno, 'super_admin')).status).toBe(200);
      const otro: any = await crearUsuario({ role: 'client' });
      usuarios.push(otro.id);
      const aSupport = await request(app).put(`/api/admin/roles/users/${otro.id}/role`).set(como(superUno)).send({ adminRole: 'support' });
      expect(aSupport.status).toBe(200);
      expect(((await User.findByPk(otro.id)) as any).adminRole).toBe('support');
    });

    it('nadie reparte lo que no tiene: un super_admin no le da a un subordinado la confirmación de devoluciones a mano', async () => {
      const subordinado: any = await crearUsuario({ role: 'client', adminRole: 'admin', permissions: [] });
      usuarios.push(subordinado.id);
      const r = await request(app).put(`/api/admin/roles/users/${subordinado.id}/permissions`).set(como(superUno)).send({ permissions: ['dispute:confirm_manual_refund'] });
      expect([r.status, r.body.code]).toEqual([403, 'PERMISO_QUE_NO_TENES']);
      // el owner sí puede, y después un super_admin guarda la ficha sin que lo ya dado lo frene
      expect((await request(app).put(`/api/admin/roles/users/${subordinado.id}/permissions`).set(como(dueno)).send({ permissions: ['dispute:confirm_manual_refund'] })).status).toBe(200);
      expect((await request(app).put(`/api/admin/roles/users/${subordinado.id}/permissions`).set(como(superUno)).send({ permissions: ['dispute:confirm_manual_refund', 'tickets:update'] })).status).toBe(200);
    });

    it('un admin entra a la pantalla de roles, solo puede dar support o marketing y no toca permisos', async () => {
      const jefe: any = await crearUsuario({ role: 'client', adminRole: 'admin', permissions: [] });
      const persona: any = await crearUsuario({ role: 'client' });
      usuarios.push(jefe.id, persona.id);
      const pantalla = await request(app).get('/api/admin/roles/permissions').set(como(jefe));
      expect(pantalla.status).toBe(200);
      expect(pantalla.body.data.rolesAsignables).toEqual(['support', 'marketing']);
      expect(pantalla.body.data.puedeCambiarPermisos).toBe(false);
      expect((await request(app).put(`/api/admin/roles/users/${persona.id}/role`).set(como(jefe)).send({ adminRole: 'dpo' })).status).toBe(403);
      expect((await request(app).put(`/api/admin/roles/users/${persona.id}/permissions`).set(como(jefe)).send({ permissions: [] })).status).toBe(403);
      expect((await request(app).put(`/api/admin/roles/users/${persona.id}/role`).set(como(jefe)).send({ adminRole: 'support' })).status).toBe(200);
    });

    it('la lista dice a quién puede tocar quien mira, y support o marketing no entran', async () => {
      const lista = await request(app).get('/api/admin/roles/users?limit=500').set(como(superUno));
      const porId = new Map<string, any>(lista.body.data.users.map((u: any) => [u.id, u]));
      expect(porId.get(superUno.id)?.sePuedeCambiar).toBe(false);
      expect(porId.get(superDos.id)?.sePuedeCambiar).toBe(false);
      expect(porId.get(admin.id)?.sePuedeCambiar).toBe(true);
      for (const rol of ['support', 'marketing']) {
        const u: any = await crearUsuario({ role: 'client', adminRole: rol });
        usuarios.push(u.id);
        expect((await request(app).get('/api/admin/roles/users').set(como(u))).status).toBe(403);
      }
    });

    it('el owner no tiene tope: sí puede dar «*»', async () => {
      const r = await request(app).put(`/api/admin/roles/users/${admin.id}/permissions`).set(como(dueno)).send({ permissions: ['*'] });
      expect(r.status).toBe(200);
    });
  });

  describe('calendario', () => {
    it('el enlace del calendario de una persona se resuelve sin recorrer la base cada vez; uno inventado da null', async () => {
      expect(await idDelDuenoDelCalendario(generateCalendarToken(String(ana.id)))).toBe(String(ana.id));
      expect(await idDelDuenoDelCalendario('a'.repeat(32))).toBeNull();
      expect(await idDelDuenoDelCalendario('no-es-un-token')).toBeNull();
    });
  });
});
