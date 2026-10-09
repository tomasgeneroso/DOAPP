import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluarPagoMercadoPago,
  esIdDePagoMp,
  condicionesNoPermitidas,
  ESTADOS_CAPTURABLES,
  ESTADOS_YA_PROCESADOS,
} from '../server/services/pagoMercadoPago.js';

/**
 * F1: /capture-order daba por aprobado lo que MercadoPago no confirmaba (sin id de pago, con
 * MercadoPago caído, con el pago "pendiente"). La regla ahora es una: todo lo que falte, venga raro o no
 * coincida es un "no". Acá se prueban los casos feos de esa regla, sin base ni red.
 */

const esperado = { amount: 11000, currency: 'ARS', payerId: 'user-1' };
const aprobado = (extra: Record<string, unknown> = {}) => ({
  status: 'approved',
  transaction_amount: 11000,
  currency_id: 'ARS',
  metadata: {},
  ...extra,
});

describe('evaluarPagoMercadoPago: el único "sí"', () => {
  it('aprobado, por el monto y la moneda esperados', () => {
    const v = evaluarPagoMercadoPago(aprobado(), esperado);
    expect(v).toEqual({ ok: true, montoRecibido: 11000 });
  });

  it('el monto es EXACTO: ni un centavo de diferencia ni redondeo (antes se toleraba un centavo)', () => {
    for (const cobrado of [11000.01, 10999.99, 10999.999, 11000.004, 11000.0001]) {
      const v = evaluarPagoMercadoPago(aprobado({ transaction_amount: cobrado }), esperado);
      expect([cobrado, v.ok ? 'OK' : v.motivo]).toEqual([cobrado, 'monto']);
    }
    // el mismo importe escrito de otra forma sí es el mismo importe
    expect(evaluarPagoMercadoPago(aprobado({ transaction_amount: 11000.0 }), esperado).ok).toBe(true);
    expect(evaluarPagoMercadoPago(aprobado({ transaction_amount: '11000.00' }), { ...esperado, amount: '11000.00' }).ok).toBe(true);
    // con centavos: el decimal que guarda la base y el que informa MercadoPago coinciden exactos
    expect(evaluarPagoMercadoPago(aprobado({ transaction_amount: 12345.67 }), { ...esperado, amount: '12345.67' }).ok).toBe(true);
    expect(evaluarPagoMercadoPago(aprobado({ transaction_amount: 12345.67 }), { ...esperado, amount: '12345.68' }).ok).toBe(false);
  });

  it('un solo pago y sin cupón: es el único caso que pasa', () => {
    expect(evaluarPagoMercadoPago(aprobado({ installments: 1, coupon_amount: 0, campaign_id: null }), esperado).ok).toBe(true);
    expect(evaluarPagoMercadoPago(aprobado({ installments: '1', coupon_amount: '0.00' }), esperado).ok).toBe(true);
  });

  it('acepta el monto como texto numérico y la moneda en minúscula', () => {
    expect(evaluarPagoMercadoPago(aprobado({ transaction_amount: '11000.00', currency_id: 'ars' }), esperado).ok).toBe(true);
    expect(evaluarPagoMercadoPago(aprobado(), { ...esperado, amount: '11000.00' }).ok).toBe(true);
  });

  it('si la metadata trae al mismo usuario, también pasa (claves en snake_case o camelCase)', () => {
    expect(evaluarPagoMercadoPago(aprobado({ metadata: { user_id: 'user-1' } }), esperado).ok).toBe(true);
    expect(evaluarPagoMercadoPago(aprobado({ metadata: { userId: 'user-1' } }), esperado).ok).toBe(true);
  });
});

describe('cuotas y cupones: DOAPP no los acepta (quedan en revisión, no se ejecutan)', () => {
  const motivoDe = (extra: Record<string, unknown>) => {
    const v = evaluarPagoMercadoPago(aprobado(extra), esperado);
    return v.ok ? 'OK' : v.motivo;
  };

  it.each([2, 3, 6, 12, '3'])('pagado en %s cuotas: motivo "cuotas"', (cuotas) => {
    expect(motivoDe({ installments: cuotas })).toBe('cuotas');
  });

  it('con un cupón o una campaña de descuento: motivo "cupon"', () => {
    expect(motivoDe({ coupon_amount: 500 })).toBe('cupon');
    expect(motivoDe({ coupon_amount: '0.01' })).toBe('cupon');
    expect(motivoDe({ campaign_id: 123456 })).toBe('cupon');
    expect(motivoDe({ campaign_id: 'PROMO-1' })).toBe('cupon');
  });

  it('sin cupón (cero, vacío, ausente) no es un cupón', () => {
    for (const extra of [{ coupon_amount: 0 }, { coupon_amount: null }, { campaign_id: null }, { campaign_id: '' }, { campaign_id: 0 }, {}]) {
      expect([JSON.stringify(extra), motivoDe(extra)]).toEqual([JSON.stringify(extra), 'OK']);
    }
  });

  it('condicionesNoPermitidas devuelve null para algo que no es un pago', () => {
    for (const nada of [null, undefined, 'x', 3]) expect(condicionesNoPermitidas(nada as any)).toBeNull();
  });

  it('la preferencia de MercadoPago limita las cuotas a UNA (guardián de código: si alguien lo saca, las cuotas vuelven)', () => {
    const codigo = readFileSync(join(process.cwd(), 'server/services/mercadopago.ts'), 'utf8');
    expect(codigo).toMatch(/payment_methods:\s*\{\s*installments:\s*1,/);
  });
});

describe('evaluarPagoMercadoPago: todo lo demás es un "no"', () => {
  const motivo = (leido: any, esp: any = esperado) => {
    const v = evaluarPagoMercadoPago(leido, esp);
    return v.ok ? 'OK' : v.motivo;
  };

  it('MercadoPago no devolvió nada: no es aprobado (F1: antes se daba por aprobado)', () => {
    for (const nada of [null, undefined, 'approved', 42, true]) {
      expect(motivo(nada)).toBe('datos_incompletos');
    }
  });

  it('un objeto vacío o sin estado no es aprobado', () => {
    expect(motivo({})).toBe('datos_incompletos');
    expect(motivo({ status: '' })).toBe('datos_incompletos');
    expect(motivo({ status: '   ' })).toBe('datos_incompletos');
    expect(motivo({ status: null })).toBe('datos_incompletos');
    expect(motivo({ status: 123 })).toBe('datos_incompletos');
  });

  it.each(['pending', 'in_process', 'authorized', 'in_mediation', 'PENDING'])('"%s" es pendiente: no se cobró todavía', (estado) => {
    expect(motivo(aprobado({ status: estado }))).toBe('pendiente');
  });

  it.each(['rejected', 'cancelled', 'refunded', 'charged_back'])('"%s" es rechazado', (estado) => {
    expect(motivo(aprobado({ status: estado }))).toBe('rechazado');
  });

  it('"authorized" NO es plata cobrada: es una reserva sin capturar', () => {
    expect(motivo(aprobado({ status: 'authorized' }))).toBe('pendiente');
  });

  it('un estado desconocido no es aprobado, aunque lo demás cuadre', () => {
    expect(motivo(aprobado({ status: 'aprobadisimo' }))).toBe('datos_incompletos');
    expect(motivo(aprobado({ status: 'succeeded' }))).toBe('datos_incompletos');
  });

  it('un pago aprobado de $1 no libera una orden de $11.000', () => {
    expect(motivo(aprobado({ transaction_amount: 1 }))).toBe('monto');
    expect(motivo(aprobado({ transaction_amount: 10999.5 }))).toBe('monto');
    expect(motivo(aprobado({ transaction_amount: 11000.5 }))).toBe('monto');
  });

  it('sin monto, con monto cero, negativo, NaN o infinito: no se decide a favor', () => {
    for (const malo of [undefined, null, 0, -11000, NaN, Infinity, '', 'mucho']) {
      expect(motivo(aprobado({ transaction_amount: malo }))).toBe('datos_incompletos');
    }
  });

  it('si el pago registrado no tiene un monto válido, tampoco se da por bueno', () => {
    for (const malo of [undefined, null, 0, -5, NaN, 'x']) {
      expect(motivo(aprobado(), { ...esperado, amount: malo })).toBe('datos_incompletos');
    }
  });

  it('otra moneda es un no, y sin moneda también (no se usa un valor por defecto)', () => {
    expect(motivo(aprobado({ currency_id: 'USD' }))).toBe('moneda');
    expect(motivo(aprobado({ currency_id: undefined }))).toBe('datos_incompletos');
    expect(motivo(aprobado({ currency_id: '' }))).toBe('datos_incompletos');
    expect(motivo(aprobado(), { ...esperado, currency: undefined })).toBe('datos_incompletos');
  });

  it('el pago de otro usuario es un no', () => {
    expect(motivo(aprobado({ metadata: { user_id: 'otra-persona' } }))).toBe('ajeno');
    expect(motivo(aprobado({ metadata: { userId: 'otra-persona' } }))).toBe('ajeno');
    expect(motivo(aprobado({ metadata: { user_id: 99 } }), { ...esperado, payerId: 'user-1' })).toBe('ajeno');
  });

  it('una metadata ausente, nula o vacía no incrimina a nadie (la defensa es el monto exacto)', () => {
    expect(motivo(aprobado({ metadata: undefined }))).toBe('OK');
    expect(motivo(aprobado({ metadata: null }))).toBe('OK');
    expect(motivo(aprobado({ metadata: { user_id: '' } }))).toBe('OK');
  });
});

describe('esIdDePagoMp', () => {
  it('sólo números de pocos dígitos', () => {
    expect(esIdDePagoMp('1234567890')).toBe(true);
    expect(esIdDePagoMp(' 1234567890 ')).toBe(true);
  });

  it('rechaza lo que podría terminar siendo otra ruta en la URL que se le pide a MercadoPago', () => {
    for (const malo of ['', '12', '../merchant_orders/1', '123/refunds', '12 34', 'mp-123', '1e5', null, undefined, 123456, '9'.repeat(30)]) {
      expect(esIdDePagoMp(malo as any)).toBe(false);
    }
  });
});

describe('estados', () => {
  it('lo capturable y lo ya procesado no se pisan', () => {
    for (const e of ESTADOS_CAPTURABLES) expect((ESTADOS_YA_PROCESADOS as readonly string[]).includes(e)).toBe(false);
  });

  it('un pago reembolsado, en disputa, fallido o en revisión no es capturable ni "ya procesado"', () => {
    for (const e of ['refunded', 'disputed', 'failed', 'cancelled', 'pending_verification', 'released']) {
      expect((ESTADOS_CAPTURABLES as readonly string[]).includes(e)).toBe(false);
      expect((ESTADOS_YA_PROCESADOS as readonly string[]).includes(e)).toBe(false);
    }
  });
});
