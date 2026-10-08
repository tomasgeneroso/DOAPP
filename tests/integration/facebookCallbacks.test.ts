import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import crypto from 'crypto';

/**
 * POST /api/auth/facebook/deauthorize y /data-deletion.
 *
 * Los dos ignoraban la firma del signed_request: un POST anónimo con el facebookId de alguien le
 * desvinculaba la cuenta (y a quien entra sólo por Facebook lo dejaba sin acceso). Además disparaba el mail
 * de "eliminación de datos" a la víctima.
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
import { crearUsuario } from '../helpers/fixtures.js';

const SECRETO = 'secreto-facebook-de-prueba';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const firmado = (datos: Record<string, unknown>, secreto = SECRETO) => {
  const payload = b64url(JSON.stringify(datos));
  return `${b64url(crypto.createHmac('sha256', secreto).update(payload).digest())}.${payload}`;
};

describe('callbacks de Facebook: sólo con la firma de Facebook', () => {
  let app: Express;
  let victima: any;
  const secretoOriginal = process.env.FACEBOOK_APP_SECRET;
  const facebookDe = async () => ((await User.findByPk(victima.id)) as any).facebookId as string | null | undefined;

  beforeAll(async () => {
    process.env.FACEBOOK_APP_SECRET = SECRETO;
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/auth.js');
    app.use('/api/auth', rutas.default);
  });

  afterEach(async () => {
    await User.update({ facebookId: '10203040506070' } as any, { where: { id: victima.id } });
  });

  afterAll(async () => {
    if (secretoOriginal === undefined) delete process.env.FACEBOOK_APP_SECRET;
    else process.env.FACEBOOK_APP_SECRET = secretoOriginal;
    try { await User.destroy({ where: { id: victima.id }, force: true }); } catch { /* ok */ }
  });

  beforeAll(async () => {
    victima = await crearUsuario({ facebookId: '10203040506070' });
  });

  for (const ruta of ['deauthorize', 'data-deletion']) {
    describe(`POST /facebook/${ruta}`, () => {
      const llamar = (signed_request: unknown) => request(app).post(`/api/auth/facebook/${ruta}`).send({ signed_request });

      it('con la firma de Facebook desvincula a ese usuario', async () => {
        const r = await llamar(firmado({ algorithm: 'HMAC-SHA256', user_id: '10203040506070' }));
        expect(r.status).toBe(200);
        expect(await facebookDe()).toBeFalsy();
      });

      it('con la firma inventada NO toca la cuenta de nadie', async () => {
        const payload = b64url(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '10203040506070' }));
        const r = await llamar(`firmafalsa.${payload}`);
        expect(r.status).toBe(400);
        expect(await facebookDe()).toBe('10203040506070');
      });

      it('firmado con otro secreto NO toca la cuenta', async () => {
        const r = await llamar(firmado({ algorithm: 'HMAC-SHA256', user_id: '10203040506070' }, 'secreto-del-atacante'));
        expect(r.status).toBe(400);
        expect(await facebookDe()).toBe('10203040506070');
      });

      it('sin signed_request o con basura, 400 y nada cambia', async () => {
        for (const raro of [undefined, '', 'a.b.c', 12345, { x: 1 }]) {
          const r = await llamar(raro);
          expect([JSON.stringify(raro), r.status]).toEqual([JSON.stringify(raro), 400]);
        }
        expect(await facebookDe()).toBe('10203040506070');
      });

      it('si el servidor no tiene FACEBOOK_APP_SECRET, rechaza todo (aunque la firma "cierre" con otro secreto)', async () => {
        delete process.env.FACEBOOK_APP_SECRET;
        try {
          const r = await llamar(firmado({ algorithm: 'HMAC-SHA256', user_id: '10203040506070' }));
          expect(r.status).toBe(400);
          expect(await facebookDe()).toBe('10203040506070');
        } finally {
          process.env.FACEBOOK_APP_SECRET = SECRETO;
        }
      });
    });
  }
});
