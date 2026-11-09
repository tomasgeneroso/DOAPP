import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * El Centro Profesional es parte de la membresía PRO (regla del dueño, 2026-11-09).
 *
 * Antes lo exigía un nivel interno «SUPER PRO» que ya no se vende: en la beta lo veían todos, pero al terminar la beta nadie (salvo el dueño) habría podido abrirlo, y la
 * web ni siquiera pedía los datos si la cuenta no era `super_pro`. Ahora puede: el dueño, todos durante la beta y, después, quien tiene PRO vigente.
 */
const fase = { beta: false };
jest.mock('../../server/services/platformPhase.js', () => ({
  __esModule: true,
  isBetaPhase: async () => fase.beta,
  getEffectiveTier: async (stored: string | null, adminRole?: string | null) =>
    adminRole === 'owner' ? 'super_pro' : fase.beta ? 'super_pro' : stored === 'pro' || stored === 'super_pro' ? stored : 'free',
}));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';
import { puedeUsarElCentroProfesional } from '../../server/services/centroProfesional.js';

const DENTRO_DE_UN_MES = new Date(Date.now() + 30 * 86_400_000);
const HACE_UN_MES = new Date(Date.now() - 30 * 86_400_000);

describe('puedeUsarElCentroProfesional (la regla sola)', () => {
  it('después de la beta: solo PRO vigente (activa y sin vencer) y el dueño', async () => {
    fase.beta = false;
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'free' })).toBe(false);
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: DENTRO_DE_UN_MES })).toBe(true);
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: null })).toBe(true);
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'pro', hasMembership: true, membershipExpiresAt: HACE_UN_MES })).toBe(false);
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'pro', hasMembership: false })).toBe(false);
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'super_pro', hasMembership: true, membershipExpiresAt: DENTRO_DE_UN_MES })).toBe(true);
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'free', adminRole: 'owner' })).toBe(true);
  });

  it('durante la beta pueden todos, aunque la cuenta sea gratis', async () => {
    fase.beta = true;
    expect(await puedeUsarElCentroProfesional({ membershipTier: 'free' })).toBe(true);
    fase.beta = false;
  });
});

describe('GET /api/membership/analytics (el Centro Profesional)', () => {
  let app: Express;
  let gratis: any, pro: any, vencido: any, dueno: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const ids = () => [gratis, pro, vencido, dueno].map((u) => u.id);

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/membership', (await import('../../server/routes/membership.js')).default);
    gratis = await crearUsuario({ role: 'doer', membershipTier: 'free', hasMembership: false });
    pro = await crearUsuario({ role: 'doer', membershipTier: 'pro', hasMembership: true, membershipExpiresAt: DENTRO_DE_UN_MES });
    vencido = await crearUsuario({ role: 'doer', membershipTier: 'pro', hasMembership: true, membershipExpiresAt: HACE_UN_MES });
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner', membershipTier: 'free' });
  });

  afterAll(async () => {
    try {
      await User.destroy({ where: { id: ids() }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('un miembro PRO vigente lo abre (antes pedía un SUPER PRO que ya no se vende)', async () => {
    fase.beta = false;
    const r = await request(app).get('/api/membership/analytics').set(con(pro));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  it('el dueño lo abre siempre', async () => {
    fase.beta = false;
    expect((await request(app).get('/api/membership/analytics').set(con(dueno))).status).toBe(200);
  });

  it('una cuenta gratis o con la membresía vencida recibe 403 «PRO_REQUIRED» con el mensaje de PRO', async () => {
    fase.beta = false;
    for (const u of [gratis, vencido]) {
      const r = await request(app).get('/api/membership/analytics').set(con(u));
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('PRO_REQUIRED');
      expect(r.body.message).toMatch(/membresía PRO/);
    }
  });

  it('las exportaciones (CSV y PDF) siguen la misma regla', async () => {
    fase.beta = false;
    for (const ruta of ['/api/membership/analytics/export.csv', '/api/membership/analytics/export.pdf']) {
      expect((await request(app).get(ruta).set(con(gratis))).status).toBe(403);
    }
    expect((await request(app).get('/api/membership/analytics/export.csv').set(con(pro))).status).toBe(200);
  });

  it('durante la beta una cuenta gratis también lo abre', async () => {
    fase.beta = true;
    try {
      expect((await request(app).get('/api/membership/analytics').set(con(gratis))).status).toBe(200);
    } finally {
      fase.beta = false;
    }
  });
});

describe('las pantallas del Centro Profesional', () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');

  it('la web ya no exige «super_pro» a secas: un miembro PRO pide los datos, y no se llama más «SUPER PRO»', () => {
    const panel = leer('client/pages/FinancePanel.tsx');
    expect(panel).toMatch(/membershipTier === "pro"/);
    expect(panel).not.toMatch(/exclusivo SUPER PRO|Pasarme a SUPER PRO/);
    expect(panel).not.toMatch(/>SUPER PRO</);
    expect(leer('client/pages/ProUsageDashboard.tsx')).toMatch(/membershipTier === 'pro'\)\s*&&\s*\(\s*<button/);
  });

  it('cada pestaña del panel tiene su guía educativa y la bienvenida con los primeros pasos', async () => {
    const panel = leer('client/pages/FinancePanel.tsx');
    const { GUIAS, PASOS_DE_BIENVENIDA, QUE_ES_EL_CENTRO } = await import('../../client/content/centroProfesional.js');
    const pestanas = [...panel.matchAll(/\["(\w+)", t\("finance\.tab\w+"/g)].map((m) => m[1]);
    expect(pestanas.sort()).toEqual(['crecimiento', 'finanzas', 'impuestos', 'profesional', 'reputacion']);
    for (const p of pestanas) {
      const g = (GUIAS as any)[p];
      expect(g).toBeDefined();
      expect(g.paraQueSirve.length).toBeGreaterThan(20);
      expect(g.comoSeLee.length).toBeGreaterThan(0);
      expect(g.queHacer.length).toBeGreaterThan(0);
    }
    expect(PASOS_DE_BIENVENIDA.length).toBeGreaterThanOrEqual(3);
    for (const paso of PASOS_DE_BIENVENIDA) expect(pestanas).toContain(paso.pestana);
    expect(QUE_ES_EL_CENTRO).toMatch(/membresía PRO/);
    expect(panel).toContain('<BienvenidaAlCentro');
    expect(panel).toContain('<GuiaDeLaPestana');
  });

  it('los textos son orientativos: mandan al contador cuando hay una decisión fiscal y no dicen «SUPER PRO»', async () => {
    const { GUIAS, AVISO_ORIENTATIVO } = await import('../../client/content/centroProfesional.js');
    const todo = JSON.stringify(GUIAS) + AVISO_ORIENTATIVO;
    expect(AVISO_ORIENTATIVO).toMatch(/contador/);
    expect(todo).not.toMatch(/SUPER PRO/i);
    expect(JSON.stringify((GUIAS as any).impuestos)).toMatch(/contador/);
  });
});
