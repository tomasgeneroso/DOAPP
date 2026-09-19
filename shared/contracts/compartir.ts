/**
 * Compartir un contrato con alguien de confianza.
 *
 * Antes de que entre un desconocido a tu casa, lo sensato es que otra persona
 * sepa quién viene, a qué hora y cómo verificarlo. Eso ya se hace por WhatsApp
 * con un mensaje improvisado; esto arma el mensaje con lo que importa y sin lo
 * que no hace falta.
 *
 * Qué se comparte y qué no, a propósito:
 *   SÍ   nombre, foto de perfil, nivel de verificación, hora y título del trabajo
 *   NO   teléfono, email ni documento del trabajador -- no son del cliente para
 *        repartir, y el contacto entre las partes va por el chat de la app
 *   NO   la dirección exacta: la pone quien comparte si quiere, en su mensaje.
 *        Es su casa, es su decisión, y no la agregamos nosotros por defecto.
 *
 * Devuelve texto plano para copiar o mandar por cualquier app. No genera
 * ningún link público: una página accesible con un token es una filtración
 * esperando un reenvío.
 */

export interface DatosParaCompartir {
  /** Cómo se llama quien va (trabajador) o quien contrató (cliente). */
  nombreDeLaOtraParte: string;
  /** 'trabajador' | 'cliente': a quién describe el mensaje. */
  rolDeLaOtraParte: 'trabajador' | 'cliente';
  tituloDelTrabajo: string;
  /** Inicio del trabajo. */
  cuando: Date | string | null;
  /** Barrio o zona. La dirección exacta no va. */
  zona?: string | null;
  /** 'none' | 'email' | 'phone' | 'document' | 'full'. */
  verificacion?: string | null;
  /** URL absoluta de la foto de perfil, si tiene. */
  foto?: string | null;
  /** URL del perfil público. */
  perfil?: string | null;
  /** Nombre de quien comparte, para que el mensaje se entienda. */
  quienComparte?: string | null;
}

const NIVELES: Record<string, string> = {
  none: 'sin verificar',
  email: 'email verificado',
  phone: 'teléfono verificado',
  document: 'documento verificado',
  full: 'identidad verificada (documento y teléfono)',
};

export function nivelDeVerificacion(v?: string | null): string {
  return NIVELES[String(v || 'none')] || NIVELES.none;
}

function fecha(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const f = new Date(d);
  if (isNaN(f.getTime())) return null;
  return f.toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function textoParaCompartir(d: DatosParaCompartir): string {
  const cuando = fecha(d.cuando);
  const quien = d.rolDeLaOtraParte === 'trabajador' ? 'Viene' : 'Trabajo para';
  const lineas = [
    `${quien} ${d.nombreDeLaOtraParte} por DOAPP.`,
    `Trabajo: ${d.tituloDelTrabajo}.`,
    cuando ? `Cuándo: ${cuando}.` : null,
    d.zona ? `Zona: ${d.zona}.` : null,
    `Verificación en DOAPP: ${nivelDeVerificacion(d.verificacion)}.`,
    d.foto ? `Foto de perfil: ${d.foto}` : null,
    d.perfil ? `Perfil: ${d.perfil}` : null,
    '',
    d.rolDeLaOtraParte === 'trabajador'
      ? 'Te lo mando para que sepas quién viene y a qué hora. Si algo pasa o no doy señales, llamame.'
      : 'Te lo mando para que sepas dónde estoy y con quién. Si algo pasa o no doy señales, llamame.',
  ];
  return lineas.filter((l) => l !== null).join('\n');
}

/** Lo que hay que decir siempre, en la pantalla y en los términos (T&C 11.3). */
export const AVISO_COMPARTIR =
  'Compartir esta información es una ayuda, no un control: DOAPP no verifica a quién se la mandás ni sigue el trabajo en tiempo real. ' +
  'No incluye el teléfono ni el documento de la otra persona, y la dirección exacta la agregás vos si querés.';
