import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Didit sin créditos (2026-11-11): «Al registrarse da error 502». El 502 no era una caída: era `POST /api/auth/kyc/start` contestando así cuando Didit rechazaba el pedido con
 * `400: You don't have enough credits to perform this request`. Reintentar no servía, la persona creía que el sitio estaba roto y nadie del equipo se enteraba.
 * Ahora: 503 con un mensaje honesto y un código, y los dueños reciben una notificación (una cada pocas horas, no una por intento). Cualquier OTRO fallo de Didit sigue siendo 502.
 */
let fallaDeDidit: Error = new Error('x');
jest.mock('../../server/services/didit.js', () => {
  const real: any = (jest as any).requireActual('../../server/services/didit.js');
  return {
    __esModule: true,
    ...real,
    default: { ...real.default },
    diditConfigProblem: () => null,
    createDiditSession: async () => {
      throw fallaDeDidit;
    },
  };
});
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { esFalloDeCreditos, avisarQueDiditNoTieneCreditos, __reiniciarElAviso } from '../../server/services/diditSinCreditos.js';
import { crearUsuario } from '../helpers/fixtures.js';

/** Un reloj de mentira con un valor realista (el de verdad es de miles de millones de milisegundos). */
const BASE = 10 * 24 * 3_600_000;
const TEXTO_REAL_DE_DIDIT = `Didit API 400: {"detail":"You don't have enough credits to perform this request. Please top up at https://business.didit.me"}`;

describe('esFalloDeCreditos', () => {
  it('reconoce el mensaje real de Didit y sus variantes', () => {
    expect(esFalloDeCreditos(new Error(TEXTO_REAL_DE_DIDIT))).toBe(true);
    expect(esFalloDeCreditos(new Error('Didit API 402: payment required'))).toBe(true);
    expect(esFalloDeCreditos('insufficient credits')).toBe(true);
  });

  it('no confunde otros fallos (timeout, 500, sin red) con falta de créditos', () => {
    expect(esFalloDeCreditos(new Error('Didit API 500: internal error'))).toBe(false);
    expect(esFalloDeCreditos(new Error('fetch failed'))).toBe(false);
    expect(esFalloDeCreditos(null)).toBe(false);
  });
});

describe('POST /api/auth/kyc/start con Didit sin créditos', () => {
  let app: Express;
  let persona: any, dueno: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const avisosDelDueno = () => Notification.count({ where: { recipientId: dueno.id, title: 'Didit se quedó sin créditos: nadie puede verificar su identidad' } as any });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', (await import('../../server/routes/auth.js')).default);
    persona = await crearUsuario({ role: 'client' });
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });

  beforeEach(() => {
    __reiniciarElAviso();
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [persona.id, dueno.id] } });
      await User.destroy({ where: { id: [persona.id, dueno.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('responde 503 con un mensaje honesto y un código (no 502 «probá de nuevo») y le avisa al dueño', async () => {
    fallaDeDidit = new Error(TEXTO_REAL_DE_DIDIT);
    const antes = await avisosDelDueno();
    const r = await request(app).post('/api/auth/kyc/start').set(con(persona)).send({});
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('VERIFICACION_NO_DISPONIBLE');
    expect(r.body.message).toMatch(/no está disponible en este momento/);
    expect(r.body.message).toMatch(/cuenta quedó creada/);
    expect(r.body.message).not.toMatch(/probá de nuevo/i);
    // el aviso va aparte (no frena la respuesta): se espera a que llegue
    for (let i = 0; i < 40 && (await avisosDelDueno()) === antes; i++) await new Promise((x) => setTimeout(x, 50));
    expect(await avisosDelDueno()).toBe(antes + 1);
  });

  it('el aviso al dueño sale UNA vez cada pocas horas, no una por cada intento de cada persona', async () => {
    expect(await avisarQueDiditNoTieneCreditos(BASE)).toBe(true);
    const tras1 = await avisosDelDueno();
    expect(await avisarQueDiditNoTieneCreditos(BASE + 60_000)).toBe(false); // un minuto después
    expect(await avisarQueDiditNoTieneCreditos(BASE + 5 * 3_600_000)).toBe(false); // cinco horas después
    expect(await avisosDelDueno()).toBe(tras1);
    expect(await avisarQueDiditNoTieneCreditos(BASE + 7 * 3_600_000)).toBe(true); // pasadas las seis horas
    expect(await avisosDelDueno()).toBe(tras1 + 1);
  });

  it('cualquier otro fallo de Didit sigue siendo 502 y NO le avisa al dueño por falta de créditos', async () => {
    fallaDeDidit = new Error('Didit API 500: internal error');
    const antes = await avisosDelDueno();
    const r = await request(app).post('/api/auth/kyc/start').set(con(persona)).send({});
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/Probá de nuevo/);
    await new Promise((x) => setTimeout(x, 300));
    expect(await avisosDelDueno()).toBe(antes);
  });
});
