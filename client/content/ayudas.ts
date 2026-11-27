/**
 * Las explicaciones de los botoncitos «i» de las pantallas (pedido del dueño, 2026-11-19: «agregar la i al lado de cosas como Mis trabajos, Mis publicaciones,
 * puntuaciones, etc. para mejor accesibilidad y experiencia del usuario»).
 *
 * Son BREVES (una o dos oraciones, sin jerga) y en positivo: dicen qué es y qué se puede hacer ahí. La clave es el nombre tal como se ve en la pantalla.
 * `tests/ayudasDeLaInterfaz.test.ts` exige que cada «i» usada en una pantalla tenga su texto acá y que ninguno sea más largo de lo que entra en el globo.
 */
export const LARGO_MAXIMO_DE_AYUDA = 220;

export const AYUDAS: Record<string, string> = {
  'Mis trabajos':
    'Acá ves los trabajos que publicaste y los que pediste hacer, con su calendario. Con una sola cuenta podés contratar y también ofrecer tus servicios.',
  'Mis publicaciones':
    'Los trabajos que publicaste vos. Ves el estado de cada uno, las propuestas que recibiste y elegís a quién contratar.',
  'Mis aplicaciones':
    'Los trabajos a los que te postulaste. Ves si tu propuesta fue vista, aceptada o si todavía espera respuesta.',
  'Mis contratos':
    'Un contrato nace cuando se elige a quién hace un trabajo. Acá seguís cada paso: inicio, entrega, confirmación y pago.',
  'Mis pagos':
    'Tus pagos hechos y recibidos. El dinero de un trabajo queda protegido y se libera cuando el trabajo se confirma.',
  'Propuestas':
    'Una propuesta es la oferta de quien quiere hacer un trabajo: precio, mensaje y fecha. Quien publicó elige cuál aceptar.',
  'Notificaciones':
    'Los avisos de tu cuenta: propuestas, mensajes, pagos y contratos. Aparecen acá apenas suceden.',
  'Configuración':
    'Tus datos, tu foto, la seguridad de tu cuenta, tus avisos y tu membresía, todo en un mismo lugar.',
  'Puntuación total':
    'El promedio de las calificaciones que te dejaron las personas con las que trabajaste. Cada contrato bien hecho suma a tu reputación.',
  'Puntuaciones':
    'Las calificaciones que recibís después de cada contrato: calidad del trabajo, puntualidad y cómo sos como persona. Una buena reputación te ayuda a conseguir más trabajos.',
  'Mi saldo':
    'Tu dinero en DOAPP: lo disponible para retirar y lo que está en espera de liberarse. Los retiros los pedís vos cuando quieras.',
  'Referidos':
    'Invitá a otras personas con tu código. Cuando completan su registro, vos sumás beneficios.',
  'Mis reclamos':
    'Si hubo un problema con un contrato, podés abrir un reclamo. Una persona de DOAPP interviene y el dinero queda protegido mientras tanto.',
  'Centro de ayuda':
    'Consultas, reportes y reclamos en un solo lugar. Escribinos cuando lo necesites y te respondemos.',
  // Lo que se publica es público: se dice dónde aparece y que lo puede encontrar un buscador o una IA que consulte la web (pedido del dueño, 2026-11-27).
  'Publicaciones del perfil':
    'Lo que publicás aparece en tu perfil. Es público: se ve sin cuenta y puede salir en Google o en respuestas de asistentes de IA que consultan la web.',
  'Artículos':
    'Un artículo sale en tu perfil y en el Blog de DOAPP. Es público: puede aparecer en Google o en respuestas de asistentes de IA que consultan la web.',
  'Blog':
    'Notas del equipo de DOAPP y artículos de la comunidad. Son públicos: pueden aparecer en Google o en respuestas de asistentes de IA que consultan la web.',
  'Publicar un trabajo':
    'Una vez aprobado, el trabajo se ve sin cuenta y puede aparecer en Google o en respuestas de IA. La calle y el número quedan reservados para quien contrates.',
  'Trabajo publicado':
    'Mientras está abierto, un trabajo es público y puede aparecer en Google o en respuestas de asistentes de IA que consultan la web.',
  'Etiquetas':
    'Agrupan trabajos, publicaciones y artículos. Tocá una para ver todo lo que la usa y las relacionadas. También podés escribir #etiqueta en el buscador.',
  'Trabajos realizados':
    'Los trabajos terminados en que participaste, separados en los que ya compartiste en tu perfil y los que todavía no.',
  'Origen y destino':
    'Para mudanzas, fletes y mandados. De cada dirección se publica la zona; la calle y el número se comparten con quien contrates.',
  'Chats cerrados':
    'El chat de un equipo se cierra cuando el trabajo termina o se cancela. Se puede leer durante el plazo para reclamar y después se borra.',
  'Antes y después':
    'Fotos de cómo estaba y cómo quedó. Van al perfil de quien publica y son públicas. Si muestran personas o datos personales, pedí a soporte que se retiren.',
};
