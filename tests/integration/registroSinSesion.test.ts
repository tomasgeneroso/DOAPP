import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';

/**
 * Registrarse en la web no abre la sesión: el correo hay que verificarlo, igual que para ingresar.
 *
 * Antes el servidor ponía la cookie de sesión aunque la pantalla dijera «revisá tu correo»: con volver atrás la persona quedaba
 * adentro sin haber verificado nada. La web pide `sinSesion`; la app del celular no, y sigue recibiendo la sesión.
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

describe('POST /api/auth/register: sesión según el cliente', () => {
  let app: Express;
  const emails: string[] = [];
  let k = 0;
  const datos = (extra: Record<string, unknown> = {}) => {
    k += 1;
    const sufijo = `${Date.now().toString(36)}${k}`;
    const email = `sinsesion${sufijo}@registro.test`;
    emails.push(email);
    return { name: 'Persona Nueva', username: `sinsesion${sufijo}`, email, password: 'password123', dni: String(30000000 + Math.floor(Math.random() * 9000000)), termsAccepted: true, ...extra };
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });

  afterAll(async () => {
    try {
      await User.destroy({ where: { email: emails }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('la web (sinSesion): crea la cuenta y pide verificar el correo, SIN token ni cookie de sesión', async () => {
    const r = await request(app).post('/api/auth/register').send(datos({ sinSesion: true }));
    expect(r.status).toBe(201);
    expect(r.body.requiresEmailVerification).toBe(true);
    expect(r.body.token).toBeUndefined();
    const cookies = (r.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(false);
    expect(r.body.user.email).toBeTruthy();
    expect(r.body.user.balance).toBeUndefined(); // solo lo mínimo
  });

  it('sin la sesión no se puede entrar con lo que devolvió el registro, y el ingreso exige el correo verificado', async () => {
    const d = datos({ sinSesion: true });
    const r = await request(app).post('/api/auth/register').send(d);
    expect(r.status).toBe(201);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: d.email, password: d.password });
    expect(login.body.emailNotVerified).toBe(true);
  });

  it('la app (sin el pedido): sigue recibiendo el token y la cookie', async () => {
    const r = await request(app).post('/api/auth/register').send(datos());
    expect(r.status).toBe(201);
    expect(typeof r.body.token).toBe('string');
    const cookies = (r.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
  });
});
