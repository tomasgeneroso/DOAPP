import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Entrar con Google con una cuenta que YA existe en DOAPP.
 *
 * Qué motivó esto: «cuando me logueo con google con <el correo de una cuenta existente> da error y vuelve al login». El
 * camino tenía fragilidades que solo se ven con cuentas reales: un perfil sin foto tumbaba la estrategia con un TypeError
 * (`photos?.[0].value`), el correo se buscaba exacto (si la cuenta lo tenía escrito distinto, no la encontraba, intentaba crear
 * una nueva y chocaba con la clave única), vincular guardaba TODA la fila (una cuenta vieja con un dato que hoy no pasa las
 * validaciones no podía entrar) y la cookie de una sesión vencida pisaba al token nuevo del encabezado.
 */

process.env.GOOGLE_CLOUD_AUTH_ID = 'id-de-prueba';
process.env.GOOGLE_CLOUD_AUTH_PASS = 'clave-de-prueba';

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { sequelize } from '../../server/config/database.js';
import { crearUsuario } from '../helpers/fixtures.js';

const perfil = (over: Record<string, unknown> = {}) => ({
  id: `gid-${Math.random().toString(36).slice(2)}`,
  displayName: 'Persona Google',
  photos: [{ value: 'https://lh3.example/foto.png' }],
  ...over,
});

async function estrategia(profile: any): Promise<{ err: any; user: any }> {
  const passport = (await import('../../server/config/passport.js')).default as any;
  const s = passport._strategy('google');
  if (!s) throw new Error('la estrategia de Google no se registró');
  const req = { query: {}, cookies: {} };
  return new Promise((resolve) => s._verify(req, 'acceso', 'refresco', profile, (err: any, user: any) => resolve({ err, user })));
}

describe('estrategia de Google con una cuenta existente', () => {
  it('vincula la cuenta por correo y la deja marcada como verificada', async () => {
    const u: any = await crearUsuario({});
    const { err, user } = await estrategia(perfil({ emails: [{ value: u.email }] }));
    expect(err).toBeNull();
    expect(String(user.id)).toBe(String(u.id));
    const g: any = await User.findByPk(u.id);
    expect(g.googleId).toBeTruthy();
    expect(g.isVerified).toBe(true);
  });

  it('un perfil SIN foto (lista vacía o ausente) no tumba el ingreso', async () => {
    for (const photos of [[], undefined]) {
      const u: any = await crearUsuario({});
      await User.update({ avatar: null } as any, { where: { id: u.id } });
      const { err, user } = await estrategia(perfil({ emails: [{ value: u.email }], photos }));
      expect(err).toBeNull();
      expect(String(user.id)).toBe(String(u.id));
    }
  });

  it('encuentra la cuenta aunque Google devuelva el correo con otras mayúsculas o espacios', async () => {
    const u: any = await crearUsuario({});
    const antes = await User.count();
    const { err, user } = await estrategia(perfil({ emails: [{ value: `  ${String(u.email).toUpperCase()} ` }] }));
    expect(err).toBeNull();
    expect(String(user.id)).toBe(String(u.id));
    expect(await User.count()).toBe(antes); // no creó una cuenta duplicada
  });

  it('encuentra una cuenta cuyo correo quedó guardado con mayúsculas (datos viejos)', async () => {
    const u: any = await crearUsuario({});
    await sequelize.query('UPDATE users SET email = upper(email) WHERE id = :id', { replacements: { id: u.id } });
    const antes = await User.count();
    const { err, user } = await estrategia(perfil({ emails: [{ value: String(u.email).toLowerCase() }] }));
    expect(err).toBeNull();
    expect(String(user.id)).toBe(String(u.id));
    expect(await User.count()).toBe(antes);
  });

  it('una cuenta vieja con un dato que hoy no pasa las validaciones igual puede entrar (solo se guardan los campos del vínculo)', async () => {
    // Una columna obligatoria hoy que en esa fila quedó vacía (en producción las columnas se agregaron con migraciones y filas viejas
    // pueden tener nulos): guardar la fila entera falla por validación; guardar solo el vínculo, no.
    const u: any = await crearUsuario({});
    await sequelize.query('ALTER TABLE users ALTER COLUMN phone_verified DROP NOT NULL');
    try {
      await sequelize.query('UPDATE users SET phone_verified = NULL WHERE id = :id', { replacements: { id: u.id } });
      const { err, user } = await estrategia(perfil({ emails: [{ value: u.email }] }));
      expect(err).toBeNull();
      expect(String(user.id)).toBe(String(u.id));
      expect(((await User.findByPk(u.id)) as any).googleId).toBeTruthy();
    } finally {
      await sequelize.query('UPDATE users SET phone_verified = false WHERE phone_verified IS NULL');
      await sequelize.query('ALTER TABLE users ALTER COLUMN phone_verified SET NOT NULL');
    }
  });

  it('una cuenta tipo owner (rol, banco, matrícula, DNI verificado) se vincula sin tocar sus otros datos', async () => {
    const u: any = await crearUsuario({});
    await User.update(
      {
        role: 'admin',
        adminRole: 'owner',
        licenseNumber: 'MP-12345',
        dni: '30111222',
        dniVerified: true,
        kycStatus: 'Approved',
        bankingInfo: { accountHolder: 'Tomas', bankType: 'bank', bankName: 'Banco', accountType: 'savings', cbu: '0123456789012345678901', alias: 'tomas.alias' },
      } as any,
      { where: { id: u.id } },
    );
    const { err, user } = await estrategia(perfil({ emails: [{ value: u.email }] }));
    expect(err).toBeNull();
    const g: any = await User.findByPk(user.id);
    expect(g.adminRole).toBe('owner');
    expect(g.dni).toBe('30111222');
    expect(g.dniVerified).toBe(true);
  });

  it('si el googleId ya está vinculado entra directo; y sin cuenta, crea una nueva con foto', async () => {
    const u: any = await crearUsuario({});
    const id = `gid-fijo-${Math.random().toString(36).slice(2)}`;
    await User.update({ googleId: id } as any, { where: { id: u.id } });
    const directo = await estrategia(perfil({ id, emails: [{ value: 'otro-correo@example.com' }] }));
    expect(directo.err).toBeNull();
    expect(String(directo.user.id)).toBe(String(u.id));

    const correo = `nueva.${Math.random().toString(36).slice(2)}@example.com`;
    const nueva = await estrategia(perfil({ emails: [{ value: correo }] }));
    expect(nueva.err).toBeNull();
    expect(nueva.user.email).toBe(correo);
    expect(nueva.user.avatar).toBe('https://lh3.example/foto.png');
  });
});

describe('token de sesión: la cookie vencida no pisa al token nuevo del encabezado', () => {
  let app: Express;
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
  });
  const secreto = () => process.env.JWT_SECRET || 'test-secret';
  const bueno = (u: any) => jwt.sign({ id: u.id }, secreto(), { expiresIn: '1h' });
  const vencido = (u: any) => jwt.sign({ id: u.id }, secreto(), { expiresIn: -60 });

  it('cookie vencida + encabezado bueno → entra (volver de Google)', async () => {
    const u: any = await crearUsuario({});
    const r = await request(app).get('/api/auth/me').set('Cookie', `token=${vencido(u)}`).set('Authorization', `Bearer ${bueno(u)}`);
    expect(r.status).toBe(200);
    expect(String(r.body.user.id)).toBe(String(u.id));
  });

  it('cookie buena sola, y encabezado bueno solo → entran', async () => {
    const u: any = await crearUsuario({});
    expect((await request(app).get('/api/auth/me').set('Cookie', `token=${bueno(u)}`)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${bueno(u)}`)).status).toBe(200);
  });

  it('si ninguno sirve, 401 (no se abre nada)', async () => {
    const u: any = await crearUsuario({});
    for (const pedido of [
      request(app).get('/api/auth/me').set('Cookie', `token=${vencido(u)}`).set('Authorization', `Bearer ${vencido(u)}`),
      request(app).get('/api/auth/me').set('Cookie', 'token=basura').set('Authorization', 'Bearer otra-basura'),
      request(app).get('/api/auth/me'),
    ]) {
      expect((await pedido).status).toBe(401);
    }
  });

  it('cada token se verifica con la firma: uno de otra clave no entra aunque venga en el encabezado', async () => {
    const u: any = await crearUsuario({});
    const ajeno = jwt.sign({ id: u.id }, 'otra-clave', { expiresIn: '1h' });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ajeno}`)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', `token=${vencido(u)}`).set('Authorization', `Bearer ${ajeno}`)).status).toBe(401);
  });
});

describe('el callback de Google', () => {
  const auth = readFileSync(join(process.cwd(), 'server/routes/auth.ts'), 'utf8');
  it('si algo falla vuelve al ingreso con una explicación (no deja el JSON de un 500)', () => {
    expect(auth).toMatch(/\(err: any, req: Request, res: Response, _next: NextFunction\)[\s\S]{0,300}error=social_failed&motivo=servidor/);
  });
});
