import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Enlazar Google o X desde la APP del celular.
 *
 * El navegador del teléfono no tiene la cookie que ata el enlace en la web, así que el callback NO enlaza: deja un código de un solo
 * uso y la app lo confirma con su propia sesión. Un enlace pasado a otra persona («enlace forzado») no puede enlazar nada, porque el
 * código solo lo acepta quien empezó el enlace.
 */

process.env.GOOGLE_CLOUD_AUTH_ID = 'id-de-prueba';
process.env.GOOGLE_CLOUD_AUTH_PASS = 'clave-de-prueba';

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
import {
  COOKIE_DE_VINCULO,
  canjearVinculoPendiente,
  emitirVinculo,
  emitirVinculoDeApp,
  guardarVinculoPendiente,
  leerVinculo,
  leerVinculoDeApp,
  _vaciarVinculosPendientes,
} from '../../server/services/vincularCuentaSocial.js';

describe('enlace desde la app (servicio)', () => {
  beforeEach(() => _vaciarVinculosPendientes());

  it('el token de la app solo lo lee leerVinculoDeApp, y el de la web solo leerVinculo (no se mezclan)', () => {
    const app = emitirVinculoDeApp('u1', 'google');
    expect(leerVinculoDeApp(app, 'google')).toBe('u1');
    expect(leerVinculoDeApp(app, 'twitter')).toBeNull(); // de otro proveedor
    expect(leerVinculo(app, 'cualquier-nonce', 'google')).toBeNull(); // sin nonce en el token, la web no lo acepta
    const web = emitirVinculo('u1', 'google');
    expect(leerVinculoDeApp(web.token, 'google')).toBeNull(); // un enlace de la web no pasa por la app
    expect(leerVinculoDeApp('basura', 'google')).toBeNull();
    expect(leerVinculoDeApp(undefined, 'google')).toBeNull();
    const sesion = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
    expect(leerVinculoDeApp(sesion, 'google')).toBeNull();
  });

  it('el código se canjea una sola vez y solo por quien empezó el enlace', () => {
    const c = guardarVinculoPendiente('ana', 'google', 'g-1', 'https://x/y.png');
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(canjearVinculoPendiente(c, 'beto')).toBeNull(); // otra persona: no sirve…
    expect(canjearVinculoPendiente(c, 'ana')).toBeNull(); // …y se gastó: tampoco le queda a la dueña

    const d = guardarVinculoPendiente('ana', 'twitter', 'x-1');
    expect(canjearVinculoPendiente(d, 'ana')).toMatchObject({ userId: 'ana', proveedor: 'twitter', idExterno: 'x-1' });
    expect(canjearVinculoPendiente(d, 'ana')).toBeNull();
  });

  it('vence a los 5 minutos y lo que no tiene forma de código no se acepta', () => {
    const t0 = 1_000_000;
    const c = guardarVinculoPendiente('ana', 'google', 'g-1', undefined, t0);
    expect(canjearVinculoPendiente(c, 'ana', t0 + 5 * 60 * 1000 + 1)).toBeNull();
    const d = guardarVinculoPendiente('ana', 'google', 'g-1', undefined, t0);
    expect(canjearVinculoPendiente(d, 'ana', t0 + 299_000)).not.toBeNull();
    for (const malo of [undefined, null, '', 'abc', 123, {}, 'z'.repeat(64), 'A'.repeat(64)]) {
      expect(canjearVinculoPendiente(malo, 'ana')).toBeNull();
    }
  });
});

describe('enlace desde la app (rutas)', () => {
  let app: Express;
  const secreto = () => process.env.JWT_SECRET || 'test-secret';
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, secreto())}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });
  beforeEach(() => _vaciarVinculosPendientes());

  it('link-start con origen app: da la dirección con el token de la app y NO pone cookie', async () => {
    const u: any = await crearUsuario({});
    const r = await request(app).post('/api/auth/social/link-start').set(con(u)).send({ provider: 'google', origen: 'app' });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/\/api\/auth\/google\?vincular=/);
    const cookies = (r.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(cookies.some((c) => c.startsWith(`${COOKIE_DE_VINCULO}=`))).toBe(false);
    expect(leerVinculoDeApp(decodeURIComponent(r.body.url.split('vincular=')[1]), 'google')).toBe(String(u.id));
  });

  it('link-confirm: enlaza la cuenta de quien empezó, una sola vez', async () => {
    const u: any = await crearUsuario({});
    const id = `g-${Math.random().toString(36).slice(2)}`;
    const codigo = guardarVinculoPendiente(String(u.id), 'google', id);
    const r = await request(app).post('/api/auth/social/link-confirm').set(con(u)).send({ codigo });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, proveedor: 'google' });
    expect(((await User.findByPk(u.id)) as any).googleId).toBe(id);
    // el mismo código no sirve otra vez
    expect((await request(app).post('/api/auth/social/link-confirm').set(con(u)).send({ codigo })).status).toBe(400);
  });

  it('enlace forzado: si lo confirma OTRA persona (la víctima), no se enlaza nada', async () => {
    const atacante: any = await crearUsuario({});
    const victima: any = await crearUsuario({});
    const codigo = guardarVinculoPendiente(String(atacante.id), 'google', 'google-de-la-victima');
    const r = await request(app).post('/api/auth/social/link-confirm').set(con(victima)).send({ codigo });
    expect(r.status).toBe(400);
    expect(((await User.findByPk(atacante.id)) as any).googleId ?? null).toBeNull();
    expect(((await User.findByPk(victima.id)) as any).googleId ?? null).toBeNull();
    // y el código quedó gastado: el atacante tampoco lo puede usar después
    expect((await request(app).post('/api/auth/social/link-confirm').set(con(atacante)).send({ codigo })).status).toBe(400);
  });

  it('link-confirm: sin sesión no se puede, y una cuenta de Google de otra persona se rechaza (409)', async () => {
    const u: any = await crearUsuario({});
    const otra: any = await crearUsuario({});
    const id = `g-${Math.random().toString(36).slice(2)}`;
    await User.update({ googleId: id } as any, { where: { id: otra.id } });
    const codigo = guardarVinculoPendiente(String(u.id), 'google', id);
    expect((await request(app).post('/api/auth/social/link-confirm').send({ codigo })).status).toBe(401);
    const r = await request(app).post('/api/auth/social/link-confirm').set(con(u)).send({ codigo });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('en_uso');
  });

  it('la estrategia de Google reconoce el enlace de la app sin cookie, y no crea cuentas', async () => {
    const passport = (await import('../../server/config/passport.js')).default as any;
    const estrategia = passport._strategy('google');
    const u: any = await crearUsuario({});
    const token = emitirVinculoDeApp(String(u.id), 'google');
    const antes = await User.count();
    const r = await new Promise<any>((resolve) =>
      estrategia._verify({ query: { state: `link:${token}` }, cookies: {} }, 'a', 'r', { id: 'g-app', emails: [{ value: 'otra@example.com' }], photos: [] }, (e: any, user: any) => resolve({ e, user })),
    );
    expect(r.user).toMatchObject({ __vincular: true, __app: true, userId: String(u.id), googleId: 'g-app' });
    expect(await User.count()).toBe(antes);
    // un enlace de la web sigue exigiendo su cookie
    const web = emitirVinculo(String(u.id), 'google');
    const sinCookie = await new Promise<any>((resolve) =>
      estrategia._verify({ query: { state: `link:${web.token}` }, cookies: {} }, 'a', 'r', { id: 'g-web', photos: [] }, (e: any, user: any) => resolve({ e, user })),
    );
    expect(sinCookie.user).toMatchObject({ __vincular: true, __app: false, userId: null });
  });

  it('los callbacks de Google y X, desde la app, dejan un código y NO enlazan por su cuenta', () => {
    const auth = readFileSync(join(process.cwd(), 'server/routes/auth.ts'), 'utf8');
    // Google: la rama de la app devuelve antes de llegar a vincularCuenta
    expect(auth).toMatch(/if \(user\.__app\) \{[\s\S]{0,500}guardarVinculoPendiente\([\s\S]{0,200}return;\s*\}[\s\S]{0,400}vincularCuenta\(user\.userId, "google"/);
    // X: idem, antes de leer la cookie de la web
    expect(auth).toMatch(/leerVinculoDeApp\(vinculo, 'twitter'\)[\s\S]{0,400}guardarVinculoPendiente\([\s\S]{0,300}return;\s*\}[\s\S]{0,300}leerVinculo\(vinculo, req\.cookies/);
  });
});
