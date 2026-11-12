import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El dashboard solo suma como GASTO lo que ya está confirmado (2026-11-11: «el dashboard me detecta gastos siendo que no fueron pagos confirmados»).
 *
 * `GET /api/balance/gastado`: cuentan los pagos con la plata confirmada (en custodia, listo para pagar, esperando confirmación, en reclamo, completado, aprobado). Los que están en
 * revisión —comprobante sin aprobar, o aprobado pero con la custodia sin verificar— se informan aparte (`enRevision`) y NO suman. Tampoco suman los pagos de otra persona, los
 * fallidos, cancelados ni devueltos, ni lo que no es un gasto (liberaciones al trabajador y reembolsos).
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('GET /api/balance/gastado', () => {
  let app: Express;
  let yo: any, otra: any;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const pagar = async (pagador: any, status: string, amount: number, extra: Record<string, unknown> = {}) => {
    const p = await Payment.create({ payerId: pagador.id, recipientId: null, amount, amountArs: amount, currency: 'ARS', status, paymentType: 'job_publication', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0, ...extra } as any);
    creados.push(String(p.id));
    return p;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/balance', (await import('../../server/routes/balance.js')).default);
    yo = await crearUsuario({ role: 'client' });
    otra = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { id: creados } as any });
      await User.destroy({ where: { id: [yo.id, otra.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('sin pagos: cero, sin nada en revisión', async () => {
    const r = await request(app).get('/api/balance/gastado').set(con(yo));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, totalGastado: 0, pagos: 0, enRevision: { pagos: 0, total: 0 } });
  });

  it('suma SOLO lo confirmado; lo que está en revisión se informa aparte y no suma', async () => {
    await pagar(yo, 'completed', 10000); // confirmado
    await pagar(yo, 'held_escrow', 5000, { paymentType: 'contract_payment' }); // confirmado: en custodia
    await pagar(yo, 'approved', 2000); // confirmado: el comprobante se aprobó
    await pagar(yo, 'verified', 7000, { paymentType: 'contract_payment' }); // comprobante aprobado, custodia sin verificar → en revisión
    await pagar(yo, 'pending_verification', 3000); // comprobante sin aprobar → en revisión
    const r = await request(app).get('/api/balance/gastado').set(con(yo));
    expect(r.body.totalGastado).toBe(17000);
    expect(r.body.pagos).toBe(3);
    expect(r.body.enRevision).toEqual({ pagos: 2, total: 10000 });
    expect(r.body.detalle).toHaveLength(3);
    expect(r.body.detalle.map((d: any) => d.estado)).not.toContain(undefined);
  });

  it('no suman los pendientes, fallidos, cancelados ni devueltos, ni los pagos de otra persona, ni liberaciones y reembolsos', async () => {
    const antes = (await request(app).get('/api/balance/gastado').set(con(yo))).body;
    await pagar(yo, 'pending', 1111);
    await pagar(yo, 'failed', 2222);
    await pagar(yo, 'cancelled', 3333);
    await pagar(yo, 'refunded', 4444);
    await pagar(yo, 'completed', 5555, { paymentType: 'escrow_release' });
    await pagar(yo, 'completed', 6666, { paymentType: 'refund' });
    await pagar(otra, 'completed', 99999);
    const despues = (await request(app).get('/api/balance/gastado').set(con(yo))).body;
    expect(despues.totalGastado).toBe(antes.totalGastado);
    expect(despues.pagos).toBe(antes.pagos);
    expect(despues.enRevision).toEqual(antes.enRevision);
  });

  it('cuando se confirma la custodia, el pago pasa de «en revisión» a gasto', async () => {
    const p = await pagar(yo, 'verified', 800, { paymentType: 'contract_payment' });
    const antes = (await request(app).get('/api/balance/gastado').set(con(yo))).body;
    await p.update({ status: 'held_escrow' } as any);
    const despues = (await request(app).get('/api/balance/gastado').set(con(yo))).body;
    expect(despues.totalGastado).toBe(antes.totalGastado + 800);
    expect(despues.enRevision.total).toBe(antes.enRevision.total - 800);
  });

  it('exige sesión', async () => {
    expect((await request(app).get('/api/balance/gastado')).status).toBe(401);
  });
});
