import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Índices de producto, por la puerta pública y contra la base real. Para que nada de otras pruebas altere las cuentas, se calcula sobre una ventana en 2031:
 * ahí solo existe lo que esta prueba crea.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { sequelize } from '../../server/config/database.js';
import { ActivityDay } from '../../server/models/sql/ActivityDay.model.js';
import { UsageCounter } from '../../server/models/sql/UsageCounter.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { anotarLatido, borrarUsoViejo, diaArgentino, sumarAlContador } from '../../server/services/registroDeUso.js';
import { metricasDeProducto } from '../../server/services/metricasDeProducto.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

const SECRETO = process.env.JWT_SECRET || 'test-secret';
const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, SECRETO)}` });
const AHORA = new Date('2031-06-30T15:00:00Z');
const DIA = 86_400_000;
const haceDias = (n: number) => new Date(AHORA.getTime() - n * DIA);
/** `createdAt` lo pone Sequelize al crear: para ubicar algo en 2031 se corrige después. */
const fechar = (tabla: string, id: string, cuando: Date) =>
  sequelize.query(`UPDATE ${tabla} SET created_at = :cuando WHERE id = :id`, { replacements: { id, cuando: cuando.toISOString() } });
const usoEl = (userId: string, dias: number, extra: Partial<Record<'sessions' | 'seconds', number>> = {}, platform = 'web') =>
  ActivityDay.create({ userId, day: diaArgentino(haceDias(dias)), platform, sessions: 1, seconds: 0, firstSeenAt: haceDias(dias), lastSeenAt: haceDias(dias), ...extra } as any);

describe('índices de producto', () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/actividad', (await import('../../server/routes/actividad.js')).default);
    app.use('/api/admin/metricas', (await import('../../server/routes/admin/metricas.js')).default);
    app.use('/api/privacy', (await import('../../server/routes/privacy.js')).default);
    await ActivityDay.destroy({ where: {} });
    await UsageCounter.destroy({ where: {} });
  });

  describe('registro de uso', () => {
    it('latidos seguidos suman tiempo en la misma visita; tras 30 minutos de silencio es otra visita; un hueco intermedio no suma tiempo', async () => {
      const u: any = await crearUsuario();
      const base = new Date('2031-01-10T15:00:00Z').getTime();
      for (const segundos of [0, 60, 120, 120 + 600, 120 + 600 + 60, 120 + 660 + 3600]) await anotarLatido(u.id, 'web', new Date(base + segundos * 1000));
      const filas = await ActivityDay.findAll({ where: { userId: u.id } });
      expect(filas).toHaveLength(1);
      expect([filas[0].sessions, filas[0].seconds]).toEqual([2, 180]);
    });

    it('dos latidos a la vez no duplican la fila', async () => {
      const u: any = await crearUsuario();
      const ahora = new Date('2031-01-11T15:00:00Z');
      await Promise.all([anotarLatido(u.id, 'android', ahora), anotarLatido(u.id, 'android', ahora)]);
      expect(await ActivityDay.count({ where: { userId: u.id } })).toBe(1);
    });

    it('el día es el argentino: a las 23:30 de acá sigue siendo el mismo día', () => {
      expect(diaArgentino(new Date('2031-03-02T02:30:00Z'))).toBe('2031-03-01');
      expect(diaArgentino(new Date('2031-03-02T03:00:00Z'))).toBe('2031-03-02');
    });

    it('la puerta pide sesión y una plataforma válida, y no anota al equipo', async () => {
      const persona: any = await crearUsuario();
      const delEquipo: any = await crearUsuario({ adminRole: 'support' });
      expect((await request(app).post('/api/actividad/latido').send({ plataforma: 'web' })).status).toBe(401);
      expect((await request(app).post('/api/actividad/latido').set(como(persona)).send({ plataforma: 'nevera' })).status).toBe(400);
      expect((await request(app).post('/api/actividad/latido').set(como(persona)).send({ plataforma: 'web' })).body).toEqual({ success: true });
      await request(app).post('/api/actividad/latido').set(como(delEquipo)).send({ plataforma: 'web' });
      expect(await ActivityDay.count({ where: { userId: persona.id } })).toBe(1);
      expect(await ActivityDay.count({ where: { userId: delEquipo.id } })).toBe(0);
    });

    it('la primera apertura solo suma a un contador y no vale desde la web', async () => {
      expect((await request(app).post('/api/actividad/primera-apertura').send({ plataforma: 'web' })).status).toBe(400);
      expect((await request(app).post('/api/actividad/primera-apertura').send({ plataforma: 'android' })).status).toBe(200);
      const filas = await UsageCounter.findAll({ where: { name: 'app_first_open' } });
      expect(filas.reduce((s, f) => s + f.total, 0)).toBe(1);
    });

    it('lo más viejo que 400 días se borra y lo demás queda', async () => {
      const u: any = await crearUsuario();
      await usoEl(u.id, 401);
      await usoEl(u.id, 399);
      await borrarUsoViejo(AHORA);
      expect((await ActivityDay.findAll({ where: { userId: u.id } })).map((f) => f.day)).toEqual([diaArgentino(haceDias(399))]);
    });

    it('pedir la eliminación de la cuenta borra el registro de uso en el momento', async () => {
      const u: any = await crearUsuario({ password: 'password123' });
      await usoEl(u.id, 1);
      const r = await request(app).post('/api/privacy/delete-request').set(como(u)).send({ reason: 'prueba', password: 'password123' });
      expect(r.status).toBe(200);
      expect(await ActivityDay.count({ where: { userId: u.id } })).toBe(0);
    });
  });

  describe('quién puede verlos', () => {
    it('solo el dueño y marketing', async () => {
      for (const [rol, estado] of [['owner', 200], ['marketing', 200], ['super_admin', 403], ['admin', 403], ['support', 403], [null, 403]] as const) {
        const u: any = await crearUsuario({ adminRole: rol });
        const r = await request(app).get('/api/admin/metricas').set(como(u));
        expect([rol, r.status]).toEqual([rol, estado]);
      }
      expect((await request(app).get('/api/admin/metricas')).status).toBe(401);
    });
  });

  describe('los números', () => {
    beforeAll(async () => {
      await ActivityDay.destroy({ where: {} });
      await UsageCounter.destroy({ where: {} });
    });

    it('sin registro de uso no hay ceros inventados: cada índice de uso dice qué falta', async () => {
      const m = await metricasDeProducto(AHORA);
      expect(m.usoDesde).toBeNull();
      for (const k of ['dau', 'mau', 'wau', 'pegajosidad', 'retencion1', 'abandono', 'arpu', 'ltv', 'duracionDeVisita'] as const) {
        expect([k, m.indices[k].valor]).toEqual([k, null]);
        expect(m.indices[k].falta).toBeTruthy();
      }
    });

    it('uso, retención, embudo y mercado salen de los datos creados', async () => {
      const cliente: any = await crearUsuario({ role: 'client' });
      const trabajador: any = await crearUsuario({ role: 'doer' });
      const queNoVuelve: any = await crearUsuario({ role: 'client' });
      const equipo: any = await crearUsuario({ adminRole: 'admin' });
      for (const u of [cliente, trabajador, queNoVuelve, equipo]) await fechar('users', u.id, haceDias(10));

      // El cliente vuelve al día 1 y al día 7; el trabajador, al día 1. El equipo usa mucho y no cuenta.
      await usoEl(cliente.id, 10, { sessions: 1, seconds: 100 });
      await usoEl(cliente.id, 9, { sessions: 2, seconds: 200 });
      await usoEl(cliente.id, 3, { sessions: 1, seconds: 300 });
      await usoEl(trabajador.id, 9, { sessions: 1, seconds: 0 }, 'android');
      await usoEl(queNoVuelve.id, 10);
      await usoEl(equipo.id, 3, { sessions: 50, seconds: 9999 });

      const publicado: any = await crearTrabajo(cliente.id, { status: 'completed' });
      const sinNadie: any = await crearTrabajo(cliente.id, { status: 'open' });
      for (const j of [publicado, sinNadie]) await fechar('jobs', j.id, haceDias(8));
      const propuesta: any = await Proposal.create({
        jobId: publicado.id, freelancerId: trabajador.id, clientId: cliente.id, coverLetter: 'Puedo hacerlo esta semana sin problema.', proposedPrice: 1000, estimatedDuration: 2, status: 'approved',
      } as any);
      await fechar('proposals', propuesta.id, new Date(haceDias(8).getTime() + 5 * 3_600_000));
      const contrato: any = await crearContrato({ jobId: publicado.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'completed', price: 20000, actualEndDate: haceDias(2) });
      await fechar('contracts', contrato.id, haceDias(7));

      await sumarAlContador('apk_download', haceDias(2));
      await sumarAlContador('apk_download', haceDias(2));
      await sumarAlContador('app_first_open', haceDias(1));

      const m = await metricasDeProducto(AHORA);
      const i = m.indices;
      expect(i.mau.valor).toBe(3);
      expect(i.wau.valor).toBe(1);
      // 6 visitas y 600 segundos entre tres personas.
      expect(i.visitasPorPersona.valor).toBeCloseTo(2, 5);
      expect(i.duracionDeVisita.valor).toBeCloseTo(100, 5);
      expect([i.retencion1.de, i.retencion1.sobre]).toEqual([2, 3]);
      expect([i.retencion7.de, i.retencion7.sobre]).toEqual([1, 3]);
      expect(i.retencion30.valor).toBeNull();
      expect(i.abandono.valor).toBeNull();
      expect(m.embudo.map((p) => p.personas)).toEqual([3, 3, 2, 2, 2, 0]);
      expect([i.conversion.de, i.conversion.sobre]).toEqual([2, 3]);
      expect([i.cubiertas.de, i.cubiertas.sobre]).toEqual([1, 2]);
      expect([i.conPostulaciones.de, i.conPostulaciones.sobre]).toEqual([1, 2]);
      expect(i.horasHastaPostulacion.valor).toBeCloseTo(5, 1);
      expect(i.volumen.valor).toBe(20000);
      expect(i.primeraApertura.valor).toBe(50);
      expect(m.adopcion.find((a) => a.nombre === 'Publicar un trabajo')).toMatchObject({ personas: 1, base: 3 });
      expect(m.plataformas).toEqual([{ plataforma: 'web', personas: 2 }, { plataforma: 'android', personas: 1 }]);
    });

    it('la respuesta lleva solo totales: ni correos, ni nombres, ni ids de personas', async () => {
      const dueno: any = await crearUsuario({ adminRole: 'owner' });
      const r = await request(app).get('/api/admin/metricas').set(como(dueno));
      const texto = JSON.stringify(r.body);
      expect(texto).not.toMatch(/@test\.local/);
      expect(texto).not.toContain('Usuario de prueba');
      expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });
  });
});
