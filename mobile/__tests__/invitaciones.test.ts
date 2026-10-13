/**
 * Invitaciones de creadores de contenido en la app. Lo que se cuida: que se reconozca el código aunque se pegue el enlace
 * entero (y nada que no lo sea), que lo que falte o venga raro sea «no sirve» y nunca «sirve», y que el registro cuente
 * si la invitación se aplicó.
 */
jest.mock('../services/api', () => ({ __esModule: true, get: jest.fn(), post: jest.fn() }));

import { get, post } from '../services/api';
import {
  canjearInvitacion, consultarInvitacion, enlacesDisponibles, extraerCodigo, interpretarCanje, interpretarConsulta,
  interpretarLotes, mensajeDelRegistro, normalizarCodigo, darDeBaja, emitirLote, listarLotes, MOTIVO_MINIMO,
} from '../services/invitaciones';

const mockGet = get as jest.Mock;
const mockPost = post as jest.Mock;
const COD = 'INF-ABCDEFGHJKMN';

describe('normalizarCodigo y extraerCodigo', () => {
  it('normaliza minúsculas y espacios; rechaza lo que no tiene la forma', () => {
    expect(normalizarCodigo('  inf-abcdefghjkmn ')).toBe(COD);
    for (const mal of ['', null, undefined, 'INF-ABC', 'INF-ABCDEFGHJKM0', 'FAM-ABCDEFGHJKMN', "INF-ABCDEFGHJKMN'; DROP", 'INF-ABCDEFGHJKMNP']) {
      expect(normalizarCodigo(mal as any)).toBeNull();
    }
  });

  it('saca el código del enlace entero, del enlace de la app, con parámetros o escrito a mano', () => {
    expect(extraerCodigo(COD)).toBe(COD);
    expect(extraerCodigo(`https://doapparg.com/invitacion/${COD}`)).toBe(COD);
    expect(extraerCodigo(`https://doapparg.com/invitacion/${COD}?utm_source=ig`)).toBe(COD);
    expect(extraerCodigo(`doapp://invitacion/${COD}`)).toBe(COD);
    expect(extraerCodigo(`Hola! Tu enlace: https://doapparg.com/invitacion/${COD.toLowerCase()} gracias`)).toBe(COD);
    expect(extraerCodigo(`/register?invitacion=${COD}`)).toBe(COD);
  });

  it('no se inventa un código de lo que no lo es', () => {
    for (const mal of ['https://doapparg.com/', 'hola', '', null, 'INF-corto', `https://malo.example/x${COD}y`]) {
      expect(extraerCodigo(mal as any)).toBeNull();
    }
  });
});

describe('interpretarConsulta: lo que falte o venga raro es «no sirve»', () => {
  it('válida: de quién es y cuántos días da', () => {
    expect(interpretarConsulta({ success: true, valida: true, dias: 365, influencer: 'Ana', mensaje: 'Invitación válida' })).toEqual({
      valida: true, mensaje: 'Invitación válida', dias: 365, influencer: 'Ana',
    });
  });

  it.each([
    [null],
    [{ success: true, valida: true }],
    [{ success: true, valida: true, dias: 0 }],
    [{ success: true, valida: true, dias: 'x' }],
    [{ success: false, valida: true, dias: 365 }],
    [{ success: true, valida: false, mensaje: 'Esta invitación ya fue usada.' }],
  ])('%j → no sirve', (res) => {
    expect(interpretarConsulta(res).valida).toBe(false);
  });

  it('cuenta el motivo del servidor', () => {
    expect(interpretarConsulta({ success: true, valida: false, mensaje: 'Esta invitación ya fue usada.' }).mensaje).toBe('Esta invitación ya fue usada.');
  });
});

describe('interpretarCanje y mensajeDelRegistro', () => {
  it('canje exitoso y fallido', () => {
    expect(interpretarCanje({ success: true, message: 'Listo.', hasta: '2027-10-12T00:00:00.000Z' })).toEqual({ ok: true, mensaje: 'Listo.', hasta: '2027-10-12T00:00:00.000Z' });
    expect(interpretarCanje({ success: false, motivo: 'ya_canjeo_una', message: 'Tu cuenta ya canjeó una invitación' })).toMatchObject({ ok: false, motivo: 'ya_canjeo_una' });
    expect(interpretarCanje(null).ok).toBe(false);
  });

  it('el registro cuenta si se aplicó o por qué no', () => {
    expect(mensajeDelRegistro({ invitacion: { aplicada: true, mensaje: 'Invitación aplicada…' } })).toEqual({ aplicada: true, mensaje: 'Invitación aplicada…' });
    expect(mensajeDelRegistro({ invitacion: { aplicada: false, mensaje: 'Esta invitación ya fue usada.' } })?.aplicada).toBe(false);
    expect(mensajeDelRegistro({})).toBeNull();
    expect(mensajeDelRegistro({ invitacion: { aplicada: true } })).toBeNull();
    expect(mensajeDelRegistro(null)).toBeNull();
  });
});

describe('llamadas a la API', () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

  it('consultar es pública (sin sesión) y usa el código canónico; un código inválido ni llega al servidor', async () => {
    mockGet.mockResolvedValueOnce({ success: true, valida: true, dias: 365 });
    expect((await consultarInvitacion(COD.toLowerCase())).valida).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(`/invitaciones/${COD}`, false);
    expect((await consultarInvitacion('basura')).valida).toBe(false);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('canjear manda el código canónico con sesión; un código inválido no se manda', async () => {
    mockPost.mockResolvedValueOnce({ success: true, hasta: 'x' });
    expect((await canjearInvitacion(COD)).ok).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/invitaciones/canjear', { codigo: COD });
    expect((await canjearInvitacion('mal')).ok).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('panel del owner: listar, emitir (recortando) y dar de baja (con el motivo recortado)', async () => {
    mockGet.mockResolvedValueOnce({ success: true });
    await listarLotes();
    expect(mockGet).toHaveBeenCalledWith('/admin/influencer-invites');
    mockPost.mockResolvedValue({ success: true });
    await emitirLote('  Ana Pérez ', ' @ana ', '  ');
    expect(mockPost).toHaveBeenLastCalledWith('/admin/influencer-invites', { nombre: 'Ana Pérez', usuario: '@ana', notas: undefined });
    await darDeBaja('id1', '  se hackeó la cuenta ');
    expect(mockPost).toHaveBeenLastCalledWith('/admin/influencer-invites/id1/deactivate', { motivo: 'se hackeó la cuenta' });
    expect(MOTIVO_MINIMO).toBe(5);
  });
});

describe('lotes del panel', () => {
  const lote = {
    batchId: 'b', influencer: 'Ana', handle: '@ana', creadoEl: '2026-10-12T00:00:00Z', total: 3, canjeadas: 1,
    invitaciones: [
      { id: '1', code: 'a', enlace: 'https://doapparg.com/invitacion/INF-A', estado: 'valida', canjeadaPor: null, canjeadaEl: null, beneficioHasta: null },
      { id: '2', code: 'b', enlace: 'https://doapparg.com/invitacion/INF-B', estado: 'canjeada', canjeadaPor: { id: 'u', name: 'X', email: 'x@y.z' }, canjeadaEl: 'f', beneficioHasta: 'g' },
      { id: '3', code: 'c', enlace: 'https://doapparg.com/invitacion/INF-C', estado: 'valida', canjeadaPor: null, canjeadaEl: null, beneficioHasta: null },
    ],
  } as any;

  it('interpretarLotes lee data y la política; sin éxito o sin lista es null (no un panel vacío engañoso)', () => {
    expect(interpretarLotes({ success: true, data: [lote], politica: { invitacionesPorCreador: 5, diasSinComision: 365 } })).toEqual({ lotes: [lote], porCreador: 5, dias: 365 });
    expect(interpretarLotes({ success: false })).toBeNull();
    expect(interpretarLotes({ success: true, data: 'no' })).toBeNull();
    expect(interpretarLotes(null)).toBeNull();
  });

  it('los enlaces para copiar son SOLO los disponibles, uno por línea', () => {
    expect(enlacesDisponibles(lote)).toBe('https://doapparg.com/invitacion/INF-A\nhttps://doapparg.com/invitacion/INF-C');
    expect(enlacesDisponibles({ ...lote, invitaciones: [lote.invitaciones[1]] })).toBe('');
  });
});
