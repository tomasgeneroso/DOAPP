/**
 * Cotizaciones en la app. Lo que se cuida: los números como se escriben en Argentina, que el total coincida con la cuenta del
 * servidor, que cada persona vea solo los botones que le corresponden (aceptar/rechazar la pendiente solo el destinatario;
 * corregir la rechazada solo quien la envió y hasta dos veces) y que lo que falte o venga raro no se tome por un éxito.
 */
jest.mock('../services/api', () => ({ __esModule: true, get: jest.fn(), post: jest.fn(), put: jest.fn() }));

import { get, post, put } from '../services/api';
import {
  IVA_POSIBLES, MAXIMO_DE_REVISIONES, aceptarCotizacion, accionesDeLaCotizacion, borradorDe, calcularTotales, corregirCotizacion,
  crearCotizacion, cuerpoDeLaCotizacion, estaVencida, etiquetaDelEstado, interpretarAccion, itemVacio, leerCotizacion,
  leerCotizaciones, listarCotizaciones, otroParticipante, parsearNumero, pesos, rechazarCotizacion, resumenParaCompartir,
  traerCotizacion, validarBorrador, type BorradorDeCotizacion,
} from '../services/cotizaciones';

const mockGet = get as jest.Mock;
const mockPost = post as jest.Mock;
const mockPut = put as jest.Mock;

describe('parsearNumero (números como los escribe la gente en Argentina)', () => {
  it.each([
    ['15000', 15000], ['15.000', 15000], ['1.234.567', 1234567], ['1.234,50', 1234.5], ['1234,5', 1234.5], ['1234.5', 1234.5],
    ['  $ 2.500 ', 2500], ['0', 0], ['10,5', 10.5],
  ])('%s → %s', (texto, esperado) => {
    expect(parsearNumero(texto)).toBe(esperado);
  });

  it.each([[''], ['  '], ['abc'], ['1,2,3'], ['-5'], ['1e3'], [null], [undefined], ['12.34.5']])('%j → null', (texto) => {
    expect(parsearNumero(texto as any)).toBeNull();
  });
});

describe('calcularTotales: la misma cuenta que el servidor', () => {
  it('cantidad × precio, IVA sobre el subtotal', () => {
    const t = calcularTotales([{ cantidad: '2', descripcion: 'a', precio: '1.000' }, { cantidad: '1', descripcion: 'b', precio: '500,50' }], 21);
    expect(t.subtotal).toBeCloseTo(2500.5);
    expect(t.iva).toBeCloseTo(525.105);
    expect(t.total).toBeCloseTo(3025.605);
  });

  it('lo que no se entiende cuenta como cero (no inventa montos) y sin IVA el total es el subtotal', () => {
    expect(calcularTotales([{ cantidad: 'x', descripcion: 'a', precio: '100' }], 0)).toEqual({ subtotal: 0, iva: 0, total: 0 });
    expect(calcularTotales([{ cantidad: '3', descripcion: 'a', precio: '100' }], 0).total).toBe(300);
    expect(calcularTotales([], 21).total).toBe(0);
  });
});

describe('validarBorrador', () => {
  const ok: BorradorDeCotizacion = {
    titulo: ' Arreglo ', items: [{ cantidad: '2', descripcion: ' Caño ', precio: '1.500,5' }], tasaDeIva: 21,
    notas: '', condicionesDePago: '', validaHasta: '2026-12-31',
  };

  it('arma los ítems recortados y con su monto', () => {
    expect(validarBorrador(ok)).toEqual({ ok: true, items: [{ qty: 2, description: 'Caño', unitPrice: 1500.5, amount: 3001 }] });
  });

  it.each([
    ['sin título', { titulo: '  ' }, /título/i],
    ['sin ítems', { items: [] }, /al menos un ítem/i],
    ['ítem sin descripción', { items: [{ cantidad: '1', descripcion: ' ', precio: '10' }] }, /ítem 1.*descripción/i],
    ['cantidad cero', { items: [{ cantidad: '0', descripcion: 'x', precio: '10' }] }, /cantidad/i],
    ['cantidad ilegible', { items: [{ cantidad: 'dos', descripcion: 'x', precio: '10' }] }, /cantidad/i],
    ['precio vacío', { items: [{ cantidad: '1', descripcion: 'x', precio: '' }] }, /precio/i],
    ['IVA que no existe', { tasaDeIva: 19 }, /IVA/i],
    ['fecha mal escrita', { validaHasta: '31/12/2026' }, /AAAA-MM-DD/],
  ])('%s → error', (_n, cambio, esperado) => {
    const r: any = validarBorrador({ ...ok, ...cambio } as any);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(esperado);
  });

  it('el error nombra el ítem que falla (el segundo)', () => {
    const r: any = validarBorrador({ ...ok, items: [ok.items[0], { cantidad: '1', descripcion: '', precio: '5' }] });
    expect(r.error).toMatch(/ítem 2/i);
  });

  it('las alícuotas válidas son las de la web', () => {
    expect(IVA_POSIBLES).toEqual([0, 10.5, 21, 27]);
  });
});

describe('cuerpoDeLaCotizacion y borradorDe', () => {
  const items = [{ qty: 1, description: 'x', unitPrice: 100, amount: 100 }];
  const b: BorradorDeCotizacion = { titulo: ' T ', items: [itemVacio()], tasaDeIva: 10.5, notas: ' n ', condicionesDePago: '', validaHasta: '' };

  it('siempre se envía (status sent) y lo vacío no viaja', () => {
    expect(cuerpoDeLaCotizacion(b, items, { recipientId: 'u2', conversationId: 'c1', applyMode: false })).toEqual({
      recipientId: 'u2', jobId: undefined, conversationId: 'c1', title: 'T', items, taxRate: 10.5, otherTaxes: [],
      notes: 'n', paymentTerms: undefined, validUntil: undefined, status: 'sent', applyMode: false,
    });
  });

  it('al corregir no se manda el destinatario', () => {
    expect('recipientId' in cuerpoDeLaCotizacion(b, items, {})).toBe(false);
  });

  it('borradorDe vuelve a poner los textos que la persona edita', () => {
    const d = borradorDe({ id: '1', title: 'Arreglo', status: 'rejected', items: [{ qty: 2, description: 'Caño', unitPrice: 1500, amount: 3000 }], subtotal: 3000, taxRate: '21', taxAmount: 630, total: 3630, notes: null, paymentTerms: '50/50', validUntil: '2026-12-31T00:00:00.000Z', senderId: 'a', recipientId: 'b' });
    expect(d).toEqual({ titulo: 'Arreglo', items: [{ cantidad: '2', descripcion: 'Caño', precio: '1500' }], tasaDeIva: 21, notas: '', condicionesDePago: '50/50', validaHasta: '2026-12-31' });
  });
});

describe('accionesDeLaCotizacion: cada persona ve lo suyo', () => {
  const q = (status: string, extra: Record<string, unknown> = {}) => ({ status, senderId: 'trabajador', recipientId: 'cliente', ...extra }) as any;

  it('el destinatario acepta o rechaza la pendiente; nadie más', () => {
    expect(accionesDeLaCotizacion(q('sent'), 'cliente')).toEqual(['aceptar', 'rechazar']);
    expect(accionesDeLaCotizacion(q('sent'), 'trabajador')).toEqual([]);
    expect(accionesDeLaCotizacion(q('sent'), 'intruso')).toEqual([]);
  });

  it('quien la envió corrige la rechazada, hasta dos veces', () => {
    expect(accionesDeLaCotizacion(q('rejected', { revisionCount: 0 }), 'trabajador')).toEqual(['corregir']);
    expect(accionesDeLaCotizacion(q('rejected', { revisionCount: MAXIMO_DE_REVISIONES - 1 }), 'trabajador')).toEqual(['corregir']);
    expect(accionesDeLaCotizacion(q('rejected', { revisionCount: MAXIMO_DE_REVISIONES }), 'trabajador')).toEqual([]);
    expect(accionesDeLaCotizacion(q('rejected'), 'cliente')).toEqual([]);
  });

  it('aceptada, borrador, sin usuario o sin cotización: nada', () => {
    expect(accionesDeLaCotizacion(q('accepted'), 'cliente')).toEqual([]);
    expect(accionesDeLaCotizacion(q('draft'), 'trabajador')).toEqual([]);
    expect(accionesDeLaCotizacion(q('sent'), undefined)).toEqual([]);
    expect(accionesDeLaCotizacion(null, 'cliente')).toEqual([]);
  });
});

describe('vencimiento, textos y participantes', () => {
  it('solo vence una pendiente con fecha pasada', () => {
    const ahora = new Date('2026-11-01T00:00:00Z').getTime();
    expect(estaVencida({ status: 'sent', validUntil: '2026-10-31T00:00:00Z' }, ahora)).toBe(true);
    expect(estaVencida({ status: 'sent', validUntil: '2026-11-30T00:00:00Z' }, ahora)).toBe(false);
    expect(estaVencida({ status: 'accepted', validUntil: '2020-01-01T00:00:00Z' }, ahora)).toBe(false);
    expect(estaVencida({ status: 'sent', validUntil: null }, ahora)).toBe(false);
  });

  it('etiquetas de estado y pesos', () => {
    expect(etiquetaDelEstado('sent')).toBe('Pendiente');
    expect(etiquetaDelEstado('rejected')).toBe('Rechazada');
    expect(etiquetaDelEstado('raro')).toBe('raro');
    expect(pesos(1234.5)).toMatch(/^\$1\.234,5$/);
    expect(pesos(null)).toBe('$0');
  });

  it('el resumen para compartir lista ítems y totales', () => {
    const r = resumenParaCompartir({ id: '1', title: 'Arreglo', status: 'sent', items: [{ qty: 2, description: 'Caño', unitPrice: 1000, amount: 2000 }], subtotal: 2000, taxRate: 21, taxAmount: 420, total: 2420, senderId: 'a', recipientId: 'b', sender: { id: 'a', name: 'Ana' }, paymentTerms: '50/50' });
    expect(r).toContain('Cotización: Arreglo');
    expect(r).toContain('De: Ana');
    expect(r).toContain('• 2 × Caño');
    expect(r).toContain('IVA (21%)');
    expect(r).toContain('Total: $2.420');
    expect(r).toContain('Condiciones de pago: 50/50');
  });

  it('el otro participante, con participantes como objetos o como ids', () => {
    expect(otroParticipante({ participants: [{ id: 'yo' }, { id: 'otro' }] }, 'yo')).toBe('otro');
    expect(otroParticipante({ participants: ['otro', 'yo'] }, 'yo')).toBe('otro');
    expect(otroParticipante({ participants: [{ id: 'yo' }] }, 'yo')).toBeNull();
    expect(otroParticipante(null, 'yo')).toBeNull();
    expect(otroParticipante({ participants: [] }, 'yo')).toBeNull();
  });
});

describe('leer lo que responde el servidor', () => {
  it('lista y detalle vienen en data; sin éxito o con otra forma son null', () => {
    expect(leerCotizaciones({ success: true, data: [{ id: '1' }] })).toHaveLength(1);
    expect(leerCotizaciones({ success: true, data: {} })).toBeNull();
    expect(leerCotizaciones({ success: false, data: [] })).toBeNull();
    expect(leerCotizacion({ success: true, data: { id: '1', title: 'x' } })?.id).toBe('1');
    expect(leerCotizacion({ success: true, data: [] })).toBeNull();
    expect(leerCotizacion({ success: true, data: {} })).toBeNull();
    expect(leerCotizacion(null)).toBeNull();
  });

  it('interpretarAccion: éxito con el contrato creado, o el motivo del servidor', () => {
    expect(interpretarAccion({ success: true, message: 'Cotización aceptada y contrato creado automáticamente', data: { id: '1' }, contractId: 'c9' }, 'x')).toMatchObject({ ok: true, contractId: 'c9' });
    // Con trabajo, el servidor ya no crea el contrato: devuelve la propuesta para confirmar (y pagar lo que falte)
    expect(interpretarAccion({ success: true, message: 'Cotización aceptada. Para contratar, confirmá la propuesta.', data: { id: '1' }, contractId: null, proposalId: 'p7' }, 'x')).toMatchObject({ ok: true, contractId: null, proposalId: 'p7' });
    expect(interpretarAccion({ success: true, data: { id: '1' } }, 'x')).toMatchObject({ ok: true, contractId: null, proposalId: null });
    expect(interpretarAccion({ success: false, message: 'Solo el destinatario puede aceptar la cotización' }, 'x')).toEqual({ ok: false, mensaje: 'Solo el destinatario puede aceptar la cotización' });
    expect(interpretarAccion(null, 'x').ok).toBe(false);
  });
});

describe('llamadas a la API', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPut.mockReset(); });

  it('listar y traer', async () => {
    mockGet.mockResolvedValue({ success: true, data: [] });
    await listarCotizaciones('received');
    expect(mockGet).toHaveBeenLastCalledWith('/quotes?type=received&limit=50');
    await listarCotizaciones('sent');
    expect(mockGet).toHaveBeenLastCalledWith('/quotes?type=sent&limit=50');
    await traerCotizacion('abc');
    expect(mockGet).toHaveBeenLastCalledWith('/quotes/abc');
  });

  it('crear con POST /quotes, corregir con PUT /quotes/:id', async () => {
    mockPost.mockResolvedValueOnce({ success: true, data: { id: '1' }, message: 'Cotización enviada correctamente' });
    expect((await crearCotizacion({ title: 'x' })).ok).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/quotes', { title: 'x' });
    mockPut.mockResolvedValueOnce({ success: false, message: 'Se alcanzó el límite de 2 contraoferts por cotización' });
    expect(await corregirCotizacion('1', { title: 'y' })).toEqual({ ok: false, mensaje: 'Se alcanzó el límite de 2 contraoferts por cotización' });
    expect(mockPut).toHaveBeenCalledWith('/quotes/1', { title: 'y' });
  });

  it('aceptar y rechazar (el motivo, recortado y opcional)', async () => {
    mockPost.mockResolvedValue({ success: true });
    await aceptarCotizacion('1');
    expect(mockPost).toHaveBeenLastCalledWith('/quotes/1/accept', {});
    await rechazarCotizacion('1', '  muy cara ');
    expect(mockPost).toHaveBeenLastCalledWith('/quotes/1/reject', { reason: 'muy cara' });
    await rechazarCotizacion('1');
    expect(mockPost).toHaveBeenLastCalledWith('/quotes/1/reject', { reason: undefined });
  });
});
