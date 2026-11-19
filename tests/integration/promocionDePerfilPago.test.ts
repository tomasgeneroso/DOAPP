import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Promocionar el perfil se paga (reporte del dueño, 2026-11-19: «en promocionar perfil no me lleva a la pantalla de pago»). Antes se reservaban los días y quedaban
 * «pendientes de pago» sin forma de pagarlos. Camino completo con la base real: reservar → pagar (orden de Mercado Pago) → confirmar → los días quedan activos y el perfil sale
 * en «destacados». El monto lo pone el servidor; un día ajeno o ya pagado no se puede pagar.
 */
const mockObtenerPago = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: {
    createPayment: async () => ({ paymentId: `pref-promo-${Math.random().toString(36).slice(2, 8)}`, checkoutUrl: 'https://mp.test/checkout' }),
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
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => async () => true }),
}));

import { Advertisement } from '../../server/models/sql/Advertisement.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('promoción del perfil: reservar, pagar y activar', () => {
  let app: Express;
  let persona: any;
  let otra: any;
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', (await import('../../server/routes/payments.js')).default);
    app.use('/api/profile-promotion', (await import('../../server/routes/profilePromotion.js')).default);
    persona = await crearUsuario({ role: 'doer', name: 'Persona Promocionada' });
    otra = await crearUsuario({ role: 'doer' });
  });

  afterAll(async () => {
    try {
      await Advertisement.destroy({ where: { advertiserId: [persona.id, otra.id] } as any });
      await Payment.destroy({ where: { payerId: [persona.id, otra.id] } as any });
      await User.destroy({ where: { id: [persona.id, otra.id] } as any, force: true });
    } catch { /* la limpieza no hace fallar la prueba */ }
  });

  it('reserva dos días, paga con Mercado Pago, se confirma y el perfil sale como destacado', async () => {
    const opciones = await request(app).get('/api/profile-promotion/options').set(con(persona));
    expect(opciones.status).toBe(200);
    expect(opciones.body.data.dias[1].precioEur).toBeGreaterThanOrEqual(1);
    expect(opciones.body.data.dias[1].precioEur).toBeLessThanOrEqual(10);
    expect(opciones.body.data.factores.map((f: any) => f.clave)).toEqual(['audiencia', 'app', 'demanda', 'escasez', 'perfil']);
    const dias = opciones.body.data.dias.slice(1, 3).map((d: any) => d.start);

    const reserva = await request(app).post('/api/profile-promotion').set(con(persona)).send({ dias });
    expect(reserva.status).toBe(201);
    const ids: string[] = reserva.body.data.ids;
    expect(ids).toHaveLength(2);
    // El precio de cada día lo fija el servidor: entre el mínimo (1 €) y el tope (10 €), al cambio de la prueba (1 € = $3000). Más IVA y costo de procesamiento.
    const neto = reserva.body.data.netoArs;
    expect(neto).toBeGreaterThanOrEqual(2 * 3000);
    expect(neto).toBeLessThanOrEqual(2 * 10 * 3000);
    const d = reserva.body.data.desglose;
    expect(d.neto).toBe(neto);
    expect(d.iva).toBeCloseTo(neto * 0.21, 1);
    expect(d.total).toBeCloseTo(d.neto + d.iva + d.procesamiento + d.ivaProcesamiento, 1);
    expect(d.total).toBeGreaterThan(neto * 1.21);

    // sin pagar no aparece en destacados
    const antes = await request(app).get('/api/profile-promotion/activos');
    expect(antes.body.data.some((p: any) => p.id === persona.id)).toBe(false);

    const pago = await request(app).post('/api/profile-promotion/pay').set(con(persona)).send({ ids });
    expect(pago.status).toBe(201);
    expect(pago.body.data.paymentUrl).toBe('https://mp.test/checkout');
    // el monto lo puso el servidor: el mismo total (con IVA y procesamiento) que se mostró al reservar
    expect(pago.body.data.totalArs).toBeCloseTo(d.total, 2);
    const fila: any = await Payment.findByPk(pago.body.data.paymentId);
    expect(fila.paymentType).toBe('profile_promotion');
    expect(Number(fila.amount)).toBeCloseTo(d.total, 2);
    expect(fila.metadata.neto).toBe(neto);

    // se confirma: Mercado Pago dice aprobado por el monto exacto
    mockObtenerPago.mockResolvedValue({ status: 'approved', status_detail: 'accredited', transaction_amount: Number(fila.amount), currency_id: 'ARS', metadata: {} });
    const captura = await request(app).post('/api/payments/capture-order').set(con(persona)).send({ preference_id: pago.body.data.preferenceId, paymentId: '9123456' });
    expect(captura.status).toBe(200);
    expect(captura.body.data.promotionActivated).toBe(true);
    expect(captura.body.data.dias).toBe(2);

    const activas = await Advertisement.findAll({ where: { id: ids } as any });
    expect(activas.every((a: any) => a.paymentStatus === 'paid' && a.status === 'active' && a.isApproved === true)).toBe(true);

    // repetir la confirmación no rehace nada
    const otraVez = await request(app).post('/api/payments/capture-order').set(con(persona)).send({ preference_id: pago.body.data.preferenceId, paymentId: '9123456' });
    expect(otraVez.status).toBe(200);
    expect(otraVez.body.data.alreadyProcessed).toBe(true);
  });

  it('no se puede pagar un día ajeno ni sin elegir ninguno', async () => {
    const opciones = await request(app).get('/api/profile-promotion/options').set(con(otra));
    const dia = opciones.body.data.dias[5].start;
    const reserva = await request(app).post('/api/profile-promotion').set(con(otra)).send({ dias: [dia] });
    const ids: string[] = reserva.body.data.ids;

    const ajeno = await request(app).post('/api/profile-promotion/pay').set(con(persona)).send({ ids });
    expect(ajeno.status).toBe(409);

    const vacio = await request(app).post('/api/profile-promotion/pay').set(con(otra)).send({ ids: [] });
    expect(vacio.status).toBe(400);
  });

  it('un pago que Mercado Pago no aprueba no activa los días', async () => {
    const opciones = await request(app).get('/api/profile-promotion/options').set(con(otra));
    const dia = opciones.body.data.dias[8].start;
    const reserva = await request(app).post('/api/profile-promotion').set(con(otra)).send({ dias: [dia] });
    const ids: string[] = reserva.body.data.ids;
    const pago = await request(app).post('/api/profile-promotion/pay').set(con(otra)).send({ ids });
    expect(pago.status).toBe(201);
    expect((await request(app).post('/api/profile-promotion/cotizar').set(con(otra)).send({ dias: [dia] })).body.data.desglose.total).toBeCloseTo(pago.body.data.totalArs, 2);
    mockObtenerPago.mockResolvedValue({ status: 'pending', status_detail: 'pending_waiting_payment', transaction_amount: 3000, currency_id: 'ARS', metadata: {} });
    const captura = await request(app).post('/api/payments/capture-order').set(con(otra)).send({ preference_id: pago.body.data.preferenceId, paymentId: '9123999' });
    expect(captura.body.data?.promotionActivated).not.toBe(true);
    const fila: any = await Advertisement.findByPk(ids[0]);
    expect(fila.paymentStatus).toBe('pending');
  });
});
