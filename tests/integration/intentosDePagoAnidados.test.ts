import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Transacciones: de 3 intentos de pagar la misma publicación (2 sin completar y 1 pagado) sale UNA fila, la del pago, con los 2 intentos anidados como rastro
 * (pedido del dueño, 2026-11-13). Base de pruebas real: valida también el SQL que los esconde del listado y del total.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('GET /api/admin/company-balance/transactions: intentos de pago anidados', () => {
  let app: Express;
  let dueno: any, cliente: any, trabajo: any;
  const pagos: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const MIN = 60_000;

  const crear = async (status: string, haceMin: number, over: Record<string, unknown> = {}) => {
    const p: any = await Payment.create({
      payerId: cliente.id, recipientId: null, amount: 10560.99, amountArs: 10560.99, currency: 'ARS', status,
      paymentType: 'job_publication', paymentMethod: 'mercadopago', platformFee: 0, platformFeePercentage: 0,
      metadata: { jobId: trabajo.id, userId: cliente.id, paymentType: 'job_publication' }, createdAt: new Date(Date.now() - haceMin * MIN), ...over,
    } as any);
    pagos.push(p.id);
    return p;
  };
  const listar = async (query = '') => {
    const r = await request(app).get(`/api/admin/company-balance/transactions?limit=200${query}`).set(con(dueno));
    expect(r.status).toBe(200);
    return r.body.data as { transactions: any[]; pagination: { total: number } };
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/company-balance', (await import('../../server/routes/admin/companyBalance.js')).default);
    dueno = await crearUsuario({ role: 'client', adminRole: 'owner' });
    cliente = await crearUsuario({ role: 'client', dniVerified: true });
    trabajo = await crearTrabajo(cliente.id, { status: 'pending_payment' });
  });

  afterAll(async () => {
    try {
      await Payment.destroy({ where: { id: pagos }, force: true } as any);
      await Job.destroy({ where: { id: trabajo.id }, force: true });
      await User.destroy({ where: { id: [dueno.id, cliente.id] }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('3 intentos y el último pagado: una sola fila con 2 intentos anidados', async () => {
    const a = await crear('pending', 20);
    const b = await crear('pending', 14);
    const c = await crear('completed', 8);
    const { transactions } = await listar();
    const propias = transactions.filter((t) => [a.id, b.id, c.id].includes(t.id));
    expect(propias.map((t) => t.id)).toEqual([c.id]);
    expect(propias[0].intentos.map((i: any) => i.id)).toEqual([a.id, b.id]);
    expect(propias[0].intentos[0]).toMatchObject({ status: 'pending' });
  });

  it('con un filtro de estado se ven todos (si no, «pendientes» saldría vacío)', async () => {
    const { transactions } = await listar('&status=pending');
    expect(transactions.filter((t) => pagos.includes(t.id)).length).toBe(2);
  });

  it('un intento sin ningún pago efectivo posterior sigue listándose por su cuenta', async () => {
    const otro = await crearTrabajo(cliente.id, { status: 'pending_payment' });
    try {
      const suelto = await crear('pending', 3, { metadata: { jobId: otro.id, userId: cliente.id, paymentType: 'job_publication' } });
      const { transactions } = await listar();
      expect(transactions.map((t) => t.id)).toContain(suelto.id);
    } finally {
      await Job.destroy({ where: { id: otro.id }, force: true });
    }
  });
});
