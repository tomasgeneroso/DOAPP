// El cliente de la API se reemplaza: estas pruebas miran cómo se interpreta cada respuesta, no la red.
const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('../services/api', () => ({
  post: (...a: unknown[]) => mockPost(...a),
  get: (...a: unknown[]) => mockGet(...a),
}));

import {
  consultarPago,
  interpretarCaptura,
  interpretarContrato,
  interpretarPropuesta,
  INTERVALO_MS,
  MAX_CONSULTAS,
} from '../services/pagos';

/**
 * Seguimiento del pago desde el celular. Mercado Pago devuelve a una página web y no a la app, así que la app confirma
 * el pago por su cuenta. La regla de fondo es la del servidor: lo que falte, venga raro o no coincida NO es un éxito.
 */
describe('interpretarCaptura (pago de una publicación)', () => {
  it('pago confirmado y publicación en revisión: lo dice y aclara que la aprueba un administrador', () => {
    const r = interpretarCaptura({ success: true, data: { jobPendingApproval: true, jobPublished: false } });
    expect(r.fase).toBe('confirmado');
    if (r.fase === 'confirmado') {
      expect(r.titulo).toContain('en revisión');
      expect(r.texto).toContain('administrador');
      expect(r.texto).toContain('notificación y por email');
    }
  });

  it('pago confirmado y trabajo publicado', () => {
    const r = interpretarCaptura({ success: true, data: { jobPublished: true } });
    expect(r.fase).toBe('confirmado');
    if (r.fase === 'confirmado') expect(r.texto).toContain('ya está publicado');
  });

  it('una respuesta exitosa sin más datos (pago ya procesado) igual se confirma, sin inventar que está publicado', () => {
    const r = interpretarCaptura({ success: true, data: { alreadyProcessed: true } });
    expect(r.fase).toBe('confirmado');
    if (r.fase === 'confirmado') expect(r.texto).not.toContain('publicado');
  });

  it('«Mercado Pago todavía no confirmó» (409 PAYMENT_PENDING) es seguir esperando, no un error', () => {
    expect(interpretarCaptura({ success: false, status: 409, code: 'PAYMENT_PENDING', message: 'x' })).toEqual({ fase: 'esperando' });
  });

  it('un corte de conexión, un tiempo agotado o un error del servidor se reintentan', () => {
    for (const r of [{ error: 'NETWORK_ERROR' }, { error: 'TIMEOUT' }, { status: 500 }, { status: 401 }]) {
      expect(interpretarCaptura({ success: false, ...r })).toEqual({ fase: 'esperando' });
    }
  });

  it('un pago en revisión se le dice a la persona con el mensaje del servidor y que no pague de nuevo', () => {
    const r = interpretarCaptura({ success: false, status: 409, code: 'PAYMENT_UNDER_REVIEW', message: 'Quedó en revisión; no pagues de nuevo.' });
    expect(r.fase).toBe('problema');
    if (r.fase === 'problema') expect(r.texto).toBe('Quedó en revisión; no pagues de nuevo.');
  });

  it('un pago rechazado es un problema, no una espera infinita', () => {
    expect(interpretarCaptura({ success: false, status: 409, code: 'PAYMENT_REJECTED', message: 'No se cobró nada' }).fase).toBe('problema');
  });

  it('lo que venga raro NO es un éxito: sin respuesta o con una forma inesperada', () => {
    expect(interpretarCaptura(undefined).fase).not.toBe('confirmado');
    expect(interpretarCaptura(null).fase).not.toBe('confirmado');
    expect(interpretarCaptura({}).fase).not.toBe('confirmado');
    expect(interpretarCaptura({ success: 'true', data: {} }).fase).not.toBe('confirmado');
    expect(interpretarCaptura({ success: false, status: 403, message: 'No autorizado' }).fase).toBe('problema');
  });
});

describe('interpretarPropuesta (cotización pagada)', () => {
  it('solo cuando la propuesta pasó a «approved» (el aviso de Mercado Pago creó el contrato) el pago está registrado', () => {
    expect(interpretarPropuesta({ status: 'pending' })).toEqual({ fase: 'esperando' });
    expect(interpretarPropuesta(undefined)).toEqual({ fase: 'esperando' });
    const r = interpretarPropuesta({ status: 'approved' });
    expect(r.fase).toBe('confirmado');
    if (r.fase === 'confirmado') expect(r.texto).toContain('contrato ya está creado');
  });
});

describe('interpretarContrato (pago de un contrato)', () => {
  it('«pendiente» y lo desconocido siguen esperando', () => {
    expect(interpretarContrato({ paymentStatus: 'pending' })).toEqual({ fase: 'esperando' });
    expect(interpretarContrato({})).toEqual({ fase: 'esperando' });
    expect(interpretarContrato(undefined)).toEqual({ fase: 'esperando' });
    expect(interpretarContrato({ paymentStatus: 'failed' })).toEqual({ fase: 'esperando' });
  });

  it('desde «pendiente de verificación» en adelante, el pago está registrado', () => {
    for (const paymentStatus of ['pending_verification', 'held_escrow', 'escrow', 'completed']) {
      expect(interpretarContrato({ paymentStatus }).fase).toBe('confirmado');
    }
  });

  it('el texto distingue la orden de pago al terminar de la garantía', () => {
    const orden = interpretarContrato({ paymentStatus: 'completed', paymentMode: 'on_completion' });
    const garantia = interpretarContrato({ paymentStatus: 'pending_verification' });
    if (orden.fase === 'confirmado' && garantia.fase === 'confirmado') {
      expect(orden.texto).toContain('orden');
      expect(garantia.texto).toContain('administrador');
    } else {
      throw new Error('los dos tenían que estar confirmados');
    }
  });
});

describe('consultarPago', () => {
  beforeEach(() => { mockPost.mockReset(); mockGet.mockReset(); });

  it('publicación: confirma con capture-order usando el id de preferencia (sin el id de pago del navegador)', async () => {
    mockPost.mockResolvedValue({ success: true, data: { jobPendingApproval: true } });
    const r = await consultarPago({ tipo: 'publicacion', preferenceId: 'pref-1' });
    expect(mockPost).toHaveBeenCalledWith('/payments/capture-order', { preference_id: 'pref-1' });
    expect(r.fase).toBe('confirmado');
  });

  it('publicación sin id de preferencia: no consulta nada y lo dice', async () => {
    const r = await consultarPago({ tipo: 'publicacion' });
    expect(mockPost).not.toHaveBeenCalled();
    expect(r.fase).toBe('problema');
  });

  it('cotización: consulta la propuesta', async () => {
    mockGet.mockResolvedValue({ success: true, proposal: { status: 'approved' } });
    const r = await consultarPago({ tipo: 'cotizacion', proposalId: 'p1' });
    expect(mockGet).toHaveBeenCalledWith('/proposals/p1');
    expect(r.fase).toBe('confirmado');
  });

  it('cotización: si la consulta falla, sigue esperando', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'NETWORK_ERROR' });
    expect((await consultarPago({ tipo: 'cotizacion', proposalId: 'p1' })).fase).toBe('esperando');
  });

  it('contrato: consulta el contrato', async () => {
    mockGet.mockResolvedValue({ success: true, contract: { paymentStatus: 'pending_verification' } });
    const r = await consultarPago({ tipo: 'contrato', contractId: 'c1' });
    expect(mockGet).toHaveBeenCalledWith('/contracts/c1');
    expect(r.fase).toBe('confirmado');
  });

  it('el plazo es de un minuto: 15 consultas cada 4 segundos', () => {
    expect(INTERVALO_MS * MAX_CONSULTAS).toBe(60000);
  });
});
