import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * GET /api/admin/hubs/financial/mercadopago: lo que Mercado Pago todavía tiene que liquidar (neto, por fecha de liberación).
 * Incidente 2026-10-19: el dashboard no mostraba los $4.987,35 «a liquidar el 30/10» que sí veía el panel de Mercado Pago.
 */
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));

import { Payment } from '../../server/models/sql/Payment.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('Mercado Pago · a liquidar', () => {
  let app: Express;
  let admin: any, comun: any, pagador: any;
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const dentroDe = (dias: number) => new Date(Date.now() + dias * 86_400_000);

  const pago = async (over: Record<string, unknown>) => {
    const p: any = await Payment.create({
      payerId: pagador.id, amount: 5267.03, currency: 'ARS', status: 'held_escrow', paymentType: 'job_publication', paymentMethod: 'mercadopago',
      isEscrow: true, platformFee: 0, platformFeePercentage: 0, mercadopagoPaymentId: `mp-${Math.random()}`, ...over,
    } as any);
    pagos.push(p.id);
    return p;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/hubs', (await import('../../server/routes/admin/hubs.js')).default);
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    comun = await crearUsuario({ role: 'client' });
    pagador = await crearUsuario({ role: 'client' });
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { id: pagos } });
      await User.destroy({ where: { id: [admin.id, comun.id, pagador.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('suma el neto de lo cobrado que todavía no se liberó, por día, y deja afuera lo ya liberado, lo pendiente y lo devuelto', async () => {
    const antes = (await request(app).get('/api/admin/hubs/financial/mercadopago').set(con(admin))).body.mercadopago;
    await pago({ netReceivedAmount: 4987.35, moneyReleaseDate: dentroDe(10) });
    await pago({ netReceivedAmount: 1000, moneyReleaseDate: dentroDe(10) });
    await pago({ netReceivedAmount: 777, moneyReleaseDate: dentroDe(-2) }); // ya liberado
    await pago({ netReceivedAmount: 555, moneyReleaseDate: dentroDe(5), status: 'pending' }); // no se cobró
    await pago({ netReceivedAmount: 444, moneyReleaseDate: dentroDe(5), status: 'refunded' }); // devuelto
    await pago({ netReceivedAmount: 333, moneyReleaseDate: dentroDe(5), mercadopagoPaymentId: null }); // no es de Mercado Pago
    await pago({ netReceivedAmount: null, moneyReleaseDate: dentroDe(7) }); // sin neto conocido

    const r = await request(app).get('/api/admin/hubs/financial/mercadopago').set(con(admin));
    expect(r.status).toBe(200);
    const d = r.body.mercadopago;
    expect(d.porLiquidarARS - antes.porLiquidarARS).toBeCloseTo(5987.35, 2);
    expect(d.pagosPorLiquidar - antes.pagosPorLiquidar).toBe(3);
    expect(d.pagosSinNeto - antes.pagosSinNeto).toBe(1);
    expect(d.porDia.length).toBeGreaterThan(0);
    expect(d.porDia[0]).toMatchObject({ dia: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('un usuario común no lo ve', async () => {
    const r = await request(app).get('/api/admin/hubs/financial/mercadopago').set(con(comun));
    expect([401, 403]).toContain(r.status);
  });
});
