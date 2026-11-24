import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Auditoría de inyecciones del 2026-11-24, por la puerta pública (las rutas):
 *  - la búsqueda global del panel armaba SQL con el texto de quien busca (una comilla simple salía de la cadena);
 *  - el portafolio dejaba enlazar el contrato de OTRA persona y el detalle público (sin sesión) devolvía el contrato entero.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Portfolio } from '../../server/models/sql/Portfolio.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('inyecciones: búsqueda del panel y portafolio', () => {
  let app: Express;
  let admin: any, atacante: any, cliente: any, trabajador: any;
  let jobId = '', contratoId = '';
  const usuarios: string[] = [];
  const items: string[] = [];
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/search', (await import('../../server/routes/admin/search.js')).default);
    app.use('/api/portfolio', (await import('../../server/routes/portfolio.js')).default);
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
    atacante = await crearUsuario({ role: 'client' });
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    usuarios.push(admin.id, atacante.id, cliente.id, trabajador.id);
    const t: any = await crearTrabajo(cliente.id, { status: 'completed', title: 'TRABAJO-QUE-NO-COINCIDE' });
    jobId = t.id;
    const c: any = await crearContrato({ jobId, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', price: 12345 });
    contratoId = c.id;
  });

  afterAll(async () => {
    try {
      await Portfolio.destroy({ where: { id: items }, force: true } as any);
      await Contract.destroy({ where: { id: contratoId }, force: true } as any);
      await Job.destroy({ where: { id: jobId }, force: true });
      await User.destroy({ where: { id: usuarios }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  describe('búsqueda global del panel', () => {
    const buscar = (id: string) => request(app).get('/api/admin/search').query({ id }).set(como(admin));

    it("un texto con comilla simple se rechaza (400) y NO devuelve trabajos que no coinciden", async () => {
      for (const ataque of ["zzzzzzzz' OR TRUE OR 'x' ILIKE '", "abcd'; DROP TABLE users; --", "abcd%' OR '1'='1"]) {
        const r = await buscar(ataque);
        expect([ataque, r.status]).toEqual([ataque, 400]);
        expect(JSON.stringify(r.body)).not.toContain('TRABAJO-QUE-NO-COINCIDE');
      }
    });

    it('un id real (completo o un pedazo) sigue encontrando lo suyo', async () => {
      const completo = await buscar(jobId);
      expect(completo.status).toBe(200);
      expect(completo.body.data.job?.id).toBe(jobId);
      const pedazo = await buscar(jobId.slice(-8));
      expect(pedazo.status).toBe(200);
      expect(pedazo.body.data.job?.id).toBe(jobId);
    });

    it('un texto de menos de 4 caracteres o que no es un id sigue dando 400', async () => {
      expect((await buscar('ab')).status).toBe(400);
      expect((await buscar('hola mundo')).status).toBe(400);
    });

    it('sigue siendo solo del equipo con rol de administración', async () => {
      const r = await request(app).get('/api/admin/search').query({ id: jobId }).set(como(atacante));
      expect(r.status).toBe(403);
    });
  });

  describe('portafolio: contrato y trabajo ajenos', () => {
    const crear = (quien: any, extra: Record<string, unknown>) =>
      request(app).post('/api/portfolio').set(como(quien)).send({ title: 'Mi trabajo', description: 'Una descripción larga para pasar las validaciones.', category: 'Reparaciones', ...extra });

    it('enlazar el contrato de otra persona es 403 y no se crea nada', async () => {
      const r = await crear(atacante, { linkedContract: contratoId });
      expect(r.status).toBe(403);
      expect(await Portfolio.count({ where: { userId: atacante.id } as any })).toBe(0);
    });

    it('enlazar el trabajo de otra persona es 403', async () => {
      expect((await crear(atacante, { linkedJob: jobId })).status).toBe(403);
    });

    it('un id que no es un id es 403 con motivo, no un 500', async () => {
      const r = await crear(atacante, { linkedContract: 'no-es-un-uuid' });
      expect(r.status).toBe(403);
      expect(r.body.message).toContain('no es válido');
    });

    it('quien trabajó SÍ puede enlazar su contrato y su trabajo', async () => {
      const r = await crear(trabajador, { linkedContract: contratoId, linkedJob: jobId });
      expect(r.status).toBe(201);
      items.push(r.body.data.id);
    });

    it('el detalle PÚBLICO (sin sesión) devuelve del contrato solo id y estado: nada de precio, firmas, entregas ni notas', async () => {
      const g = await request(app).get(`/api/portfolio/${items[0]}`);
      expect(g.status).toBe(200);
      expect(Object.keys(g.body.data.contract).sort()).toEqual(['id', 'status']);
    });

    it('no se puede cambiar después el enlace por un contrato ajeno (PUT)', async () => {
      const r = await request(app).put(`/api/portfolio/${items[0]}`).set(como(trabajador)).send({ linkedContract: (await crearAjeno()).contrato });
      expect(r.status).toBe(403);
    });

    async function crearAjeno(): Promise<{ contrato: string }> {
      const otro: any = await crearUsuario({ role: 'client' });
      usuarios.push(otro.id);
      const t: any = await crearTrabajo(otro.id, { status: 'completed' });
      const c: any = await crearContrato({ jobId: t.id, clientId: otro.id, doerId: (await crearUsuario({ role: 'doer' }).then((u: any) => { usuarios.push(u.id); return u; })).id }, { status: 'completed' });
      return { contrato: c.id };
    }
  });
});
