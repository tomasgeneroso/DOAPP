import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { readFileSync } from 'fs';
import { join } from 'path';
import { crearVerificadorDeOrigen } from '../server/middleware/corsOrigen.js';
import { errorHandler } from '../server/middleware/errorHandler.js';
import { cabecerasDeSeguridad, OPCIONES_DE_CORS, opcionesDeHelmet, PERMISSIONS_POLICY } from '../server/middleware/cabecerasDeSeguridad.js';

/**
 * CORS y cabeceras de seguridad de la API, con las MISMAS opciones que usa el servidor (`server/index.ts`), probadas con pedidos de
 * verdad, incluido el preflight.
 */
const SITIO = 'https://doapparg.com';

function crearApp(esDesarrollo = false, corsOrigins: string[] = []) {
  const app = express();
  app.use(helmet(opcionesDeHelmet()));
  app.use(cabecerasDeSeguridad);
  app.use(cors({ origin: crearVerificadorDeOrigen({ clientUrl: SITIO, corsOrigins, esDesarrollo }), ...OPCIONES_DE_CORS }));
  app.get('/api/algo', (_req, res) => res.json({ ok: true }));
  app.post('/api/algo', (_req, res) => res.json({ ok: true }));
  app.get('/uploads/archivo.pdf', (_req, res) => res.type('application/pdf').send('%PDF'));
  app.use(errorHandler as any);
  return app;
}

describe('CORS', () => {
  const app = crearApp();

  it('preflight desde el sitio exacto: 204, mismo origen (no *), con credenciales y solo los métodos y cabeceras permitidos', async () => {
    const r = await request(app)
      .options('/api/algo')
      .set('Origin', SITIO)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(SITIO);
    expect(r.headers['access-control-allow-origin']).not.toBe('*');
    expect(r.headers['access-control-allow-credentials']).toBe('true');
    expect(r.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS');
    expect(r.headers['access-control-allow-methods']).not.toMatch(/HEAD/);
    expect(r.headers['access-control-allow-headers']).toBe('Content-Type,Authorization,Accept,Accept-Language');
    expect(r.headers['access-control-max-age']).toBe('600');
  });

  it('NO refleja cabeceras pedidas que no están permitidas (antes devolvía cualquiera)', async () => {
    const r = await request(app).options('/api/algo').set('Origin', SITIO).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,x-raro,x-otra');
    expect(r.headers['access-control-allow-headers']).not.toMatch(/x-raro|x-otra/i);
  });

  it('un origen ajeno recibe 403 y NINGUNA cabecera de CORS (ni en el preflight ni en el pedido)', async () => {
    const pre = await request(app).options('/api/algo').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(pre.status).toBe(403);
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    const get = await request(app).get('/api/algo').set('Origin', 'https://evil.example');
    expect(get.status).toBe(403);
    expect(get.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('solo https: la versión http del sitio, un subdominio y un puerto distinto no pasan', async () => {
    for (const origen of ['http://doapparg.com', 'https://www.doapparg.com', 'https://doapparg.com:8443', 'https://doapparg.com.evil.example', 'null']) {
      const r = await request(app).get('/api/algo').set('Origin', origen);
      expect([origen, r.status, r.headers['access-control-allow-origin']]).toEqual([origen, 403, undefined]);
    }
  });

  it('un origen http cargado por error en CORS_ORIGINS tampoco pasa fuera de desarrollo', async () => {
    const conHttp = crearApp(false, ['http://staging.doapparg.com', 'https://staging.doapparg.com']);
    expect((await request(conHttp).get('/api/algo').set('Origin', 'http://staging.doapparg.com')).status).toBe(403);
    const ok = await request(conHttp).get('/api/algo').set('Origin', 'https://staging.doapparg.com');
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe('https://staging.doapparg.com');
  });

  it('el pedido normal desde el sitio lleva el origen exacto y Vary: Origin', async () => {
    const r = await request(app).get('/api/algo').set('Origin', SITIO);
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe(SITIO);
    expect(r.headers['access-control-allow-credentials']).toBe('true');
    expect(r.headers.vary).toMatch(/Origin/);
  });

  it('en ningún caso aparece el comodín', async () => {
    for (const origen of [SITIO, 'https://evil.example', undefined]) {
      const r = await request(app).get('/api/algo').set(origen ? { Origin: origen } : {});
      expect(r.headers['access-control-allow-origin']).not.toBe('*');
    }
  });
});

describe('cabeceras de seguridad de la API', () => {
  const app = crearApp();

  it('HSTS de un año con subdominios, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy', async () => {
    const r = await request(app).get('/api/algo').set('Origin', SITIO);
    expect(r.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(r.headers['permissions-policy']).toBe(PERMISSIONS_POLICY);
  });

  it('el Permissions-Policy deja la cámara y la ubicación solo para el sitio (la app los usa) y apaga el micrófono', () => {
    expect(PERMISSIONS_POLICY).toMatch(/camera=\(self\)/);
    expect(PERMISSIONS_POLICY).toMatch(/geolocation=\(self\)/);
    expect(PERMISSIONS_POLICY).toMatch(/microphone=\(\)/);
  });

  it('la API no carga nada (default-src none, sin frames); los archivos subidos se pueden ver dentro del sitio', async () => {
    const api = await request(app).get('/api/algo');
    expect(api.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const archivo = await request(app).get('/uploads/archivo.pdf');
    expect(archivo.headers['content-security-policy']).toBe("frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    expect(archivo.headers['content-security-policy']).not.toMatch(/default-src/);
  });

  it('el servidor real usa estas opciones y no las de antes (CSP apagada, CORS sin lista de cabeceras)', () => {
    const fuente = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
    expect(fuente).toMatch(/app\.use\(helmet\(opcionesDeHelmet\(\)\)\)/);
    expect(fuente).toMatch(/app\.use\(cabecerasDeSeguridad\)/);
    expect(fuente).toMatch(/\.\.\.OPCIONES_DE_CORS/);
    expect(fuente).not.toMatch(/contentSecurityPolicy:\s*false/);
  });
});
