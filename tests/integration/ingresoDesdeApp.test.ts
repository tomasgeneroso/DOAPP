import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ingresar a la APP con Google o X: el servidor no pone la sesión en un enlace `doapp://…` (cualquier otra app con el mismo
 * esquema la recibiría); entrega un código de 2 minutos y un solo uso que la app canjea por la sesión.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { User } from '../../server/models/sql/User.model.js';
import { canjearCodigoDeApp, emitirCodigoDeApp, _vaciarCodigosDeApp } from '../../server/services/ingresoDesdeApp.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('códigos de ingreso de la app (servicio)', () => {
  beforeEach(() => _vaciarCodigosDeApp());

  it('se canjea una sola vez', () => {
    const c = emitirCodigoDeApp('u1');
    expect(c).toMatch(/^[0-9a-f]{64}$/);
    expect(canjearCodigoDeApp(c)).toBe('u1');
    expect(canjearCodigoDeApp(c)).toBeNull();
  });

  it('vence a los 2 minutos', () => {
    const t0 = 1_000_000;
    const c = emitirCodigoDeApp('u1', t0);
    expect(canjearCodigoDeApp(c, t0 + 2 * 60 * 1000 + 1)).toBeNull();
    const d = emitirCodigoDeApp('u2', t0);
    expect(canjearCodigoDeApp(d, t0 + 119_000)).toBe('u2');
  });

  it('un código vencido o ya usado igual se gasta (no queda para reintentar)', () => {
    const t0 = 5_000;
    const c = emitirCodigoDeApp('u1', t0);
    expect(canjearCodigoDeApp(c, t0 + 999_999)).toBeNull();
    expect(canjearCodigoDeApp(c, t0 + 1)).toBeNull();
  });

  it('lo que no tiene forma de código no se acepta, venga de donde venga', () => {
    emitirCodigoDeApp('u1');
    for (const malo of [undefined, null, '', 'abc', 123, {}, [], 'z'.repeat(64), 'A'.repeat(64), '0'.repeat(63), '0'.repeat(65)]) {
      expect(canjearCodigoDeApp(malo)).toBeNull();
    }
  });

  it('dos códigos son distintos y cada uno es de su dueño', () => {
    const a = emitirCodigoDeApp('ana');
    const b = emitirCodigoDeApp('beto');
    expect(a).not.toBe(b);
    expect(canjearCodigoDeApp(b)).toBe('beto');
    expect(canjearCodigoDeApp(a)).toBe('ana');
  });
});

describe('POST /api/auth/app-login-code', () => {
  let app: Express;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });
  beforeEach(() => _vaciarCodigosDeApp());
  const canjear = (codigo: unknown) => request(app).post('/api/auth/app-login-code').send({ codigo });

  it('canjea el código por la sesión de ESA persona, y no se puede repetir', async () => {
    const u: any = await crearUsuario({ dni: '41222333' });
    const c = emitirCodigoDeApp(String(u.id));
    const r = await canjear(c);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.needsDni).toBe(false);
    const decodificado: any = jwt.verify(r.body.token, process.env.JWT_SECRET || 'test-secret');
    expect(String(decodificado.id)).toBe(String(u.id));
    const otra = await canjear(c);
    expect(otra.status).toBe(400);
    expect(otra.body.token).toBeUndefined();
  });

  it('avisa si la cuenta todavía no tiene DNI (la app lo pide antes de seguir)', async () => {
    const u: any = await crearUsuario({});
    await User.update({ dni: null as any }, { where: { id: u.id } });
    const r = await canjear(emitirCodigoDeApp(String(u.id)));
    expect(r.status).toBe(200);
    expect(r.body.needsDni).toBe(true);
  });

  it('una cuenta baneada no entra con el código', async () => {
    const u: any = await crearUsuario({});
    await User.update({ isBanned: true } as any, { where: { id: u.id } });
    const r = await canjear(emitirCodigoDeApp(String(u.id)));
    expect(r.status).toBe(400);
    expect(r.body.token).toBeUndefined();
  });

  it('códigos inventados, vacíos o de otro tipo se rechazan sin dar sesión', async () => {
    for (const malo of [undefined, '', 'x', '0'.repeat(64), { $ne: '' }, ['a']]) {
      const r = await canjear(malo);
      expect(r.status).toBe(400);
      expect(r.body.token).toBeUndefined();
    }
  });

  it('un código de una cuenta que ya no existe no da sesión', async () => {
    const r = await canjear(emitirCodigoDeApp('00000000-0000-4000-8000-000000000000'));
    expect(r.status).toBe(400);
  });
});

describe('PUT /api/auth/complete-registration (quien entró con Google/X sin DNI)', () => {
  let app: Express;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const completar = (u: any, dni: unknown) => request(app).put('/api/auth/complete-registration').set(con(u)).send({ dni });
  let n = 0;
  const dniNuevo = () => String(46_000_000 + ++n * 7919 + Math.floor(Math.random() * 1000));

  it('guarda el DNI (de 7 a 9 dígitos) y no deja uno que ya usa otra cuenta', async () => {
    const dni = dniNuevo();
    const ajena = await crearUsuario({ dni });
    const yo: any = await crearUsuario({});
    const repetido = await completar(yo, dni);
    expect(repetido.status).toBe(400);
    expect(repetido.body.code).toBe('DNI_EN_USO');
    expect(repetido.body.field).toBe('dni');
    const nuevo = dniNuevo();
    expect((await completar(yo, nuevo)).status).toBe(200);
    expect(((await User.findByPk(yo.id)) as any).dni).toBe(nuevo);
    expect(ajena).toBeTruthy();
  });

  it('un DNI mal formado se rechaza (ni letras, ni de menos de 7 dígitos, ni de más de 9)', async () => {
    const yo: any = await crearUsuario({});
    for (const mal of ['123', '1234567890', 'abcdefgh', '12.345.67a', '']) expect((await completar(yo, mal)).status).toBe(400);
  });

  it('verificado con Didit, no se cambia desde acá', async () => {
    const dni = dniNuevo();
    const yo: any = await crearUsuario({ dni, dniVerified: true });
    const r = await completar(yo, dniNuevo());
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DNI_VERIFICADO');
    expect(((await User.findByPk(yo.id)) as any).dni).toBe(dni);
  });
});

describe('las rutas del ingreso social entregan un código a la app, no la sesión', () => {
  const auth = readFileSync(join(process.cwd(), 'server/routes/auth.ts'), 'utf8');

  it('Google: el origen app viaja en state y el callback redirige a la página puente con un código', () => {
    expect(auth).toMatch(/req\.query\.origen === "app"\) opciones\.state = "app"/);
    expect(auth).toMatch(/req\.query\.state === "app"[\s\S]{0,200}emitirCodigoDeApp\(String\(user\.id\)\)/);
  });

  it('X: el origen viaja en una cookie propia y el callback entrega el código', () => {
    expect(auth).toMatch(/twitter_oauth_origen/);
    expect(auth).toMatch(/req\.cookies\?\.twitter_oauth_origen === 'app'[\s\S]{0,250}emitirCodigoDeApp/);
  });

  it('la sesión (token) nunca viaja en la dirección que se le da a la app', () => {
    const puente = auth.match(/auth\/app-return\?codigo=\$\{[^}]+\}/g) || [];
    expect(puente.length).toBe(2);
    for (const p of puente) expect(p).not.toMatch(/token/i);
  });
});
