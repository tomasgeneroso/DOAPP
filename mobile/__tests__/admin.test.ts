const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../services/api', () => ({
  get: (...a: unknown[]) => mockGet(...a),
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
}));

import {
  accionesDelPago,
  admiteDevolucionManual,
  aprobarContrato,
  aprobarPago,
  aprobarPublicacion,
  confirmacionDeAccion,
  etiquetaDelEstadoDePago,
  etiquetaDelTipoDePago,
  interpretarResolucion,
  motivoValido,
  rechazarContrato,
  rechazarPago,
  rechazarPublicacion,
  requiereMonto,
  resolverDisputa,
  tituloDelPago,
  validarResolucion,
  verificarGarantia,
} from '../services/admin';

describe('qué se le puede hacer a un pago', () => {
  it('pendiente de verificación: aprobarlo o rechazarlo, sea del tipo que sea', () => {
    for (const paymentType of ['job_publication', 'budget_increase', 'contract_payment', 'membership', 'contract']) {
      expect(accionesDelPago({ status: 'pending_verification', paymentType })).toEqual(['aprobar', 'rechazar']);
    }
  });

  it('verificado y de un contrato: verificar la garantía; verificado de otro tipo: nada', () => {
    for (const paymentType of ['contract_payment', 'escrow_deposit', 'contract']) {
      expect(accionesDelPago({ status: 'verified', paymentType })).toEqual(['verificar_garantia']);
    }
    expect(accionesDelPago({ status: 'verified', paymentType: 'job_publication' })).toEqual([]);
    expect(accionesDelPago({ status: 'verified', paymentType: 'budget_increase' })).toEqual([]);
  });

  it('cualquier otro estado no ofrece nada (ya se resolvió o todavía no llegó)', () => {
    for (const status of ['pending', 'processing', 'approved', 'held_escrow', 'completed', 'rejected', 'refunded', 'cancelled', 'failed', '']) {
      expect(accionesDelPago({ status, paymentType: 'contract_payment' })).toEqual([]);
    }
    expect(accionesDelPago(null)).toEqual([]);
    expect(accionesDelPago(undefined)).toEqual([]);
    expect(accionesDelPago({})).toEqual([]);
  });

  it('también lee el tipo cuando viene como «type»', () => {
    expect(accionesDelPago({ status: 'verified', type: 'contract_payment' })).toEqual(['verificar_garantia']);
  });
});

describe('textos', () => {
  it('el título sale del detalle, luego de la descripción', () => {
    expect(tituloDelPago({ displayInfo: { title: 'Pintar una pared' }, description: 'otra cosa' })).toBe('Pintar una pared');
    expect(tituloDelPago({ description: 'Contrato: X' })).toBe('Contrato: X');
    expect(tituloDelPago({})).toBe('Pago');
  });

  it('los tipos y estados tienen etiqueta en castellano y lo desconocido se muestra tal cual', () => {
    expect(etiquetaDelTipoDePago('budget_increase')).toBe('Aumento de precio');
    expect(etiquetaDelTipoDePago('contract')).toBe('Garantía de un contrato');
    expect(etiquetaDelTipoDePago('raro')).toBe('raro');
    expect(etiquetaDelEstadoDePago('pending_verification')).toBe('Pendiente de verificación');
    expect(etiquetaDelEstadoDePago('inventado')).toBe('inventado');
  });

  it('la confirmación avisa si Mercado Pago confirmó el pago o no', () => {
    const con = confirmacionDeAccion('aprobar', { amount: 2300, mercadopagoVerifiedAt: '2026-10-11T00:00:00Z', description: 'x' });
    const sin = confirmacionDeAccion('aprobar', { amount: 2300, description: 'x' });
    expect(con.mensaje).toContain('Mercado Pago ya confirmó');
    expect(sin.mensaje).toContain('NO tiene la confirmación');
    expect(con.mensaje).toContain('2.300');
    expect(confirmacionDeAccion('verificar_garantia', { amount: 1 }).mensaje).toContain('retenido');
    expect(confirmacionDeAccion('rechazar', { amount: 1 }).titulo).toBe('Rechazar el pago');
  });

  it('un motivo vale si llega al mínimo, sin contar espacios de los costados', () => {
    expect(motivoValido('  corto ', 10)).toBe(false);
    expect(motivoValido('un motivo largo', 10)).toBe(true);
    expect(motivoValido(undefined, 5)).toBe(false);
  });
});

describe('llamadas a la API', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPut.mockReset(); });

  it('pagos: aprobar, rechazar con motivo y verificar la garantía', async () => {
    mockPost.mockResolvedValue({ success: true });
    await aprobarPago('p1');
    await rechazarPago('p1', '  Monto que no corresponde ');
    await verificarGarantia('p1');
    expect(mockPost).toHaveBeenCalledWith('/admin/payments/p1/approve', {});
    expect(mockPost).toHaveBeenCalledWith('/admin/payments/p1/reject', { reason: 'Monto que no corresponde' });
    expect(mockPost).toHaveBeenCalledWith('/admin/payments/p1/verify-escrow', {});
  });

  it('contratos: aprobar y rechazar con motivo', async () => {
    mockPost.mockResolvedValue({ success: true });
    await aprobarContrato('c1');
    await rechazarContrato('c1', 'Datos incompletos');
    expect(mockPost).toHaveBeenCalledWith('/admin/contracts/c1/approve', {});
    expect(mockPost).toHaveBeenCalledWith('/admin/contracts/c1/reject', { reason: 'Datos incompletos' });
  });

  it('publicaciones: aprobar y rechazar mandan el estado y el motivo con los nombres del servidor', async () => {
    mockPut.mockResolvedValue({ success: true });
    await aprobarPublicacion('j1');
    await rechazarPublicacion('j1', 'Contiene datos de contacto');
    expect(mockPut).toHaveBeenCalledWith('/admin/jobs/j1/status', { status: 'approved' });
    expect(mockPut).toHaveBeenCalledWith('/admin/jobs/j1/status', { status: 'rejected', rejectedReason: 'Contiene datos de contacto' });
  });
});

describe('resolver una disputa', () => {
  const base = { tipo: 'full_release' as const, explicacion: 'El trabajo se entregó completo.', monto: '', devolucionManual: false };

  it('sin tipo o sin explicación no se manda', () => {
    expect(validarResolucion({ ...base, tipo: '' }).ok).toBe(false);
    expect(validarResolucion({ ...base, explicacion: '   ' }).ok).toBe(false);
    expect(validarResolucion({ ...base, explicacion: 'ok' }).ok).toBe(false);
  });

  it('liberar todo: manda la resolución y el tipo, sin monto ni casillero', () => {
    const r = validarResolucion({ ...base, monto: '999', devolucionManual: true });
    expect(r).toEqual({ ok: true, cuerpo: { resolution: 'El trabajo se entregó completo.', resolutionType: 'full_release' } });
  });

  it('reembolso parcial exige un monto mayor a cero y lo manda como número', () => {
    expect(validarResolucion({ ...base, tipo: 'partial_refund', monto: '' }).ok).toBe(false);
    expect(validarResolucion({ ...base, tipo: 'partial_refund', monto: '0' }).ok).toBe(false);
    expect(validarResolucion({ ...base, tipo: 'partial_refund', monto: 'abc' }).ok).toBe(false);
    const r = validarResolucion({ ...base, tipo: 'partial_refund', monto: '1.500,50' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cuerpo.refundAmount).toBe(1500.5);
  });

  it('«la devolución se hizo por fuera» sólo viaja en reembolsos y sólo si está marcado', () => {
    const total = validarResolucion({ ...base, tipo: 'full_refund', devolucionManual: true });
    if (total.ok) expect(total.cuerpo.devolucionManual).toBe(true);
    const sinMarcar = validarResolucion({ ...base, tipo: 'full_refund', devolucionManual: false });
    if (sinMarcar.ok) expect(sinMarcar.cuerpo.devolucionManual).toBeUndefined();
    const liberar = validarResolucion({ ...base, tipo: 'no_action', devolucionManual: true });
    if (liberar.ok) expect(liberar.cuerpo.devolucionManual).toBeUndefined();
    expect(admiteDevolucionManual('full_refund')).toBe(true);
    expect(admiteDevolucionManual('partial_refund')).toBe(true);
    expect(admiteDevolucionManual('full_release')).toBe(false);
    expect(requiereMonto('partial_refund')).toBe(true);
    expect(requiereMonto('full_refund')).toBe(false);
  });

  it('el servidor pide confirmar la devolución por fuera (409): se le dice y se ofrece el casillero', () => {
    const r = interpretarResolucion({ success: false, status: 409, code: 'DEVOLUCION_MANUAL_REQUERIDA', message: 'Este pago no es de Mercado Pago.' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pideDevolucionManual).toBe(true);
  });

  it('un 403 de permiso y lo que venga raro son errores con su mensaje, nunca éxito', () => {
    const permiso = interpretarResolucion({ success: false, status: 403, message: 'No tenés permiso para confirmar que una devolución se hizo por fuera.' });
    expect(permiso.ok).toBe(false);
    if (!permiso.ok) expect(permiso.mensaje).toContain('permiso');
    for (const raro of [undefined, null, {}, { success: 'true' }]) expect(interpretarResolucion(raro).ok).toBe(false);
    expect(interpretarResolucion({ success: true, message: 'Resuelta' })).toEqual({ ok: true, mensaje: 'Resuelta' });
  });

  it('resolverDisputa manda el cuerpo a la ruta del servidor', async () => {
    mockPost.mockResolvedValue({ success: true });
    await resolverDisputa('d1', { resolution: 'x', resolutionType: 'full_release' });
    expect(mockPost).toHaveBeenCalledWith('/admin/disputes/d1/resolve', { resolution: 'x', resolutionType: 'full_release' });
  });
});
