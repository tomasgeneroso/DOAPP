import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * POST /api/payments/create-order con paymentType "job_publication": sólo se paga una publicación que está
 * ESPERANDO el pago (borrador o pendiente de pago).
 *
 * Antes la ruta no miraba el estado del trabajo:
 *  - con una publicación ya abierta, MercadoPago cobraba de nuevo y capture-order no hacía nada (un cobro por nada);
 *  - con contratos gratis, el camino "publicar sin pagar" ponía "open" a un trabajo cancelado o terminado, y
 *    gastaba un contrato gratis cada vez que se repetía.
 */

const mockCrearPago = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: {
    createPayment: (...a: unknown[]) => mockCrearPago(...a),
    getPayment: async () => ({}),
  },
}));
jest.mock('../../server/services/currencyExchange.js', () => ({
  __esModule: true,
  describirCotizacion: (q: unknown) => q,
  default: {
    convertEURtoARS: async (n: number) => n * 3000,
    getEURtoARSRate: async () => 3000,
    getQuotedEURRate: async () => ({ rate: 3000 }),
    getUSDtoARSRate: async () => 1000,
    convertUSDtoARS: async (n: number) => n * 1000,
  },
}));
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: { sendEmail: async () => true } }));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('create-order de una publicación: sólo si el trabajo espera el pago', () => {
  let app: Express;
  let ana: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const pagar = (jobId: string) =>
    request(app).post('/api/payments/create-order').set(con(ana)).send({ paymentType: 'job_publication', jobId });
  const nuevo = async (status: string) => {
    const t = await crearTrabajo(ana.id, { status, price: 10000 });
    jobs.push(t.id);
    return t;
  };
  const trabajo = async (id: string) => (await Job.findByPk(id)) as any;
  const gratis = async () => ((await User.findByPk(ana.id)) as any).freeContractsRemaining as number;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    ana = await crearUsuario({ role: 'client', freeContractsRemaining: 3 });
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { payerId: ana.id } });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: ana.id }, force: true });
    } catch { /* ok */ }
  });

  it.each(['open', 'in_progress', 'completed', 'cancelled', 'paused', 'pending_approval'])(
    'un trabajo en "%s" no se paga como publicación: 409, sin cobro y sin tocar el trabajo ni los contratos gratis',
    async (estado) => {
      mockCrearPago.mockClear();
      const t = await nuevo(estado);
      const antes = await gratis();

      const r = await pagar(t.id);

      expect([estado, r.status]).toEqual([estado, 409]);
      expect(r.body.code).toBe('JOB_NOT_AWAITING_PAYMENT');
      expect(mockCrearPago).not.toHaveBeenCalled();
      expect((await trabajo(t.id)).status).toBe(estado);
      expect(await gratis()).toBe(antes);
      expect(await Payment.count({ where: { payerId: ana.id, paymentType: 'job_publication' } })).toBe(0);
    },
  );

  it('un trabajo pendiente de pago con contrato gratis se publica sin pagar (camino feliz, no se rompió)', async () => {
    const t = await nuevo('pending_payment');
    const antes = await gratis();
    const r = await pagar(t.id);
    expect(r.status).toBe(200);
    expect(r.body.requiresPayment).toBe(false);
    expect((await trabajo(t.id)).status).toBe('open');
    expect(await gratis()).toBe(antes - 1);

    // y repetirlo ya no gasta otro contrato gratis ni vuelve a "publicar"
    const otra = await pagar(t.id);
    expect(otra.status).toBe(409);
    expect(await gratis()).toBe(antes - 1);
  });

  it('un borrador sin contratos gratis sigue yendo a MercadoPago (camino feliz, no se rompió)', async () => {
    // En la beta todos son «super_pro» (getEffectiveTier): hay 2 publicaciones gratis por mes. Se agotan para probar el cobro.
    await User.update({ freeContractsRemaining: 0, proContractsUsedThisMonth: 2 } as any, { where: { id: ana.id } });
    mockCrearPago.mockReset();
    mockCrearPago.mockResolvedValue({ paymentId: 'pref-pub-1', checkoutUrl: 'https://mp.test/checkout' });
    const t = await nuevo('draft');

    const r = await pagar(t.id);

    expect(r.status).toBe(200);
    expect(r.body.approvalUrl).toBe('https://mp.test/checkout');
    expect(mockCrearPago).toHaveBeenCalledTimes(1);
    expect((await trabajo(t.id)).status).toBe('draft'); // se publica recién cuando MercadoPago confirma
  });
});
