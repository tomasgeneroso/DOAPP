import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Si la cancelación ya devolvió el pago, «Devolver dinero» no devuelve más (pedido del dueño, 2026-11-21): se canceló a tiempo, se devolvió solo y después dejaba devolver a mano
 * otra vez («Se devolvió más de lo que costó el pago», invariante 9 de la auditoría). Base de pruebas real.
 */
jest.mock('../../server/services/mercadopago.js', () => ({ __esModule: true, default: { getPayment: async () => ({ status: 'approved', transaction_amount: 10560.99, transaction_amount_refunded: 0 }), refundPayment: async () => ({}) } }));
jest.mock('../../server/index.js', () => { const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada }); return { __esModule: true, socketService: nada }; });
jest.mock('../../server/services/email.js', () => ({ __esModule: true, default: new Proxy({}, { get: () => async () => true }) }));

import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('devolver dinero después de una cancelación que ya devolvió', () => {
  let app: Express;
  let cliente: any, dueno: any;
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  const pagoConDevolucion = async (origen: string | null) => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 10560.99, amountArs: 10560.99, currency: 'ARS', status: 'completed', paymentType: 'job_publication', paymentMethod: 'mercadopago',
      mercadopagoPaymentId: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, platformFee: 0, platformFeePercentage: 0,
    } as any);
    pagos.push(p.id);
    if (origen) {
      await BalanceTransaction.create({
        userId: cliente.id, type: 'refund', amount: 10000, balanceBefore: 0, balanceAfter: 10000, description: 'Saldo a favor por cancelación de "prueba"', status: 'pending',
        metadata: { pagoId: p.id, origen, pendienteDeLiquidacion: true },
      } as any);
    }
    return p;
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
  });

  afterAll(async () => {
    try {
      await BalanceTransaction.destroy({ where: { userId: [cliente.id, dueno.id] } });
      await AuditLog.destroy({ where: { targetId: pagos } as any });
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await User.destroy({ where: { id: [cliente.id, dueno.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  it('con una devolución por cancelación, la información del pago dice que está bloqueado y por qué', async () => {
    const p = await pagoConDevolucion('cancelacion');
    const r = await request(app).get(`/api/admin/payments/${p.id}/refund-info`).set(con(dueno));
    expect(r.status).toBe(200);
    expect(r.body.data.bloqueo.codigo).toBe('YA_DEVUELTO_POR_CANCELACION');
    expect(r.body.data.bloqueo.motivo).toContain('cancelación ya devolvió');
  });

  it('con una devolución por cancelación, devolver a mano da 409 y no mueve nada', async () => {
    const p = await pagoConDevolucion('cancelacion');
    const r = await request(app).post(`/api/admin/payments/${p.id}/refund`).set(con(dueno)).send({ opcion: 'total', motivo: 'quiero devolver otra vez', reason: 'quiero devolver otra vez' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('YA_DEVUELTO_POR_CANCELACION');
    // No se creó otro asiento: sigue habiendo uno solo por este pago.
    const asientos = await BalanceTransaction.findAll({ where: { userId: cliente.id, type: 'refund' } as any });
    expect(asientos.filter((a: any) => a.metadata?.pagoId === p.id)).toHaveLength(1);
    expect(Number(((await Payment.findByPk(p.id)) as any).refundedAmount ?? 0)).toBe(0);
  });

  it('un pago sin devolución por cancelación no queda bloqueado (otras devoluciones siguen su camino)', async () => {
    const p = await pagoConDevolucion(null);
    const r = await request(app).get(`/api/admin/payments/${p.id}/refund-info`).set(con(dueno));
    expect(r.status).toBe(200);
    expect(r.body.data.bloqueo).toBeNull();
    // Y una devolución que NO es de cancelación (una baja de precio) tampoco lo bloquea.
    const q = await pagoConDevolucion('baja_de_precio');
    const rq = await request(app).get(`/api/admin/payments/${q.id}/refund-info`).set(con(dueno));
    expect(rq.body.data.bloqueo).toBeNull();
  });
});
