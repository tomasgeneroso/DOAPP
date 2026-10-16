import { describe, it, expect, afterAll, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

/**
 * El mapa del trabajo se centraba en la ciudad y no en la dirección.
 *
 * Postgres entrega los DECIMAL como texto («-34.60370000») y el mapa solo aceptaba números: descartaba las coordenadas exactas guardadas
 * y volvía a ubicar el trabajo por el nombre de la ciudad. Ahora el servidor devuelve las coordenadas como número.
 */

jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';
import { aCoordenada } from '../../client/utils/coordenadas.js';

describe('coordenadas del trabajo', () => {
  let app: Express;
  let dueno: any, trabajo: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    dueno = await crearUsuario({ role: 'client' });
    trabajo = await crearTrabajo(dueno.id, { status: 'open', latitude: -34.6037, longitude: -58.3816 });
  });

  afterAll(async () => {
    try {
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: dueno.id }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('el modelo las devuelve como número, no como texto', async () => {
    const j: any = await Job.findByPk(trabajo.id);
    expect(typeof j.latitude).toBe('number');
    expect(typeof j.longitude).toBe('number');
    expect(j.latitude).toBeCloseTo(-34.6037, 4);
    expect(typeof j.toJSON().latitude).toBe('number');
  });

  it('el detalle público del trabajo las trae como número', async () => {
    const r = await request(app).get(`/api/jobs/${trabajo.id}`);
    expect(r.status).toBe(200);
    expect(typeof r.body.job.latitude).toBe('number');
    expect(typeof r.body.job.longitude).toBe('number');
  });

  it('un trabajo sin coordenadas las devuelve null (no 0 ni NaN)', async () => {
    const sin: any = await crearTrabajo(dueno.id, { status: 'open' });
    try {
      const j: any = await Job.findByPk(sin.id);
      expect(j.latitude ?? null).toBeNull();
    } finally {
      await Job.destroy({ where: { id: sin.id }, force: true });
    }
  });

  it('aCoordenada acepta número o texto y descarta lo que no es una coordenada', () => {
    expect(aCoordenada(-34.6)).toBe(-34.6);
    expect(aCoordenada('-34.60370000')).toBeCloseTo(-34.6037, 4);
    for (const malo of [null, undefined, '', 'abc', NaN, Infinity, {}]) expect(aCoordenada(malo as never)).toBeNull();
  });
});
