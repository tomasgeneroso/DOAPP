/**
 * Politicas con numero.
 *
 * Todo plazo o cantidad que aparece a la vez en el codigo y en los Terminos y
 * Condiciones vive aca, y en ningun otro lado. Antes cada numero estaba dos
 * veces -- una en el servicio que lo aplica y otra escrita a mano en el texto
 * legal -- y las dos copias se separaron sin que nadie lo notara: los terminos
 * decian 2 horas donde el codigo hacia 24, decian comision 8% donde el codigo
 * cobraba 10%, decian 7 dias para disputar donde el codigo daba un mes.
 *
 * Un documento legal que dice una cosa mientras el sistema hace otra es peor
 * que no tener documento: el usuario firmo lo que leyo.
 *
 * Como se usa:
 *   - El servicio importa la constante desde aca (o la re-exporta, si tenia
 *     nombre propio y hay tests que la buscan por ese nombre).
 *   - Los terminos (shared/legal/terms.*.ts) la interpolan en el texto, asi que
 *     cambiar el numero aca cambia el contrato que lee el usuario en el mismo
 *     deploy.
 *   - tests/legal/terminosSincronizados.test.ts verifica que cada clausula
 *     nombre el numero vigente. Si alguien reescribe una clausula con un
 *     literal, la suite lo marca.
 *
 * Este modulo es compartido con web y mobile: nada de imports de servidor.
 */

export const POLITICAS = {
  /**
   * Horas en awaiting_confirmation antes de que el contrato se confirme solo y
   * el escrow se libere al trabajador. T&C 7.6.
   */
  AUTO_CONFIRMACION_HORAS: 24,

  /**
   * Dias corridos despues de terminado el contrato en los que todavia se puede
   * abrir una disputa. Pasado eso, se considera aceptado. T&C 10.7.
   */
  DIAS_PARA_DISPUTAR: 7,

  /**
   * Reclamo directo. Cuando una parte abre un reclamo, la otra tiene estas
   * horas para responder y las dos para arreglarlo entre ellas (retirar,
   * devolver una parte, rehacer). Si se vence sin acuerdo, o si una parte lo
   * pide despues de que la otra ya respondio, interviene un administrador y
   * pasa a ser una disputa. El dinero queda congelado desde el primer minuto.
   * T&C 10.11.
   *
   * 72 y no menos: la mayoria de los problemas entre dos personas razonables se
   * arreglan con una conversacion, y la conversacion necesita que las dos
   * esten despiertas y disponibles. Un plazo de un dia obliga a escalar a
   * gente que se hubiera arreglado sola.
   */
  RECLAMO_DIRECTO_HORAS: 72,

  /** Horas antes del vencimiento del reclamo en que se avisa a las dos partes. */
  RECLAMO_DIRECTO_AVISO_HORAS_ANTES: 24,

  /**
   * En una disputa, dias que tiene cada parte para responder al ultimo mensaje
   * de la otra. Si no responde, pierde. T&C 10.10.
   */
  DISPUTA_DIAS_PARA_RESPONDER: 7,

  /** Dias antes del vencimiento en que se avisa a la parte en silencio. T&C 10.10. */
  DISPUTA_DIAS_PARA_AVISAR: 5,

  /**
   * Cuanto deberia tardar el equipo en resolver una disputa, contado desde que
   * se abrio. Interno: no es una promesa al usuario ni figura en los T&C, es
   * la vara con la que el panel de admin/soporte muestra cuanto lleva cada
   * una (verde hasta OBJETIVO, ambar hasta MAXIMO, rojo despues).
   *
   * Una disputa abierta es plata congelada de dos personas. Cuatro dias es
   * lo que tarda leer las dos versiones, mirar las fotos y decidir; cinco es
   * el tope. Si una parte no responde, la regla de silencio (7 dias) puede
   * estirarlo: ese caso el panel lo muestra aparte, no como demora del equipo.
   */
  DISPUTA_OBJETIVO_RESOLUCION_DIAS: 4,
  DISPUTA_MAXIMO_RESOLUCION_DIAS: 5,

  /**
   * Escalera de cancelaciones del trabajador. T&C 9.4.
   * Las cancelaciones se cuentan dentro de VENTANA_DIAS:
   *   1a  aviso
   *   2a  marca visible en el perfil por MARCA_VISIBLE_DIAS
   *   3a  suspension de postularse por SUSPENSION_3RA_DIAS (+ marca)
   *   4a+ suspension por SUSPENSION_4TA_DIAS (+ marca)
   * Dos escalones de suspension y no uno: la tercera todavia puede ser mala
   * suerte; la cuarta en tres meses es un patron.
   */
  CANCELACION_VENTANA_DIAS: 90,
  CANCELACION_MARCA_VISIBLE_DIAS: 90,
  CANCELACION_SUSPENSION_3RA_DIAS: 7,
  CANCELACION_SUSPENSION_4TA_DIAS: 14,

  /**
   * Horas antes del inicio hasta las cuales el cliente cancela con devolucion
   * del precio completo (menos la comision de publicacion). Con menos tiempo
   * que eso la cancelacion es tardia. T&C 9.2 y 9.3.
   *
   * El codigo tenia 2 aca mientras los terminos decian 24. Un trabajador al que
   * le cancelan tres horas antes ya perdio el dia; 24 es lo que firmo el
   * usuario y lo que hacen Uber y Airbnb.
   */
  CANCELACION_CLIENTE_HORAS_ANTES: 24,

  /**
   * En una cancelacion tardia con trabajador seleccionado, que parte del precio
   * va al trabajador. El resto vuelve al cliente. Sin trabajador seleccionado,
   * el precio vuelve entero al cliente. T&C 9.3.
   */
  CANCELACION_TARDIA_PARTE_TRABAJADOR: 0.5,

  /**
   * Si el cliente cancela ANTES de que un admin apruebe la publicacion, que
   * parte de la comision (con su IVA) retiene la plataforma. El resto de la
   * comision vuelve; el costo de pasarela no vuelve nunca. T&C 9.1.
   *
   * La mitad y no cero: publicar-y-cancelar a los dos minutos igual le costo
   * a la plataforma una revision, y si fuera gratis seria una forma de probar
   * tarjetas. La mitad y no todo: la publicacion no llego a existir. Con la
   * comision de hoy es 5% del precio con piso de EUR 1.
   */
  CANCELACION_EN_REVISION_PARTE_COMISION: 0.5,

  /**
   * Dias habiles sin cotizacion aceptada antes de pausar una publicacion
   * "a cotizar". T&C 6.6.
   */
  COTIZAR_DIAS_HABILES_ANTES_DE_PAUSAR: 10,

  /**
   * Ventana de la puntuacion publica.
   *
   * La reputacion que se muestra sale de las reseñas de los ultimos
   * RATING_VENTANA_DIAS, pero solo si en esa ventana hubo al menos
   * RATING_CONTRATOS_MINIMOS reseñas: con dos o tres, una mala tarde hunde a
   * alguien que trabaja bien hace años. Si no llega, se toma el ultimo año.
   *
   * Por que una ventana y no todo el historial: la gente cambia. Un trabajador
   * que mejoro arrastra para siempre sus primeros trabajos, y uno que se
   * abandono se escuda en los viejos. Noventa dias es lo que usan las
   * plataformas de reparto para el mismo problema.
   */
  RATING_VENTANA_DIAS: 90,
  RATING_VENTANA_LARGA_DIAS: 365,
  RATING_CONTRATOS_MINIMOS: 5,

  /**
   * Horas antes del inicio a partir de las cuales el trabajador CONTRATADO ve
   * la direccion exacta del trabajo. Antes de eso, y para todos los demas,
   * solo barrio y zona.
   *
   * Es lo que necesita para planificar el viaje, y ni una hora mas: la
   * direccion de una casa donde va a entrar un desconocido es el dato mas
   * sensible de toda la plataforma. Los datos de contacto (telefono, email)
   * no se muestran nunca entre usuarios; para eso esta el chat.
   */
  DIRECCION_VISIBLE_HORAS_ANTES: 48,
} as const;

export type PoliticaClave = keyof typeof POLITICAS;

/**
 * Dias que le quedan a la parte en silencio cuando llega el aviso.
 * Derivado, para que el texto legal no lo repita a mano.
 */
export const DISPUTA_AVISO_DIAS_ANTES =
  POLITICAS.DISPUTA_DIAS_PARA_RESPONDER - POLITICAS.DISPUTA_DIAS_PARA_AVISAR;

/**
 * Dias que se retiene el pago al trabajador despues de terminado el contrato,
 * antes de transferirlo. Igual al plazo para disputar, y derivado a proposito:
 * la promesa de "podes reclamar hasta 7 dias despues" solo es verdad si la
 * plata todavia esta aca el dia 7. Una transferencia bancaria no se cancela.
 *
 * Es el "periodo de seguridad" de Upwork (5 dias), con el numero nuestro.
 */
export const PAGO_TRABAJADOR_RETENCION_DIAS = POLITICAS.DIAS_PARA_DISPUTAR;
