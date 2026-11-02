import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Un pago se aprueba una sola vez.
 *
 * Lo encontró la prueba real con navegador (parte B, caso B5): el endpoint de aprobar no miraba en qué estado estaba el pago. Aprobar uno ya completado,
 * en garantía, devuelto o rechazado lo pisaba, volvía a poner el trabajo en «Abierto» aunque ya estuviera en curso o cancelado, y repetía avisos,
 * facturas y registros de auditoría. Con dos toques seguidos al botón alcanzaba. Ahora el cambio de estado es un solo UPDATE condicional.
 */
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
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('aprobar un pago: una sola vez', () => {
  let app: Express;
  let cliente: any, admin: any;
  const creados = { pagos: [] as string[], jobs: [] as string[] };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const aprobar = (id: string) => request(app).post(`/api/admin/payments/${id}/approve`).set(con(admin)).send({ notes: 'ok' });
  const recargar = async (id: string) => (await Payment.findByPk(id)) as any;
  const esperar = async (cond: () => Promise<boolean>, ms = 4000) => {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
      if (await cond()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

  /** Un pago de publicación por transferencia, con su trabajo esperando que se confirme. */
  const publicacion = async (status = 'pending_verification') => {
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 5000, amountArs: 5000, currency: 'ARS', status, paymentType: 'job_publication',
      paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
    } as any);
    creados.pagos.push(pago.id);
    const trabajo: any = await crearTrabajo(cliente.id, { status: 'pending_payment', publicationPaymentId: pago.id });
    creados.jobs.push(trabajo.id);
    return { pago, trabajo };
  };
  const avisosDelCliente = async () => Notification.count({ where: { recipientId: cliente.id, title: 'Pago aprobado' } });
  const auditorias = async (pagoId: string) => AuditLog.count({ where: { targetId: pagoId, action: 'payment.approve' } as any });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
  });

  afterAll(async () => {
    try {
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

  it('un pago que espera aprobación se aprueba, publica el trabajo y avisa al cliente', async () => {
    const { pago, trabajo } = await publicacion();

    const r = await aprobar(pago.id);

    expect(r.status).toBe(200);
    expect((await recargar(pago.id)).status).toBe('completed');
    expect((await Job.findByPk(trabajo.id) as any).status).toBe('open');
    expect(await esperar(async () => (await auditorias(pago.id)) === 1)).toBe(true);
  });

  it.each(['pending', 'processing'])('un pago «%s» (por ejemplo uno de Mercado Pago que un administrador confirma a mano) también se aprueba', async (estado) => {
    const { pago } = await publicacion(estado);

    expect((await aprobar(pago.id)).status).toBe(200);
    expect((await recargar(pago.id)).status).toBe('completed');
  });

  it('aprobarlo otra vez no hace nada: 409, el trabajo no se reabre y no se repiten avisos ni auditoría', async () => {
    const { pago, trabajo } = await publicacion();
    expect((await aprobar(pago.id)).status).toBe(200);
    await esperar(async () => (await auditorias(pago.id)) === 1);
    // El trabajo siguió su camino (ya está en curso): una segunda aprobación no lo puede volver a «Abierto».
    await Job.update({ status: 'in_progress' } as any, { where: { id: trabajo.id } });
    const avisosAntes = await avisosDelCliente();

    const r = await aprobar(pago.id);

    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PAYMENT_NOT_PENDING_APPROVAL');
    expect((await Job.findByPk(trabajo.id) as any).status).toBe('in_progress');
    expect(await avisosDelCliente()).toBe(avisosAntes);
    expect(await auditorias(pago.id)).toBe(1);
    expect((await recargar(pago.id)).status).toBe('completed');
  });

  it('dos aprobaciones al mismo tiempo: una gana y la otra recibe 409; nada se duplica', async () => {
    const { pago, trabajo } = await publicacion();
    const avisosAntes = await avisosDelCliente();

    const [a, b] = await Promise.all([aprobar(pago.id), aprobar(pago.id)]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    await esperar(async () => (await auditorias(pago.id)) >= 1);
    expect(await auditorias(pago.id)).toBe(1);
    // Una aprobación de una publicación deja dos avisos al cliente (el del trabajo publicado y el del pago): no cuatro.
    expect((await avisosDelCliente()) - avisosAntes).toBe(2);
    expect((await Job.findByPk(trabajo.id) as any).status).toBe('open');
  });

  it.each(['completed', 'held_escrow', 'confirmed_for_payout', 'refunded', 'rejected', 'failed', 'cancelled', 'disputed'])(
    'un pago «%s» no se aprueba: 409 y queda como estaba',
    async (estado) => {
      const { pago, trabajo } = await publicacion(estado);

      const r = await aprobar(pago.id);

      expect(r.status).toBe(409);
      expect(r.body.code).toBe('PAYMENT_NOT_PENDING_APPROVAL');
      expect((await recargar(pago.id)).status).toBe(estado);
      expect((await Job.findByPk(trabajo.id) as any).status).toBe('pending_payment');
    },
  );
});
