import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { wafMiddleware, resetWafStats, unblacklistIP, blacklistIP, getRecentWafEvents, getBlockedIPs } from '../server/middleware/waf.js';

/**
 * Lo que la rama claude/post-work-rating-mdcw8h aportaba al firewall y no se podía perder:
 *  - una respuesta «Invalid request» sin forma de saber qué regla saltó obligaba a adivinar leyendo el log: ahora la respuesta trae
 *    un código y una referencia corta, y el panel de seguridad muestra la regla, la ruta y el campo exacto;
 *  - las muestras guardadas no pueden dejar credenciales (JWT, tokens largos);
 *  - un bloqueo de IP vence (antes duraba hasta reiniciar el proceso: un falso positivo dejaba a una persona sin acceso).
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function app() {
  const a = express();
  a.use(express.json());
  a.use(wafMiddleware);
  a.get('/api/jobs', (_req, res) => res.json({ ok: true }));
  return a;
}

let n = 100;
const ipNueva = () => `198.51.100.${(++n % 250) + 1}`;
const desde = (r: request.Test, ip: string) => r.set('User-Agent', UA).set('X-Forwarded-For', ip);

describe('el firewall deja bloqueos diagnosticables', () => {
  const entornoAnterior = process.env.NODE_ENV;
  beforeAll(() => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => {
    process.env.NODE_ENV = entornoAnterior;
    jest.restoreAllMocks();
  });
  beforeEach(() => resetWafStats());

  it('un bloqueo responde con código y referencia, sin decir qué patrón saltó', async () => {
    const r = await desde(request(app()).get('/api/jobs').query({ q: "1' OR '1'='1" }), ipNueva());
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, message: 'Invalid request', code: 'WAF_BLOCKED' });
    expect(r.body.reference).toMatch(/^[A-Z0-9]{4,8}$/);
    expect(JSON.stringify(r.body)).not.toMatch(/OR|SQL|pattern/i);
  });

  it('con la referencia se encuentra la regla, la ruta y el campo exacto que saltó', async () => {
    const r = await desde(request(app()).get('/api/jobs').query({ q: "1' OR '1'='1" }), ipNueva());
    const eventos = getRecentWafEvents({ reference: r.body.reference });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ type: 'SQL_INJECTION', path: '/api/jobs', blocked: true });
    expect(eventos[0].field).toContain('query');
  });

  it('las muestras guardadas no dejan credenciales: un JWT o un token largo se enmascaran', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const r = await desde(request(app()).get('/api/jobs').query({ q: `' OR 1=1 -- ${jwt}` }), ipNueva());
    const e = getRecentWafEvents({ reference: r.body.reference })[0];
    expect(e).toBeTruthy();
    expect(JSON.stringify(e)).not.toContain(jwt);
    expect(String(e.sample ?? '').length).toBeLessThanOrEqual(130);
  });

  it('un bloqueo de IP vence: pasado el plazo la persona vuelve a entrar (antes duraba hasta reiniciar)', async () => {
    const ip = ipNueva();
    blacklistIP(ip, 150);
    const bloqueada = await desde(request(app()).get('/api/jobs'), ip);
    expect(bloqueada.status).toBeGreaterThanOrEqual(400);
    await new Promise((r) => setTimeout(r, 250));
    const libre = await desde(request(app()).get('/api/jobs'), ip);
    expect(libre.status).toBe(200);
    expect(getBlockedIPs()).not.toContain(ip);
    unblacklistIP(ip);
  });
});
