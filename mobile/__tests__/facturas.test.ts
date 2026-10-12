/**
 * Facturas en la app: la lista y la descarga.
 *
 * La lista salía siempre vacía (el servidor responde `{ success, invoices }` y la app leía `data.invoices`) y la descarga
 * abría la dirección protegida en el navegador del teléfono, sin sesión. Ahora se pide una dirección firmada de corta vida.
 */
jest.mock('../services/api', () => ({
  __esModule: true,
  post: jest.fn(),
  API_URL: 'https://doapparg.com/api',
}));

import { post } from '../services/api';
import { armarDireccionDeDescarga, extraerFacturas, pedirDireccionDeDescarga } from '../services/facturas';

const mockPost = post as jest.Mock;
const API = 'https://doapparg.com/api';
const RUTA = '/payments/invoices/3f2c1b9e-aaaa-bbbb-cccc-0123456789ab/download-signed?t=eyJhbGciOi.payload.firma';

describe('lista de facturas', () => {
  it('lee las facturas de `invoices` (como responde el servidor)', () => {
    expect(extraerFacturas({ success: true, invoices: [{ id: 'a' }, { id: 'b' }] })).toHaveLength(2);
  });

  it('también acepta `data.invoices`', () => {
    expect(extraerFacturas({ success: true, data: { invoices: [{ id: 'a' }] } })).toHaveLength(1);
  });

  it('sin éxito, sin lista o con algo raro: vacía, nunca revienta', () => {
    expect(extraerFacturas(null)).toEqual([]);
    expect(extraerFacturas({ success: false, invoices: [{ id: 'a' }] })).toEqual([]);
    expect(extraerFacturas({ success: true })).toEqual([]);
    expect(extraerFacturas({ success: true, invoices: 'no es lista' })).toEqual([]);
  });
});

describe('dirección de descarga', () => {
  it('une la base de la API con la ruta firmada', () => {
    expect(armarDireccionDeDescarga({ success: true, ruta: RUTA }, API)).toBe(`${API}${RUTA}`);
    expect(armarDireccionDeDescarga({ success: true, ruta: RUTA }, `${API}/`)).toBe(`${API}${RUTA}`);
  });

  it('lo que falte o venga raro es un error (null), no una dirección', () => {
    expect(armarDireccionDeDescarga(null, API)).toBeNull();
    expect(armarDireccionDeDescarga({ success: false, ruta: RUTA }, API)).toBeNull();
    expect(armarDireccionDeDescarga({ success: true }, API)).toBeNull();
    expect(armarDireccionDeDescarga({ success: true, ruta: 42 }, API)).toBeNull();
    expect(armarDireccionDeDescarga({ success: true, ruta: RUTA }, '')).toBeNull();
    expect(armarDireccionDeDescarga({ success: true, ruta: RUTA }, 'javascript:alert(1)')).toBeNull();
  });

  it('no abre una dirección que no tenga la forma de una descarga firmada (ni de otro sitio)', () => {
    for (const ruta of [
      'https://malo.example/robar',
      '//malo.example/x',
      '/payments/invoices/abc/download?t=x', // la protegida, sin firma
      '/payments/invoices/abc/download-signed', // sin firma
      '/admin/users?t=x',
      `${RUTA} extra`,
    ]) {
      expect(armarDireccionDeDescarga({ success: true, ruta }, API)).toBeNull();
    }
  });
});

describe('pedirDireccionDeDescarga', () => {
  beforeEach(() => mockPost.mockReset());

  it('pide la dirección al servidor (con sesión) y devuelve la completa', async () => {
    mockPost.mockResolvedValueOnce({ success: true, ruta: RUTA, venceEnSegundos: 300 });
    const r = await pedirDireccionDeDescarga('3f2c1b9e-aaaa-bbbb-cccc-0123456789ab');
    expect(mockPost).toHaveBeenCalledWith('/payments/invoices/3f2c1b9e-aaaa-bbbb-cccc-0123456789ab/download-link', {});
    expect(r).toEqual({ ok: true, url: `${API}${RUTA}` });
  });

  it('si el servidor dice que no, se cuenta el motivo', async () => {
    mockPost.mockResolvedValueOnce({ success: false, message: 'Factura no encontrada' });
    expect(await pedirDireccionDeDescarga('x')).toEqual({ ok: false, mensaje: 'Factura no encontrada' });
  });

  it('si responde algo raro, un mensaje genérico y no una dirección', async () => {
    mockPost.mockResolvedValueOnce({ success: true, ruta: 'https://malo.example/x' });
    const r = await pedirDireccionDeDescarga('x');
    expect(r.ok).toBe(false);
  });
});
