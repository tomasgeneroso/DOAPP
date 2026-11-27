import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Compartir un trabajo terminado (pedido del dueño, 2026-11-27): «me da la opción de compartir un trabajo completado siendo que ya lo compartí… primero
 * verificar que no exista y, si existe, enlazarlo». Y la pestaña Portfolio sale: lo compartido es UNA publicación del perfil. Contra la base real.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { sequelize } from '../../server/config/database.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { Review } from '../../server/models/sql/Review.model.js';
import { Portfolio } from '../../server/models/sql/Portfolio.model.js';
import { moverPortfolioAlPerfil } from '../../server/services/moverPortfolioAlPerfil.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261127100000-puntuaciones-en-publicaciones.cjs');
const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

describe('compartir un trabajo terminado', () => {
  let app: Express;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/posts', (await import('../../server/routes/posts.js')).default);
    app.use('/api/users', (await import('../../server/routes/users.js')).default);
  });

  const armar = async () => {
    const cliente: any = await crearUsuario();
    const doer: any = await crearUsuario({ role: 'doer' });
    const t: any = await crearTrabajo(cliente.id, { status: 'completed', title: 'Pintar el patio' });
    const c: any = await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: doer.id }, { status: 'completed' });
    return { cliente, doer, t, c };
  };
  const publicar = (quien: any, campos: Record<string, string>) => {
    let r = request(app).post('/api/posts').set(como(quien)).field('title', 'Trabajo hecho').field('description', 'Quedó muy bien').field('type', 'post');
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    return r;
  };
  const compartidos = async (quien: any, ids?: string) => (await request(app).get(`/api/posts/mis-compartidos${ids ? `?jobIds=${ids}` : ''}`).set(como(quien))).body.compartidos;

  it('la columna se crea y se puede repetir', async () => {
    const interfaz = { sequelize: duenoDelEsquema() };
    await migracion.down(interfaz);
    await migracion.up(interfaz);
    await migracion.up(interfaz);
    const [filas] = await sequelize.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'contract_ratings'");
    expect(filas).toHaveLength(1);
  });

  it('antes de ofrecer se puede saber qué ya compartió y dónde; no se comparte dos veces y la respuesta dice dónde está', async () => {
    const { doer, t } = await armar();
    expect(await compartidos(doer)).toEqual({});
    const primera = await publicar(doer, { linkedJob: t.id });
    expect(primera.status).toBe(201);
    expect(await compartidos(doer)).toEqual({ [t.id]: primera.body.post.id });
    expect(await compartidos(doer, t.id)).toEqual({ [t.id]: primera.body.post.id });
    const segunda = await publicar(doer, { linkedJob: t.id });
    expect([segunda.status, segunda.body.code, segunda.body.postId]).toEqual([409, 'YA_COMPARTIDO', primera.body.post.id]);
    expect(await Post.count({ where: { author: doer.id } as any })).toBe(1);
  });

  it('cada persona comparte la suya, y si borra la publicación puede volver a compartir', async () => {
    const { cliente, doer, t } = await armar();
    const delDoer = (await publicar(doer, { linkedJob: t.id })).body.post.id;
    expect((await publicar(cliente, { linkedJob: t.id })).status).toBe(201);
    expect((await request(app).delete(`/api/posts/${delDoer}`).set(como(doer))).status).toBe(200);
    expect(await compartidos(doer)).toEqual({});
    expect((await publicar(doer, { linkedJob: t.id })).status).toBe(201);
  });

  it('sin sesión no se sabe nada de lo que compartió nadie', async () => {
    expect((await request(app).get('/api/posts/mis-compartidos')).status).toBe(401);
  });

  it('las puntuaciones salen de las reseñas reales: lo que mande la pantalla no inventa un puntaje', async () => {
    const { cliente, doer, t, c } = await armar();
    await Review.create({ contractId: c.id, reviewerId: doer.id, reviewedId: cliente.id, rating: 4, comment: 'Muy claro con lo que pedía' } as any);
    const r = await publicar(doer, { linkedJob: t.id, incluirPuntuaciones: JSON.stringify([{ contractId: c.id, comentario: true, rating: 5 }, { contractId: '00000000-0000-4000-8000-000000000000', rating: 5 }]) });
    const post: any = await Post.findByPk(r.body.post.id);
    expect(post.contractRatings).toEqual([expect.objectContaining({ contractId: c.id, rating: 4, role: 'client', comment: 'Muy claro con lo que pedía' })]);
  });

  it('el perfil muestra los trabajos realizados que se publicaron, cada uno con su publicación', async () => {
    const { doer, t, cliente } = await armar();
    const otro: any = await crearTrabajo(cliente.id, { status: 'completed', title: 'Sin compartir' });
    await crearContrato({ jobId: otro.id, clientId: cliente.id, doerId: doer.id }, { status: 'completed' });
    const pedir = async (consulta: string) => (await request(app).get(`/api/users/${doer.id}/completed-jobs${consulta}`)).body.contracts;
    expect(await pedir('?publicados=1')).toEqual([]);
    const postId = (await publicar(doer, { linkedJob: t.id })).body.post.id;
    expect((await pedir('?publicados=1')).map((x: any) => [x.job.id, x.publicacionId])).toEqual([[t.id, postId]]);
    expect(await pedir('')).toHaveLength(2);
  });

  it('lo que estaba en Portfolio pasa al perfil una sola vez, con su fecha, sin borrar nada y sin duplicar lo ya compartido', async () => {
    const { doer, t } = await armar();
    const suelto: any = await Portfolio.create({ userId: doer.id, title: `Obra suelta ${Date.now()}`, description: 'Sin trabajo vinculado', category: 'pintura', images: [], videos: [], documents: [], tags: ['pintura'], contractRatings: [] } as any);
    await sequelize.query("UPDATE portfolio_items SET created_at = '2026-01-15T12:00:00Z' WHERE id = :id", { replacements: { id: suelto.id } });
    await publicar(doer, { linkedJob: t.id });
    const yaCompartido: any = await Portfolio.create({ userId: doer.id, title: 'Del trabajo ya compartido', description: 'x', category: 'pintura', images: [], videos: [], documents: [], tags: [], contractRatings: [], linkedJob: t.id } as any);

    const delUsuario = (pasos: any[]) => pasos.filter((p) => p.userId === doer.id).map((p) => [p.portfolioId, p.resultado]).sort();
    const antes = await Post.count({ where: { author: doer.id } as any });
    expect(delUsuario(await moverPortfolioAlPerfil(false))).toEqual([[suelto.id, 'se_publica'], [yaCompartido.id, 'ya_estaba']].sort());
    expect(await Post.count({ where: { author: doer.id } as any })).toBe(antes);

    expect(delUsuario(await moverPortfolioAlPerfil(true))).toEqual([[suelto.id, 'publicado'], [yaCompartido.id, 'ya_estaba']].sort());
    expect(delUsuario(await moverPortfolioAlPerfil(true)).map((x) => x[1])).toEqual(['ya_estaba', 'ya_estaba']);
    expect(await Post.count({ where: { author: doer.id } as any })).toBe(antes + 1);
    const nueva: any = await Post.findOne({ where: { author: doer.id, title: suelto.title } as any });
    expect(new Date(nueva.createdAt).toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(await Portfolio.count({ where: { userId: doer.id } as any })).toBe(2);
  });
});
