jest.mock('../services/api', () => ({
  __esModule: true,
  get: jest.fn(),
  post: jest.fn(),
  del: jest.fn(),
  getImageUrl: (p?: string | null) => (!p ? undefined : p.startsWith('http') ? p : `https://x.test${p}`),
}));
import { del, post } from '../services/api';
import {
  autorDe,
  borrarComentario,
  comentar,
  imagenesDeGaleria,
  leerComentarios,
  leerMeGusta,
  puedeBorrarComentario,
  validarComentario,
  LIMITE_COMENTARIO,
} from '../services/publicaciones';

const mockPost = post as jest.Mock;
const mockDel = del as jest.Mock;

describe('autorDe', () => {
  it('el id sale de authorUser porque `author` viene sin id', () => {
    const a = autorDe({ author: { name: 'Ana', avatar: '/uploads/a.jpg', rating: 4.6 }, authorUser: { id: 'u-1', name: 'Ana' } });
    expect(a).toMatchObject({ id: 'u-1', name: 'Ana', avatar: 'https://x.test/uploads/a.jpg', rating: 4.6 });
  });

  it('sin autor no inventa un id (el perfil no se abre a «undefined»)', () => {
    expect(autorDe({}).id).toBeUndefined();
    expect(autorDe(null).name).toBe('Usuario');
  });

  it('un puntaje en cero no se muestra como estrella', () => {
    expect(autorDe({ author: { name: 'Ana', rating: 0 } }).rating).toBeUndefined();
  });
});

describe('imagenesDeGaleria', () => {
  it('acepta texto o { url }, completa las rutas relativas y deja afuera videos y vacíos', () => {
    const g = [{ url: '/uploads/1.jpg', type: 'image' }, '/uploads/2.jpg', { url: '/uploads/v.mp4', type: 'video' }, { url: '' }, null, { url: 'https://cdn.test/3.png' }];
    expect(imagenesDeGaleria({ gallery: g })).toEqual(['https://x.test/uploads/1.jpg', 'https://x.test/uploads/2.jpg', 'https://cdn.test/3.png']);
    expect(imagenesDeGaleria({ gallery: 'raro' })).toEqual([]);
    expect(imagenesDeGaleria(undefined)).toEqual([]);
  });
});

describe('comentarios', () => {
  const crudo = { id: 'c-1', content: 'Muy bueno', createdAt: '2026-10-01', author: { name: 'Bruno' }, authorUser: { id: 'u-2', name: 'Bruno', avatar: '/uploads/b.jpg' } };

  it('los lee con el id del autor de authorUser', () => {
    expect(leerComentarios({ success: true, comments: [crudo, { id: 'sin-texto' }, null] })).toEqual([
      { id: 'c-1', content: 'Muy bueno', createdAt: '2026-10-01', autorId: 'u-2', autor: 'Bruno', avatar: 'https://x.test/uploads/b.jpg' },
    ]);
  });

  it('una respuesta fallida es null, no una lista vacía', () => {
    expect(leerComentarios({ success: false })).toBeNull();
    expect(leerComentarios({ success: true })).toBeNull();
  });

  it('solo el autor puede borrar', () => {
    const c = leerComentarios({ success: true, comments: [crudo] })![0];
    expect(puedeBorrarComentario(c, 'u-2')).toBe(true);
    expect(puedeBorrarComentario(c, 'u-9')).toBe(false);
    expect(puedeBorrarComentario(c, undefined)).toBe(false);
    expect(puedeBorrarComentario({ ...c, autorId: undefined }, 'u-2')).toBe(false);
  });

  it('valida el texto antes de mandarlo', () => {
    expect(validarComentario('   ')).toMatchObject({ ok: false });
    expect(validarComentario('x'.repeat(LIMITE_COMENTARIO + 1))).toMatchObject({ ok: false });
    expect(validarComentario('  hola  ')).toEqual({ ok: true, texto: 'hola' });
  });
});

describe('comentar y borrar', () => {
  beforeEach(() => { mockPost.mockReset(); mockDel.mockReset(); });

  it('manda el texto recortado y devuelve el comentario del servidor', async () => {
    mockPost.mockResolvedValue({ success: true, comment: { id: 'c-9', content: 'hola', authorUser: { id: 'u-1', name: 'Ana' } } });
    const r = await comentar('p-1', '  hola ');
    expect(mockPost).toHaveBeenCalledWith('/posts/p-1/comments', { content: 'hola' });
    expect(r).toMatchObject({ ok: true, comentario: { id: 'c-9', autorId: 'u-1' } });
  });

  it('un comentario vacío no llega al servidor y un rechazo no se toma por publicado', async () => {
    expect((await comentar('p-1', '  ')).ok).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    mockPost.mockResolvedValue({ success: false, message: 'Publicación no encontrada' });
    expect(await comentar('p-1', 'hola')).toEqual({ ok: false, mensaje: 'Publicación no encontrada' });
    mockPost.mockResolvedValue({ success: true, comment: null });
    expect((await comentar('p-1', 'hola')).ok).toBe(false);
  });

  it('borrar cuenta el error del servidor', async () => {
    mockDel.mockResolvedValue({ success: false, message: 'No autorizado para eliminar este comentario' });
    expect(await borrarComentario('p-1', 'c-1')).toEqual({ ok: false, mensaje: 'No autorizado para eliminar este comentario' });
    mockDel.mockResolvedValue({ success: true });
    expect((await borrarComentario('p-1', 'c-1')).ok).toBe(true);
    expect(mockDel).toHaveBeenLastCalledWith('/posts/p-1/comments/c-1');
  });
});

describe('leerMeGusta', () => {
  it('toma lo que cuenta el servidor', () => {
    expect(leerMeGusta({ success: true, liked: true, likesCount: 7 })).toEqual({ liked: true, likesCount: 7 });
    expect(leerMeGusta({ success: true, liked: false, likesCount: -3 })).toEqual({ liked: false, likesCount: 0 });
  });

  it('sin respuesta clara no cambia nada', () => {
    expect(leerMeGusta({ success: false })).toBeNull();
    expect(leerMeGusta({ success: true })).toBeNull();
    expect(leerMeGusta(undefined)).toBeNull();
  });
});
