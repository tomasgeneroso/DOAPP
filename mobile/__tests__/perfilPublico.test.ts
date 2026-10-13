jest.mock('../services/api', () => ({ __esModule: true, get: jest.fn() }));
import { get } from '../services/api';
import { buscarPerfilPorUsuario, interpretarPerfilPorUsuario, normalizarUsuario, usuarioValido } from '../services/perfilPublico';

const mockGet = get as jest.Mock;

describe('usuario', () => {
  it('se normaliza como lo guarda el servidor (minúsculas, sin @)', () => {
    expect(normalizarUsuario('  @Ana.Perez ')).toBe('ana.perez');
    expect(normalizarUsuario(['Bruno_1', 'otro'])).toBe('bruno_1');
    expect(normalizarUsuario(undefined)).toBe('');
  });

  it('solo letras, números, punto y guion bajo; de 3 a 30', () => {
    expect(usuarioValido('ana.perez_1')).toBe(true);
    expect(usuarioValido('ab')).toBe(false);
    expect(usuarioValido('a'.repeat(31))).toBe(false);
    expect(usuarioValido('ana/../admin')).toBe(false);
    expect(usuarioValido('ana perez')).toBe(false);
  });
});

describe('buscarPerfilPorUsuario', () => {
  beforeEach(() => mockGet.mockReset());

  it('pide el perfil público sin sesión y devuelve el id', async () => {
    mockGet.mockResolvedValue({ success: true, user: { id: 'u-1', name: 'Ana' } });
    expect(await buscarPerfilPorUsuario('@Ana.Perez')).toEqual({ ok: true, id: 'u-1' });
    expect(mockGet).toHaveBeenCalledWith('/users/u/ana.perez', false);
  });

  it('un usuario inválido no llega al servidor', async () => {
    const r = await buscarPerfilPorUsuario('../etc');
    expect(r.ok).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('404 dice que no existe; otro error no se confunde con eso', async () => {
    expect(interpretarPerfilPorUsuario({ success: false, status: 404 })).toEqual({ ok: false, mensaje: 'No existe ese usuario.' });
    expect(interpretarPerfilPorUsuario({ success: false, message: 'Error de conexión' })).toEqual({ ok: false, mensaje: 'Error de conexión' });
  });

  it('una respuesta sin id no abre nada', () => {
    expect(interpretarPerfilPorUsuario({ success: true, user: {} }).ok).toBe(false);
    expect(interpretarPerfilPorUsuario(null).ok).toBe(false);
  });
});
