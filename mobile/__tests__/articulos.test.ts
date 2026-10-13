jest.mock('../services/api', () => ({
  __esModule: true,
  get: jest.fn(),
  getImageUrl: (p?: string | null) => (!p ? undefined : p.startsWith('http') ? p : `https://x.test${p}`),
}));
import { get } from '../services/api';
import {
  armarConsulta,
  decodificarEntidades,
  etiquetaDeCategoria,
  htmlABloques,
  leerArticulo,
  leerCategorias,
  leerPagina,
  listarArticulos,
  traerArticulo,
} from '../services/articulos';

const mockGet = get as jest.Mock;

const oficial = {
  id: 'a1', title: 'Cómo elegir un gasista', subtitle: 'Guía', slug: 'como-elegir-un-gasista', excerpt: 'Resumen', coverImage: '/uploads/blog/c.png',
  tags: ['gas', 'consejos'], category: 'Consejos', views: 12, readingTime: 4, postType: 'official', publishedAt: '2026-09-01', creator: { id: 'u-1', name: 'Equipo DOAPP' },
};

describe('leerPagina', () => {
  it('lee la lista con su paginado y completa la portada', () => {
    const r = leerPagina({ success: true, posts: [oficial, { sin: 'titulo' }, null], pagination: { page: 2, pages: 5, total: 47 } });
    expect(r?.articulos).toHaveLength(1);
    expect(r?.articulos[0]).toMatchObject({ slug: 'como-elegir-un-gasista', coverImage: 'https://x.test/uploads/blog/c.png', autor: 'Equipo DOAPP', readingTime: 4 });
    expect(r).toMatchObject({ pagina: 2, paginas: 5, total: 47 });
  });

  it('una respuesta fallida es null, no una lista vacía', () => {
    expect(leerPagina({ success: false })).toBeNull();
    expect(leerPagina({ success: true })).toBeNull();
    // aunque traiga artículos: sin success no se muestra nada
    expect(leerPagina({ success: false, posts: [oficial] })).toBeNull();
  });

  it('el tiempo de lectura nunca baja de 1 minuto ni es NaN', () => {
    expect(leerPagina({ success: true, posts: [{ ...oficial, readingTime: 0 }] })?.articulos[0].readingTime).toBe(1);
    expect(leerPagina({ success: true, posts: [{ ...oficial, readingTime: 'x' }] })?.articulos[0].readingTime).toBe(1);
  });
});

describe('leerArticulo / categorías', () => {
  it('trae el contenido y el autor', () => {
    const a = leerArticulo({ success: true, post: { ...oficial, content: '<p>Hola</p>', creator: { id: 'u-1', name: 'Equipo', bio: 'Somos DOAPP' } } });
    expect(a).toMatchObject({ content: '<p>Hola</p>', autorId: 'u-1', autorBio: 'Somos DOAPP' });
  });

  it('un artículo de la comunidad sin contenido no rompe', () => {
    expect(leerArticulo({ success: true, post: { ...oficial, content: undefined, postType: 'user' } })?.content).toBe('');
    expect(leerArticulo({ success: false, post: oficial })).toBeNull();
    expect(leerArticulo({ success: true })).toBeNull();
  });

  it('categorías', () => {
    expect(leerCategorias({ success: true, categories: [{ name: 'comunidad', count: '3' }, { count: 1 }] })).toEqual([{ nombre: 'comunidad', cantidad: 3 }]);
    expect(leerCategorias({ success: true })).toBeNull();
    expect(etiquetaDeCategoria('comunidad')).toBe('Comunidad');
  });
});

describe('armarConsulta y llamadas', () => {
  beforeEach(() => mockGet.mockReset());

  it('escapa lo que escribe la persona y acota la página', () => {
    expect(armarConsulta({})).toBe('page=1&limit=10');
    expect(armarConsulta({ categoria: 'comunidad', busqueda: ' gas & luz ', pagina: 3 })).toBe('page=3&limit=10&category=comunidad&search=gas%20%26%20luz');
    expect(armarConsulta({ pagina: -4 })).toBe('page=1&limit=10');
    expect(armarConsulta({ busqueda: '   ' })).toBe('page=1&limit=10');
  });

  it('lee sin sesión y escapa el slug', async () => {
    mockGet.mockResolvedValue({ success: true, posts: [], pagination: {} });
    await listarArticulos({ busqueda: 'a' });
    expect(mockGet).toHaveBeenCalledWith('/blogs?page=1&limit=10&search=a', false);
    mockGet.mockResolvedValue({ success: false, status: 404 });
    expect(await traerArticulo('../admin')).toBeNull();
    expect(mockGet).toHaveBeenLastCalledWith('/blogs/..%2Fadmin', false);
  });
});

describe('htmlABloques', () => {
  it('separa títulos, párrafos, listas y citas', () => {
    const html = '<h2>Primero</h2><p>Texto con <b>negrita</b> y <a href="x">enlace</a>.</p><ul><li>Uno</li><li>Dos</li></ul><blockquote>Una cita</blockquote>';
    expect(htmlABloques(html)).toEqual([
      { tipo: 'titulo', texto: 'Primero' },
      { tipo: 'parrafo', texto: 'Texto con negrita y enlace.' },
      { tipo: 'item', texto: 'Uno' },
      { tipo: 'item', texto: 'Dos' },
      { tipo: 'cita', texto: 'Una cita' },
    ]);
  });

  it('decodifica entidades y respeta los saltos de línea', () => {
    expect((htmlABloques('<p>Tom&aacute;s &amp; Ana&nbsp;&#169;<br>otra línea &#x41;</p>')[0] as { texto: string }).texto).toBe('Tom&aacute;s & Ana ©\notra línea A');
    expect(decodificarEntidades('&lt;b&gt; &quot;x&quot; &#39;y&#39; &#0; &#99999999;')).toBe('<b> "x" \'y\' &#0; &#99999999;');
  });

  it('no muestra scripts, estilos ni comentarios', () => {
    expect(htmlABloques('<p>Hola</p><script>alert(1)</script><style>p{}</style><!-- oculto --><p>Chau</p>')).toEqual([
      { tipo: 'parrafo', texto: 'Hola' },
      { tipo: 'parrafo', texto: 'Chau' },
    ]);
  });

  it('lo que está escrito dentro de un script no se convierte en contenido', () => {
    const b = htmlABloques('<p>Hola</p><script>document.write("<img src=\'/uploads/x.png\'><h2>Intruso</h2>")</script><p>Chau</p>');
    expect(b).toEqual([{ tipo: 'parrafo', texto: 'Hola' }, { tipo: 'parrafo', texto: 'Chau' }]);
  });

  it('las imágenes: solo http(s) o la carpeta de archivos propia', () => {
    const b = htmlABloques('<p>Antes</p><img src="/uploads/blog/x.png" alt="Una &amp; otra"><img src="javascript:alert(1)"><img src="data:image/png;base64,AAAA"><img src="https://cdn.test/y.jpg"><p>Después</p>');
    expect(b).toEqual([
      { tipo: 'parrafo', texto: 'Antes' },
      { tipo: 'imagen', url: 'https://x.test/uploads/blog/x.png', descripcion: 'Una & otra' },
      { tipo: 'imagen', url: 'https://cdn.test/y.jpg', descripcion: undefined },
      { tipo: 'parrafo', texto: 'Después' },
    ]);
  });

  it('texto plano: los párrafos se separan por líneas en blanco', () => {
    expect(htmlABloques('Uno\ncontinúa\n\nDos')).toEqual([{ tipo: 'parrafo', texto: 'Uno continúa' }, { tipo: 'parrafo', texto: 'Dos' }]);
  });

  it('vacío o raro no rompe', () => {
    expect(htmlABloques('')).toEqual([]);
    expect(htmlABloques(undefined)).toEqual([]);
    expect(htmlABloques(42)).toEqual([]);
    expect(htmlABloques('<p></p><p>  </p>')).toEqual([]);
    expect((htmlABloques('<p>2 < 3 y 5 > 4</p>')[0] as { texto: string }).texto).toBe('2 < 3 y 5 > 4');
  });
});
