const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('../services/api', () => ({
  post: (...a: unknown[]) => mockPost(...a),
  get: (...a: unknown[]) => mockGet(...a),
}));

import {
  consultarPago,
  iniciarPagoDelAumento,
  iniciarPagoDelContrato,
  interpretarCaptura,
  interpretarInicioDePago,
  interpretarTrabajo,
  puedePagarElContrato,
} from '../services/pagos';

/**
 * Aumento de precio y pago del contrato desde el celular (se suma a `pagos.test.ts`, que cubre publicación y cotización).
 */

describe('aumento de precio: interpretarCaptura', () => {
  it('pagado y en revisión: lo dice con las horas de espera que informa el servidor', () => {
    const r = interpretarCaptura({ success: true, data: { budgetPendingApproval: true, approvalHours: 24 } });
    expect(r.fase).toBe('confirmado');
    if (r.fase === 'confirmado') {
      expect(r.titulo).toContain('en revisión');
      expect(r.texto).toContain('24 horas');
      expect(r.texto).toContain('administrador');
    }
  });

  it('aplicado al instante (aprobación apagada): el precio nuevo ya está', () => {
    const r = interpretarCaptura({ success: true, data: { budgetUpdated: true } });
    expect(r.fase).toBe('confirmado');
    if (r.fase === 'confirmado') expect(r.texto).toContain('precio nuevo ya está aplicado');
  });
});

describe('interpretarTrabajo (cuando la app no tiene el id de la preferencia)', () => {
  it('publicación: «en revisión» y «abierto» son pagos registrados; lo demás sigue esperando', () => {
    expect(interpretarTrabajo('publicacion', { status: 'pending_approval' }).fase).toBe('confirmado');
    expect(interpretarTrabajo('publicacion', { status: 'open' }).fase).toBe('confirmado');
    for (const status of ['draft', 'pending_payment', 'paused', 'cancelled']) {
      expect(interpretarTrabajo('publicacion', { status })).toEqual({ fase: 'esperando' });
    }
    expect(interpretarTrabajo('publicacion', undefined)).toEqual({ fase: 'esperando' });
  });

  it('aumento: «pagado en revisión» confirma; sin cambio pendiente y reactivado también; pausado sin pagar espera', () => {
    const enRevision = interpretarTrabajo('aumento', {
      status: 'paused', pendingNewPrice: 12000, aumentoPendiente: { estado: 'pagado_en_revision', horasDeEspera: 24 },
    });
    expect(enRevision.fase).toBe('confirmado');
    expect(interpretarTrabajo('aumento', { status: 'open', pendingNewPrice: null }).fase).toBe('confirmado');
    expect(interpretarTrabajo('aumento', { status: 'paused', pendingNewPrice: 12000, aumentoPendiente: { estado: 'sin_pagar' } })).toEqual({ fase: 'esperando' });
    expect(interpretarTrabajo('aumento', { status: 'paused', pendingNewPrice: null })).toEqual({ fase: 'esperando' });
  });
});

describe('consultarPago sin id de preferencia', () => {
  beforeEach(() => { mockPost.mockReset(); mockGet.mockReset(); });

  it('publicación con el trabajo: mira el trabajo y NO llama a capture-order', async () => {
    mockGet.mockResolvedValue({ success: true, job: { status: 'pending_approval' } });
    const r = await consultarPago({ tipo: 'publicacion', jobId: 'j1' });
    expect(mockGet).toHaveBeenCalledWith('/jobs/j1');
    expect(mockPost).not.toHaveBeenCalled();
    expect(r.fase).toBe('confirmado');
  });

  it('aumento con id de preferencia: lo confirma con capture-order', async () => {
    mockPost.mockResolvedValue({ success: true, data: { budgetPendingApproval: true, approvalHours: 24 } });
    const r = await consultarPago({ tipo: 'aumento', preferenceId: 'pref-9', jobId: 'j1' });
    expect(mockPost).toHaveBeenCalledWith('/payments/capture-order', { preference_id: 'pref-9' });
    expect(r.fase).toBe('confirmado');
  });

  it('sin preferencia ni trabajo no hay nada que seguir y lo dice', async () => {
    expect((await consultarPago({ tipo: 'aumento' })).fase).toBe('problema');
    expect((await consultarPago({ tipo: 'cotizacion' })).fase).toBe('problema');
    expect((await consultarPago({ tipo: 'contrato' })).fase).toBe('problema');
  });

  it('si la consulta del trabajo falla, sigue esperando', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'NETWORK_ERROR' });
    expect(await consultarPago({ tipo: 'aumento', jobId: 'j1' })).toEqual({ fase: 'esperando' });
  });
});

describe('empezar un pago desde la app', () => {
  beforeEach(() => { mockPost.mockReset(); });

  it('con dirección de pago es un éxito (contrato: paymentUrl; aumento: approvalUrl)', () => {
    expect(interpretarInicioDePago({ success: true, paymentUrl: 'https://mp.test/c', preferenceId: 'p1' })).toEqual({ ok: true, url: 'https://mp.test/c', preferenceId: 'p1' });
    expect(interpretarInicioDePago({ success: true, approvalUrl: 'https://mp.test/a' })).toEqual({ ok: true, url: 'https://mp.test/a', preferenceId: undefined });
  });

  it('sin dirección, con una que no es web, o con success dudoso: error, no éxito', () => {
    const raros = [undefined, null, {}, { success: true }, { success: true, paymentUrl: 'javascript:alert(1)' }, { success: true, paymentUrl: '' }, { success: 'true', paymentUrl: 'https://x' }];
    for (const raro of raros) expect(interpretarInicioDePago(raro).ok).toBe(false);
  });

  it('un aumento ya pagado y en revisión se distingue (no se vuelve a cobrar)', () => {
    const r = interpretarInicioDePago({ success: false, status: 409, code: 'AUMENTO_PAGADO_EN_REVISION', message: 'Ya pagaste este aumento.' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.yaPagado).toBe(true);
  });

  it('un contrato que ya tiene un pago iniciado o cobrado se distingue y ofrece ver el estado', () => {
    const r = interpretarInicioDePago({ success: false, status: 400, message: 'Payment already exists for this contract' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.yaIniciado).toBe(true);
      expect(r.mensaje).toContain('Ver el estado de mi pago');
    }
  });

  it('el pedido del contrato y del aumento llevan origen «app» para que Mercado Pago vuelva a la página que lleva a la app', async () => {
    mockPost.mockResolvedValue({ success: true, paymentUrl: 'https://mp.test/c', approvalUrl: 'https://mp.test/a' });
    await iniciarPagoDelContrato('c1');
    await iniciarPagoDelAumento('j1');
    expect(mockPost).toHaveBeenCalledWith('/payments/contract/c1', { origen: 'app' });
    expect(mockPost).toHaveBeenCalledWith('/payments/create-order', { jobId: 'j1', paymentType: 'budget_increase', paymentMethod: 'mercadopago', origen: 'app' });
  });
});

describe('puedePagarElContrato', () => {
  const contrato = (over: Record<string, unknown> = {}) => ({ status: 'accepted', paymentStatus: 'pending', paymentMode: 'escrow', ...over });

  it('sólo el cliente, con el contrato aprobado y sin pago hecho', () => {
    expect(puedePagarElContrato(contrato(), true)).toBe(true);
    expect(puedePagarElContrato(contrato({ status: 'ready' }), true)).toBe(true);
    expect(puedePagarElContrato(contrato(), false)).toBe(false);
  });

  it('no si ya hay un pago, si todavía lo revisa administración, si ya empezó o si es de los que se pagan al terminar', () => {
    for (const paymentStatus of ['pending_verification', 'escrow', 'held_escrow', 'completed', 'refunded']) {
      expect(puedePagarElContrato(contrato({ paymentStatus }), true)).toBe(false);
    }
    for (const status of ['pending', 'in_progress', 'completed', 'cancelled', 'disputed']) {
      expect(puedePagarElContrato(contrato({ status }), true)).toBe(false);
    }
    expect(puedePagarElContrato(contrato({ paymentMode: 'on_completion' }), true)).toBe(false);
    expect(puedePagarElContrato(null, true)).toBe(false);
  });
});
