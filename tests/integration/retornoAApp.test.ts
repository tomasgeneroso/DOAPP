import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El retorno de Mercado Pago a la app del celular.
 *
 * Quien paga desde la app paga en el navegador del teléfono, y la página web de éxito necesita una sesión iniciada en ese
 * navegador: mostraba un error aunque el pago hubiera salido bien. Los pedidos que mandan `origen: 'app'` vuelven a una
 * página pública que lleva de regreso a la app. Sin ese origen, todo sigue exactamente igual que antes.
 * Además: un aumento ya pagado y en revisión no se puede pagar de nuevo, y el dueño ve en qué estado está.
 */

const mockCrearPago = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { createPayment: (...a: unknown[]) => mockCrearPago(...a), getPayment: async () => ({}) },
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
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('retorno de Mercado Pago a la app', () => {
  let app: Express;
  let cliente: any, otro: any, trabajador: any;
  const jobs: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const urlsDelUltimoPago = () => {
    const args = mockCrearPago.mock.calls.at(-1)?.[0] as any;
    return { exito: String(args?.successUrl), cancelado: String(args?.cancelUrl) };
  };

  const trabajoParaPagar = async () => {
    const t: any = await crearTrabajo(cliente.id, { status: 'pending_payment', price: 5000 });
    jobs.push(t.id);
    return t;
  };
  const trabajoConAumento = async (over: Record<string, unknown> = {}) => {
    const t: any = await crearTrabajo(cliente.id, {
      status: 'paused', price: 10000, pendingNewPrice: 12000, pendingPaymentAmount: 2300, pendingBalanceDeduction: 0,
      previousStatus: 'open', priceChangeReason: 'Más trabajo del previsto', ...over,
    });
    jobs.push(t.id);
    return t;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    // sin publicaciones gratis: para que publicar pida pago
    cliente = await crearUsuario({ role: 'client', freeContractsRemaining: 0, proContractsUsedThisMonth: 2 });
    otro = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
  });

  beforeEach(() => {
    mockCrearPago.mockReset();
    mockCrearPago.mockResolvedValue({ paymentId: 'pref-x', providerPaymentId: 'pref-x', checkoutUrl: 'https://mp.test/checkout' });
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { payerId: [cliente.id, otro.id] } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, otro.id, trabajador.id] }, force: true });
    } catch { /* ok */ }
  });

  describe('publicación', () => {
    it('desde la app vuelve a la página que lleva a la app (con el trabajo), y cancelar también', async () => {
      const t = await trabajoParaPagar();

      const r = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: t.id, paymentType: 'job_publication', origen: 'app' });

      expect(r.status).toBe(200);
      expect(r.body.approvalUrl).toBeTruthy();
      expect(r.body.preferenceId).toBe('pref-x');
      const u = urlsDelUltimoPago();
      expect(u.exito).toContain(`/payment/app-return?tipo=publicacion&estado=ok&jobId=${t.id}`);
      expect(u.cancelado).toContain(`/payment/app-return?tipo=publicacion&estado=cancelado&jobId=${t.id}`);
    });

    it('desde la web NO cambia nada: la misma página de éxito de siempre', async () => {
      const t = await trabajoParaPagar();

      const r = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: t.id, paymentType: 'job_publication' });

      expect(r.status).toBe(200);
      const u = urlsDelUltimoPago();
      expect(u.exito).toContain(`/payment/success?type=job_publication&jobId=${t.id}`);
      expect(u.exito).not.toContain('app-return');
      expect(u.cancelado).toContain(`/jobs/${t.id}/payment`);
    });

    it('un origen que no es exactamente «app» se trata como web', async () => {
      const t = await trabajoParaPagar();

      await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: t.id, paymentType: 'job_publication', origen: 'App' });

      expect(urlsDelUltimoPago().exito).toContain('/payment/success?type=job_publication');
    });
  });

  describe('aumento de precio', () => {
    it('desde la app vuelve a la página que lleva a la app', async () => {
      const t = await trabajoConAumento();

      const r = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: t.id, paymentType: 'budget_increase', origen: 'app' });

      expect(r.status).toBe(200);
      expect(urlsDelUltimoPago().exito).toContain(`/payment/app-return?tipo=aumento&estado=ok&jobId=${t.id}`);
    });

    it('con el aumento YA pagado y en revisión no se cobra de nuevo (409) y no se crea otro pago', async () => {
      const t = await trabajoConAumento();
      const pagado: any = await Payment.create({
        payerId: cliente.id, recipientId: null, contractId: null, amount: 2300, currency: 'ARS', status: 'pending_verification',
        paymentType: 'budget_increase', paymentMethod: 'mercadopago', mercadopagoVerifiedAt: new Date(),
        platformFee: 0, platformFeePercentage: 0, isEscrow: false,
      } as any);
      await t.update({ publicationPaymentId: pagado.id });
      const antes = await Payment.count({ where: { payerId: cliente.id } });

      const r = await request(app).post('/api/payments/create-order').set(con(cliente)).send({ jobId: t.id, paymentType: 'budget_increase', origen: 'app' });

      expect(r.status).toBe(409);
      expect(r.body.code).toBe('AUMENTO_PAGADO_EN_REVISION');
      expect(mockCrearPago).not.toHaveBeenCalled();
      expect(await Payment.count({ where: { payerId: cliente.id } })).toBe(antes);
    });
  });

  describe('contrato con garantía', () => {
    it('desde la app vuelve a la página que lleva a la app (con el contrato)', async () => {
      const t: any = await crearTrabajo(cliente.id, { status: 'open', price: 5000 });
      jobs.push(t.id);
      const c: any = await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', paymentStatus: 'pending', price: 5000 });

      const r = await request(app).post(`/api/payments/contract/${c.id}`).set(con(cliente)).send({ origen: 'app' });

      expect(r.status).toBe(200);
      expect(r.body.paymentUrl).toBeTruthy();
      expect(urlsDelUltimoPago().exito).toContain(`/payment/app-return?tipo=contrato&estado=ok&contractId=${c.id}`);
    });

    it('desde la web vuelve al contrato, como siempre', async () => {
      const t: any = await crearTrabajo(cliente.id, { status: 'open', price: 5000 });
      jobs.push(t.id);
      const c: any = await crearContrato({ jobId: t.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', paymentStatus: 'pending', price: 5000 });

      await request(app).post(`/api/payments/contract/${c.id}`).set(con(cliente)).send({});

      expect(urlsDelUltimoPago().exito).toContain(`/contracts/${c.id}?pago=ok`);
    });
  });

  describe('el dueño ve en qué estado está su aumento', () => {
    it('sin pagar: «sin_pagar» con el precio nuevo y lo que falta pagar', async () => {
      const t = await trabajoConAumento();

      const r = await request(app).get(`/api/jobs/${t.id}`).set(con(cliente));

      expect(r.status).toBe(200);
      expect(r.body.job.aumentoPendiente).toMatchObject({ estado: 'sin_pagar', precioNuevo: 12000, montoAPagar: 2300 });
      expect(r.body.job.aumentoPendiente.horasDeEspera).toBeGreaterThan(0);
    });

    it('pagado y esperando al administrador: «pagado_en_revision»', async () => {
      const t = await trabajoConAumento();
      const pagado: any = await Payment.create({
        payerId: cliente.id, recipientId: null, contractId: null, amount: 2300, currency: 'ARS', status: 'pending_verification',
        paymentType: 'budget_increase', paymentMethod: 'mercadopago', mercadopagoVerifiedAt: new Date(),
        platformFee: 0, platformFeePercentage: 0, isEscrow: false,
      } as any);
      await t.update({ publicationPaymentId: pagado.id });

      const r = await request(app).get(`/api/jobs/${t.id}`).set(con(cliente));

      expect(r.body.job.aumentoPendiente.estado).toBe('pagado_en_revision');
    });

    it('otra persona (o sin sesión) no ve ese dato', async () => {
      const t = await trabajoConAumento();

      const ajeno = await request(app).get(`/api/jobs/${t.id}`).set(con(otro));
      const anonimo = await request(app).get(`/api/jobs/${t.id}`);

      expect(ajeno.body.job.aumentoPendiente).toBeUndefined();
      expect(anonimo.body.job.aumentoPendiente).toBeUndefined();
    });

    it('un trabajo sin cambio de precio pendiente no trae el dato', async () => {
      const t: any = await crearTrabajo(cliente.id, { status: 'open', price: 5000 });
      jobs.push(t.id);

      const r = await request(app).get(`/api/jobs/${t.id}`).set(con(cliente));

      expect(r.body.job.aumentoPendiente).toBeUndefined();
    });
  });
});
