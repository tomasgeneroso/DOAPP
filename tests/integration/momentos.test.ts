import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * Momentos importantes, por la puerta pública y contra la base real. Lo que más se cuida: las fotos de entrega son privadas y solo se publican si las dos
 * partes aceptan; y la migración corre de verdad.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { sequelize } from '../../server/config/database.js';
import { UserMoment } from '../../server/models/sql/UserMoment.model.js';
import { BeforeAfterShare } from '../../server/models/sql/BeforeAfterShare.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { Post } from '../../server/models/sql/Post.model.js';
import { Proposal } from '../../server/models/sql/Proposal.model.js';
import { avisarPublicacionesSinPostulaciones } from '../../server/jobs/avisoSinPostulaciones.js';
import { cambioVigente, claveDelCambio } from '../../shared/legal/cambiosDePoliticas.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261126110000-momentos.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracionDelConsentimiento = require('../../migrations/20261126120000-consentimiento-de-fotos.cjs');
const SECRETO = process.env.JWT_SECRET || 'test-secret';
const como = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, SECRETO)}` });
const SUBIDAS = path.join(process.cwd(), 'uploads');

describe('momentos importantes', () => {
  let app: Express;
  const creados: string[] = [];
  const archivo = (carpeta: string, nombre: string) => {
    const ruta = path.join(SUBIDAS, carpeta, nombre);
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, 'foto de prueba');
    creados.push(ruta);
    return `/uploads/${carpeta}/${nombre}`;
  };
  const copiasPublicas = () => (fs.existsSync(path.join(SUBIDAS, 'post-media')) ? fs.readdirSync(path.join(SUBIDAS, 'post-media')).filter((f) => f.startsWith('antes-despues-')) : []);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/momentos', (await import('../../server/routes/momentos.js')).default);
  });
  afterAll(() => {
    for (const f of creados) fs.rmSync(f, { force: true });
  });

  describe('migración', () => {
    it('la columna del consentimiento se crea, se puede repetir y se puede deshacer', async () => {
      const interfaz = { sequelize: duenoDelEsquema() };
      const existe = async () => ((await sequelize.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'photo_consent_at'"))[0] as unknown[]).length;
      await migracionDelConsentimiento.down(interfaz);
      expect(await existe()).toBe(0);
      await migracionDelConsentimiento.up(interfaz);
      await migracionDelConsentimiento.up(interfaz);
      expect(await existe()).toBe(1);
    });

    it('corre, se puede repetir, deja las columnas de los modelos y la app puede usar las tablas con su rol', async () => {
      const interfaz = { sequelize: duenoDelEsquema() };
      await migracion.down(interfaz);
      await migracion.up(interfaz);
      await migracion.up(interfaz);
      for (const modelo of [UserMoment, BeforeAfterShare] as any[]) {
        const [filas]: any = await sequelize.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = :t ORDER BY column_name', { replacements: { t: modelo.getTableName() } });
        expect(filas.map((f: any) => f.column_name)).toEqual(Object.values(modelo.rawAttributes).map((a: any) => a.field).sort());
        await expect(modelo.count()).resolves.toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('cartel de cambios de políticas', () => {
    it('una cuenta nueva no lo recibe; una que ya existía lo ve una vez y no vuelve', async () => {
      const nueva: any = await crearUsuario();
      expect((await request(app).get('/api/momentos').set(como(nueva))).body.data.cambioDePoliticas).toBeNull();

      const vieja: any = await crearUsuario();
      await UserMoment.destroy({ where: { userId: vieja.id } });
      const antes = await request(app).get('/api/momentos').set(como(vieja));
      expect(antes.body.data.cambioDePoliticas.version).toBe(cambioVigente().version);
      const clave = claveDelCambio(cambioVigente().version);
      expect((await request(app).post('/api/momentos/visto').set(como(vieja)).send({ clave })).status).toBe(200);
      expect((await request(app).post('/api/momentos/visto').set(como(vieja)).send({ clave })).status).toBe(200);
      expect(await UserMoment.count({ where: { userId: vieja.id, momentKey: clave } })).toBe(1);
      expect((await request(app).get('/api/momentos').set(como(vieja))).body.data.cambioDePoliticas).toBeNull();
    });

    it('no se puede marcar por adelantado un cambio que no existe ni una clave inventada, y pide sesión', async () => {
      const u: any = await crearUsuario();
      for (const clave of [claveDelCambio(cambioVigente().version + 1), 'sin_postulaciones:x', 'cualquiera', 7]) {
        expect([(await request(app).post('/api/momentos/visto').set(como(u)).send({ clave })).status, clave]).toEqual([400, clave]);
      }
      expect((await request(app).get('/api/momentos')).status).toBe(401);
    });
  });

  describe('pregunta de bienvenida', () => {
    const pregunta = async (u: any) => (await request(app).get('/api/momentos').set(como(u))).body.data.bienvenida;

    it('solo en una cuenta nueva que todavía no publicó ni se postuló ni ofrece servicios; al cerrarla no vuelve', async () => {
      const nueva: any = await crearUsuario({ role: 'client' });
      expect(await pregunta(nueva)).toBe(true);
      await request(app).post('/api/momentos/visto').set(como(nueva)).send({ clave: 'bienvenida' });
      expect(await pregunta(nueva)).toBe(false);

      const ofrece: any = await crearUsuario({ role: 'doer' });
      const delEquipo: any = await crearUsuario({ role: 'client', adminRole: 'support' });
      const publico: any = await crearUsuario({ role: 'client' });
      await crearTrabajo(publico.id);
      const vieja: any = await crearUsuario({ role: 'client' });
      await sequelize.query("UPDATE users SET created_at = NOW() - INTERVAL '20 days' WHERE id = :id", { replacements: { id: vieja.id } });
      expect([await pregunta(ofrece), await pregunta(delEquipo), await pregunta(publico), await pregunta(vieja)]).toEqual([false, false, false, false]);
    });
  });

  describe('primer cobro', () => {
    const terminado = async (doer: any, extra: Record<string, unknown> = {}) => {
      const cliente: any = await crearUsuario();
      const t: any = await crearTrabajo(cliente.id, { status: 'completed', title: 'Pintar la reja' });
      return crearContrato({ jobId: t.id, clientId: cliente.id, doerId: doer.id }, { status: 'completed', ...extra });
    };
    const cobro = async (u: any) => (await request(app).get('/api/momentos').set(como(u))).body.data.primerCobro;

    it('terminar no es cobrar: sin la transferencia registrada ni el movimiento en el saldo no hay festejo', async () => {
      const doer: any = await crearUsuario({ role: 'doer' });
      await terminado(doer, { paymentStatus: 'pending_payout' });
      expect(await cobro(doer)).toBeNull();
    });

    it('con la transferencia registrada aparece una vez, sin inventar el monto; al cerrarlo no vuelve', async () => {
      const doer: any = await crearUsuario({ role: 'doer' });
      const c: any = await terminado(doer, { paymentStatus: 'completed', paymentProcessedAt: new Date() });
      expect(await cobro(doer)).toMatchObject({ contractId: c.id, titulo: 'Pintar la reja', via: 'transferencia', monto: null });
      await request(app).post('/api/momentos/visto').set(como(doer)).send({ clave: 'primer_cobro' });
      expect(await cobro(doer)).toBeNull();
    });

    it('acreditado en el saldo dice el monto exacto; con dos trabajos cobrados ya no es el primero', async () => {
      const doer: any = await crearUsuario({ role: 'doer' });
      const c: any = await terminado(doer, { paymentStatus: 'escrow' });
      await BalanceTransaction.create({ userId: doer.id, type: 'payment', status: 'completed', amount: 8500, balanceBefore: 0, balanceAfter: 8500, description: 'Cobro', relatedContractId: c.id } as any);
      expect(await cobro(doer)).toMatchObject({ via: 'saldo', monto: 8500 });
      await terminado(doer, { paymentStatus: 'completed', paymentProcessedAt: new Date() });
      expect(await cobro(doer)).toBeNull();
    });
  });

  describe('resumen anual y cuántas personas ofrecen un rubro', () => {
    it('el resumen cuenta solo lo propio del último año y no trae clientes ni montos', async () => {
      const doer: any = await crearUsuario({ role: 'doer' });
      const cliente: any = await crearUsuario({ name: 'Cliente Reservado' });
      for (const [rubro, hace] of [['pintura', 10], ['pintura', 40], ['limpieza', 100], ['plomeria', 500]] as const) {
        const t: any = await crearTrabajo(cliente.id, { status: 'completed', category: rubro });
        await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: doer.id }, { status: 'completed', price: 77777, actualEndDate: new Date(Date.now() - hace * 86_400_000) });
      }
      const r = await request(app).get('/api/momentos/resumen-anual').set(como(doer));
      expect(r.body.data.trabajosTerminados).toBe(3);
      expect(r.body.data.rubros).toEqual([{ rubro: 'Pintura', cantidad: 2 }, { rubro: 'Limpieza', cantidad: 1 }]);
      expect(r.body.data.calificacionMedia).toBeNull();
      expect(JSON.stringify(r.body)).not.toMatch(/Cliente Reservado|77777/);
    });

    it('con menos de 3 personas no dice cuántas; no cuenta al equipo ni a cuentas suspendidas', async () => {
      const u: any = await crearUsuario();
      const pedir = async () => (await request(app).get('/api/momentos/oferta?rubro=climatizacion').set(como(u))).body.data.personas;
      await crearUsuario({ role: 'doer', workCategories: ['climatizacion'] });
      await crearUsuario({ role: 'both', workCategories: ['climatizacion'] });
      await crearUsuario({ role: 'doer', workCategories: ['climatizacion'], adminRole: 'support' });
      await crearUsuario({ role: 'doer', workCategories: ['climatizacion'], isBanned: true });
      await crearUsuario({ role: 'client', workCategories: ['climatizacion'] });
      expect(await pedir()).toBe(0);
      await crearUsuario({ role: 'doer', workCategories: ['climatizacion', 'pintura'] });
      expect(await pedir()).toBe(3);
      expect((await request(app).get('/api/momentos/oferta?rubro=cualquiera').set(como(u))).status).toBe(400);
    });
  });

  describe('antes y después', () => {
    // Por omisión, un contrato SIN la autorización de la contratación (anterior a T&C 6.8): ahí hace falta que acepte la otra parte.
    const armar = async (extra: Record<string, unknown> = { photoConsentAt: null }) => {
      const cliente: any = await crearUsuario();
      const doer: any = await crearUsuario({ role: 'doer' });
      const ajeno: any = await crearUsuario();
      const sello = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const antes = archivo('job-images', `antes-${sello}.jpg`);
      const despues = archivo('delivery', `despues-${sello}.png`);
      const t: any = await crearTrabajo(cliente.id, { status: 'completed', title: 'Patio nuevo', images: [antes] });
      const c: any = await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: doer.id }, { status: 'completed', deliveryPhotos: [{ url: despues, nombre: 'a.png', bytes: 5, subidoPor: 'worker', subidoPorId: doer.id, subidoEl: new Date().toISOString() }], ...extra });
      const proponer = (quien: any, cuerpo: any = { antes: [antes], despues: [despues], texto: 'Quedó <b>lindo</b>' }) => request(app).post(`/api/momentos/antes-despues/contrato/${c.id}`).set(como(quien)).send(cuerpo);
      const accion = (id: string, que: string, quien: any) => request(app).post(`/api/momentos/antes-despues/${id}/${que}`).set(como(quien));
      return { cliente, doer, ajeno, antes, despues, c, proponer, accion };
    };

    it('quien no es parte no ve ni propone; no se eligen fotos de afuera del trabajo', async () => {
      const x = await armar();
      expect((await request(app).get(`/api/momentos/antes-despues/contrato/${x.c.id}`).set(como(x.ajeno))).status).toBe(404);
      expect((await x.proponer(x.ajeno)).status).toBe(404);
      for (const despues of [['/uploads/delivery/de-otro.png'], ['/uploads/dni/secreto.jpg'], ['/uploads/delivery/../dni/x.jpg'], []]) {
        expect([(await x.proponer(x.doer, { despues })).status, despues]).toEqual([400, despues]);
      }
      expect(await BeforeAfterShare.count({ where: { contractId: x.c.id } })).toBe(0);
    });

    it('proponer NO publica nada: hace falta que acepte la OTRA parte', async () => {
      const x = await armar();
      const antesDeProponer = copiasPublicas().length;
      const p = await x.proponer(x.doer);
      expect(p.status).toBe(200);
      expect(copiasPublicas().length).toBe(antesDeProponer);
      expect(await Post.count({ where: { linkedContract: x.c.id } as any })).toBe(0);
      expect((await x.accion(p.body.data.id, 'aceptar', x.doer)).status).toBe(403);
      expect((await x.accion(p.body.data.id, 'aceptar', x.ajeno)).status).toBe(404);
      expect((await x.proponer(x.cliente)).status).toBe(409);
      expect(await Notification.count({ where: { recipientId: x.cliente.id, relatedId: x.c.id } as any })).toBe(1);
      expect(await Post.count({ where: { linkedContract: x.c.id } as any })).toBe(0);
    });

    it('al aceptar se copian las fotos y se publica UNA vez, aunque se acepte dos veces a la vez; el original sigue en la carpeta privada', async () => {
      const x = await armar();
      const id = (await x.proponer(x.doer)).body.data.id;
      const [a, b] = await Promise.all([x.accion(id, 'aceptar', x.cliente), x.accion(id, 'aceptar', x.cliente)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const posts: any[] = await Post.findAll({ where: { linkedContract: x.c.id } as any });
      expect(posts).toHaveLength(1);
      expect(posts[0].gallery.map((g: any) => g.caption)).toEqual(['Antes', 'Después']);
      for (const g of posts[0].gallery) {
        expect(g.url).toMatch(/^\/uploads\/post-media\/antes-despues-/);
        expect(fs.existsSync(path.join(process.cwd(), g.url))).toBe(true);
        creados.push(path.join(process.cwd(), g.url));
      }
      expect(posts[0].description).toBe('Quedó lindo');
      expect(fs.existsSync(path.join(process.cwd(), x.despues))).toBe(true);

      // Cualquiera de las dos lo retira: se va la publicación y se borran las copias.
      expect((await x.accion(id, 'retirar', x.ajeno)).status).toBe(404);
      expect((await x.accion(id, 'retirar', x.doer)).status).toBe(200);
      expect(await Post.count({ where: { linkedContract: x.c.id } as any })).toBe(0);
      for (const g of posts[0].gallery) expect(fs.existsSync(path.join(process.cwd(), g.url))).toBe(false);
    });

    it('si dice que no, no se publica y se puede volver a proponer', async () => {
      const x = await armar();
      const id = (await x.proponer(x.cliente)).body.data.id;
      expect((await x.accion(id, 'rechazar', x.doer)).status).toBe(200);
      expect((await x.accion(id, 'aceptar', x.doer)).status).toBe(409);
      expect(await Post.count({ where: { linkedContract: x.c.id } as any })).toBe(0);
      expect((await x.proponer(x.doer)).status).toBe(200);
    });

    it('un contrato nuevo nace con la autorización anotada; el que carga un administrador (null explícito) queda sin ella', async () => {
      const x = await armar({});
      await x.c.reload();
      expect(x.c.photoConsentAt).toBeInstanceOf(Date);
      expect((await request(app).get(`/api/momentos/antes-despues/contrato/${x.c.id}`).set(como(x.doer))).body.data.sePublicaDirecto).toBe(true);
      const viejo = await armar();
      await viejo.c.reload();
      expect(viejo.c.photoConsentAt).toBeNull();
      expect((await request(app).get(`/api/momentos/antes-despues/contrato/${viejo.c.id}`).set(como(viejo.doer))).body.data.sePublicaDirecto).toBe(false);
    });

    it('con la autorización publica cualquiera de las dos sin pedir permiso, una sola vez, y avisa a la otra', async () => {
      const x = await armar({});
      const [a, b] = await Promise.all([x.proponer(x.doer), x.proponer(x.cliente)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const salio = a.status === 200 ? a : b;
      expect(salio.body.data.publicacionId).toBeTruthy();
      const posts: any[] = await Post.findAll({ where: { linkedContract: x.c.id } as any });
      expect(posts).toHaveLength(1);
      for (const g of posts[0].gallery) creados.push(path.join(process.cwd(), g.url));
      const laOtra = a.status === 200 ? x.cliente : x.doer;
      expect(await Notification.count({ where: { recipientId: laOtra.id, relatedId: x.c.id, title: 'Se publicó el antes y después' } as any })).toBe(1);
    });

    it('si alguien lo retira, volver a publicarlo necesita que la otra parte acepte', async () => {
      const x = await armar({});
      const id = (await x.proponer(x.doer)).body.data.id;
      for (const g of ((await Post.findOne({ where: { linkedContract: x.c.id } as any })) as any).gallery) creados.push(path.join(process.cwd(), g.url));
      expect((await x.accion(id, 'retirar', x.cliente)).status).toBe(200);
      const otraVez = await x.proponer(x.doer);
      expect(otraVez.status).toBe(200);
      expect(otraVez.body.data.publicacionId).toBeNull();
      expect(await Post.count({ where: { linkedContract: x.c.id } as any })).toBe(0);
      expect((await BeforeAfterShare.findByPk(id))?.status).toBe('pending');
    });

    it('con la autorización, si falta una foto no queda nada a medias y se puede reintentar sin pedir permiso', async () => {
      const x = await armar({});
      const cuantas = copiasPublicas().length;
      fs.rmSync(path.join(process.cwd(), x.despues));
      expect((await x.proponer(x.doer)).status).toBe(500);
      expect(copiasPublicas().length).toBe(cuantas);
      expect(await BeforeAfterShare.count({ where: { contractId: x.c.id } })).toBe(0);
      expect((await request(app).get(`/api/momentos/antes-despues/contrato/${x.c.id}`).set(como(x.doer))).body.data.sePublicaDirecto).toBe(true);
    });

    it('si falta una foto al publicar, no queda nada a medias y se puede reintentar', async () => {
      const x = await armar();
      const id = (await x.proponer(x.doer)).body.data.id;
      const cuantas = copiasPublicas().length;
      fs.rmSync(path.join(process.cwd(), x.despues));
      expect((await x.accion(id, 'aceptar', x.cliente)).status).toBe(500);
      expect(copiasPublicas().length).toBe(cuantas);
      expect(await Post.count({ where: { linkedContract: x.c.id } as any })).toBe(0);
      expect((await BeforeAfterShare.findByPk(id))?.status).toBe('pending');
    });
  });

  describe('aviso a publicaciones sin postulaciones', () => {
    const publicar = async (cliente: any, extra: Record<string, unknown> = {}) => {
      const t: any = await crearTrabajo(cliente.id, { status: 'open', reviewedAt: new Date(Date.now() - 30 * 3_600_000), ...extra });
      return t;
    };
    const avisos = (u: any) => Notification.count({ where: { recipientId: u.id, title: 'Tu publicación puede recibir más respuestas' } as any });

    it('un aviso por publicación y como mucho uno por persona por semana; no avisa si ya tiene postulaciones, es nueva, apagó los avisos o ya empezó', async () => {
      const conDos: any = await crearUsuario();
      await publicar(conDos);
      await publicar(conDos);
      const conPostulacion: any = await crearUsuario();
      const t: any = await publicar(conPostulacion);
      const doer: any = await crearUsuario({ role: 'doer' });
      await Proposal.create({ jobId: t.id, freelancerId: doer.id, clientId: conPostulacion.id, coverLetter: 'Puedo hacerlo esta semana sin problema.', proposedPrice: 1000, estimatedDuration: 2 } as any);
      const reciente: any = await crearUsuario();
      await publicar(reciente, { reviewedAt: new Date() });
      const sinAvisos: any = await crearUsuario({ notificationPreferences: { jobUpdate: false } });
      await publicar(sinAvisos);
      const yaEmpezo: any = await crearUsuario();
      await publicar(yaEmpezo, { startDate: new Date(Date.now() - 3_600_000), endDate: new Date(Date.now() + 3_600_000) });

      await Promise.all([avisarPublicacionesSinPostulaciones(), avisarPublicacionesSinPostulaciones()]);
      await avisarPublicacionesSinPostulaciones();
      expect([await avisos(conDos), await avisos(conPostulacion), await avisos(reciente), await avisos(sinAvisos), await avisos(yaEmpezo)]).toEqual([1, 0, 0, 0, 0]);

      // Pasada la semana le toca a la otra publicación, y a la primera no se le repite.
      await sequelize.query("UPDATE user_moments SET seen_at = seen_at - INTERVAL '8 days' WHERE user_id = :id AND moment_key LIKE 'sin%'", { replacements: { id: conDos.id } });
      await avisarPublicacionesSinPostulaciones();
      await avisarPublicacionesSinPostulaciones();
      expect(await avisos(conDos)).toBe(2);
    });
  });

});
