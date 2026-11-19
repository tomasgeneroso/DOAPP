import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Subir el comprobante de la publicación (reporte del dueño, 2026-11-19): «después de pagar la publicación no me da la opción de subir el comprobante» y «soporte me envió un mensaje desde
 * comprobante y no me llegó la notificación». «Mis trabajos» traía \`payment: null\` escrito a mano (el botón nunca aparecía) y la nota del equipo no avisaba a nadie.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { Payment } from '../../server/models/sql/Payment.model.js';
import { PaymentProof } from '../../server/models/sql/PaymentProof.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('comprobante de la publicación', () => {
  let app: Express;
  let cliente: any;
  let otra: any;
  let admin: any;
  let trabajo: any;
  let pago: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    otra = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    trabajo = await crearTrabajo(cliente.id, { status: 'pending_payment', price: 10000 });
    pago = await Payment.create({
      payerId: cliente.id, recipientId: null, contractId: null, amount: 10560.99, currency: 'ARS', status: 'pending', paymentType: 'job_publication', paymentMethod: 'bank_transfer',
      description: 'Publicación', platformFee: 0, platformFeePercentage: 0, isEscrow: false,
    } as any);
    await trabajo.update({ publicationPaymentId: pago.id });
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: cliente.id } });
      await PaymentProof.destroy({ where: { paymentId: pago.id } });
    } catch { /* la limpieza no hace fallar la prueba */ }
  });

  const delTrabajo = async () => {
    const r = await request(app).get('/api/jobs/my-jobs').set(con(cliente));
    expect(r.status).toBe(200);
    return r.body.jobs.find((j: any) => j.id === trabajo.id);
  };

  it('«Mis trabajos» trae el pago de la publicación y avisa que falta el comprobante', async () => {
    const j = await delTrabajo();
    expect(j.payment).toMatchObject({ id: pago.id, method: 'bank_transfer', requiresProof: true, proofSubmitted: false });
  });

  it('con un comprobante activo figura como entregado; una nota del equipo no cuenta como comprobante', async () => {
    await PaymentProof.create({ paymentId: pago.id, userId: admin.id, kind: 'note', uploadedByRole: 'admin', sequence: 1, isActive: false, status: 'approved', notes: 'Falta la fecha', fileSize: 0, uploadedAt: new Date() } as any);
    expect((await delTrabajo()).payment).toMatchObject({ proofSubmitted: false, ultimaNotaDelEquipo: 'Falta la fecha' });
    await PaymentProof.create({ paymentId: pago.id, userId: cliente.id, kind: 'receipt', uploadedByRole: 'client', sequence: 2, isActive: true, status: 'pending', fileUrl: '/uploads/payment-proofs/x.png', fileType: 'png', fileName: 'x.png', fileSize: 10, uploadedAt: new Date() } as any);
    expect((await delTrabajo()).payment).toMatchObject({ requiresProof: true, proofSubmitted: true });
  });

  it('el resumen para subir el comprobante lo ve quien pagó, no otra persona', async () => {
    const propio = await request(app).get(`/api/payments/${pago.id}/resumen`).set(con(cliente));
    expect(propio.status).toBe(200);
    expect(propio.body.data).toMatchObject({ method: 'bank_transfer', puedeSubir: true, proofSubmitted: true, jobId: trabajo.id });
    const ajeno = await request(app).get(`/api/payments/${pago.id}/resumen`).set(con(otra));
    expect(ajeno.status).toBe(404);
  });

  it('si el equipo escribe una nota sobre el comprobante, a quien pagó le llega una notificación con el botón para subirlo', async () => {
    const r = await request(app).post(`/api/admin/payments/${pago.id}/proof-notes`).set(con(admin)).send({ caption: 'El comprobante no se lee: subilo de nuevo' });
    expect(r.status).toBe(201);
    const n: any = await Notification.findOne({ where: { recipientId: cliente.id, category: 'payment' } as any, order: [['createdAt', 'DESC']] });
    expect(n).toBeTruthy();
    expect(n.title).toMatch(/comprobante/i);
    expect(n.message).toContain('no se lee');
    expect(n.actionUrl).toBe(`/payments/${pago.id}/comprobante`);
    expect(n.actionText).toBe('Subir comprobante');
  });
});
