import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Configuración → Seguridad:
 *  - «No recuerdo mi contraseña actual»: un código de 6 números al correo (15 min, un uso, 5 intentos, 60 s entre envíos);
 *  - enlazar Google o X a una cuenta creada con contraseña, sin que un enlace ajeno pueda enlazar el Google de otra persona.
 */

process.env.GOOGLE_CLOUD_AUTH_ID = 'id-de-prueba';
process.env.GOOGLE_CLOUD_AUTH_PASS = 'clave-de-prueba';

const correos: any[] = [];
(globalThis as any).__correosDePrueba = correos;

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy(
    {},
    {
      get: (_t, nombre) => async (...args: any[]) => {
        (globalThis as any).__correosDePrueba.push([String(nombre), ...args]);
        return true;
      },
    },
  ),
}));

import { User } from '../../server/models/sql/User.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { RefreshToken } from '../../server/models/sql/RefreshToken.model.js';
import { generateRefreshToken } from '../../server/utils/tokens.js';
import { crearUsuario } from '../helpers/fixtures.js';
import {
  emitirCodigoDeClave,
  verificarCodigoDeClave,
  _vaciarCodigosDeClave,
  VIGENCIA_DEL_CODIGO_MS,
  ESPERA_PARA_REENVIAR_MS,
  INTENTOS_MAXIMOS,
} from '../../server/services/codigoDeCambioDeClave.js';
import { COOKIE_DE_VINCULO, emitirVinculo, leerVinculo, vincularCuenta } from '../../server/services/vincularCuentaSocial.js';

describe('código para cambiar la contraseña (servicio)', () => {
  beforeEach(() => _vaciarCodigosDeClave());

  it('el código tiene 6 números y se gasta al usarlo bien', () => {
    const r = emitirCodigoDeClave('u1') as { codigo: string };
    expect(r.codigo).toMatch(/^\d{6}$/);
    expect(verificarCodigoDeClave('u1', r.codigo)).toBe('ok');
    expect(verificarCodigoDeClave('u1', r.codigo)).toBe('sin_codigo');
  });

  it('es de esa cuenta: el código de otra no sirve', () => {
    const a = emitirCodigoDeClave('ana') as { codigo: string };
    emitirCodigoDeClave('beto');
    expect(verificarCodigoDeClave('beto', a.codigo)).toBe('incorrecto');
  });

  it('vence a los 15 minutos', () => {
    const t0 = 1_000_000;
    const r = emitirCodigoDeClave('u1', t0) as { codigo: string };
    expect(verificarCodigoDeClave('u1', r.codigo, t0 + VIGENCIA_DEL_CODIGO_MS + 1)).toBe('sin_codigo');
    const d = emitirCodigoDeClave('u2', t0) as { codigo: string };
    expect(verificarCodigoDeClave('u2', d.codigo, t0 + VIGENCIA_DEL_CODIGO_MS - 1)).toBe('ok');
  });

  it('5 intentos equivocados lo anulan, aunque después se escriba el bueno', () => {
    const r = emitirCodigoDeClave('u1') as { codigo: string };
    const malo = r.codigo === '000000' ? '111111' : '000000';
    for (let i = 1; i < INTENTOS_MAXIMOS; i++) expect(verificarCodigoDeClave('u1', malo)).toBe('incorrecto');
    expect(verificarCodigoDeClave('u1', malo)).toBe('bloqueado');
    expect(verificarCodigoDeClave('u1', r.codigo)).toBe('sin_codigo');
  });

  it('no se puede pedir otro antes de 60 segundos; después sí, y el anterior deja de servir', () => {
    const t0 = 5_000_000;
    const a = emitirCodigoDeClave('u1', t0) as { codigo: string };
    expect(emitirCodigoDeClave('u1', t0 + 10_000)).toEqual({ esperarSegundos: 50 });
    const b = emitirCodigoDeClave('u1', t0 + ESPERA_PARA_REENVIAR_MS) as { codigo: string };
    if (a.codigo !== b.codigo) expect(verificarCodigoDeClave('u1', a.codigo, t0 + ESPERA_PARA_REENVIAR_MS + 1)).toBe('incorrecto');
  });

  it('lo que no es un código de 6 números nunca coincide', () => {
    emitirCodigoDeClave('u1');
    for (const malo of [undefined, null, '', 'abcdef', '12345', '1234567', 123456, { a: 1 }]) expect(verificarCodigoDeClave('u1', malo)).not.toBe('ok');
  });
});

describe('vincular Google o X (servicio)', () => {
  it('el enlace solo sirve con el token Y la cookie del navegador que lo empezó', () => {
    const { token, nonce } = emitirVinculo('u1', 'google');
    expect(leerVinculo(token, nonce, 'google')).toBe('u1');
    expect(leerVinculo(token, 'otro-nonce', 'google')).toBeNull(); // otro navegador (enlace pasado a una víctima)
    expect(leerVinculo(token, undefined, 'google')).toBeNull();
    expect(leerVinculo(token, nonce, 'twitter')).toBeNull(); // token de otro proveedor
    expect(leerVinculo('basura', nonce, 'google')).toBeNull();
    expect(leerVinculo(undefined, nonce, 'google')).toBeNull();
  });

  it('un token de sesión común no se puede usar como enlace', () => {
    const sesion = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
    expect(leerVinculo(sesion, 'x', 'google')).toBeNull();
  });

  it('enlaza, avisa que ya estaba, no toma el de otra cuenta ni pisa uno distinto, y deja anotado', async () => {
    const u: any = await crearUsuario({});
    const idExterno = `g-${Math.random().toString(36).slice(2)}`;
    expect(await vincularCuenta(u.id, 'google', idExterno, { avatar: 'https://x/y.png' })).toBe('ok');
    const g: any = await User.findByPk(u.id);
    expect(g.googleId).toBe(idExterno);
    expect(await vincularCuenta(u.id, 'google', idExterno)).toBe('ya_vinculada');
    expect(await vincularCuenta(u.id, 'google', 'otro-id')).toBe('otra_cuenta_vinculada');
    const otra: any = await crearUsuario({});
    expect(await vincularCuenta(otra.id, 'google', idExterno)).toBe('en_uso');
    expect(((await User.findByPk(otra.id)) as any).googleId ?? null).toBeNull();
    expect(await AuditLog.count({ where: { action: 'ACCOUNT_SOCIAL_LINKED', targetId: String(u.id) } })).toBe(1);
    expect(await vincularCuenta('00000000-0000-4000-8000-000000000000', 'google', 'x')).toBe('sin_usuario');
    expect(await vincularCuenta(u.id, 'google', '')).toBe('sin_usuario');
  });
});

describe('rutas de seguridad', () => {
  let app: Express;
  const secreto = () => process.env.JWT_SECRET || 'test-secret';
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, secreto())}` });
  const ultimoCodigo = () => {
    const c = [...correos].reverse().find((x) => x[0] === 'sendPasswordCodeEmail');
    return c ? String(c[3]) : null;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });
  beforeEach(() => {
    _vaciarCodigosDeClave();
    correos.length = 0;
  });

  async function conClave() {
    const u: any = await crearUsuario({});
    await u.reload();
    u.password = 'clave-vieja-123';
    await u.save();
    return u;
  }

  it('«no recuerdo mi contraseña»: el código llega al correo, nunca en la respuesta, y cambia la clave', async () => {
    const u = await conClave();
    const r = await request(app).post('/api/auth/password/send-code').set(con(u));
    expect(r.status).toBe(200);
    const codigo = ultimoCodigo();
    expect(codigo).toMatch(/^\d{6}$/);
    expect(JSON.stringify(r.body)).not.toContain(codigo as string);
    expect(r.body.message).toMatch(/\*\*\*@/); // correo enmascarado

    const mal = await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ code: codigo === '000000' ? '111111' : '000000', newPassword: 'clave-nueva-456' });
    expect(mal.status).toBe(400);
    expect(mal.body.code).toBe('INCORRECTO');

    const sesionAbierta = await generateRefreshToken(String(u.id), '1.2.3.4', 'prueba');
    const bien = await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ code: codigo, newPassword: 'clave-nueva-456' });
    expect(bien.status).toBe(200);
    expect(bien.body.logout).toBe(true);
    // todas las demás sesiones (los tokens de renovación) quedan cerradas
    expect(((await RefreshToken.findOne({ where: { token: sesionAbierta } })) as any).isRevoked).toBe(true);
    const g: any = await User.findByPk(u.id);
    expect(await g.comparePassword('clave-nueva-456')).toBe(true);
    expect(await g.comparePassword('clave-vieja-123')).toBe(false);
    expect(correos.some((x) => x[0] === 'sendPasswordChangedEmail')).toBe(true);

    // el código ya se usó
    const otra = await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ code: codigo, newPassword: 'clave-nueva-789' });
    expect(otra.status).toBe(400);
  });

  it('pedir otro código enseguida da 429; sin código o con clave corta se rechaza', async () => {
    const u = await conClave();
    expect((await request(app).post('/api/auth/password/send-code').set(con(u))).status).toBe(200);
    const seguido = await request(app).post('/api/auth/password/send-code').set(con(u));
    expect(seguido.status).toBe(429);
    expect(seguido.body.esperarSegundos).toBeGreaterThan(0);
    expect((await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ code: ultimoCodigo(), newPassword: '123' })).status).toBe(400);
    expect((await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ newPassword: 'clave-nueva-456' })).status).toBe(400);
  });

  it('5 códigos equivocados lo anulan, y quien no está logueado no puede ni pedirlo', async () => {
    const u = await conClave();
    await request(app).post('/api/auth/password/send-code').set(con(u));
    const real = ultimoCodigo() as string;
    const malo = real === '000000' ? '111111' : '000000';
    let ultimo: any;
    for (let i = 0; i < 5; i++) ultimo = await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ code: malo, newPassword: 'clave-nueva-456' });
    expect(ultimo.body.code).toBe('BLOQUEADO');
    expect((await request(app).post('/api/auth/password/change-with-code').set(con(u)).send({ code: real, newPassword: 'clave-nueva-456' })).status).toBe(400);
    expect(((await User.findByPk(u.id)) as any).comparePassword).toBeTruthy();
    expect((await request(app).post('/api/auth/password/send-code')).status).toBe(401);
  });

  it('una cuenta sin contraseña (solo Google) no usa este camino: tiene «Establecer contraseña»', async () => {
    const u: any = await crearUsuario({});
    await User.update({ password: null as any, googleId: `g-${Math.random()}` } as any, { where: { id: u.id }, hooks: false } as any);
    expect((await request(app).post('/api/auth/password/send-code').set(con(u))).status).toBe(400);
  });

  it('link-start: entrega la dirección con el token y la cookie; no repite si ya está enlazada', async () => {
    const u: any = await crearUsuario({});
    const r = await request(app).post('/api/auth/social/link-start').set(con(u)).send({ provider: 'google' });
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/\/api\/auth\/google\?vincular=/);
    const cookie = (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${COOKIE_DE_VINCULO}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    const token = decodeURIComponent(r.body.url.split('vincular=')[1]);
    const nonce = cookie!.split(';')[0].split('=')[1];
    expect(leerVinculo(token, nonce, 'google')).toBe(String(u.id));

    await User.update({ googleId: 'ya-enlazada' } as any, { where: { id: u.id } });
    expect((await request(app).post('/api/auth/social/link-start').set(con(u)).send({ provider: 'google' })).status).toBe(400);
    expect((await request(app).post('/api/auth/social/link-start').set(con(u)).send({ provider: 'facebook' })).status).toBe(400);
    expect((await request(app).post('/api/auth/social/link-start').send({ provider: 'google' })).status).toBe(401);
  });

  it('has-password dice qué cuentas hay enlazadas', async () => {
    const u: any = await crearUsuario({});
    await User.update({ googleId: 'g-1' } as any, { where: { id: u.id } });
    const r = await request(app).get('/api/auth/has-password').set(con(u));
    expect(r.body.linked).toEqual({ google: true, twitter: false, facebook: false });
  });

  it('el callback de Google enlaza sin emitir sesión, y la estrategia no crea cuentas en modo vincular', async () => {
    const passport = (await import('../../server/config/passport.js')).default as any;
    const estrategia = passport._strategy('google');
    const u: any = await crearUsuario({});
    const { token, nonce } = emitirVinculo(String(u.id), 'google');
    const antes = await User.count();
    const hacer = (cookies: any) => new Promise<any>((resolve) => estrategia._verify({ query: { state: `link:${token}` }, cookies }, 'a', 'r', { id: 'g-nuevo', emails: [{ value: 'otra-persona@example.com' }], photos: [] }, (e: any, user: any) => resolve({ e, user })));
    const ok = await hacer({ [COOKIE_DE_VINCULO]: nonce });
    expect(ok.user).toMatchObject({ __vincular: true, userId: String(u.id), googleId: 'g-nuevo' });
    const otroNavegador = await hacer({ [COOKIE_DE_VINCULO]: 'otro' });
    expect(otroNavegador.user).toMatchObject({ __vincular: true, userId: null });
    expect(await User.count()).toBe(antes); // ni creó una cuenta ni enlazó por correo

    const auth = readFileSync(join(process.cwd(), 'server/routes/auth.ts'), 'utf8');
    expect(auth).toMatch(/if \(user\?\.__vincular\) \{[\s\S]{0,900}vincularCuenta\(user\.userId, "google"[\s\S]{0,400}return;\s*\}/);
    expect(auth).toMatch(/twitter_oauth_vincular[\s\S]{0,900}vincularCuenta\(quien, 'twitter'/);
  });
});
