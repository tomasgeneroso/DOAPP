/**
 * Detecta telefonos y correos en los mensajes del chat.
 *
 * Por que existe: si las partes se pasan el contacto y arreglan por fuera, la
 * plataforma pierde la comision -- pero, mas importante, los dos pierden todo
 * lo que la plataforma les daba. Sin contrato no hay escrow, no hay disputa, no
 * hay reputacion y no hay a quien reclamarle. El que mas pierde con un arreglo
 * por afuera es el usuario, y casi nunca se da cuenta hasta que algo sale mal.
 *
 * Que NO es esto: un muro. Cualquiera puede escribir "once, quince, veintitres"
 * y pasar igual. Es friccion deliberada, y alcanza: la mayoria de los desvios
 * no son deliberados, son alguien tipeando su numero sin pensarlo.
 *
 * El riesgo real de este filtro no es que se le escape un telefono, es que
 * bloquee un mensaje legitimo. Un precio de ARS 10.000.000, una direccion de
 * Av. Corrientes 1234, un DNI, una medida de 20x30x40. Por eso la deteccion es
 * conservadora a proposito: preferimos que pase un telefono antes que frenar a
 * alguien que estaba hablando de plata.
 */

export type ContactKind = 'telefono' | 'email';

export interface ContactMatch {
  kind: ContactKind;
  /** El fragmento detectado, para poder mostrarselo al usuario. */
  text: string;
}

/**
 * Correos.
 *
 * Se aceptan las formas evasivas mas comunes -- "juan arroba gmail punto com"
 * -- porque son faciles de detectar y quien las escribe sabe perfectamente lo
 * que esta haciendo.
 */
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const EMAIL_HABLADO = /[a-z0-9._%+-]+\s+arroba\s+[a-z0-9.-]+\s+punto\s+[a-z]{2,}/gi;

/**
 * Telefonos argentinos.
 *
 * Formas que cubre: +54 9 11 2345-6789, 011 15 2345 6789, 11 2345 6789,
 * 1123456789, 15-2345-6789. Todas tienen entre 8 y 13 digitos una vez que se
 * sacan los separadores.
 *
 * Lo que deliberadamente NO cubre: un numero pelado sin separadores de menos de
 * 8 digitos (seria un precio), y cualquier cosa con formato de miles.
 */
const TELEFONO = /(?:\+?54\s*)?(?:9\s*)?(?:\(?\d{2,4}\)?[\s.-]*)?(?:15[\s.-]*)?\d{3,4}[\s.-]*\d{4}\b/g;

/** Un numero escrito como precio: 40.000 / 1.250.000 / 10,50 */
const FORMATO_MILES = /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/;

/** Palabras que, cerca de un numero, dicen que es plata y no un telefono. */
const CONTEXTO_PLATA = /(?:\$|ars|pesos|usd|dolares|euros?|eur|precio|presupuesto|cotiz|cobro|pago|total|monto)/i;

/**
 * Palabras que dicen que es una direccion.
 *
 * "numero" quedo deliberadamente afuera: "mi numero es 11 2345 6789" es un
 * telefono, no una direccion, y era el caso que mas queriamos detectar. Para
 * direcciones alcanza con nro. y n°, que son inequivocos.
 */
const CONTEXTO_DIRECCION = /(?:calle|av\.?|avenida|piso|depto|departamento|altura|nro\.?|n[°º]|cp\b|codigo postal)/i;

function esPrecioODireccion(texto: string, match: string, indice: number): boolean {
  if (FORMATO_MILES.test(match.trim())) return true;

  // Se mira una ventana alrededor: "te cobro 1123456789" es sospechoso, pero
  // "el total es 1.123.456" no, y "Av. Rivadavia 1234" tampoco.
  const desde = Math.max(0, indice - 30);
  const ventana = texto.slice(desde, indice + match.length + 15);

  return CONTEXTO_PLATA.test(ventana) || CONTEXTO_DIRECCION.test(ventana);
}

/** Cuantos digitos tiene, ignorando separadores. */
function digitos(s: string): number {
  return (s.match(/\d/g) || []).length;
}

/**
 * Encuentra datos de contacto en un texto.
 *
 * Devuelve la lista de lo encontrado en vez de un booleano para poder decirle
 * al usuario exactamente que fue lo que se detecto: un mensaje rechazado sin
 * decir por que es peor que no tener filtro.
 */
export function findContactInfo(texto: string): ContactMatch[] {
  return analyzeMessage(texto).bloquear;
}

export interface MessageAnalysis {
  /** Datos de contacto claros: el mensaje no se envia. */
  bloquear: ContactMatch[];
  /**
   * Numeros con forma de telefono que se dejaron pasar por el contexto.
   *
   * Es la contracara de la proteccion contra falsos positivos: el que quiere
   * evadir escribe "te cobro 1123456789" y pasa, porque "cobro" hace que el
   * filtro lo lea como plata. No se puede cerrar sin bloquear precios
   * legitimos, que es peor.
   *
   * Entonces el mensaje se envia igual -- el usuario no se entera de nada --
   * pero queda marcado para que administracion lo revise. Un falso positivo
   * acá no le cuesta nada a nadie: sólo mirar.
   */
  revisar: ContactMatch[];
}

export function analyzeMessage(texto: string): MessageAnalysis {
  const encontrados: ContactMatch[] = [];
  const sospechosos: ContactMatch[] = [];
  const original = String(texto || '');
  if (!original.trim()) return { bloquear: encontrados, revisar: sospechosos };

  for (const re of [EMAIL, EMAIL_HABLADO]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(original)) !== null) {
      encontrados.push({ kind: 'email', text: m[0] });
    }
  }

  TELEFONO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TELEFONO.exec(original)) !== null) {
    const frag = m[0];
    const n = digitos(frag);

    // Menos de 8 digitos no es un telefono argentino; mas de 13 tampoco.
    if (n < 8 || n > 13) continue;
    // Un correo ya detectado puede contener digitos que el regex de telefono
    // vuelve a levantar.
    if (encontrados.some((e) => e.kind === 'email' && e.text.includes(frag.trim()))) continue;

    if (esPrecioODireccion(original, frag, m.index)) {
      // El formato de miles es inequivocamente un precio: ni se marca.
      if (!FORMATO_MILES.test(frag.trim())) {
        sospechosos.push({ kind: 'telefono', text: frag.trim() });
      }
      continue;
    }

    encontrados.push({ kind: 'telefono', text: frag.trim() });
  }

  return { bloquear: encontrados, revisar: sospechosos };
}

/** El mensaje que se le muestra a quien intento mandar un contacto. */
export function contactBlockedMessage(matches: ContactMatch[]): string {
  const tipos = new Set(matches.map((m) => m.kind));
  const que =
    tipos.has('telefono') && tipos.has('email')
      ? 'un teléfono y un correo'
      : tipos.has('telefono')
        ? 'un teléfono'
        : 'un correo';

  return (
    `Parece que estás compartiendo ${que}. Los datos de contacto se intercambian ` +
    'cuando el trabajo se confirma. Arreglar por afuera te deja sin pago protegido, ' +
    'sin sistema de disputas y sin respaldo si algo sale mal.'
  );
}
