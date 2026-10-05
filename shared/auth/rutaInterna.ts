/**
 * Un destino de navegación que viene de afuera, convertido en una ruta de ESTA
 * aplicación o en el valor por defecto. Nunca en otro sitio.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * La pantalla de login lee `?redirect=` de la URL y, al iniciar sesión, navega
 * ahí. Sin validar. Un enlace como
 *
 *     https://doapparg.com/login?redirect=//sitio-malo.com
 *
 * se ve legítimo (es el dominio verdadero, con el candado y todo), la víctima
 * pone su contraseña en el formulario verdadero, y al terminar la mandamos al
 * sitio de otro. Es el redireccionamiento abierto clásico, y su valor para quien
 * ataca es justamente que nace de una pantalla de login en la que se confía.
 *
 * react-router tiene un aviso publicado sobre lo mismo (`navigate` y `<Link>`
 * con barras invertidas) que sólo se cierra con la versión 7. Esta función no
 * depende de eso: valida del lado nuestro, así que protege con cualquier versión
 * y sigue protegiendo después de actualizar.
 *
 * ── Qué se acepta ───────────────────────────────────────────────────────────
 *
 * Sólo una ruta que empiece con UNA barra: `/blog/create`, `/disputes/new?x=1`.
 *
 * Qué se rechaza, y por qué cada cosa:
 *
 *  - `//host` y `/\host`: el navegador las toma como "mismo esquema, otro
 *    host". Es el ataque en sí.
 *  - Cualquier barra invertida: los navegadores la tratan como una barra, así
 *    que `/\host` y `\\host` equivalen a `//host`. Es el rodeo del aviso de
 *    react-router.
 *  - Tabulaciones, saltos de línea y demás caracteres de control: el parser de
 *    URLs del navegador los BORRA antes de interpretar, así que una tabulación
 *    entre las dos barras se convierte en `//host` después de pasar cualquier
 *    chequeo que mire el texto tal cual.
 *  - Los invisibles de Unicode (ancho cero, separadores de línea, marca de
 *    orden de bytes): por lo mismo, no se ven y se normalizan.
 *  - `https://…`, `javascript:…`, `data:…`: no empiezan con barra.
 *
 * `searchParams.get` ya decodificó el valor una vez, así que `%2F%2Fhost` llega
 * como `//host` y cae en la primera regla. No se decodifica de nuevo acá: lo que
 * se valida es exactamente lo que se va a usar.
 *
 * Se comparan códigos numéricos y no se usa una expresión regular a propósito:
 * los caracteres que importan son invisibles, y escritos como literales en el
 * fuente se pierden, se corrompen al guardar el archivo, o directamente rompen
 * la regex (U+2028 es un fin de línea para JavaScript).
 */
const LARGO_MAXIMO = 2048;

/** Barra invertida, y los invisibles que el navegador ignora o normaliza. */
const PROHIBIDOS = new Set<number>([
  0x5c, // \
  0x7f, // DEL
  0x85, // siguiente línea
  0x200b, // espacio de ancho cero
  0x200c,
  0x200d,
  0x200e,
  0x200f,
  0x2028, // separador de línea
  0x2029, // separador de párrafo
  0xfeff, // marca de orden de bytes
]);

function tieneCaracteresProhibidos(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    // 0x00-0x1f: caracteres de control, incluidos tabulación, salto de línea y
    // retorno de carro, que son los que el parser de URLs borra.
    if (codigo <= 0x1f || PROHIBIDOS.has(codigo)) return true;
  }
  return false;
}

export function rutaInternaSegura(destino: unknown, porDefecto = '/'): string {
  if (typeof destino !== 'string') return porDefecto;
  if (destino.length === 0 || destino.length > LARGO_MAXIMO) return porDefecto;

  // Tiene que ser una ruta, y de una sola barra.
  if (destino[0] !== '/') return porDefecto;
  if (destino[1] === '/') return porDefecto;

  if (tieneCaracteresProhibidos(destino)) return porDefecto;

  return destino;
}
