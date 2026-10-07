import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../server/models/sql/User.model.js';
import { BusinessPlan } from '../../server/models/sql/BusinessPlan.model.js';
import cookieParser from 'cookie-parser';
import { wafMiddleware } from '../../server/middleware/waf.js';
import {
  securityHeaders,
  xssProtection,
  preventDirectoryTraversal,
  apiLimiter,
} from '../../server/middleware/security.js';

/**
 * El plan de negocio se guarda de verdad.
 *
 * Qué motivó esto: "no me guardan los valores que cambio". La pantalla guarda
 * sola, con un retraso de menos de un segundo después de cada cambio, y todas
 * las pruebas de esa pantalla usaban una API SIMULADA: probaban que el cliente
 * manda lo que corresponde, no que el servidor lo conserve y lo devuelva. Es la
 * mitad del recorrido que nunca se había verificado.
 *
 * Esto guarda con el servidor real y la base de pruebas, vuelve a pedir el plan y
 * compara. Incluye los casos que suelen perder datos sin avisar: el cero, el
 * `false`, un plan parcial, y cada rol que puede entrar.
 */

const RUTA = '/api/admin/business-plan';
const SLUG = 'constitucion';

describe('el plan de negocio se guarda y se recupera', () => {
  let app: Express;
  const usuarios: Record<string, { id: string; token: string }> = {};

  const crear = async (clave: string, adminRole: string | null) => {
    const u: any = await User.create({
      email: `${clave}@plan.test`,
      name: `Persona ${clave}`,
      username: `plan${clave}`,
      password: 'password123',
      role: 'doer',
      ...(adminRole ? { adminRole } : {}),
    } as any);
    usuarios[clave] = {
      id: u.id,
      token: jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret'),
    };
  };

  const como = (clave: string) => ({ Authorization: `Bearer ${usuarios[clave].token}` });
  const guardar = (clave: string, data: any) =>
    request(app).put(RUTA).set(como(clave)).send({ data });
  const leer = (clave = 'owner') => request(app).get(RUTA).set(como(clave));

  beforeAll(async () => {
    /**
     * La MISMA cadena que tiene el servidor real delante de cada ruta
     * (server/index.ts): WAF, saneador de XSS, bloqueo de rutas y límite de
     * pedidos. La primera versión de esta prueba montaba sólo la ruta, y no veía
     * nada de lo que pasa en el camino: si alguno de estos middlewares rechaza o
     * reescribe el guardado, tiene que verse acá.
     */
    app = express();
    app.use(wafMiddleware);
    app.use(express.json({ limit: '10mb' }));
    app.use(cookieParser());
    app.use(securityHeaders);
    app.use(xssProtection);
    app.use(preventDirectoryTraversal);
    app.use('/api', apiLimiter);
    const rutas = await import('../../server/routes/admin/businessPlan.js');
    app.use(RUTA, rutas.default);

    await BusinessPlan.destroy({ where: { slug: SLUG } });
    await crear('owner', 'owner');
    await crear('analista', 'analista');
    await crear('comun', null);
  });

  afterAll(async () => {
    await BusinessPlan.destroy({ where: { slug: SLUG } });
    await User.destroy({
      where: { email: ['owner@plan.test', 'analista@plan.test', 'comun@plan.test'] },
    });
  });

  beforeEach(async () => {
    await BusinessPlan.destroy({ where: { slug: SLUG } });
  });

  it('sin nada guardado devuelve los valores por defecto', async () => {
    const r = await leer();
    expect(r.status).toBe(200);
    expect(r.body.isDefault).toBe(true);
    expect(r.body.data.ue.fijos).toBeGreaterThan(0);
  });

  it('lo que se guarda es lo que se vuelve a leer', async () => {
    const base = (await leer()).body.data;
    const cambiado = {
      ...base,
      ueCurrency: 'ARS',
      ue: { ...base.ue, mauActual: 12345, soporte: 2.5, contratos: 0.55, disputas: 1, fraude: 0.5 },
      ueOrigen: {
        ticket: { moneda: 'ARS', monto: 12345 },
        soporte: { moneda: 'USD', monto: 2.5 },
      },
      rateArs: 1777,
    };

    const put = await guardar('owner', cambiado);
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);

    const r = await leer();
    expect(r.body.isDefault).toBe(false);
    expect(r.body.data.ue.mauActual).toBe(12345);
    expect(r.body.data.ue.soporte).toBe(2.5);
    expect(r.body.data.ue.contratos).toBe(0.55);
    expect(r.body.data.ueCurrency).toBe('ARS');
    expect(r.body.data.rateArs).toBe(1777);
    // El origen de los importes viaja y vuelve igual: sin esto el cambio de
    // moneda no podría devolver el número original después de recargar.
    expect(r.body.data.ueOrigen).toMatchObject(cambiado.ueOrigen);
    // Los costos fijos NO son una entrada: salen de los gastos de la etapa real, y
    // su origen lo registra la coordinación (en la moneda de esa tabla).
    expect(r.body.data.ueOrigen.fijos.moneda).toBe(r.body.data.budgetRealCurrency);
  });

  it('el cero y el false se guardan: no se revierten al valor por defecto', async () => {
    /**
     * El caso clásico de pérdida silenciosa: completar lo que "falta" con el
     * valor por defecto usando `||` o `if (!valor)` convierte un cero legítimo
     * (soporte gratis, churn cero) en el número de fábrica.
     */
    const base = (await leer()).body.data;
    const conCeros = {
      ...base,
      ue: { ...base.ue, soporte: 0, fraude: 0, disputas: 0, mauActual: 0 },
      projection: {
        ...base.projection,
        growth: { ...base.projection.growth, churnPct: 0, techoUsuarios: 0 },
        revenue: { ...base.projection.revenue, ingresosConIva: false, membresiaPct: 0 },
        costs: { ...base.projection.costs, costosConIvaPct: 0, cac: 0 },
      },
    };

    expect((await guardar('owner', conCeros)).status).toBe(200);
    const d = (await leer()).body.data;

    expect(d.ue.soporte).toBe(0);
    expect(d.ue.fraude).toBe(0);
    expect(d.ue.disputas).toBe(0);
    expect(d.projection.growth.churnPct).toBe(0);
    expect(d.projection.growth.techoUsuarios).toBe(0);
    expect(d.projection.revenue.ingresosConIva).toBe(false);
    expect(d.projection.costs.costosConIvaPct).toBe(0);
    expect(d.projection.costs.cac).toBe(0);
  });

  it('una serie de cambios seguidos conserva el último de cada campo', async () => {
    // Es lo que pasa al tipear: cada tecla guarda el plan entero.
    let plan = (await leer()).body.data;
    for (const mauActual of [1, 12, 123, 1234, 12345]) {
      plan = { ...plan, ue: { ...plan.ue, mauActual } };
      expect((await guardar('owner', plan)).status).toBe(200);
    }
    plan = { ...plan, ue: { ...plan.ue, soporte: 7 } };
    expect((await guardar('owner', plan)).status).toBe(200);

    const d = (await leer()).body.data;
    expect(d.ue.mauActual).toBe(12345);
    expect(d.ue.soporte).toBe(7);
  });

  it('un plan guardado con menos campos se completa sin pisar lo guardado', async () => {
    expect((await guardar('owner', { ue: { mauActual: 999 } })).status).toBe(200);
    const d = (await leer()).body.data;

    expect(d.ue.mauActual).toBe(999); // lo guardado manda
    expect(d.ue.ticket).toBeGreaterThan(0); // lo que faltaba se completó
    expect(d.projection.growth.horizonteMeses).toBeGreaterThan(0);
  });

  it('el analista también guarda, y el owner ve lo que guardó', async () => {
    const base = (await leer('analista')).body.data;
    const put = await guardar('analista', { ...base, ue: { ...base.ue, mauActual: 4242 } });
    expect(put.status).toBe(200);

    expect((await leer('owner')).body.data.ue.mauActual).toBe(4242);
  });

  it('quién guardó queda registrado', async () => {
    const base = (await leer()).body.data;
    await guardar('analista', base);
    const r = await leer();
    expect(r.body.updatedBy).toBe('Persona analista');
    expect(r.body.updatedAt).toBeTruthy();
  });

  it('un usuario común no puede guardar ni leer, y no cambia nada', async () => {
    const base = (await leer()).body.data;
    expect((await guardar('owner', { ...base, ue: { ...base.ue, mauActual: 111 } })).status).toBe(200);

    const intento = await guardar('comun', { ...base, ue: { ...base.ue, mauActual: 999999 } });
    expect(intento.status).toBe(403);
    expect((await leer('comun')).status).toBe(403);

    expect((await leer()).body.data.ue.mauActual).toBe(111);
  });

  it('sin sesión devuelve 401, no un guardado a medias', async () => {
    const r = await request(app).put(RUTA).send({ data: { ue: { mauActual: 5 } } });
    expect(r.status).toBe(401);
  });

  it('rechaza un cuerpo que no es un plan, sin tocar el guardado', async () => {
    const base = (await leer()).body.data;
    expect((await guardar('owner', { ...base, ue: { ...base.ue, mauActual: 777 } })).status).toBe(200);

    for (const malo of [null, 'texto', [1, 2, 3], 42]) {
      const r = await request(app).put(RUTA).set(como('owner')).send({ data: malo as any });
      expect(r.status).toBe(400);
    }
    expect((await leer()).body.data.ue.mauActual).toBe(777);
  });

  it('un plan desmesurado se rechaza con 413 y no pisa el guardado', async () => {
    const base = (await leer()).body.data;
    expect((await guardar('owner', { ...base, ue: { ...base.ue, mauActual: 555 } })).status).toBe(200);

    const enorme = { ...base, relleno: 'x'.repeat(600 * 1024) };
    expect((await guardar('owner', enorme)).status).toBe(413);
    expect((await leer()).body.data.ue.mauActual).toBe(555);
  });

  /**
   * Los bloques del plan coinciden.
   *
   * El plan tenía un ticket en la economía unitaria y otro en la proyección, y dos
   * costos fijos distintos; cada lector resolvía la contradicción a su manera. Lo
   * que se lee tiene que venir ya coordinado (shared/pricing/planCoordinado.ts), sin
   * importar lo que haya quedado guardado en la base.
   */
  describe('lo que se lee viene coordinado', () => {
    it('sin nada guardado: trae la beta, con comisión 0 y sus meses', async () => {
      const d = (await leer()).body.data;
      expect(d.betaMeses).toBeGreaterThanOrEqual(0);
      expect(d.betaMeses).toBeLessThanOrEqual(24);
      expect(d.projection.beta).toBeDefined();
      expect(d.projection.beta.comisionPct).toBe(0);
      expect(d.projection.beta.meses).toBe(d.betaMeses);
      expect(d.projection.growth.horizonteMeses).toBe(120);
    });

    it('un plan guardado sin etapa real la recibe como copia de SU presupuesto, no del de fábrica', async () => {
      const base = (await leer()).body.data;
      const { budgetReal: _r, budgetRealCurrency: _m, ...sinReal } = base;
      const propio = [{ c: 'Algo propio', m: 777, n: '' }];
      expect((await guardar('owner', { ...sinReal, budget: propio, budgetCurrency: 'EUR' })).status).toBe(200);

      const d = (await leer()).body.data;
      expect(d.budgetReal).toEqual(propio);
      expect(d.budgetRealCurrency).toBe('EUR');
    });

    it('el ticket de la proyección es el de la economía unitaria, no el que había guardado', async () => {
      const base = (await leer()).body.data;
      const viejo = {
        ...base,
        projectionCurrency: 'USD',
        ueCurrency: 'USD',
        ue: { ...base.ue, ticket: 21 },
        ueOrigen: { ticket: { moneda: 'USD', monto: 21 } },
        projection: {
          ...base.projection,
          revenue: { ...base.projection.revenue, ticket: 9999, comisionPct: 77 },
        },
      };
      expect((await guardar('owner', viejo)).status).toBe(200);

      const d = (await leer()).body.data;
      expect(d.projection.revenue.ticket).toBe(21);
      expect(d.projection.revenue.comisionPct).toBe(d.ue.comision);
    });

    it('los costos fijos salen de los rubros fijos de la etapa real; lo guardado a mano se pisa', async () => {
      const base = (await leer()).body.data;
      const plan = {
        ...base,
        projectionCurrency: 'USD',
        budgetRealCurrency: 'USD',
        budgetReal: [
          { c: 'Meta Ads', m: 8000, n: '' },
          { c: 'Abogado', m: 1000, n: '' },
          { c: 'Servidores', m: 500, n: '' },
        ],
        ue: { ...base.ue, fijos: 424242 },
        projection: { ...base.projection, costs: { ...base.projection.costs, fijosMensuales: 123456, cac: 4 } },
      };
      expect((await guardar('owner', plan)).status).toBe(200);

      const d = (await leer()).body.data;
      expect(d.projection.costs.fijosMensuales).toBe(1500); // sin la publicidad
      expect(d.ue.fijos).toBeCloseTo(1500, 4);
      // y la publicidad compra usuarios: 8.000 ÷ CAC 4
      expect(d.projection.growth.altasPorMes).toBe(2000);
    });

    it('lo coordinado no cambia al leerlo otra vez ni al guardarlo y volver a leerlo', async () => {
      const a = (await leer()).body.data;
      expect((await guardar('owner', a)).status).toBe(200);
      const b = (await leer()).body.data;
      expect(b).toEqual(a);
    });
  });
});
