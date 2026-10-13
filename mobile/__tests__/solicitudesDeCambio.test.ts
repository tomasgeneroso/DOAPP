/**
 * Solicitudes de cambio o cancelación de un contrato. Lo que se cuida: solo la OTRA parte responde, solo si está pendiente, y
 * que a quien va a aceptar una cancelación se le avise que el contrato se cancela (el servidor cancela el contrato sin más).
 */
jest.mock('../services/api', () => ({ __esModule: true, get: jest.fn(), put: jest.fn() }));

import { get, put } from '../services/api';
import {
  advertenciaDeAceptar, etiquetaDelEstadoDeLaSolicitud, etiquetaDelTipo, interpretarRespuesta, leerSolicitud, leerSolicitudes,
  pendientesParaResponder, puedeResponder, responderSolicitud, traerSolicitud, traerSolicitudesDelContrato,
} from '../services/solicitudesDeCambio';

const mockGet = get as jest.Mock;
const mockPut = put as jest.Mock;
const sol = (extra: Record<string, unknown> = {}) => ({
  id: 's1', type: 'cancel', reason: 'No puedo', status: 'pending', requestedBy: { id: 'cliente', name: 'C' },
  contract: { id: 'c1', client: { id: 'cliente', name: 'C' }, doer: { id: 'trabajador', name: 'T' } }, ...extra,
}) as any;

describe('puedeResponder', () => {
  it('solo la otra parte', () => {
    expect(puedeResponder(sol(), 'trabajador')).toBe(true);
    expect(puedeResponder(sol(), 'cliente')).toBe(false); // quien la pidió no se la responde a sí mismo
    expect(puedeResponder(sol(), 'intruso')).toBe(false); // ni alguien ajeno al contrato
  });

  it('solo mientras está pendiente', () => {
    for (const status of ['accepted', 'rejected', 'escalated_to_support']) expect(puedeResponder(sol({ status }), 'trabajador')).toBe(false);
  });

  it('sin usuario o sin solicitud, no', () => {
    expect(puedeResponder(sol(), undefined)).toBe(false);
    expect(puedeResponder(null, 'trabajador')).toBe(false);
  });

  it('en la lista por contrato (sin datos del contrato) alcanza con que no la haya pedido uno mismo', () => {
    const sinContrato = sol({ contract: undefined });
    expect(puedeResponder(sinContrato, 'trabajador')).toBe(true);
    expect(puedeResponder(sinContrato, 'cliente')).toBe(false);
  });

  it('pendientesParaResponder filtra la lista', () => {
    const lista = [sol({ id: 'a' }), sol({ id: 'b', status: 'accepted' }), sol({ id: 'c', requestedBy: { id: 'trabajador', name: 'T' } })];
    expect(pendientesParaResponder(lista, 'trabajador').map((x) => x.id)).toEqual(['a']);
    expect(pendientesParaResponder(null, 'trabajador')).toEqual([]);
  });
});

describe('textos', () => {
  it('estados y tipos', () => {
    expect(etiquetaDelEstadoDeLaSolicitud('pending')).toBe('Pendiente');
    expect(etiquetaDelEstadoDeLaSolicitud('escalated_to_support')).toBe('Derivada a soporte');
    expect(etiquetaDelEstadoDeLaSolicitud('raro')).toBe('raro');
    expect(etiquetaDelTipo('cancel')).toBe('Cancelación del contrato');
    expect(etiquetaDelTipo('modify')).toBe('Modificación del contrato');
  });

  it('aceptar una cancelación avisa que el contrato se cancela y que se revise el dinero retenido', () => {
    const a = advertenciaDeAceptar({ type: 'cancel' });
    expect(a).toMatch(/se cancela/i);
    expect(a).toMatch(/dinero retenido/i);
    expect(advertenciaDeAceptar({ type: 'modify' })).toMatch(/nuevos términos/i);
  });
});

describe('leer y llamar', () => {
  beforeEach(() => { mockGet.mockReset(); mockPut.mockReset(); });

  it('lee changeRequest y changeRequests (al lado de success); lo demás es null', () => {
    expect(leerSolicitud({ success: true, changeRequest: { id: 's1' } })?.id).toBe('s1');
    expect(leerSolicitud({ success: true, changeRequest: {} })).toBeNull();
    expect(leerSolicitud({ success: false, changeRequest: { id: 's1' } })).toBeNull();
    expect(leerSolicitudes({ success: true, changeRequests: [{ id: 'a' }] })).toHaveLength(1);
    expect(leerSolicitudes({ success: true, changeRequests: 'no' })).toBeNull();
    expect(leerSolicitudes(null)).toBeNull();
  });

  it('interpretarRespuesta', () => {
    expect(interpretarRespuesta({ success: true, message: 'Solicitud aceptada' })).toEqual({ ok: true, mensaje: 'Solicitud aceptada' });
    expect(interpretarRespuesta({ success: false, message: 'No tienes permiso para responder esta solicitud' }).ok).toBe(false);
    expect(interpretarRespuesta(null).ok).toBe(false);
  });

  it('traer, listar por contrato y responder (accept siempre booleano)', async () => {
    mockGet.mockResolvedValue({ success: true });
    await traerSolicitud('s1');
    expect(mockGet).toHaveBeenLastCalledWith('/contract-change-requests/s1');
    await traerSolicitudesDelContrato('c1');
    expect(mockGet).toHaveBeenLastCalledWith('/contract-change-requests/contract/c1');
    mockPut.mockResolvedValue({ success: true, message: 'Solicitud rechazada' });
    expect((await responderSolicitud('s1', false)).ok).toBe(true);
    expect(mockPut).toHaveBeenLastCalledWith('/contract-change-requests/s1/respond', { accept: false });
    await responderSolicitud('s1', 'si' as any);
    expect(mockPut).toHaveBeenLastCalledWith('/contract-change-requests/s1/respond', { accept: false }); // lo que no es true literal no acepta
  });
});
