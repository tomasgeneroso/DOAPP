const mockPatch = jest.fn();
jest.mock('../services/api', () => ({
  patch: (...a: unknown[]) => mockPatch(...a),
}));

import {
  cambiarPresupuesto,
  cancelarCambioDePresupuesto,
  interpretarCambioDePresupuesto,
  parsearNumeroArgentino,
  puedeCambiarElPresupuesto,
  validarCambioDePresupuesto,
} from '../services/presupuesto';

describe('parsearNumeroArgentino', () => {
  it('entiende el formato argentino y el sin formato', () => {
    expect(parsearNumeroArgentino('12.000,50')).toBe(12000.5);
    expect(parsearNumeroArgentino('12.000')).toBe(12000);
    expect(parsearNumeroArgentino('12000')).toBe(12000);
    expect(parsearNumeroArgentino('$ 1.500')).toBe(1500);
    expect(parsearNumeroArgentino('1.234.567')).toBe(1234567);
    expect(parsearNumeroArgentino('0,5')).toBe(0.5);
    expect(parsearNumeroArgentino('15000.5')).toBe(15000.5);
  });

  it('lo que no se entiende da NaN, no un número inventado', () => {
    for (const malo of ['', ' ', 'abc', '12abc', '1,2,3', '12.00.0', '--5', '1e5', undefined as any, null as any]) {
      expect(Number.isNaN(parsearNumeroArgentino(malo))).toBe(true);
    }
  });
});

describe('validarCambioDePresupuesto', () => {
  const motivo = 'Hay más trabajo del previsto';

  it('un cambio válido devuelve el precio como número y el motivo sin espacios de más', () => {
    expect(validarCambioDePresupuesto('15.000', `  ${motivo}  `, 10000)).toEqual({ ok: true, precio: 15000, motivo });
  });

  it('rechaza precio vacío, cero, negativo, ilegible o enorme', () => {
    for (const t of ['', '0', '-5', 'abc', '1000000000']) {
      expect(validarCambioDePresupuesto(t, motivo, 10000).ok).toBe(false);
    }
  });

  it('rechaza el mismo precio que ya tiene', () => {
    const r = validarCambioDePresupuesto('10.000', motivo, 10000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('mismo presupuesto');
  });

  it('el motivo tiene que tener al menos 10 caracteres', () => {
    expect(validarCambioDePresupuesto('15000', 'corto', 10000).ok).toBe(false);
    expect(validarCambioDePresupuesto('15000', '   nueve ch ', 10000).ok).toBe(false);
    expect(validarCambioDePresupuesto('15000', 'diez chars', 10000).ok).toBe(true);
    expect(validarCambioDePresupuesto('15000', undefined as any, 10000).ok).toBe(false);
  });
});

describe('interpretarCambioDePresupuesto', () => {
  it('402 con «requiere pago»: trae lo que hay que pagar y el desglose', () => {
    const r = interpretarCambioDePresupuesto({
      success: false, status: 402, requiresPayment: true, message: 'Debes completar el pago', amountRequired: 2345.67,
      breakdown: { oldPrice: 10000, newPrice: 12000, amountToPay: 2345.67, balanceToUse: 0 },
    });
    expect(r.tipo).toBe('requierePago');
    if (r.tipo === 'requierePago') {
      expect(r.aPagar).toBe(2345.67);
      expect(r.desglose.newPrice).toBe(12000);
    }
  });

  it('un 402 sin monto a pagar NO se toma como pedido de pago', () => {
    expect(interpretarCambioDePresupuesto({ success: false, status: 402, requiresPayment: true }).tipo).toBe('error');
    expect(interpretarCambioDePresupuesto({ success: false, status: 402, requiresPayment: true, amountRequired: 0 }).tipo).toBe('error');
  });

  it('éxito: aplicado (bajar el precio, o subirlo cubierto por el saldo)', () => {
    const r = interpretarCambioDePresupuesto({ success: true, message: 'Presupuesto aumentado.' });
    expect(r).toEqual({ tipo: 'aplicado', mensaje: 'Presupuesto aumentado.' });
  });

  it('un aumento ya pagado y en revisión se distingue de un error cualquiera', () => {
    expect(interpretarCambioDePresupuesto({ success: false, status: 409, code: 'AUMENTO_PAGADO_EN_REVISION', message: 'Ya pagaste' }).tipo).toBe('aumentoEnRevision');
  });

  it('un trabajo con contrato en curso lleva al contrato (400 con redirectTo)', () => {
    const r = interpretarCambioDePresupuesto({ success: false, status: 400, redirectTo: '/api/contracts/abc/request-price-change', message: 'x' });
    expect(r.tipo).toBe('conContrato');
  });

  it('lo que venga raro es un error, nunca un éxito', () => {
    for (const raro of [undefined, null, {}, { success: 'true' }, { success: false, message: 'Algo falló' }]) {
      expect(interpretarCambioDePresupuesto(raro).tipo).toBe('error');
    }
  });
});

describe('llamadas', () => {
  beforeEach(() => mockPatch.mockReset());

  it('cambiar el presupuesto manda newPrice y reason a PATCH /jobs/:id/budget', async () => {
    mockPatch.mockResolvedValue({ success: true, message: 'ok' });
    await cambiarPresupuesto('j1', 12000, 'Más trabajo del previsto');
    expect(mockPatch).toHaveBeenCalledWith('/jobs/j1/budget', { newPrice: 12000, reason: 'Más trabajo del previsto' });
  });

  it('cancelar el cambio: éxito, y el rechazo por aumento ya pagado se marca', async () => {
    mockPatch.mockResolvedValueOnce({ success: true, message: 'Cambio cancelado.' });
    expect(await cancelarCambioDePresupuesto('j1')).toEqual({ ok: true, mensaje: 'Cambio cancelado.' });
    expect(mockPatch).toHaveBeenCalledWith('/jobs/j1/cancel-budget-change', {});

    mockPatch.mockResolvedValueOnce({ success: false, status: 409, code: 'AUMENTO_PAGADO_EN_REVISION', message: 'Ya pagaste este aumento' });
    const r = await cancelarCambioDePresupuesto('j1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.yaPagado).toBe(true);
  });
});

describe('puedeCambiarElPresupuesto', () => {
  it('sólo el dueño de un trabajo abierto y sin un cambio a medias', () => {
    expect(puedeCambiarElPresupuesto({ status: 'open' }, true)).toBe(true);
    expect(puedeCambiarElPresupuesto({ status: 'open' }, false)).toBe(false);
    for (const status of ['draft', 'pending_payment', 'pending_approval', 'paused', 'in_progress', 'completed', 'cancelled']) {
      expect(puedeCambiarElPresupuesto({ status }, true)).toBe(false);
    }
    expect(puedeCambiarElPresupuesto({ status: 'open', pendingNewPrice: 12000 }, true)).toBe(false);
    expect(puedeCambiarElPresupuesto({ status: 'open', aumentoPendiente: { estado: 'sin_pagar' } }, true)).toBe(false);
    expect(puedeCambiarElPresupuesto(null, true)).toBe(false);
  });
});
