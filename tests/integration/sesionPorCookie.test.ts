import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import type { AddressInfo } from 'net';
import { io as clienteSocket } from 'socket.io-client';

/**
 * La sesión de la web vive SOLO en la cookie httpOnly (auditoría de seguridad, 2026-11-24).
 * Antes el token de 7 días también quedaba en localStorage (y /auth/me fabricaba uno nuevo en cada llamada): cualquier script de la página se lo llevaba.
 * La web ahora guarda un marcador que no es un token; el servidor usa la cookie y el tiempo real también.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { SocketService } from '../../server/services/socket.js';
import { valorDeCookie } from '../../server/utils/cookieDeSesion.js';

const MARCADOR = 'sesion-en-cookie';

describe('sesión por cookie', () => {
  let app: Express;
  let servidor: http.Server;
  let puerto = 0;
  let persona: any;
  let cookie = '';

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    const { protect } = await import('../../server/middleware/auth.js');
    app.post('/api/_escribir', protect, (_req, res) => { res.json({ success: true }); });
    servidor = http.createServer(app);
    new SocketService(servidor);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    puerto = (servidor.address() as AddressInfo).port;
    persona = await crearUsuario({ role: 'client' });
    const r = await request(app).post('/api/auth/login').send({ email: persona.email, password: 'password123' });
    expect(r.status).toBe(200);
    const setCookie: string[] = (r.headers['set-cookie'] as unknown as string[]) || [];
    cookie = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('token=')) || '';
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
    try { await User.destroy({ where: { id: persona.id }, force: true }); } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('el ingreso deja la sesión en una cookie httpOnly', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: persona.email, password: 'password123' });
    const sesion = ((r.headers['set-cookie'] as unknown as string[]) || []).find((c) => c.startsWith('token=')) || '';
    expect(sesion).toMatch(/HttpOnly/i);
    expect(sesion).toMatch(/SameSite=Lax/i);
  });

  it('/auth/me ya NO devuelve un token (antes fabricaba uno nuevo de 7 días en cada llamada)', async () => {
    const r = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(persona.email);
    expect(r.body.token).toBeUndefined();
  });

  it('con SOLO la cookie y el marcador en «Authorization» (como manda la web) se entra, también a lo que escribe', async () => {
    const lee = await request(app).get('/api/auth/me').set('Cookie', cookie).set('Authorization', `Bearer ${MARCADOR}`);
    expect(lee.status).toBe(200);
    const escribe = await request(app).post('/api/_escribir').set('Cookie', cookie).set('Authorization', `Bearer ${MARCADOR}`).send({});
    expect(escribe.status).toBe(200);
  });

  it('el marcador SIN cookie no es una sesión', async () => {
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${MARCADOR}`)).status).toBe(401);
    expect((await request(app).post('/api/_escribir').set('Authorization', `Bearer ${MARCADOR}`).send({})).status).toBe(401);
  });

  it('una cookie falsa con el marcador tampoco', async () => {
    expect((await request(app).get('/api/auth/me').set('Cookie', 'token=inventado').set('Authorization', `Bearer ${MARCADOR}`)).status).toBe(401);
  });

  describe('tiempo real (socket)', () => {
    const conectar = (opciones: { cookie?: string; token?: string }) =>
      new Promise<{ conectado: boolean; error?: string }>((resolver) => {
        const s = clienteSocket(`http://127.0.0.1:${puerto}`, {
          transports: ['polling'],
          reconnection: false,
          forceNew: true,
          ...(opciones.token ? { auth: { token: opciones.token } } : {}),
          ...(opciones.cookie ? { extraHeaders: { cookie: opciones.cookie } } : {}),
        });
        s.on('connect', () => { s.close(); resolver({ conectado: true }); });
        s.on('connect_error', (e: Error) => { s.close(); resolver({ conectado: false, error: e.message }); });
        setTimeout(() => { s.close(); resolver({ conectado: false, error: 'tiempo agotado' }); }, 6000);
      });

    it('se conecta con la cookie y el marcador en «auth» (lo que hace la web)', async () => {
      expect(await conectar({ cookie, token: MARCADOR })).toEqual({ conectado: true });
    });
    it('se conecta con la cookie sola', async () => {
      expect(await conectar({ cookie })).toEqual({ conectado: true });
    });
    it('con solo el marcador (sin cookie) no se conecta', async () => {
      const r = await conectar({ token: MARCADOR });
      expect(r.conectado).toBe(false);
      expect(r.error).toMatch(/Authentication error/);
    });
    it('la app móvil sigue entrando con su token en «auth»', async () => {
      const real = cookie.replace(/^token=/, '');
      expect(await conectar({ token: real })).toEqual({ conectado: true });
    });
  });

  describe('lectura de la cookie', () => {
    it('toma el valor entre otras cookies, con comillas o codificado', () => {
      expect(valorDeCookie('a=1; token=abc.def.ghi; b=2', 'token')).toBe('abc.def.ghi');
      expect(valorDeCookie('token="x%20y"', 'token')).toBe('x y');
      expect(valorDeCookie('otra=1', 'token')).toBeUndefined();
      expect(valorDeCookie(undefined, 'token')).toBeUndefined();
      expect(valorDeCookie('mitoken=zzz', 'token')).toBeUndefined();
    });
  });
});
