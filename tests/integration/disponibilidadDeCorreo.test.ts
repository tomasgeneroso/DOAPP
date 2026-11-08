import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

/**
 * «¿Está libre este correo?» en el registro: el correo viaja en el CUERPO de un POST, no en la dirección.
 *
 * Qué motivó esto (auditoría de datos personales del 2026-11-06): la pantalla de registro pedía
 * `GET /api/auth/check-availability?email=<correo>` en cada correo que alguien terminaba de escribir, y esa dirección queda en los
 * registros de nginx y de Cloudflare (y en la analítica de Google, antes de limpiarla). El POST responde lo mismo; el GET se
 * conserva hasta que no queden pestañas abiertas con la versión vieja de la web.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { crearUsuario } from '../helpers/fixtures.js';

describe('/api/auth/check-availability', () => {
  let app: Express;
  let existente: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    existente = await crearUsuario({ role: 'client' });
  });

  it('POST: un correo ya registrado figura como no disponible', async () => {
    const r = await request(app).post('/api/auth/check-availability').send({ email: existente.email });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, emailAvailable: false });
  });

  it('POST: un correo que nadie usa figura como disponible', async () => {
    const r = await request(app).post('/api/auth/check-availability').send({ email: 'nadie-lo-usa@correo-de-prueba.com' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, emailAvailable: true });
  });

  it('POST: no distingue mayúsculas ni espacios (igual que antes)', async () => {
    const r = await request(app).post('/api/auth/check-availability').send({ email: `  ${String(existente.email).toUpperCase()}  ` });
    expect(r.body.emailAvailable).toBe(false);
  });

  it('POST: también comprueba el nombre de usuario', async () => {
    const tomado = await request(app).post('/api/auth/check-availability').send({ username: existente.username });
    const libre = await request(app).post('/api/auth/check-availability').send({ username: 'usuario-que-no-existe-xyz' });
    expect(tomado.body.usernameAvailable).toBe(false);
    expect(libre.body.usernameAvailable).toBe(true);
  });

  it('POST: sin cuerpo no falla ni afirma nada', async () => {
    const r = await request(app).post('/api/auth/check-availability').send({});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
  });

  it('POST: un cuerpo con algo que no es texto no rompe la comprobación', async () => {
    const r = await request(app).post('/api/auth/check-availability').send({ email: { $ne: null }, username: ['a'] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
  });

  it('GET (pestañas abiertas con la web vieja): sigue respondiendo lo mismo', async () => {
    const tomado = await request(app).get('/api/auth/check-availability').query({ email: existente.email });
    const libre = await request(app).get('/api/auth/check-availability').query({ email: 'nadie-lo-usa@correo-de-prueba.com' });
    expect(tomado.body).toEqual({ success: true, emailAvailable: false });
    expect(libre.body).toEqual({ success: true, emailAvailable: true });
  });
});
