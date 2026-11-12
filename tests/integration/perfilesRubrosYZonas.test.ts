import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Rubros y zona de trabajo del perfil + directorio de perfiles (pedido del dueño, 2026-11-12):
 *  - al registrarse se elige cliente, trabajador o ambos; el trabajador elige rubros (los de los trabajos) o «cualquier rubro»;
 *  - en Configuración se editan rubros, radio de trabajo y otras zonas (se sanean);
 *  - el directorio busca por nombre, rubro, perfil, puntuación y ubicación y devuelve tarjetas sin la calle ni datos de contacto.
 */
jest.mock('../../server/index.js', () => ({
  __esModule: true,
  socketService: new Proxy({}, { get: () => () => undefined }),
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('perfiles: rubros, zonas y directorio', () => {
  let app: Express;
  const creados: string[] = [];
  const marca = `Zz${Date.now().toString(36)}`;
  const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const registrar = (extra: Record<string, unknown>) => {
    const n = Math.random().toString(36).slice(2, 8);
    return request(app).post('/api/auth/register').send({
      name: 'Persona Prueba', username: `reg${n}`, email: `reg${n}@perfiles.test`, password: 'password123', dni: String(20000000 + Math.floor(Math.random() * 9999999)), termsAccepted: true, ...extra,
    });
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    app.use('/api/users', (await import('../../server/routes/users.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
  });

  afterAll(async () => {
    try { await User.destroy({ where: { id: creados }, force: true }); } catch { /* ok */ }
    try { await User.destroy({ where: { email: { [(await import('sequelize')).Op.like]: '%@perfiles.test' } }, force: true }); } catch { /* ok */ }
  });

  describe('registro', () => {
    it('trabajador con rubros: rol doer, rubros saneados (los que no existen se descartan)', async () => {
      const r = await registrar({ accountType: 'worker', workCategories: ['plomeria', 'electricidad', 'plomeria', 'inventado', 7] });
      expect(r.status).toBe(201);
      const u: any = await User.findOne({ where: { email: r.body.user.email } });
      expect(u.role).toBe('doer');
      expect([...u.workCategories].sort()).toEqual(['electricidad', 'plomeria']);
      expect(u.workAnyCategory).toBe(false);
    });

    it('ambos + «cualquier rubro»', async () => {
      const r = await registrar({ accountType: 'both', workAnyCategory: true });
      const u: any = await User.findOne({ where: { email: r.body.user.email } });
      expect(u.role).toBe('both');
      expect(u.workAnyCategory).toBe(true);
    });

    it('cliente: rol client y no guarda rubros aunque lleguen', async () => {
      const r = await registrar({ accountType: 'client', workCategories: ['plomeria'], workAnyCategory: true });
      const u: any = await User.findOne({ where: { email: r.body.user.email } });
      expect(u.role).toBe('client');
      expect(u.workCategories).toEqual([]);
      expect(u.workAnyCategory).toBe(false);
    });

    it('sin elegir nada el alta sigue como antes (rol por defecto)', async () => {
      const r = await registrar({});
      const u: any = await User.findOne({ where: { email: r.body.user.email } });
      expect(u.role).toBe('user');
    });
  });

  describe('configuración', () => {
    it('guarda rubros, radio y zonas saneados y los devuelve', async () => {
      const u: any = await crearUsuario({ role: 'doer' });
      creados.push(u.id);
      const r = await request(app).put('/api/auth/settings').set(como(u)).send({
        workCategories: ['pintura', 'nada'],
        workAnyCategory: false,
        workRadiusKm: 25,
        workZones: [{ name: ' Palermo ', radiusKm: 10 }, { name: 'palermo' }, { name: 'x' }, { name: 'Tigre', radiusKm: 'mucho' }],
      });
      expect(r.status).toBe(200);
      const g: any = await User.findByPk(u.id);
      expect(g.workCategories).toEqual(['pintura']);
      expect(g.workRadiusKm).toBe(25);
      expect(g.workZones).toEqual([{ name: 'Palermo', radiusKm: 10 }, { name: 'Tigre' }]);
      expect(r.body.user.workRadiusKm).toBe(25);
    });

    it('un radio absurdo se ignora', async () => {
      const u: any = await crearUsuario({ role: 'doer' });
      creados.push(u.id);
      await request(app).put('/api/auth/settings').set(como(u)).send({ workRadiusKm: 9999 });
      expect(((await User.findByPk(u.id)) as any).workRadiusKm).toBeNull();
    });
  });

  describe('directorio', () => {
    let ana: any, beto: any, cora: any, cliente: any, baneado: any;
    beforeAll(async () => {
      const dato = (o: Record<string, unknown>) => ({ isBanned: false, ...o });
      ana = await crearUsuario(dato({ name: `Ana ${marca}`, username: `ana${marca.toLowerCase()}`, role: 'doer', rating: 4.8, workCategories: ['plomeria'], address: { street: 'Calle Secreta 123', city: 'Rosario', state: 'Santa Fe' } }));
      beto = await crearUsuario(dato({ name: `Beto ${marca}`, username: `beto${marca.toLowerCase()}`, role: 'both', rating: 3.2, workCategories: ['electricidad'], workZones: [{ name: 'Funes', radiusKm: 15 }], address: { city: 'Córdoba', state: 'Córdoba' } }));
      cora = await crearUsuario(dato({ name: `Cora ${marca}`, username: `cora${marca.toLowerCase()}`, role: 'doer', rating: 4.0, workAnyCategory: true, address: { city: 'Mendoza' } }));
      cliente = await crearUsuario(dato({ name: `Cliente ${marca}`, username: `cli${marca.toLowerCase()}`, role: 'client' }));
      baneado = await crearUsuario(dato({ name: `Baneado ${marca}`, username: `ban${marca.toLowerCase()}`, role: 'doer', isBanned: true, workCategories: ['plomeria'] }));
      creados.push(ana.id, beto.id, cora.id, cliente.id, baneado.id);
    });

    const buscar = async (qs: Record<string, string>) => (await request(app).get('/api/users/directory').query({ q: marca, ...qs })).body;
    const nombres = (r: any) => r.users.map((u: any) => u.name.split(' ')[0]).sort();

    it('por nombre: por defecto solo trabajadores, sin baneados', async () => {
      const r = await buscar({});
      expect(r.success).toBe(true);
      expect(nombres(r)).toEqual(['Ana', 'Beto', 'Cora']);
    });

    it('por perfil: clientes o todos', async () => {
      expect(nombres(await buscar({ role: 'client' }))).toEqual(['Beto', 'Cliente']); // «ambos» también es cliente
      expect(nombres(await buscar({ role: 'all' }))).toEqual(['Ana', 'Beto', 'Cliente', 'Cora']);
    });

    it('por rubro: el que lo eligió y quien ofrece «cualquier rubro»', async () => {
      expect(nombres(await buscar({ rubro: 'plomeria' }))).toEqual(['Ana', 'Cora']);
      expect(nombres(await buscar({ rubro: 'electricidad' }))).toEqual(['Beto', 'Cora']);
      // un rubro que no existe no filtra nada
      expect(nombres(await buscar({ rubro: 'inventado' }))).toEqual(['Ana', 'Beto', 'Cora']);
    });

    it('por puntuación mínima', async () => {
      expect(nombres(await buscar({ minRating: '4' }))).toEqual(['Ana', 'Cora']);
      expect(nombres(await buscar({ minRating: '4.5' }))).toEqual(['Ana']);
    });

    it('por ubicación: ciudad, provincia o una zona de trabajo', async () => {
      expect(nombres(await buscar({ location: 'rosario' }))).toEqual(['Ana']);
      expect(nombres(await buscar({ location: 'santa fe' }))).toEqual(['Ana']);
      expect(nombres(await buscar({ location: 'funes' }))).toEqual(['Beto']);
      expect(nombres(await buscar({ location: 'mendoza' }))).toEqual(['Cora']);
    });

    it('ordena por reputación y devuelve la tarjeta sin la calle ni datos de contacto', async () => {
      const r = await buscar({});
      expect(r.users.map((u: any) => u.name.split(' ')[0])).toEqual(['Ana', 'Cora', 'Beto']);
      const ana = r.users[0];
      expect(ana).toMatchObject({ city: 'Rosario', state: 'Santa Fe', rubros: [{ id: 'plomeria', label: 'Plomería' }] });
      const texto = JSON.stringify(r);
      expect(texto).not.toMatch(/Calle Secreta/);
      expect(ana).not.toHaveProperty('email');
      expect(ana).not.toHaveProperty('phone');
      expect(ana).not.toHaveProperty('address');
    });

    it('pagina', async () => {
      const r = await buscar({ limit: '2', page: '2' });
      expect(r.users).toHaveLength(1);
      expect(r.pagination).toMatchObject({ page: 2, total: 3, pages: 2 });
    });
  });

  describe('muro de trabajos: «Para mí»', () => {
    let cliente: any;
    const titulos: string[] = [];
    const trabajo = async (titulo: string, over: Record<string, unknown>) => {
      const j: any = await crearTrabajo(cliente.id, { status: 'open', title: `${titulo} ${marca}`, ...over });
      titulos.push(j.title);
      return j;
    };
    const muro = async (qs: Record<string, string>) => {
      const r = await request(app).get('/api/jobs').query({ status: 'open', query: marca, limit: '50', ...qs });
      return r.body.jobs.map((j: any) => j.title.replace(` ${marca}`, '')).sort();
    };

    beforeAll(async () => {
      cliente = await crearUsuario({ role: 'client' });
      creados.push(cliente.id);
      // Rosario (-32.95, -60.64), Funes (-32.92, -60.81, a ~16 km), Córdoba (-31.42, -64.18, lejos)
      await trabajo('Plomería en Rosario', { category: 'plomeria', location: 'Rosario, Santa Fe', latitude: -32.95, longitude: -60.64 });
      await trabajo('Pintura en Funes', { category: 'pintura', location: 'Funes, Santa Fe', latitude: -32.92, longitude: -60.81 });
      await trabajo('Plomería en Córdoba', { category: 'plomeria', location: 'Córdoba, Córdoba', latitude: -31.42, longitude: -64.18 });
      await trabajo('Electricidad sin coordenadas', { category: 'electricidad', location: 'Rosario, Santa Fe' });
    });

    it('por rubros: solo los trabajos de esos rubros (los rubros que no existen se ignoran)', async () => {
      expect(await muro({ categories: 'plomeria' })).toEqual(['Plomería en Córdoba', 'Plomería en Rosario']);
      expect(await muro({ categories: 'plomeria,pintura,inventado' })).toEqual(['Pintura en Funes', 'Plomería en Córdoba', 'Plomería en Rosario']);
      expect((await muro({ categories: 'inventado' })).length).toBe(4); // sin rubros válidos no filtra
    });

    it('por zona (nombre): el lugar aparece en la ubicación del trabajo, con cualquier mayúscula o puntuación', async () => {
      expect(await muro({ zones: 'rosario' })).toEqual(['Electricidad sin coordenadas', 'Plomería en Rosario']);
      expect(await muro({ zones: 'Funes|Córdoba' })).toEqual(['Pintura en Funes', 'Plomería en Córdoba']);
    });

    it('por radio: dentro de los km desde el punto base (distancia real), o por nombre de zona; las dos cosas suman', async () => {
      // desde Rosario, 25 km: Rosario y Funes entran, Córdoba no
      expect(await muro({ nearLat: '-32.95', nearLng: '-60.64', radiusKm: '25' })).toEqual(['Pintura en Funes', 'Plomería en Rosario']);
      // 5 km: solo Rosario
      expect(await muro({ nearLat: '-32.95', nearLng: '-60.64', radiusKm: '5' })).toEqual(['Plomería en Rosario']);
      // radio + una zona por nombre (Córdoba) + rubro
      expect(await muro({ nearLat: '-32.95', nearLng: '-60.64', radiusKm: '5', zones: 'Córdoba', categories: 'plomeria' })).toEqual(['Plomería en Córdoba', 'Plomería en Rosario']);
    });

    it('un punto o radio inválido no filtra nada', async () => {
      expect((await muro({ nearLat: '999', nearLng: '0', radiusKm: '10' })).length).toBe(4);
      expect((await muro({ nearLat: '-32.95', nearLng: '-60.64', radiusKm: '0' })).length).toBe(4);
    });
  });

  describe('punto base de la zona', () => {
    it('se guarda redondeado a ~1 km, no sale en el perfil público y un punto inválido lo borra', async () => {
      const u: any = await crearUsuario({ role: 'doer', username: `pt${marca.toLowerCase()}` });
      creados.push(u.id);
      await request(app).put('/api/auth/settings').set(como(u)).send({ workLatitude: -32.951234, workLongitude: -60.641234 });
      let g: any = await User.findByPk(u.id);
      expect([g.workLatitude, g.workLongitude]).toEqual([-32.95, -60.64]);
      const publico = await request(app).get(`/api/users/u/${u.username}`);
      expect(JSON.stringify(publico.body)).not.toMatch(/workLatitude|workLongitude/);
      await request(app).put('/api/auth/settings').set(como(u)).send({ workLatitude: 500, workLongitude: 0 });
      g = await User.findByPk(u.id);
      expect(g.workLatitude).toBeNull();
    });
  });
});
