/**
 * Qué NO puede decir el texto de una publicación.
 *
 * Una publicación no es un mensaje de chat: la lee cualquiera, incluso sin
 * cuenta. Por eso las reglas son más duras que las del chat
 * (shared/chat/contactFilter.ts), y por tres motivos distintos:
 *
 *   Teléfono y correo. En el chat se toleran los números ambiguos porque ahí
 *   se negocia el precio y frenar un "te cobro 15.000" es peor que dejar pasar
 *   un teléfono. En una publicación no hay tal cosa: el precio va en su campo,
 *   no en la descripción. Un número de diez dígitos suelto acá es un teléfono.
 *
 *   La dirección exacta. Es la regla de la plataforma: la ve solo el trabajador
 *   contratado, 48 h antes de empezar. Escribirla en la descripción la publica
 *   para todo internet, junto con el dato de que ese día no va a haber nadie en
 *   casa o de que sí lo va a haber. Es el peor dato que se puede filtrar, y se
 *   filtra sin querer: alguien copia y pega la dirección donde no va.
 *
 *   Y el motivo de siempre: arreglar por fuera deja a los dos sin escrow, sin
 *   disputa y sin reputación.
 *
 * Esto NO es un muro. Quien quiera evadirlo lo evade ("once, quince..."). Es
 * fricción deliberada para el caso mayoritario, que no es el que evade sino el
 * que no pensó que la descripción es pública.
 */

export type DatoProhibido = 'telefono' | 'email' | 'direccion';

export interface HallazgoPublico {
  tipo: DatoProhibido;
  /** El fragmento, para poder mostrárselo a quien escribió. */
  texto: string;
  /** En qué campo apareció. */
  campo: string;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_HABLADO = /[a-z0-9._%+-]+\s+arroba\s+[a-z0-9.-]+\s+punto\s+[a-z]{2,}/gi;

/** Una tira de 8 a 13 dígitos, con o sin separadores. */
const TIRA = /[\d][\d\s.\-()]{6,}[\d]|\d{8,13}/g;

/** Escrito como precio: 40.000 / 1.250.000 / 10,50. Eso sí puede ir. */
const FORMATO_MILES = /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/;

/**
 * Una dirección con altura: "Av. Corrientes 1234", "calle Belgrano 55",
 * "Rivadavia nro 890", "Mitre n° 1200", "altura 3400".
 *
 * Pide la palabra Y el número juntos a propósito. Sin el número, "estoy en la
 * calle Corrientes" o "trabajo en altura" son frases comunes que no dicen
 * dónde vive nadie; con el número, ya es una puerta.
 */
const DIRECCION_CON_ALTURA =
  /\b(?:calle|av\.?|avda\.?|avenida|pasaje|pje\.?|diagonal|diag\.?|ruta|camino|boulevard|bv\.?|blvd\.?)\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9.'"-]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9.'"-]+){0,3}\s+(?:n[°ºro.]*\s*)?\d{1,5}\b/gi;

/** "altura 1234", "nro 890", "n° 55": la altura sola ya alcanza para ubicar. */
const ALTURA_SUELTA = /\b(?:altura|nro\.?|n[°º])\s*\d{2,5}\b/gi;

/**
 * Piso y departamento. Solos no ubican a nadie, pero nunca aparecen si no es
 * para completar una dirección, así que valen como señal.
 */
const PISO_DEPTO = /\b(?:piso\s*\d{1,3}|(?:depto|dpto|departamento)\s*\.?\s*[0-9a-z]{1,4})\b/gi;

function digitos(s: string): number {
  return (s.match(/\d/g) || []).length;
}

function buscar(re: RegExp, texto: string, tipo: DatoProhibido, campo: string): HallazgoPublico[] {
  const out: HallazgoPublico[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    out.push({ tipo, texto: m[0].trim(), campo });
    // Un regex global sobre un match vacío no avanza: sin esto se cuelga.
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/** Revisa UN campo. */
export function revisarCampo(texto: unknown, campo: string): HallazgoPublico[] {
  const t = String(texto ?? '');
  if (!t.trim()) return [];

  const hallazgos: HallazgoPublico[] = [
    ...buscar(EMAIL, t, 'email', campo),
    ...buscar(EMAIL_HABLADO, t, 'email', campo),
    ...buscar(DIRECCION_CON_ALTURA, t, 'direccion', campo),
    ...buscar(ALTURA_SUELTA, t, 'direccion', campo),
    ...buscar(PISO_DEPTO, t, 'direccion', campo),
  ];

  // Teléfonos: cualquier tira de 8 a 13 dígitos que no esté escrita como
  // precio. Sin la excepción por contexto que sí tiene el chat: acá el precio
  // tiene su propio campo y no hay por qué escribirlo en la descripción.
  TIRA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIRA.exec(t)) !== null) {
    const frag = m[0].trim();
    const n = digitos(frag);
    if (n < 8 || n > 13) continue;
    if (FORMATO_MILES.test(frag)) continue;
    // No repetir lo que ya se detectó como parte de un correo o una dirección.
    if (hallazgos.some((h) => h.texto.includes(frag) || frag.includes(h.texto))) continue;
    if (hallazgos.some((h) => h.tipo === 'telefono' && h.texto === frag)) continue;
    hallazgos.push({ tipo: 'telefono', texto: frag, campo });
  }

  return hallazgos;
}

/** Revisa todos los campos de texto libre de una publicación. */
export function revisarPublicacion(campos: Record<string, unknown>): HallazgoPublico[] {
  return Object.entries(campos).flatMap(([campo, valor]) => revisarCampo(valor, campo));
}

const NOMBRE_DE_CAMPO: Record<string, string> = {
  title: 'el título',
  summary: 'el resumen',
  description: 'la descripción',
  requirements: 'los requisitos',
  tasks: 'las tareas',
};

/**
 * El mensaje para quien escribió. Dice qué se encontró y dónde, porque un
 * rechazo sin explicación hace que la persona reescriba a ciegas o se vaya.
 */
export function mensajeDeRechazo(hallazgos: HallazgoPublico[]): string {
  const tipos = new Set(hallazgos.map((h) => h.tipo));
  const campos = [...new Set(hallazgos.map((h) => NOMBRE_DE_CAMPO[h.campo] || h.campo))];
  const ejemplos = [...new Set(hallazgos.map((h) => h.texto))].slice(0, 3);

  const que: string[] = [];
  if (tipos.has('telefono')) que.push('un teléfono');
  if (tipos.has('email')) que.push('un correo');
  if (tipos.has('direccion')) que.push('una dirección');

  const lista = que.length > 1 ? `${que.slice(0, -1).join(', ')} y ${que[que.length - 1]}` : que[0];

  const porQue = tipos.has('direccion')
    ? 'La dirección exacta se la mostramos solo al trabajador que contrates, 48 horas antes de empezar: si la escribís acá queda publicada para cualquiera.'
    : 'La publicación la ve cualquier persona, y arreglar por fuera de la app te deja sin pago protegido, sin reclamo y sin reseñas.';

  return (
    `Parece que hay ${lista} en ${campos.join(' y ')} (${ejemplos.map((e) => `"${e}"`).join(', ')}). ` +
    `${porQue} Sacalo y volvé a intentar: vas a poder coordinar todo por el chat de la app.`
  );
}
