import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Dos pedidos del dueño (2026-11-22), por la puerta pública (las rutas):
 *  1) Etiquetar a los trabajadores al compartir un trabajo terminado: solo a quien trabajó en ese trabajo, no a uno mismo y no a quien apagó las etiquetas en su configuración.
 *     Quien publica tiene que ser parte del trabajo. La publicación guarda las fotos que se adjuntan.
 *  2) Pruebas de un reclamo: cada una dice quién la subió y se le puede agregar una nota (solo las partes y el equipo; no con el reclamo cerrado).
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: new Proxy({}, { get: () => () => undefined }) }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { Review } from '../../server/models/sql/Review.model.js';
import { Portfolio } from '../../server/models/sql/Portfolio.model.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';

describe('etiquetas en la publicación y notas en las pruebas del reclamo', () => {
  let app: Express;
  let cliente: any, ana: any, beto: any, ajeno: any;
  let jobId: string;
  const contratos: string[] = [];
  const disputas: string[] = [];
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/posts', (await import('../../server/routes/posts.js')).default);
    app.use('/api/disputes', (await import('../../server/routes/disputes.js')).default);
    app.use('/api/portfolio', (await import('../../server/routes/portfolio.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    ana = await crearUsuario({ role: 'doer' });
    beto = await crearUsuario({ role: 'doer' });
    ajeno = await crearUsuario({ role: 'doer' });
    // Beto apagó las etiquetas en su configuración.
    await User.update({ notificationPreferences: { email: true, push: true, sms: false, newMessage: true, jobUpdate: true, contractUpdate: true, paymentUpdate: true, marketing: false, canBeTagged: false } } as any, { where: { id: beto.id } });
    const t: any = await crearTrabajo(cliente.id, { status: 'completed', maxWorkers: 2 });
    jobId = t.id;
    for (const doer of [ana, beto]) {
      const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId: doer.id }, { status: 'completed' });
      contratos.push(c.id);
    }
  });

  afterAll(async () => {
    const ids = [cliente.id, ana.id, beto.id, ajeno.id];
    try {
      await Portfolio.destroy({ where: { userId: ids } as any, force: true } as any);
      await Review.destroy({ where: { contractId: contratos } as any, force: true } as any);
      await Dispute.destroy({ where: { id: disputas }, force: true } as any);
      await Post.destroy({ where: { author: ids } });
      await Notification.destroy({ where: { recipientId: ids } });
      await Contract.destroy({ where: { id: contratos }, force: true } as any);
      await Job.destroy({ where: { id: jobId }, force: true });
      await User.destroy({ where: { id: ids }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  const publicar = (quien: any, campos: Record<string, string>) => {
    let r = request(app).post('/api/posts').set(como(quien)).field('title', 'Trabajo hecho').field('description', 'Quedó muy bien').field('type', 'post');
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    return r;
  };

  describe('etiquetas', () => {
    it('el cliente etiqueta a quien trabajó y lo permite: queda etiquetada y recibe un aviso; quien apagó las etiquetas no', async () => {
      const r = await publicar(cliente, { linkedJob: jobId, taggedUsers: JSON.stringify([ana.id, beto.id]) });
      expect(r.status).toBe(201);
      const post: any = await Post.findByPk(r.body.post.id);
      expect(post.taggedUsers).toEqual([String(ana.id)]);
      expect(r.body.noEtiquetados).toBe(1);
      expect(await Notification.count({ where: { recipientId: ana.id, title: 'Te etiquetaron en una publicación' } as any })).toBe(1);
      expect(await Notification.count({ where: { recipientId: beto.id, title: 'Te etiquetaron en una publicación' } as any })).toBe(0);
      // al leerla vienen con nombre
      const leida = await request(app).get(`/api/posts/${post.id}`);
      expect(leida.body.post.etiquetados.map((e: any) => e.id)).toEqual([String(ana.id)]);
    });

    it('si alguien apaga las etiquetas después, deja de verse en las publicaciones donde estaba', async () => {
      const r = await publicar(cliente, { linkedJob: jobId, taggedUsers: JSON.stringify([ana.id]) });
      const id = r.body.post.id;
      await User.update({ notificationPreferences: { email: true, push: true, sms: false, newMessage: true, jobUpdate: true, contractUpdate: true, paymentUpdate: true, marketing: false, canBeTagged: false } } as any, { where: { id: ana.id } });
      const leida = await request(app).get(`/api/posts/${id}`);
      expect(leida.body.post.etiquetados).toEqual([]);
      await User.update({ notificationPreferences: { email: true, push: true, sms: false, newMessage: true, jobUpdate: true, contractUpdate: true, paymentUpdate: true, marketing: false } } as any, { where: { id: ana.id } });
    });

    it('no se etiqueta a quien no trabajó en ese trabajo ni a uno mismo', async () => {
      const r = await publicar(cliente, { linkedJob: jobId, taggedUsers: JSON.stringify([ajeno.id, cliente.id]) });
      expect(r.status).toBe(201);
      const post: any = await Post.findByPk(r.body.post.id);
      expect(post.taggedUsers).toEqual([]);
    });

    it('un trabajador también etiqueta a su compañero, no a sí mismo', async () => {
      const r = await publicar(ana, { linkedJob: jobId, taggedUsers: JSON.stringify([ana.id, beto.id]) });
      expect(r.status).toBe(201);
      expect(((await Post.findByPk(r.body.post.id)) as any).taggedUsers).toEqual([]); // Beto no permite
    });

    it('quien no participó en el trabajo no puede compartirlo; y no se etiqueta fuera de un trabajo', async () => {
      const a = await publicar(ajeno, { linkedJob: jobId });
      expect(a.status).toBe(403);
      const b = await publicar(cliente, { taggedUsers: JSON.stringify([ana.id]) });
      expect(b.status).toBe(400);
    });

    it('la publicación queda enlazada al contrato del trabajo', async () => {
      const r = await publicar(cliente, { linkedJob: jobId });
      expect(contratos).toContain(String(((await Post.findByPk(r.body.post.id)) as any).linkedContract));
    });
  });

  describe('etiquetar después de publicar', () => {
    it('una publicación que salió sin trabajo ni etiquetas: se elige el trabajo y se etiqueta; quien no lo permite no entra; se puede sacar', async () => {
      const p: any = await Post.create({ author: cliente.id, title: 'Sin etiquetas', description: 'x', gallery: [], type: 'post', tags: [] } as any);
      // solo quien publicó
      expect((await request(app).get(`/api/posts/${p.id}/etiquetables`).set(como(ana))).status).toBe(403);
      // sin trabajo vinculado ofrece elegir entre sus trabajos terminados
      const a = await request(app).get(`/api/posts/${p.id}/etiquetables`).set(como(cliente));
      expect(a.body.vinculado).toBe(false);
      expect(a.body.trabajos.map((t: any) => t.id)).toContain(String(jobId));
      // con el trabajo: Ana permite, Beto no
      const b = await request(app).get(`/api/posts/${p.id}/etiquetables?jobId=${jobId}`).set(como(cliente));
      expect(b.body.personas.map((x: any) => [x.name === ana.name, x.permite]).length).toBe(2);
      expect(b.body.personas.find((x: any) => x.id === String(beto.id)).permite).toBe(false);
      // guardar
      const g = await request(app).put(`/api/posts/${p.id}/etiquetas`).set(como(cliente)).send({ linkedJob: jobId, taggedUsers: [ana.id, beto.id] });
      expect(g.status).toBe(200);
      expect(g.body.etiquetados).toEqual([String(ana.id)]);
      const guardado: any = await Post.findByPk(p.id);
      expect(guardado.taggedUsers).toEqual([String(ana.id)]);
      expect(contratos).toContain(String(guardado.linkedContract));
      // sacarla
      const s = await request(app).put(`/api/posts/${p.id}/etiquetas`).set(como(cliente)).send({ taggedUsers: [] });
      expect(s.status).toBe(200);
      expect(((await Post.findByPk(p.id)) as any).taggedUsers).toEqual([]);
      // otra persona no puede cambiar las etiquetas
      expect((await request(app).put(`/api/posts/${p.id}/etiquetas`).set(como(ana)).send({ taggedUsers: [ana.id] })).status).toBe(403);
    });
  });

  describe('portafolio: la puntuación a los trabajadores', () => {
    it('se copia desde las reseñas reales: una por trabajador, con el comentario solo si se pidió; no se inventa ninguna', async () => {
      const dejar = (c: string, quien: any, rating: number, comment: string) =>
        Review.create({ contractId: c, reviewerId: cliente.id, reviewedId: quien.id, reviewedRole: 'doer', rating, comment, source: 'post_work' } as any);
      await dejar(contratos[0], ana, 5, 'Excelente trabajo, muy prolija.');
      await dejar(contratos[1], beto, 3, 'Cumplió, pero tardó.');

      const mias = await request(app).get(`/api/posts/job/${jobId}/mis-opiniones`).set(como(cliente));
      expect(mias.body.opiniones.map((o: any) => [o.workerId, o.rating]).sort()).toEqual([[String(ana.id), 5], [String(beto.id), 3]].sort());
      // quien no participó no ve nada
      expect((await request(app).get(`/api/posts/job/${jobId}/mis-opiniones`).set(como(ajeno))).body.opiniones).toEqual([]);

      const r = await request(app).post('/api/portfolio').set(como(cliente)).send({
        title: 'Trabajo compartido', description: 'Quedó bien', category: 'construccion', linkedJob: jobId,
        incluirPuntuaciones: [
          { contractId: contratos[0], puntaje: true, comentario: true },
          { contractId: contratos[1], puntaje: true, comentario: false },
          { contractId: '00000000-0000-4000-8000-000000000000', puntaje: true, comentario: true }, // no existe: se ignora
        ],
      });
      expect(r.status).toBe(201);
      const guardado: any = await Portfolio.findByPk(r.body.data.id);
      expect(guardado.contractRatings).toHaveLength(2);
      const deAna = guardado.contractRatings.find((x: any) => x.workerId === String(ana.id));
      const deBeto = guardado.contractRatings.find((x: any) => x.workerId === String(beto.id));
      expect([deAna.rating, deAna.comment]).toEqual([5, 'Excelente trabajo, muy prolija.']);
      expect([deBeto.rating, deBeto.comment]).toEqual([3, undefined]);
      expect(Number(guardado.contractRating)).toBe(4); // el promedio de lo que se muestra
    });
  });

  describe('pruebas del reclamo', () => {
    let disputaId: string;
    const prueba = (por: any) => ({ fileName: 'foto.jpg', fileUrl: '/uploads/disputes/foto.jpg', fileType: 'image', fileSize: 10, uploadedAt: new Date(), uploadedBy: String(por.id) });

    beforeAll(async () => {
      const d: any = await crearDisputa({ contractId: contratos[0], initiatedBy: cliente.id, against: ana.id }, { status: 'open', evidence: [prueba(cliente)] });
      disputaId = d.id;
      disputas.push(d.id);
    });

    it('una parte agrega una nota a una prueba: queda con quién la escribió y cuándo, y se suman', async () => {
      const a = await request(app).post(`/api/disputes/${disputaId}/evidence/0/notes`).set(como(cliente)).send({ text: 'Así quedó el piso.' });
      expect(a.status).toBe(200);
      const b = await request(app).post(`/api/disputes/${disputaId}/evidence/0/notes`).set(como(ana)).send({ text: 'Esa foto es de antes de mi trabajo.' });
      expect(b.status).toBe(200);
      const d: any = await Dispute.findByPk(disputaId);
      expect(d.evidence[0].uploadedBy).toBe(String(cliente.id));
      expect(d.evidence[0].notes.map((n: any) => [n.by, n.text])).toEqual([
        [String(cliente.id), 'Así quedó el piso.'],
        [String(ana.id), 'Esa foto es de antes de mi trabajo.'],
      ]);
    });

    it('un tercero no puede, una prueba que no existe da 404 y una nota vacía o larga se rechaza', async () => {
      // Un tercero no ve el reclamo (la base lo oculta): 404, y de todos modos no se agrega nada.
      expect([403, 404]).toContain((await request(app).post(`/api/disputes/${disputaId}/evidence/0/notes`).set(como(ajeno)).send({ text: 'hola' })).status);
      expect((await request(app).post(`/api/disputes/${disputaId}/evidence/7/notes`).set(como(cliente)).send({ text: 'hola' })).status).toBe(404);
      expect((await request(app).post(`/api/disputes/${disputaId}/evidence/0/notes`).set(como(cliente)).send({ text: '   ' })).status).toBe(400);
      expect((await request(app).post(`/api/disputes/${disputaId}/evidence/0/notes`).set(como(cliente)).send({ text: 'x'.repeat(501) })).status).toBe(400);
    });

    it('con el reclamo cerrado no se agregan notas', async () => {
      await Dispute.update({ status: 'cancelled' } as any, { where: { id: disputaId } });
      const r = await request(app).post(`/api/disputes/${disputaId}/evidence/0/notes`).set(como(cliente)).send({ text: 'tarde' });
      expect(r.status).toBe(400);
    });
  });
});
