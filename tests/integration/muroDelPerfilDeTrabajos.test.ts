import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Pedido del dueño (2026-11-24): la publicación de un trabajo en el muro del perfil NO se edita (editarla sería modificar el trabajo);
 * solo se agrega o se quita. Y desde «Trabajos publicados» se ve qué trabajos míos están en el muro.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('muro del perfil: la publicación de un trabajo se agrega y se quita, no se edita', () => {
  let app: Express;
  let cliente: any, ana: any;
  let jobId: string, otroJobId: string, contratoId: string;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/posts', (await import('../../server/routes/posts.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    ana = await crearUsuario({ role: 'doer' });
    const t: any = await crearTrabajo(cliente.id, { status: 'completed' });
    jobId = t.id;
    const t2: any = await crearTrabajo(cliente.id, { status: 'completed' });
    otroJobId = t2.id;
    const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId: ana.id }, { status: 'completed' });
    contratoId = c.id;
  });

  afterAll(async () => {
    const ids = [cliente.id, ana.id];
    try {
      await Post.destroy({ where: { author: ids } });
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { id: contratoId }, force: true } as any);
      await Job.destroy({ where: { id: [jobId, otroJobId] }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  const publicarTrabajo = () =>
    request(app).post('/api/posts').set(como(cliente)).field('title', 'Trabajo hecho').field('description', 'Quedó muy bien').field('type', 'post').field('linkedJob', jobId);

  it('la publicación de un trabajo NO se edita: 409 con su código, y el texto queda como estaba', async () => {
    const creada = await publicarTrabajo();
    expect(creada.status).toBe(201);
    const id = creada.body.post?.id ?? creada.body.data?.id;
    const r = await request(app).put(`/api/posts/${id}`).set(como(cliente)).field('title', 'Otro título');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PUBLICACION_DE_TRABAJO_NO_SE_EDITA');
    expect(((await Post.findByPk(id)) as any).title).toBe('Trabajo hecho');
  });

  it('una publicación libre (sin trabajo) sí se edita', async () => {
    const creada = await request(app).post('/api/posts').set(como(cliente)).field('title', 'Mi día').field('description', 'Hoy trabajé').field('type', 'post');
    expect(creada.status).toBe(201);
    const id = creada.body.post?.id ?? creada.body.data?.id;
    const r = await request(app).put(`/api/posts/${id}`).set(como(cliente)).field('title', 'Mi día, editado');
    expect(r.status).toBe(200);
    expect(((await Post.findByPk(id)) as any).title).toBe('Mi día, editado');
  });

  it('«mis trabajos en el muro» dice qué trabajos míos están compartidos (y solo esos)', async () => {
    const r = await request(app).get('/api/posts/mis-trabajos-en-el-muro').set(como(cliente));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.enElMuro)).toContain(jobId);
    expect(Object.keys(r.body.enElMuro)).not.toContain(otroJobId);
  });

  it('sin sesión no se ve; y otra persona no ve los trabajos del muro de alguien más', async () => {
    expect((await request(app).get('/api/posts/mis-trabajos-en-el-muro')).status).toBe(401);
    const r = await request(app).get('/api/posts/mis-trabajos-en-el-muro').set(como(ana));
    expect(r.status).toBe(200);
    expect(r.body.enElMuro).toEqual({});
  });

  it('quitar la publicación del muro sigue funcionando y el trabajo no se toca', async () => {
    const id = (await request(app).get('/api/posts/mis-trabajos-en-el-muro').set(como(cliente))).body.enElMuro[jobId];
    expect(id).toBeTruthy();
    const r = await request(app).delete(`/api/posts/${id}`).set(como(cliente));
    expect(r.status).toBe(200);
    expect(Object.keys((await request(app).get('/api/posts/mis-trabajos-en-el-muro').set(como(cliente))).body.enElMuro)).not.toContain(jobId);
    expect(((await Job.findByPk(jobId)) as any).status).toBe('completed');
  });
});
