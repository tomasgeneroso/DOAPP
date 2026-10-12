import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El pago de un contrato por Mercado Pago, de punta a punta: pedir el pago → aviso de Mercado Pago → el administrador
 * aprueba → verifica la garantía → el contrato arranca con el dinero retenido.
 *
 * Lo que había: `POST /payments/contract/:id` registraba el pago con el tipo «contract», que NINGÚN paso del administrador
 * reconoce (aprobar, verificar la garantía y liberar sólo aceptan «contract_payment»/«escrow_deposit»). El pago aprobado
 * quedaba «completed» sin retener nada, no se podía verificar la garantía y el contrato nunca arrancaba. Además, quien ya
 * había pagado y esperaba la verificación podía pagar una segunda vez (la guarda sólo miraba pending/approved/held_escrow).
 */

const mockObtenerPago = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockCrearPreferencia = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: {
    createPayment: (...a: unknown[]) => mockCrearPreferencia(...a),
    getPayment: (...a: unknown[]) => mockObtenerPago(...a),
  },
}));
jest.mock('../../server/services/currencyExchange.js', () => ({
  __esModule: true,
  describirCotizacion: (q: unknown) => q,
  default: { convertEURtoARS: async (n: number) => n * 3000, getEURtoARSRate: async () => 3000, getQuotedEURRate: async () => ({ rate: 3000 }) },
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
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { crearUsuario, crearTrabajo, crearContrato } from '../helpers/fixtures.js';

describe('pago de un contrato por Mercado Pago: la cadena completa', () => {
  let app: Express;
  let cliente: any, trabajador: any, admin: any;
  const jobs: string[] = [];
  const entorno = { ...process.env };
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const esperar = async (cond: () => Promise<boolean>, ms = 4000) => {
    const limite = Date.now() + ms;
    while (Date.now() < limite) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 50)); }
    return false;
  };

  const contratoAceptado = async (price = 5000) => {
    const t: any = await crearTrabajo(cliente.id, { status: 'open', price });
    jobs.push(t.id);
    return crearContrato({ jobId: t.id, clientId: cliente.id, doerId: trabajador.id }, { status: 'accepted', paymentStatus: 'pending', price }) as Promise<any>;
  };
  const pagoDe = async (contractId: string) => (await Payment.findOne({ where: { contractId }, order: [['createdAt', 'DESC']] })) as any;
  const pagar = (id: string) => request(app).post(`/api/payments/contract/${id}`).set(con(cliente)).send({ origen: 'app' });
  /** Mercado Pago avisa que el pago se aprobó. */
  const avisarAprobado = async (pago: any, idMp: string, monto: number) => {
    mockObtenerPago.mockResolvedValue({
      status: 'approved', status_detail: 'accredited', transaction_amount: monto, currency_id: 'ARS', metadata: { payment_id: pago.id },
    });
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET; // cargar rutas puede leer el .env real
    return request(app).post('/api/webhooks/mercadopago').send({ type: 'payment', action: 'payment.updated', data: { id: idMp } });
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/webhooks', (await import('../../server/routes/webhooks.js')).default);
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  beforeEach(() => {
    mockObtenerPago.mockReset();
    mockCrearPreferencia.mockReset();
    mockCrearPreferencia.mockResolvedValue({ paymentId: 'pref-contrato', providerPaymentId: 'pref-contrato', checkoutUrl: 'https://mp.test/checkout' });
    process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    delete process.env.MP_WEBHOOK_PROCESA_PAGOS;
    process.env.NODE_ENV = entorno.NODE_ENV;
  });

  afterAll(async () => {
    try {
      await Notification.destroy({ where: { recipientId: [cliente.id, trabajador.id, admin.id] } });
      await Payment.destroy({ where: { payerId: cliente.id } });
      await Contract.destroy({ where: { jobId: jobs }, force: true });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, trabajador.id, admin.id] }, force: true });
    } catch { /* ok */ }
  });

  it('pedir el pago registra un pago de tipo «contract_payment», en garantía, con el id de la preferencia guardado', async () => {
    const c = await contratoAceptado();

    const r = await pagar(c.id);

    expect(r.status).toBe(200);
    expect(r.body.paymentUrl).toContain('https://mp.test/checkout');
    const p = await pagoDe(c.id);
    expect(p.paymentType).toBe('contract_payment');
    expect(p.isEscrow).toBe(true);
    expect(p.status).toBe('pending');
    expect(p.mercadopagoPreferenceId).toBe('pref-contrato');
  });

  it('aviso de Mercado Pago → el administrador aprueba → verifica la garantía → el contrato arranca con el dinero retenido', async () => {
    const c = await contratoAceptado(5000);
    await pagar(c.id);
    const p = await pagoDe(c.id);

    // 1) Mercado Pago avisa
    expect((await avisarAprobado(p, '9000001', Number(p.amount))).status).toBe(200);
    expect(await esperar(async () => (await pagoDe(c.id)).status === 'pending_verification')).toBe(true);
    expect(((await Contract.findByPk(c.id)) as any).paymentStatus).toBe('pending_verification');

    // 2) el administrador aprueba: queda «verified» (todavía no está en garantía)
    const aprobado = await request(app).post(`/api/admin/payments/${p.id}/approve`).set(con(admin)).send({});
    expect(aprobado.status).toBe(200);
    expect((await pagoDe(c.id)).status).toBe('verified');

    // 3) verifica la garantía: los tres estados cambian juntos
    const garantia = await request(app).post(`/api/admin/payments/${p.id}/verify-escrow`).set(con(admin)).send({});
    expect(garantia.status).toBe(200);
    expect((await pagoDe(c.id)).status).toBe('held_escrow');
    const contrato: any = await Contract.findByPk(c.id);
    expect(contrato.escrowStatus).toBe('held_escrow');
    expect(contrato.paymentStatus).toBe('escrow');
    expect(contrato.status).toBe('in_progress');
  });

  it('quien ya pagó y espera la verificación NO puede pagar una segunda vez (400) ni se crea otro pago', async () => {
    const c = await contratoAceptado();
    await pagar(c.id);
    const p = await pagoDe(c.id);
    await avisarAprobado(p, '9000002', Number(p.amount));
    await esperar(async () => (await pagoDe(c.id)).status === 'pending_verification');
    const antes = await Payment.count({ where: { contractId: c.id } });

    const otra = await pagar(c.id);

    expect(otra.status).toBe(400);
    expect(await Payment.count({ where: { contractId: c.id } })).toBe(antes);
  });

  describe('un pago iniciado y sin terminar no deja el contrato trabado, ni cobra dos veces', () => {
    const cantidad = (contractId: string) => Payment.count({ where: { contractId } });

    it('el cliente cierra el checkout y vuelve a pagar: recibe la MISMA dirección de pago y no se crea otro pago', async () => {
      const c = await contratoAceptado();
      const primero = await pagar(c.id);
      expect(primero.status).toBe(200);
      expect(primero.body.reanudado).toBeUndefined();
      expect(((await pagoDe(c.id)) as any).metadata?.checkoutUrl).toBe('https://mp.test/checkout');

      const otra = await pagar(c.id);

      expect(otra.status).toBe(200);
      expect(otra.body.reanudado).toBe(true);
      expect(otra.body.paymentUrl).toBe('https://mp.test/checkout');
      expect(otra.body.paymentId).toBe(primero.body.paymentId);
      expect(await cantidad(c.id)).toBe(1);
      expect(mockCrearPreferencia).toHaveBeenCalledTimes(1); // no se le pidió otra preferencia a Mercado Pago
    });

    it('Mercado Pago falla al armar la preferencia: el pago queda anulado (anotado) y el próximo intento funciona', async () => {
      const c = await contratoAceptado();
      mockCrearPreferencia.mockRejectedValueOnce(new Error('Mercado Pago no responde'));

      const falla = await pagar(c.id);

      expect(falla.status).toBe(500);
      const roto: any = await pagoDe(c.id);
      expect(roto.status).toBe('cancelled');
      expect(roto.metadata.anulacion.por).toBe('system');
      expect(roto.metadata.anulacion.motivo).toMatch(/Mercado Pago no responde/);

      const reintento = await pagar(c.id);

      expect(reintento.status).toBe(200);
      expect(reintento.body.reanudado).toBeUndefined();
      expect(((await pagoDe(c.id)) as any).status).toBe('pending');
    });

    it('un pago que quedó sin preferencia (huérfano) se anula con nota y asiento de auditoría, y se crea uno nuevo', async () => {
      const c = await contratoAceptado();
      const huerfano: any = await Payment.create({
        contractId: c.id, payerId: cliente.id, recipientId: trabajador.id, amount: 5000, currency: 'ARS',
        status: 'pending', paymentType: 'contract_payment', description: 'huérfano', isEscrow: true, escrowStatus: 'pending',
      } as any);

      const r = await pagar(c.id);

      expect(r.status).toBe(200);
      expect(r.body.paymentId).not.toBe(huerfano.id);
      const anulado: any = await Payment.findByPk(huerfano.id);
      expect(anulado.status).toBe('cancelled');
      expect(anulado.metadata.anulacion).toMatchObject({ por: `user:${cliente.id}`, estadoAnterior: 'pending' });
      expect(anulado.metadata.anulacion.el).toBeTruthy();
      const asiento: any = await AuditLog.findOne({ where: { action: 'CONTRACT_PAYMENT_ORPHAN_CANCELLED', targetId: String(huerfano.id) } });
      expect(asiento).toBeTruthy();
      expect(asiento.actor).toBe(`user:${cliente.id}`);
    });

    it('con una preferencia viva pero SIN dirección guardada (pagos viejos) sigue dando 400: no se arriesga un doble cobro', async () => {
      const c = await contratoAceptado();
      await pagar(c.id);
      const p: any = await pagoDe(c.id);
      p.metadata = {};
      p.changed('metadata', true);
      await p.save();

      const otra = await pagar(c.id);

      expect(otra.status).toBe(400);
      expect(otra.body.message).toMatch(/already exists/i);
      expect(await cantidad(c.id)).toBe(1);
      expect(((await pagoDe(c.id)) as any).status).toBe('pending');
    });

    it('si el contrato cambió de precio, el pago viejo (otro monto) no se reanuda: 400', async () => {
      const c = await contratoAceptado(5000);
      await pagar(c.id);
      await Contract.update({ totalPrice: 7000, price: 7000 } as any, { where: { id: c.id } });

      const otra = await pagar(c.id);

      expect(otra.status).toBe(400);
      expect(await cantidad(c.id)).toBe(1);
    });

    it('si Mercado Pago ya avisó algo de ese pago (tiene id de pago de MP), no se toca: 400', async () => {
      const c = await contratoAceptado();
      await pagar(c.id);
      const p: any = await pagoDe(c.id);
      p.mercadopagoPaymentId = '9000099';
      await p.save();

      const otra = await pagar(c.id);

      expect(otra.status).toBe(400);
      expect(((await pagoDe(c.id)) as any).status).toBe('pending');
    });

    it('un huérfano junto a un pago ya retenido NO se limpia ni se deja pagar de nuevo: manda el pago retenido (400)', async () => {
      const c = await contratoAceptado();
      await Payment.create({
        contractId: c.id, payerId: cliente.id, recipientId: trabajador.id, amount: 5000, currency: 'ARS',
        status: 'held_escrow', paymentType: 'contract_payment', description: 'retenido', isEscrow: true, escrowStatus: 'held_escrow',
      } as any);
      const huerfano: any = await Payment.create({
        contractId: c.id, payerId: cliente.id, recipientId: trabajador.id, amount: 5000, currency: 'ARS',
        status: 'pending', paymentType: 'contract_payment', description: 'huérfano', isEscrow: true, escrowStatus: 'pending',
      } as any);

      const otra = await pagar(c.id);

      expect(otra.status).toBe(400);
      expect(((await Payment.findByPk(huerfano.id)) as any).status).toBe('pending');
      expect(await cantidad(c.id)).toBe(2);
    });
  });
});
