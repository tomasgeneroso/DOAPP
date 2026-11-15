import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Pantalla «Pagos» (lista de pendientes): 3 intentos de pagar la misma publicación salen como UNA fila —la última— con los otros 2 anidados como rastro
 * (pedido del dueño, 2026-11-13). Vale también cuando el último pago todavía está en revisión (no llegó a confirmarse). Base de pruebas real.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('GET /api/admin/payments/pending: intentos de pago anidados', () => {
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
    const r = await request(app).get(`/api/admin/payments/pending?limit=200${query}`).set(con(dueno));
    expect(r.status).toBe(200);
    return r.body as { data: any[]; pagination: { total: number } };
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
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

  it('3 intentos, el último todavía en revisión: una fila (la última) con 2 intentos anidados, del más viejo al más nuevo', async () => {
    const a = await crear('pending', 20);
    const b = await crear('pending', 14);
    const c = await crear('pending', 8);
    const { data, pagination } = await listar('&status=unverified');
    const propias = data.filter((p) => [a.id, b.id, c.id].includes(p.id));
    expect(propias.map((p) => p.id)).toEqual([c.id]);
    expect(propias[0].intentos.map((i: any) => i.id)).toEqual([a.id, b.id]);
    expect(propias[0].intentos[0]).toMatchObject({ status: 'pending' });
    // el total de la paginación tampoco cuenta los intentos
    expect(pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('intentos viejos sin trabajo guardado (como los de staging) también se anidan: misma descripción y mismo monto', async () => {
    const otro = await crearTrabajo(cliente.id, { status: 'pending_payment' });
    try {
      const sinTrabajo = { metadata: {}, description: 'Publicación: prueba staging viejo', amount: 777.77, amountArs: 777.77 };
      const a = await crear('pending', 30, sinTrabajo);
      const b = await crear('pending', 25, sinTrabajo);
      // el último sí está atado a su trabajo, como pasaba antes: lo apunta el trabajo y por eso tiene job_id
      const c = await crear('pending', 20, { ...sinTrabajo, metadata: { jobId: otro.id }, jobId: otro.id });
      const { data } = await listar('&status=unverified');
      const propias = data.filter((p) => [a.id, b.id, c.id].includes(p.id));
      expect(propias.map((p) => p.id)).toEqual([c.id]);
      expect(propias[0].intentos.map((i: any) => i.id)).toEqual([a.id, b.id]);
      expect(propias[0].intentos[0].paymentMethod).toBe('mercadopago');
    } finally {
      await Job.destroy({ where: { id: otro.id }, force: true });
    }
  });

  it('una búsqueda por el id de un intento lo encuentra (no se esconde cuando se lo busca)', async () => {
    const { data } = await listar(`&status=all&search=${pagos[0]}`);
    expect(data.map((p) => p.id)).toContain(pagos[0]);
  });

  it('un pago de otro trabajo no se mezcla', async () => {
    const otro = await crearTrabajo(cliente.id, { status: 'pending_payment' });
    try {
      const suelto = await crear('pending', 3, { metadata: { jobId: otro.id, userId: cliente.id, paymentType: 'job_publication' } });
      const { data } = await listar('&status=unverified');
      const fila = data.find((p) => p.id === suelto.id);
      expect(fila).toBeTruthy();
      expect(fila.intentos).toEqual([]);
    } finally {
      await Job.destroy({ where: { id: otro.id }, force: true });
    }
  });
});
