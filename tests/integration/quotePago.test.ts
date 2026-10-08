import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * El cobro de una cotización usa la misma cuenta que el resto de los cobros.
 *
 * `POST /api/quotes/:id/pay` calculaba la comisión a mano: 8% con piso de $1.000, sin
 * IVA ni costo de procesamiento y sin mirar la beta. El resto de la plataforma cobra
 * 10% (COMMISSION_RATES) con piso de EUR 2, IVA 21% y procesamiento, y 0% de comisión
 * en la beta. Con este flujo, la misma operación daba otro total según por dónde se
 * pagara.
 *
 * La fase (beta o estable) se controla con un mock de `isBetaPhase`, y la pasarela de
 * pago con otro: no sale nada a la red.
 */

const mockEsBeta = jest.fn<() => Promise<boolean>>();
jest.mock('../../server/services/platformPhase.js', () => ({
  ...(jest.requireActual('../../server/services/platformPhase.js') as object),
  isBetaPhase: () => mockEsBeta(),
}));

const mockCrearPago = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../server/services/mercadopago.js', () => ({
  __esModule: true,
  default: { createPayment: (...a: unknown[]) => mockCrearPago(...a) },
}));

import { User } from '../../server/models/sql/User.model.js';
import { Quote } from '../../server/models/sql/Quote.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { COMMISSION_RATES } from '../../shared/constants/membershipPricing.js';
import { MINIMUM_COMMISSION_ARS } from '../../shared/pricing/minimums.js';
import { splitFees } from '../../shared/pricing/processingCost.js';

describe('POST /api/quotes/:id/pay', () => {
  let app: Express;
  let pagador: { id: string; token: string };
  let emisor: { id: string };

  const crearUsuario = async (clave: string, extra: Record<string, unknown> = {}) => {
    const u: any = await User.create({
      email: `${clave}@cotizacion.test`,
      name: `Persona ${clave}`,
      username: `cot${clave}`,
      password: 'password123',
      role: 'client',
      ...extra,
    } as any);
    return { id: u.id as string, token: jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret') };
  };

  const crearCotizacion = async (total: number) => {
    const q: any = await Quote.create({
      quoteNumber: `Q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`.slice(0, 20),
      status: 'sent',
      senderId: emisor.id,
      recipientId: pagador.id,
      title: 'Arreglo de canilla',
      items: [],
      subtotal: total,
      taxRate: 0,
      taxAmount: 0,
      total,
    } as any);
    return q.id as string;
  };

  const pagar = (id: string) => request(app).post(`/api/quotes/${id}/pay`).set('Authorization', `Bearer ${pagador.token}`).send({});

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const rutas = await import('../../server/routes/quotes.js');
    app.use('/api/quotes', rutas.default);

    await User.destroy({ where: { email: ['pagador@cotizacion.test', 'emisor@cotizacion.test'] } });
    // Sin contratos gratuitos: a un usuario nuevo le quedan 3 y pagaría 0% (excepción real).
    pagador = await crearUsuario('pagador', { freeContractsRemaining: 0 });
    emisor = await crearUsuario('emisor');
  });

  afterAll(async () => {
    await Payment.destroy({ where: { payerId: pagador.id } });
    await Quote.destroy({ where: { senderId: emisor.id } });
    await User.destroy({ where: { email: ['pagador@cotizacion.test', 'emisor@cotizacion.test'] } });
  });

  beforeEach(() => {
    mockCrearPago.mockReset();
    mockCrearPago.mockResolvedValue({ providerPaymentId: 'pref-1', paymentId: 'p-1', checkoutUrl: 'https://mp.test/checkout' });
  });

  it('fuera de la beta cobra la comisión vigente (10%), con IVA y procesamiento, no 8%', async () => {
    mockEsBeta.mockResolvedValue(false);
    const id = await crearCotizacion(36000);

    const r = await pagar(id);
    expect(r.status).toBe(200);

    const comision = (36000 * COMMISSION_RATES.free) / 100; // 3.600
    expect(r.body.commission).toBe(comision);
    expect(r.body.commissionRate).toBe(COMMISSION_RATES.free);
    expect(r.body.vat).toBe(Math.round(comision * 0.21 * 100) / 100);

    const esperado = splitFees(36000, comision, r.body.vat);
    expect(r.body.totalWithCommission).toBe(esperado.clientPays);
    // y NO el total de la cuenta vieja: 36.000 + 8% = 38.880
    expect(r.body.totalWithCommission).not.toBe(38880);

    const pago: any = await Payment.findOne({ where: { quoteId: id } });
    expect(Number(pago.amount)).toBe(esperado.clientPays);
    expect(Number(pago.platformFee)).toBe(comision);
    expect(Number(pago.platformFeePercentage)).toBe(COMMISSION_RATES.free);
  });

  it('en la beta no hay comisión, pero el cliente igual paga el costo de procesamiento', async () => {
    mockEsBeta.mockResolvedValue(true);
    const id = await crearCotizacion(36000);

    const r = await pagar(id);
    expect(r.status).toBe(200);
    expect(r.body.commission).toBe(0);
    expect(r.body.totalWithCommission).toBe(splitFees(36000, 0, 0).clientPays);
    expect(r.body.totalWithCommission).toBeGreaterThan(36000);
  });

  it('el piso de la comisión es el vigente (EUR 2 en pesos), no $1.000', async () => {
    mockEsBeta.mockResolvedValue(false);
    const id = await crearCotizacion(1000); // 10% = 100 → manda el piso

    const r = await pagar(id);
    expect(r.status).toBe(200);
    expect(r.body.commission).toBe(MINIMUM_COMMISSION_ARS);
    expect(r.body.commission).not.toBe(1000);
  });

  it('sólo el destinatario puede pagar (no se tocó la autorización)', async () => {
    mockEsBeta.mockResolvedValue(false);
    const id = await crearCotizacion(5000);
    const ajeno = await crearUsuario('ajeno');
    const r = await request(app).post(`/api/quotes/${id}/pay`).set('Authorization', `Bearer ${ajeno.token}`).send({});
    expect(r.status).toBe(403);
    await User.destroy({ where: { id: ajeno.id } });
  });
});
