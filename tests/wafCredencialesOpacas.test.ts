import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { wafMiddleware, resetWafStats, unblacklistIP } from '../server/middleware/waf.js';

/**
 * El firewall de la aplicación mira lo que escribe la persona (consulta, cuerpo, referer) buscando ataques. Un token de sesión
 * (JWT) o un código de Google son cadenas AL AZAR en base64url: tienen guiones, y un doble guion (--) es el comentario de SQL.
 * Al volver de Google la pantalla de retorno llama a /api/auth/me con el token en la dirección de la que viene (el referer): una de
 * cada tantas veces el azar ponía «--» ahí y el firewall respondía 400 «Invalid request»: «error auth, http400».
 *
 * Las credenciales opacas (token, code, state…) no son texto de una persona; se validan donde se usan. El resto se sigue mirando.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function app() {
  const a = express();
  a.use(express.json());
  a.use(wafMiddleware);
  a.get('/api/auth/me', (_req, res) => res.json({ ok: true }));
  a.get('/api/auth/google/callback', (_req, res) => res.json({ ok: true }));
  a.get('/api/jobs', (_req, res) => res.json({ ok: true }));
  return a;
}

// El firewall no se aplica a la máquina local (está en su lista blanca): cada pedido simula venir de una dirección distinta.
let n = 0;
const desde = (r: request.Test) => r.set('User-Agent', UA).set('X-Forwarded-For', `203.0.113.${(++n % 250) + 1}`);

const jwtConGuiones = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4LS1hYmNkIiwiaWF0IjoxNzAwMDAwMDAwfQ.abc--def_ghi-jkl';

describe('el firewall y las credenciales opacas', () => {
  // El firewall solo actúa en producción (en desarrollo deja pasar todo).
  const entornoAnterior = process.env.NODE_ENV;
  beforeAll(() => {
    process.env.NODE_ENV = 'production';
  });
  afterAll(() => {
    process.env.NODE_ENV = entornoAnterior;
  });
  beforeEach(() => {
    resetWafStats();
    unblacklistIP('::ffff:127.0.0.1');
    unblacklistIP('127.0.0.1');
    unblacklistIP('::1');
  });

  it('un pedido que viene de /auth/callback?token=<JWT con guiones dobles> no se bloquea', async () => {
    const r = await desde(request(app()).get('/api/auth/me')).set('Referer', `https://doapparg.com/auth/callback?token=${jwtConGuiones}&needsDni=true`);
    expect(r.status).toBe(200);
  });

  it('el código de Google (con guiones dobles) y el state en el callback no se bloquean', async () => {
    const r = await desde(request(app()).get('/api/auth/google/callback'))
      .query({ code: '4/0AVMBsJh_xx--yy-zz', scope: 'email profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid', authuser: '0', prompt: 'consent', state: `link:${jwtConGuiones}` })
      ;
    expect(r.status).toBe(200);
  });

  it('lo que sí es un ataque sigue bloqueado: SQL en una consulta, y SQL en la ruta del referer', async () => {
    const a = app();
    expect((await desde(request(a).get('/api/jobs')).query({ q: "1' OR '1'='1" })).status).toBe(400);
    const r = await desde(request(a).get('/api/jobs')).set('Referer', "https://doapparg.com/buscar/1'; DROP TABLE users; --");
    expect(r.status).toBe(400);
  });

  it('una consulta con «--» en el texto que escribió la persona SÍ se sigue frenando (no se aflojó la regla general)', async () => {
    const r = await desde(request(app()).get('/api/jobs')).query({ search: 'x -- y' });
    expect(r.status).toBe(400);
  });
});
