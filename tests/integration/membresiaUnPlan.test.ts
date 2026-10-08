import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Hay UNA sola membresía paga (PRO mensual) y durante la beta no se vende.
 *
 * Qué había: el cobro de membresías todavía aceptaba 'quarterly' (PRO x3 con 11%
 * de descuento) y 'super_pro' (EUR 8 con upgrade prorrateado), y no miraba si la
 * beta estaba en curso: sólo `GET /pricing` lo hacía, así que comprar saltándose la
 * pantalla funcionaba. Además `/capture-order` decidía el plan con
 * `payment.amount >= 8.99` sobre un monto en PESOS, de modo que casi toda compra de
 * PRO terminaba activando SUPER_PRO. Los Términos (7.3 y 8.1) dicen otra cosa.
 *
 * La fase (beta o estable) se controla con la fase real guardada en la base, con una
 * fecha de cierre lejana para que el reloj nunca decida; la pasarela de pago y el
 * tipo de cambio son mocks: no sale nada a la red.
 */

const TIPO_EUR = 1500; // pesos por euro dentro del test

const mockCrearPago = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockObtenerPago = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: {
    createPayment: (...a: unknown[]) => mockCrearPago(...a),
    getPayment: (...a: unknown[]) => mockObtenerPago(...a),
  },
}));

jest.mock('../../server/services/currencyExchange.js', () => ({
  __esModule: true,
  describirCotizacion: (q: unknown) => q,
  default: {
    convertEURtoARS: async (n: number) => n * 1500,
    getEURtoARSRate: async () => 1500,
    getQuotedEURRate: async () => ({ rate: 1500 }),
    // El código viejo de /capture-order todavía cotizaba en dólares: sin esto fallaría
    // con un 500 en vez de mostrar el plan equivocado que activaba.
    getUSDtoARSRate: async () => 1000,
    convertUSDtoARS: async (n: number) => n * 1000,
  },
}));

// payments.ts importa socketService de server/index.ts, que levanta el servidor entero.
jest.mock('../../server/index.js', () => ({ __esModule: true, socketService: {} }));

// El cron se captura en vez de programarse, y el mail se registra en vez de enviarse.
let mockTareaCron: (() => Promise<void>) | undefined;
jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: (_expr: string, fn: () => Promise<void>) => { mockTareaCron = fn; } },
}));
const mockEnviarMail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: { sendEmail: (...a: unknown[]) => mockEnviarMail(...a) },
}));

import { User } from '../../server/models/sql/User.model.js';
import { Membership } from '../../server/models/sql/Membership.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { AppSetting } from '../../server/models/sql/AppSetting.model.js';
import {
  setPlatformPhase,
  configurarFechasDeFase,
  PHASE_SETTING_KEY,
} from '../../server/services/platformPhase.js';
import membershipService from '../../server/services/membershipService.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../../shared/constants/membershipPricing.js';

const PRECIO_ARS = MEMBERSHIP_PRICES_EUR.pro * TIPO_EUR;
const PLAN_VIEJO_ACEPTADO = ['quarterly', 'super_pro'];
let contadorIdMp = 7_000_000;

describe('una sola membresía paga, y no se vende en la beta', () => {
  let app: Express;
  const usuarios: Record<string, { id: string; token: string }> = {};
  const emails: string[] = [];

  const crear = async (clave: string, extra: Record<string, unknown> = {}) => {
    const email = `${clave}@membresia.test`;
    emails.push(email);
    const u: any = await User.create({
      email,
      name: `Persona ${clave}`,
      username: `mem${clave}`,
      password: 'password123',
      role: 'doer',
      ...extra,
    } as any);
    usuarios[clave] = {
      id: u.id,
      token: jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret'),
    };
  };
  const como = (clave: string) => ({ Authorization: `Bearer ${usuarios[clave].token}` });
  const crearPago = (clave: string, body: Record<string, unknown>) =>
    request(app).post('/api/membership/create-payment').set(como(clave)).send(body);
  const enBeta = () => setPlatformPhase('beta');
  const enFaseEstable = () => setPlatformPhase('live');
  const pagosDe = (clave: string) => Payment.count({ where: { payerId: usuarios[clave].id } });

  beforeAll(async () => {
    // Una fecha de cierre lejana: la fase la decide la fila guardada, no el reloj.
    configurarFechasDeFase({ betaEndsAt: '2099-12-31T23:59:59-03:00' });

    app = express();
    app.use(express.json());
    const membresia = await import('../../server/routes/membership.js');
    const pagos = await import('../../server/routes/payments.js');
    app.use('/api/membership', membresia.default);
    app.use('/api/payments', pagos.default);

    await crear('libre');
    await crear('pro', { hasMembership: true, membershipTier: 'pro' });
    await crear('heredada', { hasMembership: true, membershipTier: 'super_pro' });
    await crear('compra');
  });

  afterAll(async () => {
    const ids = Object.values(usuarios).map((u) => u.id);
    await Notification.destroy({ where: { recipientId: ids } });
    // La membresía referencia al último pago: se borra primero.
    await Membership.destroy({ where: { userId: ids } });
    await Payment.destroy({ where: { payerId: ids } });
    await User.destroy({ where: { email: emails } });
    await AppSetting.destroy({ where: { key: PHASE_SETTING_KEY } });
    configurarFechasDeFase({});
  });

  beforeEach(async () => {
    mockCrearPago.mockReset();
    mockCrearPago.mockResolvedValue({ paymentId: 'pref-1', checkoutUrl: 'https://mp.test/checkout' });
    mockObtenerPago.mockReset();
    // Un pago aprobado COMPLETO, como lo devuelve MercadoPago: /capture-order exige monto y moneda,
    // y un `{ status: 'approved' }` a secas ya no alcanza para dar nada por pagado.
    mockObtenerPago.mockResolvedValue({
      status: 'approved',
      status_detail: 'accredited',
      transaction_amount: PRECIO_ARS,
      currency_id: 'ARS',
      metadata: {},
    });
    mockEnviarMail.mockReset();
    mockEnviarMail.mockResolvedValue(true);
    const ids = Object.values(usuarios).map((u) => u.id);
    await Membership.destroy({ where: { userId: ids } }); // referencia al último pago: primero
    await Payment.destroy({ where: { payerId: ids } });
    await enFaseEstable();
  });

  /* ------------------------------------------------------------------ *
   * A. POST /create-payment
   * ------------------------------------------------------------------ */
  describe('POST /api/membership/create-payment', () => {
    it.each(PLAN_VIEJO_ACEPTADO)("el plan '%s' ya no se vende: 400, sin tocar la pasarela ni crear un pago", async (plan) => {
      const r = await crearPago('libre', { plan });
      expect(r.status).toBe(400);
      expect(r.body.success).toBe(false);
      expect(r.body.message).toMatch(/Plan inválido/);
      expect(mockCrearPago).not.toHaveBeenCalled();
      expect(await pagosDe('libre')).toBe(0);
    });

    it('un plan inventado o un cuerpo vacío dan el mismo 400', async () => {
      expect((await crearPago('libre', { plan: 'anual' })).status).toBe(400);
      expect((await crearPago('libre', {})).status).toBe(400);
      expect((await request(app).post('/api/membership/create-payment').set(como('libre'))).status).toBe(400);
      expect(mockCrearPago).not.toHaveBeenCalled();
    });

    it('el 400 por plan viejo es el mismo durante la beta: no depende de la fase', async () => {
      await enBeta();
      for (const plan of PLAN_VIEJO_ACEPTADO) {
        const r = await crearPago('libre', { plan });
        expect({ plan, status: r.status }).toEqual({ plan, status: 400 });
      }
    });

    it("'monthly' durante la beta se rechaza con 403 y el motivo, sin cobrar nada", async () => {
      await enBeta();
      const r = await crearPago('libre', { plan: 'monthly' });
      expect(r.status).toBe(403);
      expect(r.body.success).toBe(false);
      expect(r.body.code).toBe('MEMBERSHIPS_NOT_AVAILABLE');
      expect(r.body.message).toMatch(/beta/i);
      expect(mockCrearPago).not.toHaveBeenCalled();
      expect(await pagosDe('libre')).toBe(0);
    });

    it("'monthly' fuera de la beta cobra PRO en euros convertido a pesos, y nada más", async () => {
      const r = await crearPago('libre', { plan: 'monthly' });
      expect(r.status).toBe(200);
      expect(r.body.initPoint).toBe('https://mp.test/checkout');

      expect(mockCrearPago).toHaveBeenCalledTimes(1);
      const enviado: any = mockCrearPago.mock.calls[0][0];
      expect(enviado.amount).toBe(PRECIO_ARS);
      expect(enviado.currency).toBe('ARS');
      expect(enviado.description).toBe('Membresía DOAPP PRO - Mensual');
      expect(enviado.metadata).toMatchObject({ paymentType: 'membership', plan: 'monthly', tier: 'PRO' });

      const pago: any = await Payment.findOne({ where: { payerId: usuarios.libre.id } });
      expect(Number(pago.amount)).toBe(PRECIO_ARS);
      expect(pago.paymentType).toBe('membership');
      expect(Number(pago.platformFee)).toBe(0);
    });

    it('quien ya tiene una membresía activa (PRO o heredada) no compra otra', async () => {
      for (const clave of ['pro', 'heredada']) {
        const r = await crearPago(clave, { plan: 'monthly' });
        expect({ clave, status: r.status }).toEqual({ clave, status: 400 });
        expect(r.body.message).toMatch(/membresía activa/);
      }
      expect(mockCrearPago).not.toHaveBeenCalled();
    });

    it('sin sesión devuelve 401', async () => {
      const r = await request(app).post('/api/membership/create-payment').send({ plan: 'monthly' });
      expect(r.status).toBe(401);
    });
  });

  describe('las otras dos rutas que arrancan una compra también respetan la beta', () => {
    it('POST /upgrade-to-pro durante la beta: 403 y no se crea nada', async () => {
      await enBeta();
      const r = await request(app).post('/api/membership/upgrade-to-pro').set(como('libre')).send({});
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('MEMBERSHIPS_NOT_AVAILABLE');
      expect(mockCrearPago).not.toHaveBeenCalled();
      expect(await pagosDe('libre')).toBe(0);
      expect(await Membership.count({ where: { userId: usuarios.libre.id } })).toBe(0);
    });

    it('POST /create ya no existe (410) ni en la beta ni fuera de ella, y no crea nada', async () => {
      for (const fase of [enBeta, enFaseEstable]) {
        await fase();
        const r = await request(app).post('/api/membership/create').set(como('libre')).send({});
        expect(r.status).toBe(410);
        expect(mockCrearPago).not.toHaveBeenCalled();
        expect(await pagosDe('libre')).toBe(0);
        expect(await Membership.count({ where: { userId: usuarios.libre.id } })).toBe(0);
      }
      await enBeta();
    });

    it('POST /upgrade-to-pro fuera de la beta sigue cobrando PRO (el guard no rompe el camino feliz)', async () => {
      const r = await request(app).post('/api/membership/upgrade-to-pro').set(como('libre')).send({});
      expect(r.status).toBe(201);
      expect((mockCrearPago.mock.calls[0][0] as any).amount).toBe(PRECIO_ARS);
    });
  });

  /* ------------------------------------------------------------------ *
   * A. GET /pricing
   * ------------------------------------------------------------------ */
  describe('GET /api/membership/pricing', () => {
    it('SUPER PRO ya no se ofrece: sólo queda un objeto vacío de compatibilidad para las apps viejas', async () => {
      /**
       * Quitar `superPro` del todo rompía la app móvil ya publicada: lee
       * `pricing.superPro.priceARS` sin `?.` y lanza un TypeError al abrir Membresía.
       * Va sin precio, sin beneficios y marcado como discontinuado.
       */
      for (const fase of [enBeta, enFaseEstable]) {
        await fase();
        const r = await request(app).get('/api/membership/pricing');
        expect(r.status).toBe(200);
        expect(r.body.pricing.superPro).toEqual({ discontinued: true, name: 'PRO', price: null, priceARS: null, benefits: [] });
        expect(Object.keys(r.body.pricing).sort()).toEqual(['free', 'pro', 'superPro']);
      }
    });

    it('trae PRO con el precio en euros de la constante y la comisión sin cambios', async () => {
      const r = await request(app).get('/api/membership/pricing');
      expect(r.body.pricing.pro.priceEUR).toBe(MEMBERSHIP_PRICES_EUR.pro);
      expect(r.body.pricing.pro.priceARS).toBe(PRECIO_ARS);
      expect(r.body.pricing.pro.commissionRate).toBe(COMMISSION_RATES.free);
      expect(JSON.stringify(r.body)).not.toMatch(/SUPER PRO/);
    });

    it('durante la beta avisa que no está a la venta, con el motivo de los Términos', async () => {
      await enBeta();
      const r = await request(app).get('/api/membership/pricing');
      expect(r.body.available).toBe(false);
      expect(r.body.unavailableReason).toMatch(/beta/i);
      expect(r.body.unavailableReason).not.toMatch(/comisi/i); // la membresía no baja la comisión
    });

    it('fuera de la beta queda a la venta y no trae motivo', async () => {
      await enFaseEstable();
      const r = await request(app).get('/api/membership/pricing');
      expect(r.body.available).toBe(true);
      expect(r.body.unavailableReason).toBeNull();
    });
  });

  /* ------------------------------------------------------------------ *
   * B. POST /payments/capture-order, rama membresía
   * ------------------------------------------------------------------ */
  describe('POST /api/payments/capture-order con una membresía', () => {
    const crearPagoPendiente = (clave: string, descripcion: string, preferencia: string) =>
      Payment.create({
        payerId: usuarios[clave].id,
        recipientId: null,
        contractId: null,
        amount: PRECIO_ARS,
        currency: 'ARS',
        status: 'pending',
        paymentType: 'membership',
        mercadopagoPreferenceId: preferencia,
        description: descripcion,
        platformFee: 0,
        platformFeePercentage: 0,
        isEscrow: false,
      } as any);
    const capturar = (clave: string, preferencia: string) =>
      request(app)
        .post('/api/payments/capture-order')
        .set(como(clave))
        // Un id de MercadoPago real es numérico (capture-order lo valida), y no se puede repetir entre pagos.
        .send({ preference_id: preferencia, paymentId: String(++contadorIdMp) });

    beforeEach(async () => {
      await Membership.destroy({ where: { userId: usuarios.compra.id } });
      await User.update(
        { hasMembership: false, membershipTier: 'free' } as any,
        { where: { id: usuarios.compra.id } },
      );
    });

    it('un pago de PRO, que en pesos supera 8,99, activa PRO y no SUPER_PRO', async () => {
      // El monto en pesos (miles) siempre pasaba el umbral de 8,99 pensado para dólares.
      expect(PRECIO_ARS).toBeGreaterThan(8.99);
      await crearPagoPendiente('compra', 'Membresía DOAPP PRO - Mensual', 'pref-pro');

      const r = await capturar('compra', 'pref-pro');
      expect(r.status).toBe(200);
      expect(r.body.data.membershipActivated).toBe(true);
      expect(r.body.data.plan).toBe('PRO');

      const m: any = await Membership.findOne({ where: { userId: usuarios.compra.id } });
      expect(m.plan).toBe('PRO');
      expect(Number(m.priceEUR)).toBe(MEMBERSHIP_PRICES_EUR.pro);
      expect(Number(m.priceARS)).toBe(PRECIO_ARS);
      expect(Number(m.exchangeRateAtPurchase)).toBe(TIPO_EUR);
      expect(Number(m.priceUSD)).toBe(0); // legacy: ya no se cotiza en dólares
      // sin comisión por plan: la tasa del registro es la de la tabla, no 2 ni 3
      expect(Number(m.reducedCommissionPercentage)).toBe(COMMISSION_RATES.pro);

      const u: any = await User.findByPk(usuarios.compra.id);
      expect(u.hasMembership).toBe(true);
      expect(u.membershipTier).toBe('pro');
    });

    it("aunque la descripción diga 'SUPER PRO', toda compra activa PRO", async () => {
      await crearPagoPendiente('compra', 'Membresía DOAPP SUPER PRO - Mensual', 'pref-viejo');

      const r = await capturar('compra', 'pref-viejo');
      expect(r.status).toBe(200);
      expect(r.body.data.plan).toBe('PRO');
      const u: any = await User.findByPk(usuarios.compra.id);
      expect(u.membershipTier).toBe('pro');
      const m: any = await Membership.findOne({ where: { userId: usuarios.compra.id } });
      expect(m.plan).toBe('PRO');
    });

    it('la renovación de una membresía existente la deja en PRO, con 30 días nuevos y el precio en euros', async () => {
      await Membership.create({
        userId: usuarios.compra.id,
        plan: 'SUPER_PRO',
        status: 'expired',
        startDate: new Date(Date.now() - 60 * 86400000),
        endDate: new Date(Date.now() - 30 * 86400000),
        priceUSD: 8.99,
        priceARS: 1,
        exchangeRateAtPurchase: 1,
      } as any);
      await crearPagoPendiente('compra', 'Membresía DOAPP PRO - Mensual', 'pref-renov');

      const r = await capturar('compra', 'pref-renov');
      expect(r.status).toBe(200);

      const m: any = await Membership.findOne({ where: { userId: usuarios.compra.id } });
      expect(m.plan).toBe('PRO');
      expect(m.status).toBe('active');
      expect(new Date(m.endDate).getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
      expect(Number(m.priceEUR)).toBe(MEMBERSHIP_PRICES_EUR.pro);
      expect(Number(m.reducedCommissionPercentage)).toBe(COMMISSION_RATES.pro);
    });
  });

  /* ------------------------------------------------------------------ *
   * D. La comisión guardada sale de COMMISSION_RATES
   * ------------------------------------------------------------------ */
  describe('la tasa que se guarda con la membresía sale de COMMISSION_RATES', () => {
    const nuevaMembresia = (clave: string, plan: 'PRO' | 'SUPER_PRO', status = 'pending', extra: Record<string, unknown> = {}) =>
      Membership.create({
        userId: usuarios[clave].id,
        plan,
        status,
        startDate: new Date(Date.now() - 1000),
        endDate: new Date(Date.now() + 30 * 86400000),
        priceUSD: 0,
        priceARS: PRECIO_ARS,
        exchangeRateAtPurchase: TIPO_EUR,
        ...extra,
      } as any);

    beforeEach(async () => {
      await Membership.destroy({ where: { userId: usuarios.compra.id } });
    });

    it.each([
      ['PRO', COMMISSION_RATES.pro],
      ['SUPER_PRO', COMMISSION_RATES.super_pro],
    ] as const)('una membresía %s se crea con la tasa de la tabla (antes 3 o 1)', async (plan, tasa) => {
      const m: any = await nuevaMembresia('compra', plan);
      expect(Number(m.reducedCommissionPercentage)).toBe(tasa);
    });

    it('activar la membresía deja la tasa del usuario en la de la tabla (antes 3)', async () => {
      await nuevaMembresia('compra', 'PRO');
      // activateMembership exige un pago de membresía propio y confirmado
      const pago: any = await Payment.create({
        payerId: usuarios.compra.id, recipientId: null, contractId: null, amount: PRECIO_ARS, currency: 'ARS',
        status: 'completed', paymentType: 'membership', description: 'Membresía DOAPP PRO - Mensual',
        platformFee: 0, platformFeePercentage: 0, isEscrow: false,
      } as any);
      await membershipService.activateMembership(usuarios.compra.id, pago.id);
      const u: any = await User.findByPk(usuarios.compra.id);
      expect(u.membershipTier).toBe('pro');
      expect(Number(u.currentCommissionRate)).toBe(COMMISSION_RATES.pro);
    });

    it('cancelar la membresía devuelve la tasa estándar (antes 8)', async () => {
      await nuevaMembresia('compra', 'PRO', 'active');
      await membershipService.cancelMembership(usuarios.compra.id, 'prueba');
      const u: any = await User.findByPk(usuarios.compra.id);
      expect(u.hasMembership).toBe(false);
      expect(Number(u.currentCommissionRate)).toBe(COMMISSION_RATES.free);
    });

    it('una membresía vencida sin renovación automática devuelve la tasa estándar (antes 8)', async () => {
      await nuevaMembresia('compra', 'PRO', 'active', {
        startDate: new Date(Date.now() - 40 * 86400000),
        endDate: new Date(Date.now() - 86400000),
        autoRenew: false,
      });
      await User.update({ hasMembership: true, currentCommissionRate: 1 } as any, { where: { id: usuarios.compra.id } });

      await membershipService.checkExpiredMemberships();
      const u: any = await User.findByPk(usuarios.compra.id);
      expect(u.hasMembership).toBe(false);
      expect(Number(u.currentCommissionRate)).toBe(COMMISSION_RATES.free);
    });
  });

  /* ------------------------------------------------------------------ *
   * E. Aviso de fin del descuento por referidos
   * ------------------------------------------------------------------ */
  describe('el aviso de fin del descuento por referidos dice la comisión real', () => {
    const VIEJO = [/\b8\s?%/, /\$\s?4\.999/, /\$\s?8\.999/, /SUPER PRO/, /1%\s+de\s+comisi/i, /mantener comisiones reducidas/i];

    const correrCron = async () => {
      const { startResetReferralDiscountsJob } = await import('../../server/jobs/resetReferralDiscounts.js');
      startResetReferralDiscountsJob();
      expect(mockTareaCron).toBeDefined();
      await mockTareaCron!();
    };
    const prepararUsuario = () =>
      User.update(
        {
          hasReferralDiscount: true,
          referralDiscountExpiresAt: new Date(Date.now() - 86400000),
          membershipTier: 'free',
          currentCommissionRate: 3,
        } as any,
        { where: { id: usuarios.libre.id } },
      );
    const mailEnviado = (): string => {
      expect(mockEnviarMail).toHaveBeenCalledTimes(1);
      return String((mockEnviarMail.mock.calls[0][0] as any).html);
    };

    beforeEach(async () => {
      await Notification.destroy({ where: { recipientId: usuarios.libre.id } });
      await prepararUsuario();
    });

    it('fuera de la beta: dice la tasa de la constante y que PRO da visibilidad sin cambiar la comisión', async () => {
      await enFaseEstable();
      await correrCron();

      const html = mailEnviado();
      expect(html).toContain(`${COMMISSION_RATES.free}%`);
      expect(html).toContain(`€${MEMBERSHIP_PRICES_EUR.pro}`);
      expect(html).toMatch(/no cambia la comisión/i);
      for (const v of VIEJO) expect({ patron: String(v), aparece: v.test(html) }).toEqual({ patron: String(v), aparece: false });

      const u: any = await User.findByPk(usuarios.libre.id);
      expect(Number(u.currentCommissionRate)).toBe(COMMISSION_RATES.free); // antes 8
      expect(u.hasReferralDiscount).toBe(false);

      const n: any = await Notification.findOne({ where: { recipientId: usuarios.libre.id } });
      expect(n.message).toContain(`${COMMISSION_RATES.free}%`);
      expect(n.message).toContain(`€${MEMBERSHIP_PRICES_EUR.pro}`);
      for (const v of VIEJO) expect({ patron: String(v), aparece: v.test(n.message) }).toEqual({ patron: String(v), aparece: false });
      expect(Number(n.data.newRate)).toBe(COMMISSION_RATES.free);
    });

    it('durante la beta: no dice que se cobra comisión ni invita a comprar una membresía que no está a la venta', async () => {
      await enBeta();
      await correrCron();

      const html = mailEnviado();
      expect(html).toMatch(/Durante la beta no se cobra comisión/);
      expect(html).toContain(`${COMMISSION_RATES.free}%`); // la que rige al terminar
      expect(html).not.toContain(`€${MEMBERSHIP_PRICES_EUR.pro}`);
      expect(html).not.toMatch(/Ver planes/);
      for (const v of VIEJO) expect({ patron: String(v), aparece: v.test(html) }).toEqual({ patron: String(v), aparece: false });
    });
  });

  /* ------------------------------------------------------------------ *
   * C. Mail de bienvenida de la membresía (está dentro de una función no exportada)
   * ------------------------------------------------------------------ */
  describe('el mail de bienvenida a PRO lista beneficios reales', () => {
    const fuente = readFileSync(join(process.cwd(), 'server/routes/webhooks.ts'), 'utf8');
    const bienvenida = fuente.slice(fuente.indexOf('async function handleMembershipPayment'), fuente.indexOf('Webhook de suscripción: hoy NO cambia'));

    it('no promete comisión reducida, contratos por plan ni soporte prioritario', () => {
      expect(bienvenida.length).toBeGreaterThan(500);
      expect(bienvenida).not.toMatch(/3 contratos mensuales/);
      expect(bienvenida).not.toMatch(/\b3%/);
      expect(bienvenida).not.toMatch(/Soporte prioritario/);
      expect(bienvenida).not.toMatch(/Estadísticas avanzadas/);
    });

    it('lista promoción del perfil (con los días de la constante), insignia, prioridad en búsquedas y estadísticas', () => {
      expect(bienvenida).toContain('${MEMBERSHIP_PROMO_DAYS} días de promoción');
      expect(bienvenida).toMatch(/Insignia/);
      expect(bienvenida).toMatch(/Prioridad en las búsquedas/);
      expect(bienvenida).toMatch(/Estadísticas de tu perfil/);
      expect(bienvenida).toMatch(/la misma que en el plan gratuito/);
    });
  });

  /* ------------------------------------------------------------------ *
   * F. PRO no se regala: activar exige un pago propio y confirmado
   * ------------------------------------------------------------------ */
  describe('POST /api/membership/activate y /create: sin pago confirmado no hay PRO', () => {
    const pagoDe = (clave: string, extra: Record<string, unknown> = {}) =>
      Payment.create({
        payerId: usuarios[clave].id, recipientId: null, contractId: null, amount: PRECIO_ARS, currency: 'ARS',
        status: 'completed', paymentType: 'membership', description: 'Membresía DOAPP PRO - Mensual',
        platformFee: 0, platformFeePercentage: 0, isEscrow: false, ...extra,
      } as any) as Promise<any>;
    const filaPendiente = (clave: string, extra: Record<string, unknown> = {}) =>
      Membership.create({
        userId: usuarios[clave].id, plan: 'PRO', status: 'pending', startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000), priceUSD: 0, priceARS: PRECIO_ARS,
        exchangeRateAtPurchase: TIPO_EUR, ...extra,
      } as any);
    const activar = (clave: string, paymentId: unknown) =>
      request(app).post('/api/membership/activate').set(como(clave)).send({ paymentId });
    const esPro = async (clave: string) => ((await User.findByPk(usuarios[clave].id)) as any).membershipTier === 'pro';

    beforeEach(async () => {
      await Membership.destroy({ where: { userId: usuarios.compra.id } });
      await Payment.destroy({ where: { payerId: [usuarios.compra.id, usuarios.libre.id] } });
      await User.update({ hasMembership: false, membershipTier: 'free' } as any, { where: { id: [usuarios.compra.id, usuarios.libre.id] } });
    });

    it('un paymentId inventado ("x", "mp-1", un número) no activa nada', async () => {
      await filaPendiente('compra');
      for (const falso of ['x', 'mp-1', '123456', 'drop table users']) {
        const r = await activar('compra', falso);
        expect([falso, r.status]).toEqual([falso, 404]);
      }
      expect(await esPro('compra')).toBe(false);
      expect(((await Membership.findOne({ where: { userId: usuarios.compra.id } })) as any).status).toBe('pending');
    });

    it('el pago de otra persona no sirve', async () => {
      await filaPendiente('compra');
      const ajeno = await pagoDe('libre');
      const r = await activar('compra', ajeno.id);
      expect(r.status).toBe(404);
      expect(await esPro('compra')).toBe(false);
    });

    it('un pago que todavía no está confirmado no sirve', async () => {
      await filaPendiente('compra');
      for (const estado of ['pending', 'processing', 'pending_verification', 'failed']) {
        const p = await pagoDe('compra', { status: estado });
        const r = await activar('compra', p.id);
        expect([estado, r.status]).toEqual([estado, 409]);
      }
      expect(await esPro('compra')).toBe(false);
    });

    it('un pago que no es de membresía no sirve', async () => {
      await filaPendiente('compra');
      const p = await pagoDe('compra', { paymentType: 'job_publication' });
      expect((await activar('compra', p.id)).status).toBe(404);
      expect(await esPro('compra')).toBe(false);
    });

    it('sin paymentId se rechaza con 400', async () => {
      const r = await request(app).post('/api/membership/activate').set(como('compra')).send({});
      expect(r.status).toBe(400);
    });

    it('con un pago propio, de membresía y confirmado, activa PRO y lo deja registrado', async () => {
      await filaPendiente('compra');
      const p = await pagoDe('compra');
      const r = await activar('compra', p.id);
      expect(r.status).toBe(200);
      expect(await esPro('compra')).toBe(true);
      const m: any = await Membership.findOne({ where: { userId: usuarios.compra.id } });
      expect(m.status).toBe('active');
      expect(String(m.lastPaymentId)).toBe(String(p.id));
    });

    it('un mismo pago no reactiva una membresía ya vencida o cancelada (sería regalar otro mes)', async () => {
      const p = await pagoDe('compra');
      await filaPendiente('compra', { status: 'expired', lastPaymentId: p.id });
      const r = await activar('compra', p.id);
      expect(r.status).toBe(409);
      expect(await esPro('compra')).toBe(false);
    });

    it('/create ya no existe: no crea la fila ni marca al usuario como miembro antes de pagar', async () => {
      await enFaseEstable();
      const r = await request(app).post('/api/membership/create').set(como('libre')).send({});
      expect(r.status).toBe(410);
      expect(await Membership.count({ where: { userId: usuarios.libre.id } })).toBe(0);
      expect(((await User.findByPk(usuarios.libre.id)) as any).hasMembership).toBe(false);
      await enBeta();
    });
  });
});
