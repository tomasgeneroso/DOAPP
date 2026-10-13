/**
 * Detalle del tablero por contrato: ingresos, gastos y contratos activos. Las mismas cuentas que la web.
 */
jest.mock('../services/api', () => ({ __esModule: true, get: jest.fn() }));

import { get } from '../services/api';
import { ETIQUETAS_DE_ESTADO, esTipoDeDetalle, resumirDetalle, soyElCliente, soyElTrabajador, traerContratos } from '../services/tablero';

const mockGet = get as jest.Mock;
const YO = 'yo';
const c = (extra: Record<string, unknown>) => ({ id: String(Math.random()), status: 'completed', price: 1000, client: { id: 'otro' }, doer: { id: YO }, ...extra }) as any;

describe('ingresos y gastos', () => {
  const contratos = [
    c({ price: 1000 }),                                                  // completé como trabajador
    c({ price: 3000 }),                                                  // idem
    c({ price: 500, client: { id: YO }, doer: { id: 'otro' } }),         // pagué como cliente
    c({ price: 700, status: 'in_progress' }),                            // todavía no terminó
    c({ price: 900, status: 'cancelled' }),
  ];

  it('ingresos: solo completados en los que soy el trabajador; total, cantidad y promedio', () => {
    const r = resumirDetalle('ingresos', contratos, YO);
    expect(r.cantidad).toBe(2);
    expect(r.total).toBe(4000);
    expect(r.promedio).toBe(2000);
  });

  it('gastos: solo completados en los que soy el cliente', () => {
    const r = resumirDetalle('gastos', contratos, YO);
    expect(r.cantidad).toBe(1);
    expect(r.total).toBe(500);
  });

  it('sin contratos o con una respuesta rara: ceros, no NaN', () => {
    for (const lista of [[], null, undefined, 'no es lista' as any]) {
      expect(resumirDetalle('ingresos', lista, YO)).toMatchObject({ cantidad: 0, total: 0, promedio: 0 });
    }
  });

  it('un precio ilegible cuenta como cero (no rompe el total)', () => {
    expect(resumirDetalle('ingresos', [c({ price: 'abc' }), c({ price: '250.5' })], YO).total).toBe(250.5);
  });

  it('sin usuario no es de nadie', () => {
    expect(resumirDetalle('ingresos', contratos, undefined).cantidad).toBe(0);
  });
});

describe('contratos activos', () => {
  const contratos = [
    c({ status: 'pending' }),
    c({ status: 'accepted', client: { id: YO }, doer: { id: 'otro' } }),
    c({ status: 'in_progress' }),
    c({ status: 'in_progress', client: { id: YO }, doer: { id: 'otro' }, price: 2000 }),
    c({ status: 'completed' }),
    c({ status: 'cancelled' }),
    c({ status: 'in_progress', client: { id: 'a' }, doer: { id: 'b' } }), // ajeno
  ];

  it('pendiente, aceptado y en curso, como cliente o como trabajador; cuenta por estado', () => {
    const r = resumirDetalle('activos', contratos, YO);
    expect(r.cantidad).toBe(4);
    expect(r.porEstado).toEqual({ pending: 1, accepted: 1, in_progress: 2 });
    expect(r.total).toBe(1000 + 1000 + 1000 + 2000);
  });

  it('un contrato ajeno, completado o cancelado no cuenta', () => {
    const r = resumirDetalle('activos', contratos, YO);
    expect(r.contratos.every((x) => ['pending', 'accepted', 'in_progress'].includes(x.status))).toBe(true);
  });
});

describe('roles y tipos', () => {
  it('reconoce al cliente y al trabajador por el objeto o por el id plano', () => {
    expect(soyElCliente({ status: 'x', price: 1, client: { id: YO } }, YO)).toBe(true);
    expect(soyElCliente({ status: 'x', price: 1, clientId: YO }, YO)).toBe(true);
    expect(soyElTrabajador({ status: 'x', price: 1, doerId: YO }, YO)).toBe(true);
    expect(soyElTrabajador({ status: 'x', price: 1, doer: { id: 'otro' } }, YO)).toBe(false);
  });

  it('solo existen los tres detalles', () => {
    expect(esTipoDeDetalle('ingresos')).toBe(true);
    expect(esTipoDeDetalle('gastos')).toBe(true);
    expect(esTipoDeDetalle('activos')).toBe(true);
    expect(esTipoDeDetalle('admin')).toBe(false);
    expect(esTipoDeDetalle(undefined)).toBe(false);
    expect(ETIQUETAS_DE_ESTADO.in_progress).toBe('En curso');
  });
});

describe('traerContratos', () => {
  beforeEach(() => mockGet.mockReset());

  it('lee contracts de al lado de success (como responde el servidor)', async () => {
    mockGet.mockResolvedValueOnce({ success: true, count: 1, contracts: [{ id: '1' }] });
    expect(await traerContratos()).toEqual([{ id: '1' }]);
    expect(mockGet).toHaveBeenCalledWith('/contracts');
  });

  it('sin éxito o con otra forma: null (no una lista vacía engañosa)', async () => {
    mockGet.mockResolvedValueOnce({ success: false });
    expect(await traerContratos()).toBeNull();
    mockGet.mockResolvedValueOnce(null);
    expect(await traerContratos()).toBeNull();
  });
});
