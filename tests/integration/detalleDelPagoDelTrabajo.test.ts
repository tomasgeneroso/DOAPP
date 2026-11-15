import { describe, it, expect, afterAll, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * «Detalles del pago» de MI publicación (pedido del dueño, 2026-11-15): lo ve quien publicó el trabajo (no otra persona), con cuándo y cómo se aprobó el pago y el
 * trabajo. Y un trabajo cancelado por fecha vencida sigue en «Mis trabajos». Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('GET /api/jobs/:id/payment-details', () => {
  let app: Express;
  let admin: any, dueno: any, otro: any, trabajo: any, pago: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    admin = await crearUsuario({ role: 'client', adminRole: 'admin', name: 'Ana Admin' });
    dueno = await crearUsuario({ role: 'client', dniVerified: true });
    otro = await crearUsuario({ role: 'client', dniVerified: true });
    trabajo = await crearTrabajo(dueno.id, { status: 'pending_payment' });
    pago = await Payment.create({
      payerId: dueno.id, recipientId: null, amount: 10560.99, amountArs: 10560.99, currency: 'ARS', status: 'completed', paymentType: 'job_publication',
      paymentMethod: 'mercadopago', platformFee: 0, platformFeePercentage: 0, mercadopagoVerifiedAt: new Date('2026-11-13T21:57:00Z'), createdAt: new Date('2026-11-13T21:46:00Z'),
      metadata: { jobId: trabajo.id, userId: dueno.id, paymentType: 'job_publication' },
    } as any);
    // El trabajo lo aprobó un administrador un día después del fin y se canceló solo por fecha vencida.
    await Job.update(
      {
        status: 'cancelled', publicationPaid: true, publicationPaymentId: pago.id, publicationPaidAt: new Date('2026-11-13T21:57:00Z'),
        reviewedBy: admin.id, reviewedAt: new Date('2026-11-14T22:10:00Z'), cancelledAt: new Date('2026-11-14T22:11:00Z'),
        cancellationReason: 'Cancelado automáticamente: Ningún trabajador se postuló antes de la fecha programada.',
      } as any,
      { where: { id: trabajo.id } },
    );
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { id: pago.id }, force: true } as any);
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [admin.id, dueno.id, otro.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('quien publicó ve el pago aprobado (automático) y el trabajo aprobado (administrador, SIN nombre) y la cancelación', async () => {
    const r = await request(app).get(`/api/jobs/${trabajo.id}/payment-details`).set(con(dueno));
    expect(r.status).toBe(200);
    const d = r.body.data.detalle;
    expect(d.pagoAprobado).toMatchObject({ modo: 'automatico', cuando: '2026-11-13T21:57:00.000Z' });
    expect(d.trabajoAprobado).toMatchObject({ modo: 'administrador', cuando: '2026-11-14T22:10:00.000Z', quien: null });
    expect(JSON.stringify(d)).not.toMatch(/Ana Admin/);
    expect(d.cancelado.motivo).toMatch(/Ningún trabajador/);
    expect(d.metodo).toBe('Mercado Pago');
    expect(d.monto).toBeCloseTo(10560.99, 2);
    // la historia viene de lo más reciente a lo más viejo
    expect(d.historia.map((h: any) => h.clave)).toEqual(['trabajo_cancelado', 'trabajo_aprobado', 'pago_aprobado', 'pago_iniciado']);
  });

  it('otra persona no lo ve (404, no se confirma ni que existe)', async () => {
    const r = await request(app).get(`/api/jobs/${trabajo.id}/payment-details`).set(con(otro));
    expect(r.status).toBe(404);
  });

  it('sin sesión, no', async () => {
    const r = await request(app).get(`/api/jobs/${trabajo.id}/payment-details`);
    expect([401, 403]).toContain(r.status);
  });

  it('un trabajo cancelado por fecha vencida sigue en «Mis trabajos»', async () => {
    const r = await request(app).get('/api/jobs/my-jobs').set(con(dueno));
    expect(r.status).toBe(200);
    const mio = r.body.jobs.find((j: any) => j.id === trabajo.id);
    expect(mio).toBeTruthy();
    expect(mio.status).toBe('cancelled');
  });
});
