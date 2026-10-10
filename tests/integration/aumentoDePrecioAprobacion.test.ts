import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Aumento de precio de un trabajo ya publicado, pagado por Mercado Pago.
 *
 * Regla de esta etapa: todo pago confirmado por Mercado Pago lo confirma un administrador. El aumento era la excepción:
 * se aplicaba solo al volver el comprador. Ahora espera al administrador y, si en 24 horas no lo revisa, se aprueba
 * solo SIEMPRE QUE el pago haya sido efectuado correctamente (Mercado Pago lo confirmó: monto exacto, sin cuotas ni
 * cupón). Un pago en revisión por no coincidir, o por transferencia sin verificar, no se aprueba solo nunca.
 */

const mockObtenerPago = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: {
    createPayment: async () => ({ paymentId: 'pref-x', checkoutUrl: 'https://mp.test/checkout' }),
    getPayment: (...a: unknown[]) => mockObtenerPago(...a),
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
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: () => undefined } }));
const mockEnviarPagoRecibido = jest.fn<(...a: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, {
    get: (_t, prop) => (prop === 'sendPagoRecibido' ? (...a: unknown[]) => mockEnviarPagoRecibido(...a) : async () => true),
  }),
}));

import { Job } from '../../server/models/sql/Job.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { ModuleConfig } from '../../server/models/sql/ModuleConfig.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import BalanceTransaction from '../../server/models/sql/BalanceTransaction.model.js';
import { olvidarModulos } from '../../server/services/moduleFlags.js';
import { MODULO_APROBACION_DE_PUBLICACIONES } from '../../shared/constants/modulos.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { aprobarAumentosVencidos } from '../../server/services/aumentoDePrecio.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('aumento de precio pagado: espera al administrador y se aprueba solo a las 24 horas', () => {
  let app: Express;
  let cliente: any, admin: any;
  const jobs: string[] = [];
  let idMp = 8_000_000;
  const HORA = 3_600_000;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  /** Un trabajo pausado con su aumento de $10.000 a $12.000 pendiente y el pago de $2.300 listo para confirmar. */
  const armar = async (jobOver: Record<string, unknown> = {}, pagoOver: Record<string, unknown> = {}) => {
    const trabajo: any = await crearTrabajo(cliente.id, {
      status: 'paused', price: 10000, pendingNewPrice: 12000, pendingPaymentAmount: 2300,
      pendingBalanceDeduction: 0, previousStatus: 'open', priceChangeReason: 'Más trabajo del previsto', ...jobOver,
    });
    jobs.push(trabajo.id);
    const pref = `pref-aum-${trabajo.id.slice(0, 8)}`;
    const pago: any = await Payment.create({
      payerId: cliente.id, recipientId: null, contractId: null, amount: 2300, currency: 'ARS', status: 'pending',
      paymentType: 'budget_increase', paymentMethod: 'mercadopago', mercadopagoPreferenceId: pref,
      description: 'Aumento de prueba', platformFee: 0, platformFeePercentage: 0, isEscrow: false, ...pagoOver,
    } as any);
    await trabajo.update({ publicationPaymentId: pago.id });
    return { trabajo, pago, pref };
  };
  /** Un pago que ya está esperando al administrador desde hace `horas`. */
  const enRevision = async (horas: number, pagoOver: Record<string, unknown> = {}, jobOver: Record<string, unknown> = {}) => {
    const r = await armar(jobOver, {
      status: 'pending_verification', mercadopagoVerifiedAt: new Date(Date.now() - horas * HORA), ...pagoOver,
    });
    return r;
  };
  const aprobado = () => ({ status: 'approved', status_detail: 'accredited', transaction_amount: 2300, currency_id: 'ARS', metadata: {} });
  const capturar = (pref: string, idDelPagoEnMp: string = String(++idMp)) =>
    request(app).post('/api/payments/capture-order').set(con(cliente)).send({ preference_id: pref, paymentId: idDelPagoEnMp });
  const trabajoDe = async (id: string) => (await Job.findByPk(id)) as any;
  const pagoDe = async (id: string) => (await Payment.findByPk(id)) as any;
  const aprobar = (pagoId: string) => request(app).post(`/api/admin/payments/${pagoId}/approve`).set(con(admin)).send({});
  const apagarModulo = async () => {
    await ModuleConfig.upsert({ moduleId: MODULO_APROBACION_DE_PUBLICACIONES, category: 'feature', name: 'Aprobación', description: 'x', isActive: false } as any);
    olvidarModulos();
  };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/admin/payments', (await import('../../server/routes/admin/payments.js')).default);
    app.use('/api/jobs', (await import('../../server/routes/jobs.js')).default);
    cliente = await crearUsuario({ role: 'client' });
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
  });

  beforeEach(async () => {
    await ModuleConfig.destroy({ where: { moduleId: MODULO_APROBACION_DE_PUBLICACIONES } });
    olvidarModulos();
    mockObtenerPago.mockReset();
    mockObtenerPago.mockResolvedValue(aprobado());
    mockEnviarPagoRecibido.mockClear();
    await User.update({ balanceArs: 0 } as any, { where: { id: cliente.id } });
  });

  afterEach(async () => {
    await Notification.destroy({ where: { recipientId: [cliente.id, admin.id] } });
  });

  afterAll(async () => {
    try {
      await ModuleConfig.destroy({ where: { moduleId: MODULO_APROBACION_DE_PUBLICACIONES } });
      olvidarModulos();
      await BalanceTransaction.destroy({ where: { userId: cliente.id } });
      await AuditLog.destroy({ where: { action: ['PRICE_INCREASE_AUTO_APPROVED', 'PRICE_INCREASE_AUTO_NOT_APPLIED'] } });
      await Payment.destroy({ where: { payerId: cliente.id } });
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: [cliente.id, admin.id] }, force: true });
    } catch { /* la limpieza no puede hacer fallar el test */ }
  });

  /* ---------------- al volver de pagar ---------------- */

  describe('al volver de pagar (módulo encendido, el valor por defecto)', () => {
    it('el aumento NO se aplica: el pago queda en revisión con la marca de Mercado Pago y el trabajo sigue pausado', async () => {
      const { trabajo, pago, pref } = await armar();

      const r = await capturar(pref);

      expect(r.status).toBe(200);
      expect(r.body.data.budgetUpdated).toBe(false);
      expect(r.body.data.budgetPendingApproval).toBe(true);
      expect(r.body.data.approvalHours).toBe(POLITICAS.APROBACION_AUTOMATICA_DEL_AUMENTO_HORAS);
      const t = await trabajoDe(trabajo.id);
      expect(Number(t.price)).toBe(10000);
      expect(t.status).toBe('paused');
      expect(Number(t.pendingNewPrice)).toBe(12000);
      const p = await pagoDe(pago.id);
      expect(p.status).toBe('pending_verification');
      expect(p.mercadopagoVerifiedAt).toBeTruthy();
    });

    it('avisa al cliente (notificación y email) y a los administradores', async () => {
      const { pref } = await armar();

      await capturar(pref);

      const alCliente = await Notification.findAll({ where: { recipientId: cliente.id } });
      expect(alCliente.map((n: any) => n.title)).toEqual(['Recibimos el pago de tu aumento: está en revisión']);
      expect(alCliente[0].message).toContain('24 horas');
      expect(mockEnviarPagoRecibido).toHaveBeenCalledTimes(1);
      expect(mockEnviarPagoRecibido).toHaveBeenCalledWith(String(cliente.id), expect.objectContaining({ titulo: 'Recibimos el pago de tu aumento: está en revisión', monto: 2300 }));
      const alAdmin = await Notification.findAll({ where: { recipientId: admin.id } });
      expect(alAdmin.map((n: any) => n.title)).toContain('Aumento de precio pagado para aprobar');
    });

    it('volver a la página de éxito responde lo mismo y no duplica avisos ni aplica nada', async () => {
      const { trabajo, pref } = await armar();
      await capturar(pref, '8999001');

      // volver a la página de éxito (recargar) manda el mismo id de pago de Mercado Pago
      const otra = await capturar(pref, '8999001');

      expect([otra.status, otra.body]).toEqual([200, expect.anything()]);
      expect(otra.body.data.alreadyProcessed).toBe(true);
      expect(otra.body.data.budgetPendingApproval).toBe(true);
      expect(otra.body.data.budgetUpdated).toBe(false);
      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(10000);
      expect(await Notification.count({ where: { recipientId: cliente.id } })).toBe(1);
      expect(mockEnviarPagoRecibido).toHaveBeenCalledTimes(1);
    });

    it('un pago que Mercado Pago no confirma bien (monto distinto) no queda con la marca y no se aplica', async () => {
      const { trabajo, pago, pref } = await armar();
      mockObtenerPago.mockResolvedValue({ ...aprobado(), transaction_amount: 1 });

      const r = await capturar(pref);

      expect(r.status).not.toBe(200);
      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(10000);
      const p = await pagoDe(pago.id);
      expect(p.mercadopagoVerifiedAt ?? null).toBeNull();
    });
  });

  describe('con el módulo apagado (publicar solo)', () => {
    it('el aumento se aplica al volver de pagar, como antes', async () => {
      await apagarModulo();
      const { trabajo, pago, pref } = await armar();

      const r = await capturar(pref);

      expect(r.status).toBe(200);
      expect(r.body.data.budgetUpdated).toBe(true);
      expect(r.body.data.budgetPendingApproval).toBeUndefined();
      const t = await trabajoDe(trabajo.id);
      expect(Number(t.price)).toBe(12000);
      expect(t.status).toBe('open');
      expect(t.pendingNewPrice ?? null).toBeNull();
      expect((await pagoDe(pago.id)).status).toBe('completed');
    });

    it('y los aumentos que quedaron esperando se aprueban en la próxima pasada, sin esperar las 24 horas', async () => {
      await apagarModulo();
      const { trabajo } = await enRevision(0.1);

      await aprobarAumentosVencidos();

      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(12000);
    });
  });

  /* ---------------- el administrador ---------------- */

  describe('el administrador', () => {
    it('lo aprueba desde Pagos pendientes: el precio se aplica, el trabajo se reactiva y queda el historial', async () => {
      const { trabajo, pago, pref } = await armar();
      await capturar(pref);

      const r = await aprobar(pago.id);

      expect(r.status).toBe(200);
      const t = await trabajoDe(trabajo.id);
      expect(Number(t.price)).toBe(12000);
      expect(t.status).toBe('open');
      expect(t.pendingNewPrice ?? null).toBeNull();
      expect(t.previousStatus ?? null).toBeNull();
      expect(t.priceHistory).toHaveLength(1);
      expect(t.priceHistory[0]).toMatchObject({ oldPrice: 10000, newPrice: 12000, approvedBy: String(admin.id) });
      expect((await pagoDe(pago.id)).status).toBe('completed');
      expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Presupuesto actualizado' } })).toBe(1);
    });

    it('aprobarlo dos veces no aplica el aumento dos veces', async () => {
      const { trabajo, pago, pref } = await armar();
      await capturar(pref);
      await aprobar(pago.id);

      await aprobar(pago.id);

      const t = await trabajoDe(trabajo.id);
      expect(Number(t.price)).toBe(12000);
      expect(t.priceHistory).toHaveLength(1);
    });

    it('la parte pagada con saldo a favor se descuenta UNA vez, con asiento (el camino del administrador nunca la descontaba)', async () => {
      await User.update({ balanceArs: 1000 } as any, { where: { id: cliente.id } });
      const { pago, pref } = await armar({ pendingBalanceDeduction: 400 });
      await capturar(pref);

      await aprobar(pago.id);
      await aprobar(pago.id);

      expect(Number(((await User.findByPk(cliente.id)) as any).balanceArs)).toBe(600);
      const asientos: any[] = await BalanceTransaction.findAll({ where: { userId: cliente.id } });
      const delAumento = asientos.filter((a) => a.metadata?.origen === 'aumento_de_precio');
      expect(delAumento).toHaveLength(1);
      expect(Math.abs(Number(delAumento[0].amount))).toBe(400);
    });

    it('si lo rechaza, el trabajo vuelve a su estado y precio de antes y el cliente recibe el aviso', async () => {
      const { trabajo, pago, pref } = await armar();
      await capturar(pref);

      const r = await request(app).post(`/api/admin/payments/${pago.id}/reject`).set(con(admin)).send({ reason: 'Monto que no corresponde' });

      expect(r.status).toBe(200);
      const t = await trabajoDe(trabajo.id);
      expect(Number(t.price)).toBe(10000);
      expect(t.status).toBe('open');
      expect(t.pendingNewPrice ?? null).toBeNull();
      expect((await pagoDe(pago.id)).status).toBe('rejected');
      expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Aumento de presupuesto rechazado' } })).toBe(1);
    });
  });

  /* ---------------- las 24 horas ---------------- */

  describe('aprobación automática pasado el plazo', () => {
    it('antes de las 24 horas no toca nada', async () => {
      const { trabajo, pago } = await enRevision(23);

      await aprobarAumentosVencidos();

      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(10000);
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
    });

    it('pasadas las 24 horas, con el pago confirmado por Mercado Pago, lo aprueba solo y lo deja asentado', async () => {
      const { trabajo, pago } = await enRevision(25);

      const cuantos = await aprobarAumentosVencidos();

      expect(cuantos).toBeGreaterThanOrEqual(1);
      const t = await trabajoDe(trabajo.id);
      expect(Number(t.price)).toBe(12000);
      expect(t.status).toBe('open');
      expect(t.priceHistory[0]).toMatchObject({ oldPrice: 10000, newPrice: 12000, approvedBy: 'automatico' });
      const p = await pagoDe(pago.id);
      expect(p.status).toBe('completed');
      expect(p.adminNotes).toContain('Automático');
      const alCliente = await Notification.findAll({ where: { recipientId: cliente.id, title: 'Presupuesto actualizado' } });
      expect(alCliente).toHaveLength(1);
      expect(alCliente[0].message).toContain('se aprobó automáticamente');
      const asiento: any = await AuditLog.findOne({ where: { action: 'PRICE_INCREASE_AUTO_APPROVED', targetId: String(pago.id) } });
      expect(asiento).not.toBeNull();
    });

    it('una segunda pasada no vuelve a aplicarlo ni a avisar', async () => {
      const { trabajo } = await enRevision(30);
      await aprobarAumentosVencidos();

      await aprobarAumentosVencidos();

      expect((await trabajoDe(trabajo.id)).priceHistory).toHaveLength(1);
      expect(await Notification.count({ where: { recipientId: cliente.id, title: 'Presupuesto actualizado' } })).toBe(1);
    });

    it('un pago SIN la confirmación de Mercado Pago (en revisión por no coincidir, o transferencia sin verificar) no se aprueba solo nunca', async () => {
      const { trabajo, pago } = await enRevision(500, { mercadopagoVerifiedAt: null });

      await aprobarAumentosVencidos();

      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(10000);
      expect((await pagoDe(pago.id)).status).toBe('pending_verification');
    });

    it('un pago que un administrador ya rechazó no se aprueba solo', async () => {
      const { trabajo, pago } = await enRevision(30, { status: 'rejected' });

      await aprobarAumentosVencidos();

      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(10000);
      expect((await pagoDe(pago.id)).status).toBe('rejected');
    });

    it('si el trabajo ya no tiene el aumento pendiente, no inventa uno: vuelve a revisión humana, avisa y no lo reintenta', async () => {
      const { trabajo, pago } = await enRevision(30, {}, { pendingNewPrice: null, status: 'cancelled' });

      await aprobarAumentosVencidos();

      expect(Number((await trabajoDe(trabajo.id)).price)).toBe(10000);
      const p = await pagoDe(pago.id);
      expect(p.status).toBe('pending_verification');
      expect(p.metadata?.aumentoSinAplicar).toBe(true);
      expect(await Notification.count({ where: { recipientId: admin.id, title: 'Aumento de precio pagado que no se pudo aplicar' } })).toBe(1);

      await aprobarAumentosVencidos(); // no se reintenta ni vuelve a avisar
      expect(await Notification.count({ where: { recipientId: admin.id, title: 'Aumento de precio pagado que no se pudo aplicar' } })).toBe(1);
    });
  });

  /* ---------------- guardas ---------------- */

  describe('con el aumento pagado y en revisión', () => {
    it('el cliente no puede cancelar el cambio de presupuesto (la plata ya está cobrada)', async () => {
      const { trabajo } = await enRevision(1);

      const r = await request(app).patch(`/api/jobs/${trabajo.id}/cancel-budget-change`).set(con(cliente)).send({});

      expect(r.status).toBe(409);
      expect(r.body.code).toBe('AUMENTO_PAGADO_EN_REVISION');
      const t = await trabajoDe(trabajo.id);
      expect(t.status).toBe('paused');
      expect(Number(t.pendingNewPrice)).toBe(12000);
    });

    it('tampoco puede pedir otro monto: el pago corresponde al anterior', async () => {
      const { trabajo } = await enRevision(1);

      const r = await request(app).patch(`/api/jobs/${trabajo.id}/budget`).set(con(cliente)).send({ newPrice: 50000, reason: 'Quiero otro monto distinto' });

      expect(r.status).toBe(409);
      expect(r.body.code).toBe('AUMENTO_PAGADO_EN_REVISION');
      expect(Number((await trabajoDe(trabajo.id)).pendingNewPrice)).toBe(12000);
    });

    it('sin un pago en revisión, cancelar el cambio sigue funcionando', async () => {
      const { trabajo } = await armar(); // el pago está pendiente, no pagado

      const r = await request(app).patch(`/api/jobs/${trabajo.id}/cancel-budget-change`).set(con(cliente)).send({});

      expect(r.status).toBe(200);
      expect((await trabajoDe(trabajo.id)).status).toBe('open');
    });
  });
});
