/**
 * Con protección de pago, o sin ella.
 *
 * Todo lo que define el módulo de "pago al terminar" vive acá: el nombre del
 * módulo, los dos modos, los plazos, y —lo más importante— la regla de hasta
 * dónde responde DOAPP. Servidor, web y mobile leen de este archivo.
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
 * Los tres momentos donde hay que avisar, y qué dice cada uno.
 *
 * Están acá y no en los componentes porque son la misma promesa dicha tres
 * veces: si divergen, la aplicación está diciendo tres cosas distintas sobre
 * lo mismo.
 *
 * Tono: describir el riesgo, no asustar ni desalentar. Quien elige este modo
 * suele tener un motivo razonable —hay rubros donde nadie paga por
 * adelantado—; lo que no puede pasar es que se entere después.
 */
export const AVISOS_SIN_PROTECCION = {
  /** Al ver la publicación, antes de decidir si interesa. */
  publicacion: {
    titulo: 'Este trabajo se paga al terminar',
    cuerpo:
      'No hay dinero retenido por DOAPP. El cliente paga cuando el trabajo está hecho, ' +
      'a través de una orden de pago que se genera en ese momento.',
  },
  /** Al postularse: es la última pantalla antes de comprometer tiempo. */
  postulacion: {
    titulo: 'Antes de postularte, tené esto claro',
    cuerpo:
      'En este trabajo no hay pago retenido. Si el cliente no paga la orden al terminar, ' +
      'DOAPP no tiene fondos para liberarte. Podemos mediar únicamente si el pago se hizo ' +
      'por la orden de la aplicación.',
  },
  /** Al contratar: es el momento en que las dos partes quedan obligadas. */
  contratacion: {
    titulo: 'Contrato sin protección de pago',
    cuerpo:
      'Al aceptar, las dos partes acuerdan que el pago se hace al terminar, por la orden que ' +
      'genera la aplicación. Mientras tanto no hay dinero retenido. Si se paga por fuera de la ' +
      'orden, DOAPP no interviene en un eventual reclamo.',
  },
} as const;

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
