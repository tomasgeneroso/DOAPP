/**
 * Datos personales que no tienen que salir de DOAPP (hacia Google Analytics, cabeceras de pedidos a terceros) ni quedar enteros en un registro.
 *
 * Qué motivó esto (auditoría del 2026-11-06): la analítica de la web le entregaba a Google la dirección de cada pantalla CON su query
 * (`/reset-password?token=…`, `/verify-email?token=…`, `/auth/callback?token=<sesión>`, `/invitacion/<código>`), el registro del servidor
 * escribía el correo de cada destinatario, y la app mandaba un correo adentro del `User-Agent` de un pedido a OpenStreetMap.
 *
 * Una sola fuente para web, app y servidor; `tests/datosPersonalesAfuera.test.ts` vigila que no vuelva.
 */

const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** 7 o más dígitos, juntos o separados por espacios, guiones, puntos o paréntesis: un teléfono, un DNI, un CBU. */
const NUMERO_LARGO = /(?:\+?\d[\s().-]?){7,}/g;

/** «juan.perez@gmail.com» → «j***@gmail.com»: se ve de quién se habla sin guardar la dirección. Acepta una lista («a@x.com, b@y.com»). */
export function enmascararCorreo(correo: unknown): string {
  if (Array.isArray(correo)) return correo.map(enmascararCorreo).join(', ');
  const texto = String(correo ?? '').trim();
  if (texto.includes(',')) return texto.split(',').map(enmascararCorreo).join(', ');
  const arroba = texto.lastIndexOf('@');
  if (arroba < 1 || arroba === texto.length - 1) return '***';
  return `${texto[0]}***${texto.slice(arroba)}`;
}

/** «+54 9 11 2233-4455» → «***4455»: los últimos cuatro dígitos alcanzan para reconocerlo. */
export function enmascararTelefono(telefono: unknown): string {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  return digitos.length < 5 ? '***' : `***${digitos.slice(-4)}`;
}

/**
 * Texto que escribió una persona (una búsqueda, un mensaje de error) listo para salir hacia un tercero:
 * los correos y los números largos se reemplazan, y se corta a `max` caracteres.
 */
export function limpiarTextoLibre(valor: unknown, max = 100): string {
  return String(valor ?? '').replace(CORREO, '[correo]').replace(NUMERO_LARGO, '[número]').trim().slice(0, max);
}

/** Campos de un evento de analítica donde cae lo que escribió una persona (una búsqueda, un mensaje de error, un título). */
export const CAMPOS_DE_TEXTO_LIBRE: readonly string[] = [
  'event_label',
  'search_term',
  'content_value',
  'description',
  'filter_value',
  'item_location',
  'location',
  'page_title',
];

/**
 * Parámetros de un evento de analítica con el texto libre limpio. No toca lo demás (importes, ids, porcentajes: un `price_range`
 * de «50000-100000» no es un teléfono) y entra a las listas de `items`.
 */
export function parametrosSinDatos<T extends Record<string, unknown>>(parametros: T): T {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(parametros)) {
    if (typeof valor === 'string' && CAMPOS_DE_TEXTO_LIBRE.includes(clave)) salida[clave] = limpiarTextoLibre(valor);
    else if (Array.isArray(valor)) {
      salida[clave] = valor.map((x) => (x && typeof x === 'object' ? parametrosSinDatos(x as Record<string, unknown>) : x));
    } else salida[clave] = valor;
  }
  return salida as T;
}

/** Un tramo de la ruta que contiene un correo (`/usuario/ana@correo.com`, también codificado) no sale tal cual. */
function tramoSinCorreo(tramo: string): string {
  let decodificado = tramo;
  try {
    decodificado = decodeURIComponent(tramo);
  } catch {
    /* un % mal formado: se mira el texto como vino */
  }
  return decodificado.includes('@') ? ':correo' : tramo;
}

/**
 * La dirección de una pantalla tal como se le cuenta a un tercero: solo la ruta.
 *  - Sin query (`?token=`, `?email=`, `?search=`) ni `#fragmento`: ahí viajan los secretos.
 *  - `/invitacion/<código>` → `/invitacion/:codigo` (el código es un beneficio de una sola persona).
 *  - Un tramo con un correo → `:correo`.
 */
export function direccionSinDatos(direccion: unknown): string {
  let ruta: string;
  try {
    ruta = new URL(String(direccion ?? ''), 'https://destino.invalido').pathname;
  } catch {
    return '/';
  }
  ruta = ruta.replace(/^\/invitacion\/[^/]+/i, '/invitacion/:codigo');
  return ruta.split('/').map(tramoSinCorreo).join('/') || '/';
}

/**
 * Parámetros de campaña que Google lee de la dirección para saber de dónde vino cada visita (qué anuncio, qué campaña).
 * No son datos personales y sin ellos la atribución se pierde en silencio: los únicos de la query que sobreviven.
 */
export const PARAMETROS_DE_CAMPANA: readonly string[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'gbraid', 'wbraid'];

/**
 * La dirección de la visita tal como se le cuenta a Google (`page_location`): origen y ruta limpia (`direccionSinDatos`) más SOLO los
 * parámetros de campaña. Cualquier otra cosa de la query (`?token=`, `?email=`, `?search=`) no sale. Un valor con un correo se descarta.
 * Recibe el `location` del navegador entero para que quien la llama no tenga que leer la query.
 */
export function ubicacionParaAnalitica(ubicacion: { origin: string; pathname: string; search?: string }): string {
  const buscados = new URLSearchParams(ubicacion.search ?? '');
  const campana = new URLSearchParams();
  for (const clave of PARAMETROS_DE_CAMPANA) {
    const valor = buscados.get(clave);
    if (valor && !valor.includes('@')) campana.set(clave, valor.slice(0, 200));
  }
  const query = campana.toString();
  return `${ubicacion.origin}${direccionSinDatos(ubicacion.pathname)}${query ? `?${query}` : ''}`;
}

/**
 * De dónde viene la visita (`document.referrer`) sin query ni fragmento. Una recarga completa justo después de entrar con Google
 * trae como referrer la pantalla de retorno con la sesión en la dirección: eso tampoco puede salir.
 * Vacío si no hay referrer o no es una dirección.
 */
export function referrerSinDatos(referrer: unknown): string {
  try {
    const u = new URL(String(referrer ?? ''));
    return u.origin + direccionSinDatos(u.pathname);
  } catch {
    return '';
  }
}
