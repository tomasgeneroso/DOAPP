jest.mock('../services/api', () => ({ __esModule: true, post: jest.fn() }));
import { post } from '../services/api';
import { alternarInteres, interesesValidos, interpretarOnboarding, terminarOnboarding } from '../services/onboarding';

const mockPost = post as jest.Mock;
const CATS = [{ id: 'plomeria' }, { id: 'limpieza' }, { id: 'otros' }];

describe('intereses', () => {
  it('alternar agrega y quita sin tocar el resto ni repetir', () => {
    expect(alternarInteres([], 'plomeria')).toEqual(['plomeria']);
    expect(alternarInteres(['plomeria', 'limpieza'], 'plomeria')).toEqual(['limpieza']);
    expect(alternarInteres(['plomeria'], 'limpieza')).toEqual(['plomeria', 'limpieza']);
  });

  it('solo se mandan ids de categorías que existen, sin repetidos', () => {
    expect(interesesValidos(['plomeria', 'plomeria', 'inventada', 'otros'], CATS)).toEqual(['plomeria', 'otros']);
    expect(interesesValidos('no es lista', CATS)).toEqual([]);
    expect(interesesValidos(null, CATS)).toEqual([]);
  });
});

describe('terminarOnboarding', () => {
  beforeEach(() => mockPost.mockReset());

  it('manda los intereses y marca el onboarding como completado; saltar manda lista vacía', async () => {
    mockPost.mockResolvedValue({ success: true });
    expect((await terminarOnboarding(['plomeria'])).ok).toBe(true);
    expect(mockPost).toHaveBeenLastCalledWith('/auth/onboarding', { interests: ['plomeria'], onboardingCompleted: true });
    await terminarOnboarding([]);
    expect(mockPost).toHaveBeenLastCalledWith('/auth/onboarding', { interests: [], onboardingCompleted: true });
  });

  it('un error se cuenta, no se toma por éxito', () => {
    expect(interpretarOnboarding({ success: false, message: 'Error del servidor' })).toEqual({ ok: false, mensaje: 'Error del servidor' });
    expect(interpretarOnboarding(null).ok).toBe(false);
    expect(interpretarOnboarding({ success: 'true' }).ok).toBe(false);
  });
});
