import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * La clave de panel (pedido del dueño, 2026-11-26): para ejercer cualquier rol hace falta, además de la sesión, una clave propia. Por la puerta pública y
 * contra la base real: sin la clave la persona es un usuario común y el panel la rechaza; la clave no se puede adivinar probando; y siempre hay cómo volver
 * a entrar.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
const correos: Array<{ to: string; subject: string; html: string }> = [];
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: (_t, nombre) => (nombre === 'sendEmail' ? async (c: any) => { correos.push(c); return true; } : async () => true) }),
}));

import { AdminPanelKey } from '../../server/models/sql/AdminPanelKey.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { crearUsuario } from '../helpers/fixtures.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261126130000-clave-de-panel.cjs');
const SECRETO = process.env.JWT_SECRET || 'test-secret';
const sesion = (u: any) => jwt.sign({ id: u.id, email: u.email }, SECRETO);
const como = (u: any) => ({ Authorization: `Bearer ${sesion(u)}` });
const CONTRASENA = 'password123';

describe('clave de panel', () => {
  let app: Express;
  const antes = process.env.CLAVE_DE_PANEL_EN_PRUEBAS;

  beforeAll(async () => {
    process.env.CLAVE_DE_PANEL_EN_PRUEBAS = 'si';
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/clave-de-panel', (await import('../../server/routes/claveDePanel.js')).default);
    app.use('/api/admin/tickets', (await import('../../server/routes/admin/tickets.js')).default);
    app.use('/api/admin/roles', (await import('../../server/routes/admin/roles.js')).default);
    app.use('/api/tickets', (await import('../../server/routes/tickets.js')).default);
    app.use('/api/archivo/enlace', (await import('../../server/routes/archivoEnlace.js')).default);
  });
  afterAll(() => {
    if (antes === undefined) delete process.env.CLAVE_DE_PANEL_EN_PRUEBAS;
    else process.env.CLAVE_DE_PANEL_EN_PRUEBAS = antes;
  });

  const conRol = (adminRole = 'support', extra: Record<string, unknown> = {}) => crearUsuario({ adminRole, ...extra });
  const crear = (u: any, cuerpo: any = { contrasena: CONTRASENA }) => request(app).post('/api/clave-de-panel/crear').set(como(u)).send(cuerpo);
  const abrir = (u: any, clave: string, extra: any = {}) => request(app).post('/api/clave-de-panel/abrir').set(como(u)).send({ clave, ...extra });
  const cookieDe = (r: any): string => ([] as string[]).concat(r.headers['set-cookie'] || []).find((c) => c.startsWith('panel=')) || '';
  const panel = (u: any, cookie = '') => request(app).get('/api/admin/tickets').set(como(u)).set('Cookie', cookie ? cookie.split(';')[0] : 'x=1');
  const conClaveAbierta = async (adminRole = 'support') => {
    const u: any = await conRol(adminRole);
    const clave = (await crear(u)).body.data.clave as string;
    const cookie = cookieDe(await abrir(u, clave));
    return { u, clave, cookie };
  };

  it('la migración corre, se puede repetir y la app usa la tabla con su rol', async () => {
    const interfaz = { sequelize: duenoDelEsquema() };
    await migracion.down(interfaz);
    await migracion.up(interfaz);
    await migracion.up(interfaz);
    const u: any = await conRol();
    expect((await crear(u)).status).toBe(200);
  });

  it('sin la clave el panel responde CLAVE_DE_PANEL_REQUERIDA y en el resto de DOAPP es un usuario común; su rol guardado no se toca', async () => {
    const soporte: any = await conRol('support');
    const otra: any = await crearUsuario();
    const ticket: any = await Ticket.create({ ticketNumber: `T-${Date.now()}`, subject: 'Consulta ajena', category: 'support', priority: 'medium', status: 'open', createdBy: otra.id, messages: [] } as any);

    const r = await panel(soporte);
    expect([r.status, r.body.code]).toEqual([403, 'CLAVE_DE_PANEL_REQUERIDA']);
    expect([403, 404]).toContain((await request(app).get(`/api/tickets/${ticket.id}`).set(como(soporte))).status);
    const lista = await request(app).get('/api/tickets').set(como(soporte));
    expect(JSON.stringify(lista.body)).not.toContain(ticket.id);
    expect((await User.findByPk(soporte.id))?.adminRole).toBe('support');

    // Con la clave puesta, la misma persona ve ese ticket: la diferencia la hace la clave.
    const clave = (await crear(soporte)).body.data.clave;
    const cookie = cookieDe(await abrir(soporte, clave)).split(';')[0];
    expect((await request(app).get(`/api/tickets/${ticket.id}`).set(como(soporte)).set('Cookie', cookie)).status).toBe(200);
  });

  it('crear: pide la contraseña de la cuenta, entrega una clave extremadamente segura UNA vez y guarda solo su hash', async () => {
    const u: any = await conRol();
    expect((await crear(u, { contrasena: 'otra' })).status).toBe(400); // 400: un 401 mandaría a la persona al ingreso
    const r = await crear(u);
    const clave: string = r.body.data.clave;
    expect(clave).toHaveLength(32);
    for (const grupo of [/[A-Z]/, /[a-z]/, /[2-9]/, /[!#$%*+\-=?@_]/]) expect(clave).toMatch(grupo);
    expect(r.headers['cache-control']).toBe('no-store');
    const fila: any = await AdminPanelKey.findByPk(u.id);
    expect(fila.keyHash).toMatch(/^\$2[aby]\$12\$/);
    expect(JSON.stringify(fila.toJSON())).not.toContain(clave);
    expect((await crear(u)).status).toBe(409);
    const estado = await request(app).get('/api/clave-de-panel/estado').set(como(u));
    expect(estado.body.data).toMatchObject({ exigida: true, creada: true, abierta: false });
  });

  it('quien no tiene un rol no tiene clave de panel', async () => {
    const u: any = await crearUsuario();
    expect((await crear(u)).status).toBe(403);
  });

  it('al ponerla se abre el panel con una cookie que ningún script lee; en la web el pase no viaja en la respuesta y la app lo manda en una cabecera', async () => {
    const u: any = await conRol();
    const clave = (await crear(u)).body.data.clave;
    const r = await abrir(u, clave);
    expect(r.status).toBe(200);
    expect(r.body.data.pase).toBeUndefined();
    expect(cookieDe(r)).toMatch(/HttpOnly/i);
    expect((await panel(u, cookieDe(r))).status).toBe(200);

    const deLaApp = await abrir(u, clave, { paraLaApp: true });
    const pase = deLaApp.body.data.pase;
    expect((await request(app).get('/api/admin/tickets').set(como(u)).set('X-Clave-De-Panel', pase)).status).toBe(200);
    // El pase no sirve de sesión, ni para otra persona.
    expect((await request(app).get('/api/admin/tickets').set({ Authorization: `Bearer ${pase}` }).set('X-Clave-De-Panel', pase)).status).toBe(401);
    const otra: any = await conRol();
    expect((await panel(otra, cookieDe(r))).status).toBe(403);
  });

  it('adivinar no sirve: al quinto intento se traba, y ni la correcta entra hasta que pase el tiempo', async () => {
    const u: any = await conRol();
    const clave = (await crear(u)).body.data.clave;
    const estados: number[] = [];
    for (let i = 0; i < 5; i++) estados.push((await abrir(u, `mala-${i}`)).status);
    expect(estados).toEqual([400, 400, 400, 400, 429]);
    expect((await abrir(u, clave)).status).toBe(429);
    await AdminPanelKey.update({ lockedUntil: new Date(Date.now() - 1000) } as any, { where: { userId: u.id } });
    expect((await abrir(u, clave)).status).toBe(200);
  });

  it('veinte intentos a la vez no prueban más de cinco claves', async () => {
    const u: any = await conRol();
    await crear(u);
    const respuestas = await Promise.all(Array.from({ length: 20 }, (_, i) => abrir(u, `a-la-vez-${i}`)));
    expect(respuestas.filter((r) => r.status === 400).length).toBeLessThanOrEqual(5);
    expect(respuestas.every((r) => r.status === 400 || r.status === 429)).toBe(true);
  });

  it('cambiarla o cerrar todas las sesiones deja sin efecto lo que estaba abierto', async () => {
    const { u, clave, cookie } = await conClaveAbierta();
    const nueva = await request(app).post('/api/clave-de-panel/cambiar').set(como(u)).send({ claveActual: clave });
    expect(nueva.status).toBe(200);
    expect(nueva.body.data.clave).not.toBe(clave);
    expect((await panel(u, cookie)).status).toBe(403);
    expect((await abrir(u, clave)).status).toBe(400);

    const otraVez = cookieDe(await abrir(u, nueva.body.data.clave));
    expect((await panel(u, otraVez)).status).toBe(200);
    await User.update({ tokensValidAfter: new Date(Date.now() + 5_000) } as any, { where: { id: u.id } });
    const sesionNueva = jwt.sign({ id: u.id, email: u.email, iat: Math.floor(Date.now() / 1000) + 6 }, SECRETO);
    const r = await request(app).get('/api/admin/tickets').set({ Authorization: `Bearer ${sesionNueva}` }).set('Cookie', otraVez.split(';')[0]);
    expect([r.status, r.body.code]).toEqual([403, 'CLAVE_DE_PANEL_REQUERIDA']);
  });

  it('recuperarla pide el código del correo Y la contraseña de la cuenta, y el código sirve una vez', async () => {
    const { u, clave, cookie } = await conClaveAbierta();
    correos.length = 0;
    expect((await request(app).post('/api/clave-de-panel/pedir-codigo').set(como(u)).send({})).status).toBe(200);
    const codigo = correos[0].html.match(/>([0-9A-F]{10})</)![1];
    const recuperar = (cuerpo: any) => request(app).post('/api/clave-de-panel/recuperar').set(como(u)).send(cuerpo);
    expect((await recuperar({ codigo })).status).toBe(400);
    expect((await recuperar({ contrasena: CONTRASENA, codigo: '0000000000' })).status).toBe(400);
    const r = await recuperar({ contrasena: CONTRASENA, codigo });
    expect(r.status).toBe(200);
    expect(r.body.data.clave).not.toBe(clave);
    expect((await panel(u, cookie)).status).toBe(403);
    expect((await recuperar({ contrasena: CONTRASENA, codigo })).status).toBe(400);
  });

  it('el owner (con SU panel abierto) puede reiniciar la de otra persona; nadie más', async () => {
    const afectada = await conClaveAbierta('support');
    const superAdmin = await conClaveAbierta('super_admin');
    const dueno = await conClaveAbierta('owner');
    const reiniciar = (quien: { u: any; cookie: string }, id: string, conCookie = true) =>
      request(app).post(`/api/admin/roles/${id}/reiniciar-clave-de-panel`).set(como(quien.u)).set('Cookie', conCookie ? quien.cookie.split(';')[0] : 'x=1').send({});
    expect((await reiniciar(superAdmin, afectada.u.id)).status).toBe(403);
    expect((await reiniciar(dueno, afectada.u.id, false)).body.code).toBe('CLAVE_DE_PANEL_REQUERIDA');
    expect((await reiniciar(dueno, dueno.u.id)).status).toBe(400);
    expect((await reiniciar(dueno, afectada.u.id)).status).toBe(200);
    expect((await panel(afectada.u, afectada.cookie)).status).toBe(403);
    expect((await crear(afectada.u)).status).toBe(200);
  });

  it('los archivos privados de otras personas tampoco se abren sin la clave', async () => {
    const { u, cookie } = await conClaveAbierta('support');
    const pedir = (c: string) => request(app).get('/api/archivo/enlace?ruta=disputes/prueba-ajena.png').set(como(u)).set('Cookie', c);
    expect((await pedir('x=1')).status).toBe(403);
    expect((await pedir(cookie.split(';')[0])).status).toBe(200);
  });

  it('todas las rutas de /api/admin pasan por protect, que es quien pide la clave', () => {
    const carpeta = path.join(process.cwd(), 'server', 'routes', 'admin');
    const sinProtect = fs.readdirSync(carpeta).filter((f) => f.endsWith('.ts') && !/\bprotect\b/.test(fs.readFileSync(path.join(carpeta, f), 'utf8')));
    expect(sinProtect).toEqual([]);
  });
});
