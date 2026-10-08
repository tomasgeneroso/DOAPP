import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';

/**
 * Segundo factor (2FA) del panel de administración.
 *
 * Lo que había:
 *  - GET /backup-codes regeneraba los 10 códigos de respaldo con sólo tener sesión: quien se llevara una
 *    sesión (token robado, XSS) sacaba códigos nuevos y con ellos salteaba el segundo factor.
 *  - Al usar un código de respaldo se hacía `splice` sobre el arreglo y `save()`: Sequelize no detecta esa
 *    mutación en el lugar, así que el código "usado" no se borraba de la base y valía para siempre.
 *  - /validate no tenía tope de intentos fallidos por cuenta.
 */

import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('2FA: códigos de respaldo y tope de intentos', () => {
  let app: Express;
  let reiniciarFallos: () => void;
  const creados: string[] = [];
  const CODIGOS = ['AAAA1111', 'BBBB2222', 'CCCC3333', 'DDDD4444'];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const totp = (secreto: string) => speakeasy.totp({ secret: secreto, encoding: 'base32' });

  const usuarioConDosFactores = async () => {
    const secreto = speakeasy.generateSecret({ length: 20 }).base32;
    const u: any = await crearUsuario({ role: 'doer', adminRole: 'admin', twoFactorEnabled: true, twoFactorSecret: secreto, twoFactorBackupCodes: [...CODIGOS] });
    creados.push(u.id);
    return { u, secreto };
  };
  const codigosEnBase = async (id: string) => ((await User.findByPk(id)) as any).twoFactorBackupCodes as string[];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    const modulo = await import('../../server/routes/admin/twoFactor.js');
    reiniciarFallos = (modulo as any)._reiniciarFallosDe2FA;
    app.use('/api/admin/2fa', modulo.default);
  });

  beforeEach(() => reiniciarFallos());

  afterAll(async () => {
    try { await User.destroy({ where: { id: creados }, force: true }); } catch { /* ok */ }
  });

  describe('POST /validate', () => {
    it('acepta el código vigente del autenticador', async () => {
      const { u, secreto } = await usuarioConDosFactores();
      const r = await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: totp(secreto) });
      expect(r.status).toBe(200);
    });

    it('un código de respaldo sirve UNA sola vez: se borra de la base (antes valía para siempre)', async () => {
      const { u } = await usuarioConDosFactores();
      const primero = await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: 'BBBB2222' });
      expect(primero.status).toBe(200);
      expect(await codigosEnBase(u.id)).toEqual(['AAAA1111', 'CCCC3333', 'DDDD4444']);

      const segundo = await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: 'BBBB2222' });
      expect(segundo.status).toBe(401);
      // y los demás siguen sirviendo
      expect((await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: 'AAAA1111' })).status).toBe(200);
      expect(await codigosEnBase(u.id)).toEqual(['CCCC3333', 'DDDD4444']);
    });

    it('un código inválido es 401', async () => {
      const { u } = await usuarioConDosFactores();
      expect((await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: '000000' })).status).toBe(401);
      expect((await request(app).post('/api/admin/2fa/validate').set(con(u)).send({})).status).toBe(400);
    });

    it('tras 5 fallos seguidos se bloquea la cuenta, aunque el sexto código sea el correcto', async () => {
      const { u, secreto } = await usuarioConDosFactores();
      for (let i = 0; i < 5; i++) {
        expect((await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: '111111' })).status).toBe(401);
      }
      const r = await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: totp(secreto) });
      expect(r.status).toBe(429);
      expect(r.body.code).toBe('TWO_FACTOR_LOCKED');
    });

    it('un acierto antes del tope reinicia la cuenta de fallos', async () => {
      const { u, secreto } = await usuarioConDosFactores();
      for (let i = 0; i < 4; i++) await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: '111111' });
      expect((await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: totp(secreto) })).status).toBe(200);
      for (let i = 0; i < 4; i++) await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: '111111' });
      expect((await request(app).post('/api/admin/2fa/validate').set(con(u)).send({ code: totp(secreto) })).status).toBe(200);
    });

    it('el bloqueo de una cuenta no afecta a otra', async () => {
      const a = await usuarioConDosFactores();
      const b = await usuarioConDosFactores();
      for (let i = 0; i < 5; i++) await request(app).post('/api/admin/2fa/validate').set(con(a.u)).send({ code: '111111' });
      expect((await request(app).post('/api/admin/2fa/validate').set(con(a.u)).send({ code: totp(a.secreto) })).status).toBe(429);
      expect((await request(app).post('/api/admin/2fa/validate').set(con(b.u)).send({ code: totp(b.secreto) })).status).toBe(200);
    });

    it('sin sesión es 401', async () => {
      expect((await request(app).post('/api/admin/2fa/validate').send({ code: '123456' })).status).toBe(401);
    });
  });

  describe('regenerar códigos de respaldo', () => {
    it('el GET de antes ya no regenera nada (410) y no toca los códigos', async () => {
      const { u } = await usuarioConDosFactores();
      const r = await request(app).get('/api/admin/2fa/backup-codes').set(con(u));
      expect(r.status).toBe(410);
      expect(await codigosEnBase(u.id)).toEqual(CODIGOS);
    });

    it('con sólo la sesión (sin el código del autenticador) no se regeneran', async () => {
      const { u } = await usuarioConDosFactores();
      const r = await request(app).post('/api/admin/2fa/backup-codes').set(con(u)).send({});
      expect(r.status).toBe(400);
      expect(await codigosEnBase(u.id)).toEqual(CODIGOS);
    });

    it('con un código incorrecto, o con un código de RESPALDO, tampoco', async () => {
      const { u } = await usuarioConDosFactores();
      for (const code of ['000000', 'AAAA1111']) {
        const r = await request(app).post('/api/admin/2fa/backup-codes').set(con(u)).send({ code });
        expect([code, r.status]).toEqual([code, 401]);
      }
      expect(await codigosEnBase(u.id)).toEqual(CODIGOS);
    });

    it('con el código vigente del autenticador devuelve 10 códigos nuevos y los guarda', async () => {
      const { u, secreto } = await usuarioConDosFactores();
      const r = await request(app).post('/api/admin/2fa/backup-codes').set(con(u)).send({ code: totp(secreto) });
      expect(r.status).toBe(200);
      expect(r.body.data.backupCodes).toHaveLength(10);
      expect(await codigosEnBase(u.id)).toEqual(r.body.data.backupCodes);
      expect(await codigosEnBase(u.id)).not.toEqual(CODIGOS);
    });

    it('también tiene tope de intentos fallidos', async () => {
      const { u, secreto } = await usuarioConDosFactores();
      for (let i = 0; i < 5; i++) await request(app).post('/api/admin/2fa/backup-codes').set(con(u)).send({ code: '111111' });
      const r = await request(app).post('/api/admin/2fa/backup-codes').set(con(u)).send({ code: totp(secreto) });
      expect(r.status).toBe(429);
      expect(await codigosEnBase(u.id)).toEqual(CODIGOS);
    });

    it('un usuario sin 2FA activado no puede regenerar', async () => {
      const u: any = await crearUsuario({ role: 'doer', adminRole: 'admin' });
      creados.push(u.id);
      const r = await request(app).post('/api/admin/2fa/backup-codes').set(con(u)).send({ code: '123456' });
      expect(r.status).toBe(400);
    });
  });
});
