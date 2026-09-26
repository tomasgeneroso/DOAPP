/**
 * Con protección de pago, o sin ella.
 *
 * Todo lo que define el módulo de "pago al terminar" vive acá: el nombre del
 * módulo, los dos modos, los plazos, los textos que se le muestran al usuario
 * y —lo más importante— la regla de hasta dónde responde DOAPP. Servidor, web
 * y mobile leen de este archivo.
 *
 * Está junto y en un solo lugar por una razón concreta: cada una de estas
 * afirmaciones aparece en los términos y condiciones, en un aviso antes de
 * postularse y en otro antes de contratar. Si el número vive en tres archivos,
 * en algún momento los tres dicen cosas distintas y la que vale legalmente es
 * la que leyó el usuario, no la que ejecuta el código. Ya pasó con la tabla de
 * comisiones.
 */

/** El módulo, tal como se llama en `module_configs`. Arranca apagado. */
export const MODULO_PAGO_AL_TERMINAR = 'payment:on_completion';

export type ModoDePago = 'escrow' | 'on_completion';

export const MODOS_DE_PAGO: ModoDePago[] = ['escrow', 'on_completion'];

export const MODO_POR_DEFECTO: ModoDePago = 'escrow';

export function esModoValido(v: unknown): v is ModoDePago {
  return typeof v === 'string' && (MODOS_DE_PAGO as string[]).includes(v);
}

/**
 * Pagar al terminar exige pasar por una cotización.
 *
 * Por qué no se puede publicar con precio fijo y pagar al final: sin protección
 * de pago no hay nada que respalde el acuerdo salvo el acuerdo mismo, así que
 * el acuerdo tiene que existir de verdad y tiene que estar detallado. Una
 * cotización —hecha por el trabajador, o pedida por el cliente— lista qué
 * incluye el precio antes de que nadie se comprometa.
 *
 * La diferencia práctica es grande. Con protección, si al final las partes no
 * coinciden en qué se había acordado, hay plata retenida y un administrador
 * puede repartirla. Sin protección no hay nada que repartir: lo único que queda
 * es el papel. Entonces el papel tiene que ser bueno.
 */
export const REQUIERE_COTIZACION: Record<ModoDePago, boolean> = {
  escrow: false,
  on_completion: true,
};

/**
 * Cuánto vive una orden de pago antes de vencer.
 *
 * Una orden abierta para siempre es un contrato que nunca cierra y plata que
 * nadie reclama. Siete días es tiempo de sobra para pagar algo que ya se
 * recibió, y corto como para que el trabajador sepa cuándo dejar de esperar.
 */
export const DIAS_PARA_PAGAR_LA_ORDEN = 7;

/** Cómo se paga una orden. Las dos existen y el cliente elige. */
export type MetodoDeOrden = 'mercadopago' | 'comprobante';

/**
 * Hasta dónde responde DOAPP en el modo sin protección.
 *
 * Esta función es la regla entera, y es deliberadamente corta: si alguna vez
 * hay que explicarla en un juicio, tiene que poder leerse de una sentada.
 *
 * DOAPP cobra comisión únicamente cuando el pago pasa por la orden de la
 * plataforma. Como la mediación de conflictos se financia con esa comisión, es
 * también el único caso en que está incluida. Un pago hecho por fuera —en
 * efectivo, por transferencia directa entre las partes, por cualquier vía que
 * la aplicación no vio— no genera comisión y no habilita reclamo: DOAPP no
 * tiene forma de saber qué se pagó ni de retener nada.
 *
 * No es una excusa para no responder: es la condición que hace que responder
 * sea posible.
 */
export function cubiertoPorDoapp(orden: {
  /** 'completed' o 'verified': el dinero entró y está confirmado. */
  estado?: string | null;
  /** Que el pago haya quedado asociado a ESTA orden, no a otra cosa. */
  confirmadoPorLaApp?: boolean | null;
}): boolean {
  if (!orden?.confirmadoPorLaApp) return false;
  return orden.estado === 'completed' || orden.estado === 'verified';
}

/**
 * Si se puede abrir un reclamo con intervención de DOAPP.
 *
 * En el modo con protección, siempre: hay fondos retenidos y un administrador
 * puede moverlos. En el modo sin protección, sólo si el pago pasó por la orden
 * y está verificado — antes de eso no hay nada que mediar ni con qué.
 *
 * Esto NO es una comodidad de la interfaz. El botón de reclamo tiene que estar
 * apagado de verdad, y el servidor tiene que rechazar el intento: una disputa
 * abierta sobre una operación que DOAPP no vio no se puede resolver de ninguna
 * manera, y dejarla abrir es prometer algo que después hay que incumplir a
 * mano, con alguien enojado del otro lado.
 */
export function puedeReclamar(contrato: {
  paymentMode?: string | null;
  /** El reflejo en el contrato. Pasa a 'completed' cuando la orden se confirma. */
  paymentStatus?: string | null;
  /** La orden, si el que pregunta la tiene a mano. */
  orden?: { estado?: string | null; confirmadoPorLaApp?: boolean | null } | null;
}): boolean {
  if (contrato?.paymentMode !== 'on_completion') return true;

  // Con la orden a mano se mira la orden, que es la fuente.
  if (contrato.orden) return cubiertoPorDoapp(contrato.orden);

  /**
   * Sin la orden —un listado, por ejemplo, donde pedirla por cada fila serían
   * veinte consultas— se mira el reflejo que quedó en el contrato. Es una sola
   * función y no dos para que no puedan decir cosas distintas: la de arriba es
   * la regla, esto es el atajo que se apoya en ella.
   */
  return contrato.paymentStatus === 'completed';
}

/** Lo que se dice cuando el reclamo está deshabilitado, y qué ofrecer en su lugar. */
export const RECLAMO_DESHABILITADO = {
  titulo: 'No disponible todavía',
  motivo:
    'Este trabajo se paga al terminar y no hay un pago confirmado. El reclamo se habilita ' +
    'cuando el cliente paga la orden desde la aplicación y el pago queda verificado.',
  /** Lo que ve el cliente: puede resolverlo él mismo. */
  accionCliente: 'Ir a pagar la orden',
  /** Lo que ve el trabajador: no depende de él, pero puede ver el estado. */
  accionTrabajador: 'Ver el estado de la orden',
} as const;

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export type Momento = 'publicacion' | 'postulacion' | 'contratacion';
export type Rol = 'cliente' | 'trabajador';

export interface Aviso {
  titulo: string;
  cuerpo: string;
}

/**
 * Los tres momentos donde hay que avisar, y qué dice cada uno.
 *
 * Están acá y no en los componentes porque son la misma promesa dicha tres
 * veces: si divergen, la aplicación está diciendo tres cosas distintas sobre
 * lo mismo.
 *
 * Varios tienen versión por rol. No es decoración: el cliente y el trabajador
 * no corren el mismo riesgo ni tienen la misma responsabilidad, y un texto
 * neutro termina siendo vago para los dos. Al cliente hay que decirle que él
 * es el responsable de pagar; al trabajador, qué le pasa si el cliente no lo
 * hace.
 *
 * Tono: describir el riesgo, no asustar ni desalentar. Quien elige este modo
 * suele tener un motivo razonable —hay rubros donde nadie paga por
 * adelantado—; lo que no puede pasar es que se entere después.
 */
export const AVISOS_SIN_PROTECCION: Record<
  Momento,
  { general: Aviso } & Partial<Record<Rol, Aviso>>
> = {
  /** Al ver la publicación, antes de decidir si interesa. Lo lee cualquiera. */
  publicacion: {
    general: {
      titulo: 'Este trabajo se paga al terminar',
      cuerpo:
        'No hay dinero retenido por DOAPP. El precio sale de una cotización que las dos partes ' +
        'aceptan, y el cliente paga cuando el trabajo está hecho, por una orden que se genera en ' +
        'ese momento.',
    },
  },

  /** Al postularse: la última pantalla antes de comprometer tiempo. */
  postulacion: {
    general: {
      titulo: 'Antes de postularte, tené esto claro',
      cuerpo:
        'Este trabajo se paga al terminar: no hay dinero retenido. El cliente es el responsable ' +
        'de hacer el pago cuando el trabajo esté hecho. Si lo hace por Mercado Pago desde la ' +
        'aplicación, tenés el respaldo de DOAPP para abrir un reclamo desde el momento en que ' +
        'ese pago se confirma. Si te paga por fuera, no podemos intervenir: no vimos la ' +
        'operación y no hay fondos que retener.',
    },
  },

  /** Al contratar: el momento en que las dos partes quedan obligadas. */
  contratacion: {
    general: {
      titulo: 'Contrato sin protección de pago',
      cuerpo:
        'El pago se hace al terminar, por la orden que genera la aplicación. Mientras tanto no ' +
        'hay dinero retenido. El reclamo con intervención de DOAPP se habilita desde que ese ' +
        'pago se confirma; si se paga por fuera de la orden, no podemos intervenir.',
    },
    cliente: {
      titulo: 'Vos sos responsable del pago',
      cuerpo:
        'Al aceptar te comprometés a pagar el precio cotizado cuando el trabajo esté hecho. Vas ' +
        'a recibir una orden de pago en la aplicación. Si pagás por ahí, las dos partes quedan ' +
        'con el respaldo de DOAPP para un reclamo desde que el pago se confirma. Si pagás por ' +
        'fuera de la orden, ni vos ni el trabajador pueden reclamar acá.',
    },
    trabajador: {
      titulo: 'Contrato sin protección de pago',
      cuerpo:
        'Al aceptar acordás que el pago se hace al terminar. Mientras tanto no hay dinero ' +
        'retenido y el cliente es el responsable de pagarlo. Vas a poder abrir un reclamo sólo ' +
        'si el pago se hizo por la orden de la aplicación y quedó confirmado.',
    },
  },
};

/** El aviso que corresponde, con el del rol si existe y el neutro si no. */
export function avisoSinProteccion(momento: Momento, rol?: Rol | null): Aviso {
  const entrada = AVISOS_SIN_PROTECCION[momento];
  if (rol && entrada[rol]) return entrada[rol] as Aviso;
  return entrada.general;
}

// ---------------------------------------------------------------------------
// Cómo funciona cada modo
// ---------------------------------------------------------------------------

export interface ComoFunciona {
  nombre: string;
  resumen: string;
  pasos: string[];
  /** La frase que responde "¿y si la otra parte falla?". */
  riesgo: string;
  /** Cuándo hay reclamo con DOAPP adentro. */
  reclamo: string;
}

/**
 * Los dos modos explicados al usuario, uno al lado del otro.
 *
 * Se muestran juntos y no por separado a propósito. Un usuario que ve sólo el
 * modo que está por elegir no tiene con qué compararlo, y la diferencia entre
 * los dos no es un detalle de implementación: es quién corre el riesgo. Eso
 * se entiende viendo los dos, no leyendo uno.
 */
export const COMO_FUNCIONA: Record<ModoDePago, ComoFunciona> = {
  escrow: {
    nombre: 'Pagás primero',
    resumen: 'El dinero queda guardado por DOAPP hasta que el trabajo está hecho.',
    pasos: [
      'Publicás el trabajo con un precio y lo abonás.',
      'DOAPP retiene ese dinero: ni vos lo tenés, ni el trabajador lo cobró.',
      'Elegís al trabajador y se hace el trabajo.',
      'Cuando las dos partes confirman que está terminado, el dinero se libera al trabajador.',
    ],
    riesgo:
      'Si el trabajo no se hace o se hace mal, el dinero sigue en DOAPP y se puede devolver.',
    reclamo: 'Siempre disponible: hay fondos retenidos que un administrador puede repartir.',
  },
  on_completion: {
    nombre: 'Pagás al terminar',
    resumen: 'No se retiene nada. El precio se acuerda por cotización y se paga al final.',
    pasos: [
      'Publicás el trabajo sin precio, o pedís una cotización.',
      'El trabajador cotiza con el detalle de qué incluye.',
      'Aceptás la cotización: ese es el precio acordado. No pagás nada todavía.',
      'Se hace el trabajo.',
      'Al terminar, la aplicación genera la orden de pago y la abonás ahí.',
    ],
    riesgo:
      'Si el cliente no paga, DOAPP no tiene fondos para liberarle al trabajador. El riesgo ' +
      'lo corre el trabajador, que ya hizo el trabajo.',
    reclamo:
      'Sólo desde que el pago se hace por la orden de la aplicación y queda confirmado. Un pago ' +
      'por fuera no se puede reclamar acá.',
  },
};

/** Lo que se muestra al lado del modo, en una tarjeta o un formulario. */
export const ETIQUETAS_MODO: Record<ModoDePago, { nombre: string; breve: string }> = {
  escrow: {
    nombre: 'Con protección de pago',
    breve: 'El dinero queda retenido hasta que el trabajo está hecho',
  },
  on_completion: {
    nombre: 'Se paga al terminar',
    breve: 'Sin dinero retenido: se paga cuando el trabajo está hecho',
  },
};
