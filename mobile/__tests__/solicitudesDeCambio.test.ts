/**
 * Solicitudes de cambio o cancelación de un contrato. Lo que se cuida: solo la OTRA parte responde, solo si está pendiente, a
 * quien va a aceptar una cancelación se le avisa que NO se cancela sola (la revisa un administrador, que resuelve el dinero) y
 * al pedir un cambio se aplican las mismas reglas del servidor (el precio no se cambia por acá).
 */
jest.mock('../services/api', () => ({ __esModule: true, get: jest.fn(), put: jest.fn(), post: jest.fn() }));

import { get, post, put } from '../services/api';
import {
  advertenciaDeAceptar, etiquetaDelEstadoDeLaSolicitud, etiquetaDelTipo, interpretarRespuesta, leerSolicitud, leerSolicitudes,
  pendientesParaResponder, puedeResponder, responderSolicitud, traerSolicitud, traerSolicitudesDelContrato,
  admiteCambios, armarSolicitud, fechaDelDia, hayPendiente, interpretarPedido, pedirCambio, sinEmpezar, LIMITE_NOTA,
} from '../services/solicitudesDeCambio';

const mockGet = get as jest.Mock;
const mockPut = put as jest.Mock;
const mockPost = post as jest.Mock;
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

  it('aceptar una cancelación avisa que no se cancela solo: la revisa un administrador, que resuelve el dinero', () => {
    const a = advertenciaDeAceptar({ type: 'cancel' });
    expect(a).toMatch(/mutuo acuerdo/i);
    expect(a).toMatch(/administrador/i);
    expect(a).toMatch(/resuelve el dinero/i);
    expect(a).not.toMatch(/se cancela./i); // no promete una cancelación inmediata
    expect(advertenciaDeAceptar({ type: 'modify' })).toMatch(/fechas/i);
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

describe('pedir un cambio', () => {
  const AHORA = new Date(2026, 9, 13, 10, 0, 0); // 13/10/2026
  const bor = (extra: Record<string, unknown> = {}) => ({ tipo: 'modify' as const, motivo: 'Necesito mover la fecha por lluvia.', inicio: '', fin: '2026-12-15', nota: '', ...extra });

  it('solo se pide sobre un contrato vivo', () => {
    for (const e of ['pending', 'ready', 'accepted', 'in_progress']) expect(admiteCambios(e)).toBe(true);
    for (const e of ['completed', 'cancelled', 'disputed', 'in_review', 'rejected', 'awaiting_confirmation', '', undefined]) expect(admiteCambios(e)).toBe(false);
    expect(sinEmpezar('accepted')).toBe(true);
    expect(sinEmpezar('in_progress')).toBe(false);
  });

  it('fechaDelDia solo acepta días que existen', () => {
    expect(fechaDelDia('2026-12-15')).toBeInstanceOf(Date);
    expect(fechaDelDia(' 2026-12-15 ')).toBeInstanceOf(Date);
    for (const malo of ['', '15/12/2026', '2026-13-01', '2026-02-31', '2026-1-5', 'mañana']) expect(fechaDelDia(malo)).toBeNull();
  });

  it('cancelar solo necesita el motivo', () => {
    const r = armarSolicitud('c1', 'in_progress', { ...bor(), tipo: 'cancel', fin: 'basura' }, AHORA);
    expect(r).toEqual({ ok: true, cuerpo: { contractId: 'c1', type: 'cancel', reason: 'Necesito mover la fecha por lluvia.' } });
  });

  it('el motivo: al menos 5 caracteres, con espacios recortados, y un tope', () => {
    expect(armarSolicitud('c1', 'accepted', bor({ motivo: '  no  ' }), AHORA)).toMatchObject({ ok: false });
    expect(armarSolicitud('c1', 'accepted', bor({ motivo: 'x'.repeat(1001) }), AHORA)).toMatchObject({ ok: false });
    expect((armarSolicitud('c1', 'accepted', bor({ motivo: '  Por lluvia  ' }), AHORA) as any).cuerpo.reason).toBe('Por lluvia');
  });

  it('una modificación manda solo lo que se pidió, como fechas ISO, y NUNCA un precio', () => {
    const r: any = armarSolicitud('c1', 'accepted', bor({ inicio: '2026-11-20', nota: ' Portón lateral ' }), AHORA);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.cuerpo.newTerms).sort()).toEqual(['description', 'endDate', 'startDate']);
    expect(r.cuerpo.newTerms.description).toBe('Portón lateral');
    expect(new Date(r.cuerpo.newTerms.startDate).getTime()).toBeLessThan(new Date(r.cuerpo.newTerms.endDate).getTime());
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/price/i);
  });

  it('exige algo que cambiar, y fechas válidas, futuras y en orden', () => {
    expect(armarSolicitud('c1', 'accepted', bor({ fin: '' }), AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/qué querés cambiar/) });
    expect(armarSolicitud('c1', 'accepted', bor({ fin: '2026-02-31' }), AHORA)).toMatchObject({ ok: false });
    expect(armarSolicitud('c1', 'accepted', bor({ fin: '2026-10-01' }), AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/futura/) });
    expect(armarSolicitud('c1', 'accepted', bor({ inicio: '2026-10-01', fin: '' }), AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/futura/) });
    expect(armarSolicitud('c1', 'accepted', bor({ inicio: '2026-12-20', fin: '2026-12-15' }), AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/anterior/) });
    expect(armarSolicitud('c1', 'accepted', bor({ nota: 'y'.repeat(LIMITE_NOTA + 1) }), AHORA)).toMatchObject({ ok: false });
  });

  it('con el trabajo en curso no se mueve el inicio, y un contrato cerrado no admite nada', () => {
    expect(armarSolicitud('c1', 'in_progress', bor({ inicio: '2026-11-20' }), AHORA)).toMatchObject({ ok: false, error: expect.stringMatching(/ya empezó/) });
    expect(armarSolicitud('c1', 'in_progress', bor(), AHORA)).toMatchObject({ ok: true });
    expect(armarSolicitud('c1', 'completed', bor(), AHORA)).toMatchObject({ ok: false });
    expect(armarSolicitud('c1', 'cancelled', { ...bor(), tipo: 'cancel' }, AHORA)).toMatchObject({ ok: false });
  });

  it('interpretar el pedido: solo es ok con una solicitud creada', () => {
    expect(interpretarPedido({ success: true, message: 'Solicitud enviada exitosamente', changeRequest: { id: 's9' } })).toEqual({ ok: true, mensaje: 'Solicitud enviada exitosamente', id: 's9' });
    expect(interpretarPedido({ success: true })).toMatchObject({ ok: false });
    expect(interpretarPedido({ success: false, message: 'Ya existe una solicitud pendiente para este contrato' })).toEqual({ ok: false, mensaje: 'Ya existe una solicitud pendiente para este contrato' });
    expect(interpretarPedido(null).ok).toBe(false);
  });

  it('pedirCambio llama a /contract-change-requests', async () => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ success: true, changeRequest: { id: 's1' } });
    const cuerpo = { contractId: 'c1', type: 'cancel' as const, reason: 'Por lluvia fuerte' };
    expect((await pedirCambio(cuerpo)).ok).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/contract-change-requests', cuerpo);
  });

  it('hayPendiente: con una pendiente (de quien sea) no se abre otra', () => {
    expect(hayPendiente([sol({ status: 'accepted' }), sol({ status: 'pending' })])).toBe(true);
    expect(hayPendiente([sol({ status: 'rejected' })])).toBe(false);
    expect(hayPendiente([])).toBe(false);
    expect(hayPendiente(null)).toBe(false);
  });
});
