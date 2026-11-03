import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Rechazar (y aprobar) un pago mira los DOS lugares donde existe la plata: DOAPP y Mercado Pago.
 *
 * Lo que pasaba: «rechazar» no miraba el estado del pago. Uno ya completado, en garantía o devuelto pasaba a «rechazado», y la publicación volvía a «pendiente
 * de pago» aunque ya estuviera en curso. Peor: un pago que Mercado Pago SÍ había cobrado se podía rechazar en DOAPP, y el cliente se quedaba sin su publicación y
 * sin su plata. Y aprobar un pago de Mercado Pago no le preguntaba a Mercado Pago si lo había cobrado.
 */
const mockMp: { respuesta: () => Promise<any> } = { respuesta: async () => ({ status: 'approved', transaction_amount: 5000, transaction_amount_refunded: 0 }) };
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { getPayment: async () => mockMp.respuesta() },
}));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));
jest.mock('../../server/services/invoiceService.js', () => ({
  __esModule: true,
  generateClientPaymentInvoice: async () => undefined,
  generateWorkerPaymentInvoice: async () => undefined,
  getUserInvoices: async () => [],
  getInvoiceById: async () => null,
}));

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('rechazar y aprobar un pago: DOAPP y Mercado Pago tienen que coincidir', () => {
  let app: Express;
  let cliente: any, admin: any;
  const creados = { pagos: [] as string[], jobs: [] as string[] };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const rechazar = (id: string) => request(app).post(`/api/admin/payments/${id}/reject`).set(con(admin)).send({ reason: 'no entró' });
  const aprobar = (id: string) => request(app).post(`/api/admin/payments/${id}/approve`).set(con(admin)).send({ notes: 'ok' });
  const pagoDe = async (id: string) => (await Payment.findByPk(id)) as any;
  const trabajoDe = async (id: string) => (await Job.findByPk(id)) as any;

  /** Una publicación con su pago. `enMp` = el pago tiene número de operación de Mercado Pago. */
  const publicacion = async (over: { status?: string; enMp?: boolean; jobStatus?: string } = {}) => {
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 5000, amountArs: 5000, currency: 'ARS', status: over.status ?? 'pending_verification', paymentType: 'job_publication',
      paymentMethod: over.enMp ? 'mercadopago' : 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
      ...(over.enMp ? { mercadopagoPaymentId: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } : {}),
    } as any);
    creados.pagos.push(pago.id);
    const trabajo: any = await crearTrabajo(cliente.id, { status: over.jobStatus ?? 'pending_payment', publicationPaymentId: pago.id });
    creados.jobs.push(trabajo.id);
    return { pago, trabajo };
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
  });

  beforeEach(() => {
    mockMp.respuesta = async () => ({ status: 'approved', transaction_amount: 5000, transaction_amount_refunded: 0 });
  });

  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: [cliente.id, admin.id] } });
      await AuditLog.destroy({ where: { targetId: creados.pagos } as any });
      await PaymentProof.destroy({ where: { paymentId: creados.pagos } });
      await Notification.destroy({ where: { recipientId: [cliente.id, admin.id] } });
      await Job.destroy({ where: { id: creados.jobs }, force: true });
      await Payment.destroy({ where: { id: creados.pagos }, force: true } as any);
      await User.destroy({ where: { id: [cliente.id, admin.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('rechazar', () => {
    it('un pago que espera aprobación se rechaza y la publicación vuelve a «pendiente de pago»', async () => {
      const { pago, trabajo } = await publicacion();
      const r = await rechazar(pago.id);
      expect(r.status).toBe(200);
      expect((await pagoDe(pago.id)).status).toBe('rejected');
      expect((await trabajoDe(trabajo.id)).status).toBe('pending_payment');
    });

    it('rechazar dos veces: el segundo recibe 409 y no repite el aviso', async () => {
      const { pago, trabajo } = await publicacion();
      expect((await rechazar(pago.id)).status).toBe(200);
      const avisos = await Notification.count({ where: { recipientId: cliente.id, relatedId: trabajo.id } as any });
      const otra = await rechazar(pago.id);
      expect(otra.status).toBe(409);
      expect(otra.body.code).toBe('PAYMENT_NOT_PENDING_APPROVAL');
      expect(await Notification.count({ where: { recipientId: cliente.id, relatedId: trabajo.id } as any })).toBe(avisos);
    });

    it.each(['completed', 'held_escrow', 'refunded', 'confirmed_for_payout', 'rejected', 'cancelled'])('un pago «%s» NO se rechaza y la publicación no se toca', async (estado) => {
      const { pago, trabajo } = await publicacion({ status: estado, jobStatus: 'open' });
      const r = await rechazar(pago.id);
      expect([estado, r.status]).toEqual([estado, 409]);
      expect((await pagoDe(pago.id)).status).toBe(estado);
      expect((await trabajoDe(trabajo.id)).status).toBe('open');
    });

    it('una publicación que ya está en curso no vuelve a «pendiente de pago» aunque su pago se rechace', async () => {
      const { pago, trabajo } = await publicacion({ jobStatus: 'in_progress' });
      expect((await rechazar(pago.id)).status).toBe(200);
      expect((await trabajoDe(trabajo.id)).status).toBe('in_progress');
    });

    it('dos pedidos a la vez (rechazar y aprobar): gana uno solo', async () => {
      const { pago } = await publicacion();
      const [a, b] = await Promise.all([rechazar(pago.id), aprobar(pago.id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('si a ese pago ya se le devolvió plata al saldo del cliente, no se rechaza', async () => {
      const { pago } = await publicacion();
      await BalanceTransaction.create({
        userId: cliente.id, type: 'refund', amount: 1000, balanceBefore: 0, balanceAfter: 1000, description: 'devolución de prueba', status: 'completed',
        metadata: { pagoId: pago.id, origen: 'cancelacion' },
      } as any);
      const r = await rechazar(pago.id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_ALREADY_REFUNDED');
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
    });

    it('Mercado Pago YA COBRÓ este pago: no se rechaza «a ciegas» en DOAPP (el cliente perdería publicación y plata)', async () => {
      const { pago } = await publicacion({ enMp: true });
      const r = await rechazar(pago.id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('MERCADOPAGO_YA_COBRO');
      expect(r.body.requiereReconocimiento).toBe(true);
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
    });

    it('...salvo que quien rechaza reconozca que Mercado Pago ya cobró: se rechaza y queda anotado que falta devolver la plata', async () => {
      const { pago } = await publicacion({ enMp: true });
      const r = await request(app).post(`/api/admin/payments/${pago.id}/reject`).set(con(admin)).send({ reason: 'pago duplicado', reconoceQueMercadoPagoYaCobro: true });
      expect(r.status).toBe(200);
      const despues = await pagoDe(pago.id);
      expect(despues.status).toBe('rejected');
      expect(despues.adminNotes).toMatch(/Mercado Pago ya había cobrado este pago: falta devolverle la plata al cliente/);
    });

    it('Mercado Pago no lo cobró (pendiente): se rechaza', async () => {
      mockMp.respuesta = async () => ({ status: 'pending', transaction_amount: 5000, transaction_amount_refunded: 0 });
      const { pago } = await publicacion({ enMp: true });
      expect((await rechazar(pago.id)).status).toBe(200);
    });

    it('si no se puede consultar a Mercado Pago no se decide a ciegas (503) y el pago queda como estaba', async () => {
      mockMp.respuesta = async () => {
        throw new Error('sin conexión');
      };
      const { pago } = await publicacion({ enMp: true });
      const r = await rechazar(pago.id);
      expect(r.status).toBe(503);
      expect(r.body.code).toBe('MERCADOPAGO_NO_RESPONDE');
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
    });
  });

  describe('devolver un pago por Mercado Pago (reembolso)', () => {
    const devolver = (id: string, extra: Record<string, unknown> = {}) =>
      request(app).post(`/api/admin/payments/${id}/refund`).set(con(admin)).send({ motivo: 'devolución de prueba de este pago', ...extra });

    it('si el pago YA volvió entero al saldo del cliente, no se devuelve de nuevo por Mercado Pago (no hay nada que devolver)', async () => {
      const { pago } = await publicacion({ status: 'completed', enMp: true });
      await BalanceTransaction.create({
        userId: cliente.id, type: 'refund', amount: 5000, balanceBefore: 0, balanceAfter: 5000, description: 'devolución de prueba', status: 'completed',
        metadata: { pagoId: pago.id, origen: 'cancelacion' },
      } as any);
      const r = await devolver(pago.id);
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/ya fue devuelto por completo/);
      expect(Number((await pagoDe(pago.id)).refundedAmount) || 0).toBe(0);
    });

    it('si volvió una parte al saldo, solo se puede devolver el resto (no el total)', async () => {
      const { pago } = await publicacion({ status: 'completed', enMp: true });
      await BalanceTransaction.create({
        userId: cliente.id, type: 'refund', amount: 3000, balanceBefore: 0, balanceAfter: 3000, description: 'devolución de prueba', status: 'completed',
        metadata: { pagoId: pago.id, origen: 'cancelacion' },
      } as any);
      const r = await devolver(pago.id, { monto: 4000 });
      expect(r.status).toBe(400);
      expect(r.body.disponible).toBe(2000);
      expect(r.body.message).toMatch(/al saldo del cliente/);
    });
  });

  describe('aprobar un pago de Mercado Pago', () => {
    it('Mercado Pago lo confirma por el monto: se aprueba y publica el trabajo', async () => {
      const { pago, trabajo } = await publicacion({ enMp: true });
      const r = await aprobar(pago.id);
      expect(r.status).toBe(200);
      expect((await pagoDe(pago.id)).status).toBe('completed');
      expect((await trabajoDe(trabajo.id)).status).not.toBe('pending_payment');
    });

    it('Mercado Pago dice que NO está aprobado: no se aprueba y no se publica nada', async () => {
      mockMp.respuesta = async () => ({ status: 'pending', transaction_amount: 5000, transaction_amount_refunded: 0 });
      const { pago, trabajo } = await publicacion({ enMp: true });
      const r = await aprobar(pago.id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('MERCADOPAGO_NO_CONFIRMA');
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
      expect((await trabajoDe(trabajo.id)).status).toBe('pending_payment');
    });

    it('Mercado Pago ya devolvió parte del pago: no se aprueba', async () => {
      mockMp.respuesta = async () => ({ status: 'approved', transaction_amount: 5000, transaction_amount_refunded: 1000 });
      const { pago } = await publicacion({ enMp: true });
      expect((await aprobar(pago.id)).body.code).toBe('MERCADOPAGO_NO_CONFIRMA');
    });

    it('Mercado Pago cobró MENOS de lo que DOAPP esperaba: no se aprueba', async () => {
      mockMp.respuesta = async () => ({ status: 'approved', transaction_amount: 3000, transaction_amount_refunded: 0 });
      const { pago } = await publicacion({ enMp: true });
      const r = await aprobar(pago.id);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('MERCADOPAGO_MONTO_DISTINTO');
    });

    it('si no se puede consultar a Mercado Pago no se aprueba a ciegas (503)', async () => {
      mockMp.respuesta = async () => null;
      const { pago } = await publicacion({ enMp: true });
      const r = await aprobar(pago.id);
      expect(r.status).toBe(503);
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
    });

    it('una transferencia (sin Mercado Pago) se aprueba como siempre: no hay otro lugar donde mirar', async () => {
      mockMp.respuesta = async () => {
        throw new Error('no se tiene que llamar');
      };
      const { pago } = await publicacion();
      expect((await aprobar(pago.id)).status).toBe(200);
    });
  });
});
