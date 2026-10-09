import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import crypto from 'crypto';

/**
 * Webhooks de MercadoPago.
 *
 * Lo que había: (1) sin MERCADOPAGO_WEBHOOK_SECRET se aceptaba cualquier aviso; (2) /mercadopago/subscription
 * no verificaba firma y renovaba o cancelaba la membresía del usuario que dijera el CUERPO del aviso;
 * (3) la búsqueda del pago lanzaba "WHERE contract_id = undefined" en cada aviso, así que el webhook de
 * pagos nunca procesó ninguno; (4) un "aprobado" repetido volvía a ejecutar todo.
 *
 * MercadoPago es un simulacro: no sale nada a la red.
 */

const mockObtenerPago = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { getPayment: (...a: unknown[]) => mockObtenerPago(...a), createPayment: async () => ({}) },
}));
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: { sendEmail: async () => true, sendBalanceRefundEmail: async () => true },
}));
jest.mock('../../server/services/currencyExchange.js', () => ({
  __esModule: true,
  describirCotizacion: (q: unknown) => q,
  default: { convertEURtoARS: async (n: number) => n * 3000, getEURtoARSRate: async () => 3000 },
}));

import { User } from '../../server/models/sql/User.model.js';
import { Membership } from '../../server/models/sql/Membership.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';

const SECRETO = 'secreto-de-prueba-del-webhook';

describe('webhooks de MercadoPago', () => {
  let app: Express;
  let usuario: { id: string };
  const emailUsuario = 'webhook@mp.test';
  let contador = 4_000_000;
  const entornoOriginal = { ...process.env };

  const firmar = (dataId: string, secreto = SECRETO) => {
    const ts = String(Date.now());
    const requestId = 'req-' + ts;
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = crypto.createHmac('sha256', secreto).update(manifest).digest('hex');
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
  };

  const esperar = async (condicion: () => Promise<boolean>, ms = 3000) => {
    const limite = Date.now() + ms;
    while (Date.now() < limite) {
      if (await condicion()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const crearPago = async (extra: Record<string, unknown> = {}) => {
    const idMp = String(++contador);
    const p: any = await Payment.create({
      payerId: usuario.id,
      recipientId: null,
      contractId: null,
      amount: 5000,
      currency: 'ARS',
      status: 'pending',
      paymentType: 'job_publication',
      mercadopagoPaymentId: idMp,
      description: 'Publicación de prueba',
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
      ...extra,
    } as any);
    return { id: p.id as string, idMp };
  };
  const estadoDe = async (id: string) => ((await Payment.findByPk(id)) as any).status as string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/webhooks.js');
    app.use('/api/webhooks', rutas.default);
    await User.destroy({ where: { email: emailUsuario } });
    const u: any = await User.create({ email: emailUsuario, name: 'Persona webhook', username: 'webhookmp', password: 'password123', role: 'doer' } as any);
    usuario = { id: u.id };
  });

  afterAll(async () => {
    await Notification.destroy({ where: { recipientId: usuario.id } });
    await Membership.destroy({ where: { userId: usuario.id } });
    await Payment.destroy({ where: { payerId: usuario.id } });
    await User.destroy({ where: { email: emailUsuario } });
  });

  beforeEach(async () => {
    mockObtenerPago.mockReset();
    await Notification.destroy({ where: { recipientId: usuario.id } });
    await Membership.destroy({ where: { userId: usuario.id } });
    await Payment.destroy({ where: { payerId: usuario.id } });
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.MP_WEBHOOK_PROCESA_PAGOS;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = entornoOriginal.NODE_ENV;
    if (entornoOriginal.MERCADOPAGO_WEBHOOK_SECRET === undefined) delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    else process.env.MERCADOPAGO_WEBHOOK_SECRET = entornoOriginal.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.MP_WEBHOOK_PROCESA_PAGOS;
  });

  /* ---------------- la firma ---------------- */

  describe('firma', () => {
    const aviso = (id: string) => ({ type: 'payment', action: 'payment.updated', data: { id } });

    it('en PRODUCCIÓN, sin MERCADOPAGO_WEBHOOK_SECRET se rechaza todo (antes se aceptaba cualquier aviso)', async () => {
      process.env.NODE_ENV = 'production';
      const r = await request(app).post('/api/webhooks/mercadopago').send(aviso('123456'));
      expect(r.status).toBe(401);
      expect(mockObtenerPago).not.toHaveBeenCalled();
    });

    it('en producción sin secreto también se rechaza la ruta de suscripción', async () => {
      process.env.NODE_ENV = 'production';
      const r = await request(app).post('/api/webhooks/mercadopago/subscription').send({ action: 'subscription.authorized', data: { external_reference: 'x' } });
      expect(r.status).toBe(401);
    });

    it('con secreto, un aviso sin firma o con firma falsa se rechaza', async () => {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO;
      expect((await request(app).post('/api/webhooks/mercadopago').send(aviso('123456'))).status).toBe(401);
      const falsa = firmar('123456', 'otro-secreto');
      expect((await request(app).post('/api/webhooks/mercadopago').set(falsa).send(aviso('123456'))).status).toBe(401);
      expect((await request(app).post('/api/webhooks/mercadopago/subscription').send({ action: 'subscription.authorized' })).status).toBe(401);
    });

    it('con secreto, un aviso con la firma correcta se acepta', async () => {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO;
      const r = await request(app).post('/api/webhooks/mercadopago').set(firmar('123456')).send(aviso('123456'));
      expect(r.status).toBe(200);
    });

    it('con la firma de OTRO id no se puede avisar de un pago distinto', async () => {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = SECRETO;
      const r = await request(app).post('/api/webhooks/mercadopago').set(firmar('111111')).send(aviso('222222'));
      expect(r.status).toBe(401);
    });
  });

  /* ---------------- la suscripción ---------------- */

  describe('suscripción', () => {
    it('un aviso anónimo NO renueva ni cancela la membresía de nadie', async () => {
      const fin = new Date(Date.now() + 5 * 86400000);
      await Membership.create({
        userId: usuario.id, plan: 'PRO', status: 'active', startDate: new Date(), endDate: fin,
        priceUSD: 0, priceEUR: 7, priceARS: 21000, exchangeRateAtPurchase: 3000, autoRenew: true,
      } as any);

      for (const cuerpo of [
        { action: 'subscription.authorized', data: { external_reference: usuario.id } },
        { type: 'subscription', data: { status: 'authorized', external_reference: usuario.id } },
        { action: 'subscription.cancelled', data: { external_reference: usuario.id } },
        { type: 'subscription', data: { status: 'cancelled', external_reference: usuario.id } },
      ]) {
        const r = await request(app).post('/api/webhooks/mercadopago/subscription').send(cuerpo);
        expect(r.status).toBe(200);
        const r2 = await request(app).post('/api/webhooks/mercadopago').send(cuerpo);
        expect(r2.status).toBe(200);
      }
      await pausa(300);

      const m: any = await Membership.findOne({ where: { userId: usuario.id } });
      expect(m.status).toBe('active');
      expect(new Date(m.endDate).getTime()).toBe(fin.getTime()); // ni un mes gratis
      expect(m.cancelledAt ?? null).toBeNull();
    });

    it('un cuerpo vacío o roto no hace caer la ruta de suscripción', async () => {
      const r = await request(app).post('/api/webhooks/mercadopago/subscription').send({});
      expect(r.status).toBe(200);
    });
  });

  /* ---------------- el procesamiento de pagos ---------------- */

  describe('pagos', () => {
    const aprobado = (extra: Record<string, unknown> = {}) => ({
      status: 'approved', status_detail: 'accredited', transaction_amount: 5000, currency_id: 'ARS', metadata: {}, ...extra,
    });
    const avisar = (idMp: string) => request(app).post('/api/webhooks/mercadopago').send({ type: 'payment', action: 'payment.updated', data: { id: idMp } });
    /** Un administrador de prueba: el aviso de «pago en revisión» sólo se genera por el camino de rechazo, no por el de aprobación. */
    const conAdmin = async (fn: (adminId: string) => Promise<void>) => {
      const admin: any = await User.create({ email: 'admin-rev@mp.test', name: 'Admin revisión', username: 'adminrevmp', password: 'password123', role: 'admin', adminRole: 'admin' } as any);
      try { await fn(admin.id); } finally {
        await Notification.destroy({ where: { recipientId: admin.id } });
        await User.destroy({ where: { id: admin.id }, force: true });
      }
    };

    it('apagado (por defecto): se acepta el aviso pero el pago NO avanza', async () => {
      const { id, idMp } = await crearPago();
      mockObtenerPago.mockResolvedValue(aprobado());

      expect((await avisar(idMp)).status).toBe(200);
      await esperar(async () => mockObtenerPago.mock.calls.length > 0);
      await pausa(300);

      expect(await estadoDe(id)).toBe('pending');
    });

    it('apagado: el aviso igual GUARDA el id de MercadoPago del pago (la conciliación lo necesita para ver un cobro que nadie confirmó)', async () => {
      const { id, idMp } = await crearPago({ mercadopagoPaymentId: null });
      mockObtenerPago.mockResolvedValue(aprobado({ metadata: { payment_id: id } }));

      expect((await avisar(idMp)).status).toBe(200);
      const guardado = await esperar(async () => ((await Payment.findByPk(id)) as any).mercadopagoPaymentId === idMp);

      expect(guardado).toBe(true);
      expect(await estadoDe(id)).toBe('pending'); // sólo el vínculo: no se publica ni se activa nada
    });

    it('encendido: las publicaciones, membresías y aumentos los sigue confirmando capture-order: el webhook sólo guarda el vínculo', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      for (const tipo of ['job_publication', 'membership', 'budget_increase']) {
        const { id, idMp } = await crearPago({ paymentType: tipo, mercadopagoPaymentId: null });
        mockObtenerPago.mockResolvedValue(aprobado({ metadata: { payment_id: id } }));

        expect((await avisar(idMp)).status).toBe(200);
        const guardado = await esperar(async () => ((await Payment.findByPk(id)) as any).mercadopagoPaymentId === idMp);

        expect([tipo, guardado]).toEqual([tipo, true]);
        // sigue pendiente: si el webhook llegara primero y lo pasara a revisión, al volver el comprador capture-order le mostraría un error
        expect([tipo, await estadoDe(id)]).toEqual([tipo, 'pending']);
      }
    });

    it('encendido: el monto se compara EXACTO (una diferencia menor a un centavo también deja el pago en revisión con aviso)', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      await conAdmin(async (adminId) => {
        const { id, idMp } = await crearPago({ paymentType: 'contract_payment', amount: 5000 });
        mockObtenerPago.mockResolvedValue(aprobado({ transaction_amount: 5000.004 })); // dentro de la vieja tolerancia de un centavo

        expect((await avisar(idMp)).status).toBe(200);
        await esperar(async () => (await estadoDe(id)) !== 'pending');
        expect(await estadoDe(id)).toBe('pending_verification');
        expect(await Notification.count({ where: { recipientId: adminId, title: 'Pago con monto inesperado' } })).toBe(1);
      });
    });

    it('encendido: un aviso aprobado SIN monto o SIN moneda no pasa como bueno (antes se saltaba el control)', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      await conAdmin(async (adminId) => {
        for (const roto of [{ transaction_amount: undefined }, { currency_id: undefined }]) {
          const { id, idMp } = await crearPago({ paymentType: 'contract_payment' });
          mockObtenerPago.mockResolvedValue(aprobado(roto));
          expect((await avisar(idMp)).status).toBe(200);
          await esperar(async () => (await estadoDe(id)) !== 'pending');
          expect([JSON.stringify(roto), await estadoDe(id)]).toEqual([JSON.stringify(roto), 'pending_verification']);
        }
        expect(await Notification.count({ where: { recipientId: adminId, title: 'Pago con monto inesperado' } })).toBe(2);
      });
    });

    it('encendido: un pago en cuotas o con cupón queda en revisión con aviso a administración', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      await conAdmin(async (adminId) => {
        for (const extra of [{ installments: 3 }, { coupon_amount: 800 }]) {
          const { id, idMp } = await crearPago({ paymentType: 'contract_payment' });
          mockObtenerPago.mockResolvedValue(aprobado(extra));
          expect((await avisar(idMp)).status).toBe(200);
          await esperar(async () => (await estadoDe(id)) !== 'pending');
          expect([JSON.stringify(extra), await estadoDe(id)]).toEqual([JSON.stringify(extra), 'pending_verification']);
        }
        expect(await Notification.count({ where: { recipientId: adminId, title: 'Pago en cuotas o con cupón' } })).toBe(2);
      });
    });

    it('encendido: la búsqueda del pago ya no lanza error y el pago avanza al flujo de verificación', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      const { id, idMp } = await crearPago({ paymentType: 'contract_payment' });
      mockObtenerPago.mockResolvedValue(aprobado()); // sin metadata.external_reference: el caso que rompía

      expect((await avisar(idMp)).status).toBe(200);
      const avanzo = await esperar(async () => (await estadoDe(id)) !== 'pending');
      expect(avanzo).toBe(true);
      expect(await estadoDe(id)).toBe('pending_verification');
    });

    it('encendido: un "aprobado" repetido sobre un pago ya procesado no vuelve a ejecutar nada', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      const { id, idMp } = await crearPago({ status: 'completed' });
      mockObtenerPago.mockResolvedValue(aprobado());

      expect((await avisar(idMp)).status).toBe(200);
      await esperar(async () => mockObtenerPago.mock.calls.length > 0);
      await pausa(300);

      expect(await estadoDe(id)).toBe('completed');
      expect(await Notification.count({ where: { recipientId: usuario.id } })).toBe(0);
    });

    it('encendido: el rechazo de OTRO intento no pisa un pago ya cobrado', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      const { id, idMp } = await crearPago({ status: 'held_escrow' });
      mockObtenerPago.mockResolvedValue(aprobado({ status: 'rejected' }));

      expect((await avisar(idMp)).status).toBe(200);
      await esperar(async () => mockObtenerPago.mock.calls.length > 0);
      await pausa(300);

      expect(await estadoDe(id)).toBe('held_escrow');
    });

    it('un id de pago inválido en el aviso se ignora sin consultar a MercadoPago', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      for (const malo of ['../merchant_orders/1', 'abc', '', undefined]) {
        const r = await request(app).post('/api/webhooks/mercadopago').send({ type: 'payment', data: { id: malo } });
        expect(r.status).toBe(200);
      }
      await pausa(200);
      expect(mockObtenerPago).not.toHaveBeenCalled();
    });

    it('un aviso de pago sin "data" no rompe la ruta', async () => {
      process.env.MP_WEBHOOK_PROCESA_PAGOS = 'true';
      const r = await request(app).post('/api/webhooks/mercadopago').send({ type: 'payment' });
      expect(r.status).toBe(200);
      await pausa(200);
      expect(mockObtenerPago).not.toHaveBeenCalled();
    });
  });
});
