import { describe, it, expect } from '@jest/globals';
import { procesamientoParaCobrar, MP_FEE_BY_RELEASE_DAYS } from '../shared/pricing/processingCost.js';
import { costoRealDeMp, tarifaSuperaLoCobrado } from '../server/services/costoRealDeMp.js';

/**
 * Incidente 2026-10-19: un trabajo de $5.000 con el procesamiento calculado al 4,19 %: el cliente pagó $5.267,03 y Mercado Pago liquidó
 * $4.987,35 (descontó $279,68 = 5,31 % del total, es decir 4,39 % + IVA). El trabajador cobra los $5.000 del contrato, así que los $12,65 de
 * diferencia los ponía DOAPP en cada operación. La tasa tiene que ser la que MP cobra de verdad; y si no lo es, tiene que avisar.
 */
const MP_DESCUENTA = 0.0531; // 4,39 % + IVA, lo que se vio en el pago real

describe('el procesamiento cubre la tarifa real de Mercado Pago', () => {
  it('reproduce el incidente: con 4,19 % el cliente paga $5.267,03 y MP liquida $4.987,35 (faltan $12,65 para el trabajador)', () => {
    const p = procesamientoParaCobrar(5000, 0.0419);
    const cliente = 5000 + p.total;
    expect(cliente).toBeCloseTo(5267.03, 2);
    const neto = cliente - cliente * MP_DESCUENTA;
    expect(neto).toBeCloseTo(4987.35, 1);
    expect(5000 - neto).toBeGreaterThan(12);
  });

  it('con 4,39 % (la tarifa a 10 días) lo que MP liquida alcanza para pagarle los $5.000 al trabajador', () => {
    const p = procesamientoParaCobrar(5000, MP_FEE_BY_RELEASE_DAYS[10].base);
    const cliente = 5000 + p.total;
    const neto = cliente - cliente * MP_DESCUENTA;
    expect(neto).toBeGreaterThanOrEqual(5000 - 0.1);
    expect(MP_FEE_BY_RELEASE_DAYS[10]).toEqual({ base: 0.0439, withVat: 0.0531 });
  });
});

describe('costo real que informa Mercado Pago', () => {
  it('toma la tarifa del vendedor (no la del comprador), el neto y la fecha de liberación', () => {
    const c = costoRealDeMp({
      fee_details: [
        { fee_payer: 'collector', amount: 279.68 },
        { fee_payer: 'payer', amount: 50 },
      ],
      transaction_details: { net_received_amount: 4987.35 },
      money_release_date: '2026-10-30T12:00:00.000-03:00',
    });
    expect(c.processingFee).toBe(279.68);
    expect(c.netReceivedAmount).toBe(4987.35);
    expect(c.moneyReleaseDate?.toISOString()).toBe('2026-10-30T15:00:00.000Z');
  });

  it('lo que no vino no se inventa', () => {
    expect(costoRealDeMp({})).toEqual({});
    expect(costoRealDeMp(null)).toEqual({});
    expect(costoRealDeMp({ fee_details: [{ fee_payer: 'payer', amount: 10 }], money_release_date: 'no es fecha' })).toEqual({});
  });

  it('detecta que MP cobró más de lo que se le cobró al cliente, con un peso de tolerancia', async () => {
    // El caso real: se cobraron $220,68 (sin IVA) y MP descontó $279,68 con IVA = $231,14 sin IVA.
    const r = await tarifaSuperaLoCobrado(279.68, 220.68);
    expect(r.supera).toBe(true);
    expect(r.diferencia).toBeCloseTo(10.46, 1);
    // Cubierta (con un peso de margen) o sin dato: no es una alarma.
    expect((await tarifaSuperaLoCobrado(279.68, 231)).supera).toBe(false);
    expect((await tarifaSuperaLoCobrado(279.68, 0)).supera).toBe(false);
    expect((await tarifaSuperaLoCobrado(0, 220)).supera).toBe(false);
  });
});
