/**
 * Catálogo de problemas de dinero: cada cosa que puede salir mal al mover plata tiene un CÓDIGO estable, un texto para el usuario y una
 * guía para el admin (qué significa, por qué pasa, qué hacer y dónde mirar).
 *
 * Fuente única: la usan el servidor (para armar el aviso a administración y la respuesta), la web (modal del usuario y página
 * `/admin/guia-de-errores`) y el test que verifica que ningún código usado en el servidor falte acá.
 *
 * Antes el error que veía el usuario era «Balance calculation error», sin números, y el admin no tenía forma de saber cuál de las cuentas
 * era la que no cerraba. Ahora el mensaje trae los números y el código lleva a esta guía.
 */

export type GravedadDelProblema = 'alta' | 'media' | 'baja';

export interface PasoDeLaGuia {
  texto: string;
  /** Ruta de la web donde se hace el paso. */
  ruta?: string;
}

export interface ProblemaCatalogado {
  codigo: string;
  /** Para el admin: qué pasó, en pocas palabras. */
  titulo: string;
  /** Para el usuario: qué le pasó a SU plata y qué sigue, sin jerga. */
  paraElUsuario: string;
  queSignifica: string;
  causas: string[];
  queHacer: PasoDeLaGuia[];
  gravedad: GravedadDelProblema;
}

export const CATALOGO_DE_PROBLEMAS = {
  'RETIRO-CUENTA-NO-CIERRA': {
    codigo: 'RETIRO-CUENTA-NO-CIERRA',
    titulo: 'Un retiro no se pudo crear porque las cuentas no cierran',
    paraElUsuario: 'No pudimos crear tu retiro porque las cuentas de tu saldo no cerraron. Tu dinero está intacto. Ya avisamos a administración y lo va a revisar.',
    queSignifica:
      'Al pedir un retiro el sistema comprueba: saldo antes − saldo que se debita = saldo después. Si esa resta no da lo que se guardó, no crea el pedido para no registrar un movimiento que no cuadra. El mensaje trae los tres números.',
    causas: [
      'Hay una retención (comisión por devoluciones de publicaciones canceladas) y el saldo que se debita es mayor que lo que se transfiere. Si ves que la diferencia es justo la retención, es un error de cálculo del sistema, no del usuario.',
      'El saldo del usuario cambió entre que se leyó y que se guardó el pedido (dos pedidos a la vez).',
      'El saldo del usuario se tocó a mano en la base, sin dejar un asiento en el libro.',
    ],
    queHacer: [
      { texto: 'Abrí la auditoría de saldos y buscá al usuario: si «saldo» y «libro» difieren, primero resolvé eso (código SALDO-NO-CIERRA-LIBRO).', ruta: '/admin/auditoria-saldos' },
      { texto: 'Si el saldo cierra con el libro, comparalo con los números del mensaje: la diferencia entre «saldo antes» y «lo que se debita» tiene que ser la retención informada. Si no lo es, avisá al equipo técnico con el código y los números.' },
      { texto: 'Pedile al usuario que reintente. Si vuelve a fallar, no lo fuerces a mano: el retiro se puede cargar desde el panel solo cuando las cuentas cierran.', ruta: '/admin/withdrawals' },
    ],
    gravedad: 'media',
  },

  'SALDO-NO-CIERRA-LIBRO': {
    codigo: 'SALDO-NO-CIERRA-LIBRO',
    titulo: 'El saldo del usuario no coincide con la suma de sus movimientos',
    paraElUsuario: 'Por seguridad frenamos este movimiento: tenemos que revisar tu cuenta antes de mover dinero. Tu saldo no se modificó. Administración ya fue avisada.',
    queSignifica:
      'El saldo de cada usuario tiene que ser igual a la suma de sus asientos completados en el libro. Si difieren, alguien cambió el saldo sin dejar asiento (o al revés) y mover plata encima de eso agrandaría el problema. El mensaje trae saldo, libro y diferencia.',
    causas: [
      'Se editó el saldo directamente en la base o con un script, sin crear el asiento.',
      'Un asiento quedó en estado «pending» o «failed» y el saldo sí se movió (o al revés).',
      'Un proceso viejo (antes de que todo pasara por el libro) acreditó saldo sin asiento.',
    ],
    queHacer: [
      { texto: 'Abrí la auditoría de saldos y ubicá al usuario: ahí está la diferencia exacta.', ruta: '/admin/auditoria-saldos' },
      { texto: 'Abrí el historial de ese usuario (desde el buscador del admin) para encontrar el movimiento que falta o sobra.', ruta: '/admin/search' },
      { texto: 'Corregilo con un asiento de ajuste (que quede quién, cuándo y por qué), nunca editando el saldo. Cuando saldo y libro cierren, el usuario puede operar de nuevo.' },
    ],
    gravedad: 'alta',
  },

  'PAGO-SIN-CONFIRMAR': {
    codigo: 'PAGO-SIN-CONFIRMAR',
    titulo: 'Se quiso devolver un pago que nadie confirmó',
    paraElUsuario: 'Cancelamos tu publicación, pero todavía no podemos devolverte el dinero porque no encontramos la confirmación de ese pago. Administración ya fue avisada y lo resuelve a la brevedad.',
    queSignifica:
      'Antes de acreditar o devolver dinero se comprueba que el pago original haya sido confirmado, ya sea automáticamente por Mercado Pago o a mano por un administrador. Acá no se encontró ninguna de las dos cosas, así que no se movió plata.',
    causas: [
      'El pago está en un estado que no es de dinero recibido (pendiente, en verificación, rechazado, cancelado).',
      'El pago es de otro usuario, o no es el pago de esta publicación.',
      'Una transferencia bancaria se subió pero nadie la verificó.',
    ],
    queHacer: [
      { texto: 'Abrí el pago de la publicación y mirá su estado y quién lo confirmó.', ruta: '/admin/financial-transactions' },
      { texto: 'Si el dinero sí llegó (extracto del banco o panel de Mercado Pago), confirmá el pago desde el panel de pagos; la devolución se hace con un asiento de ajuste.', ruta: '/admin/pending-payments' },
      { texto: 'Si el dinero no llegó, no hay nada que devolver: avisale al usuario.' },
    ],
    gravedad: 'alta',
  },

  'DEV-SIN-ID-DE-PAGO': {
    codigo: 'DEV-SIN-ID-DE-PAGO',
    titulo: 'No hay un pago de Mercado Pago registrado contra el cual devolver',
    paraElUsuario: 'No pudimos devolver el dinero a tu medio de pago, así que lo dejamos como saldo a favor en tu cuenta: sin descuentos, podés republicar sin pagar de nuevo o retirarlo a tu banco.',
    queSignifica:
      'Para devolver por Mercado Pago hace falta el número de operación de ese pago. Si el pago está confirmado pero no tiene ese número, la devolución automática no se puede hacer; el dinero se acredita como saldo y queda registrado.',
    causas: [
      'El pago lo confirmó un administrador a mano (sin que llegara el aviso automático de Mercado Pago) y no se cargó el número de operación.',
      'El pago fue por transferencia bancaria o con saldo, no por Mercado Pago.',
    ],
    queHacer: [
      { texto: 'No hace falta hacer nada si al usuario le sirve el saldo a favor. Si pidió el dinero en su tarjeta, devolvelo desde el panel de Mercado Pago y registralo.' },
      { texto: 'Para que no se repita: al confirmar a mano un pago de Mercado Pago, cargá su número de operación.', ruta: '/admin/pending-payments' },
    ],
    gravedad: 'baja',
  },

  'DEV-YA-DEVUELTO': {
    codigo: 'DEV-YA-DEVUELTO',
    titulo: 'Ese pago ya tuvo una devolución',
    paraElUsuario: 'Ese pago ya había sido devuelto antes, así que lo que corresponde quedó como saldo a favor en tu cuenta.',
    queSignifica: 'El pago ya tiene un monto devuelto. Devolver otra vez podría pagar dos veces lo mismo, así que se acredita como saldo.',
    causas: ['Una disputa o una cancelación anterior ya devolvió parte o todo.', 'Un reintento de una devolución que ya había salido.'],
    queHacer: [
      { texto: 'Mirá el pago y su historial: confirmá que lo devuelto y lo acreditado como saldo no superen lo que pagó el cliente.', ruta: '/admin/financial-transactions' },
    ],
    gravedad: 'media',
  },

  'DEV-SIN-MONTO': {
    codigo: 'DEV-SIN-MONTO',
    titulo: 'No quedaba monto para devolver al medio de pago',
    paraElUsuario: 'Después de los descuentos que corresponden no quedaba un monto para devolver a tu medio de pago, así que lo que haya quedó como saldo a favor.',
    queSignifica: 'El neto a devolver (lo que le toca al cliente menos la retención) dio cero o menos.',
    causas: ['La liquidación de la cancelación dejó todo para el trabajador o para la plataforma (cancelación tardía).'],
    queHacer: [{ texto: 'Revisá la liquidación de la cancelación en el libro de dinero; si cierra con las reglas del punto 9 de los términos, no hay nada que hacer.', ruta: '/admin/audit-logs' }],
    gravedad: 'baja',
  },

  'DEV-MP-RECHAZADA': {
    codigo: 'DEV-MP-RECHAZADA',
    titulo: 'Mercado Pago rechazó la devolución',
    paraElUsuario: 'No pudimos devolver el dinero a tu medio de pago, así que lo dejamos como saldo a favor en tu cuenta: sin descuentos, podés republicar sin pagar de nuevo o retirarlo a tu banco.',
    queSignifica: 'Mercado Pago contestó con error al pedirle la devolución. El mensaje trae lo que respondió. El cliente no perdió plata: se acreditó como saldo.',
    causas: [
      'El pago es demasiado viejo (Mercado Pago limita el plazo para devolver).',
      'La cuenta de Mercado Pago no tiene saldo disponible para devolver.',
      'El pago estaba en disputa o contracargo.',
      'Credenciales de Mercado Pago vencidas o mal cargadas.',
    ],
    queHacer: [
      { texto: 'Leé el motivo exacto que trae el mensaje y buscalo en el panel de Mercado Pago, en la actividad de ese pago.' },
      { texto: 'Si el usuario insiste en su tarjeta, hacé la devolución desde el panel de Mercado Pago y anotala en el pago; después descontá el saldo acreditado con un asiento de ajuste para no pagar dos veces.', ruta: '/admin/financial-transactions' },
    ],
    gravedad: 'media',
  },

  'DEV-CONTROL-FALLIDO': {
    codigo: 'DEV-CONTROL-FALLIDO',
    titulo: 'Una comprobación de seguridad frenó la devolución al medio de pago',
    paraElUsuario: 'Por seguridad la devolución a tu medio de pago pasa por una revisión. Mientras tanto, el dinero quedó como saldo a favor en tu cuenta (sin descuentos). Administración ya fue avisada.',
    queSignifica:
      'Antes de devolver plata a un medio de pago se comprueba que el pago sea del cliente y de esa publicación, que esté confirmado, que el monto y la fecha cierren, y que Mercado Pago lo confirme. Una de esas comprobaciones falló: el mensaje dice cuál, qué se esperaba y qué se encontró.',
    causas: [
      'El monto del pago no coincide con el desglose (precio + comisión + IVA + procesamiento).',
      'El pago tiene más de 180 días (fuera del plazo de devolución de Mercado Pago).',
      'Mercado Pago informa otro estado o importe que el que tenemos guardado.',
      'El cliente ya tuvo varias devoluciones en los últimos 30 días: se frena para que lo mire una persona.',
    ],
    queHacer: [
      { texto: 'Mirá la comprobación que falló y compará «esperado» con «encontrado».' },
      { texto: 'Si es un falso positivo (por ejemplo, un cliente legítimo con varias cancelaciones), hacé la devolución a mano desde Mercado Pago y registrala.', ruta: '/admin/financial-transactions' },
      { texto: 'Si los datos no cierran, no devuelvas nada: abrí el pago y escalá al equipo técnico con el código.', ruta: '/admin/auditoria-saldos' },
    ],
    gravedad: 'alta',
  },

  'DEV-REGISTRO-FALLIDO': {
    codigo: 'DEV-REGISTRO-FALLIDO',
    titulo: 'La devolución salió pero no se pudo anotar en el pago',
    paraElUsuario: 'Te devolvimos el dinero a tu medio de pago. Según el banco puede tardar unos días en verse.',
    queSignifica: 'Mercado Pago devolvió la plata, pero falló guardar ese dato en nuestro pago. Hay que anotarlo a mano para que no se devuelva dos veces.',
    causas: ['Falló la base de datos justo después de la devolución.'],
    queHacer: [
      { texto: 'Abrí el pago, cargá el monto devuelto y el motivo con el número de devolución que trae el mensaje.', ruta: '/admin/financial-transactions' },
    ],
    gravedad: 'alta',
  },

  'PAGO-NO-LEIDO': {
    codigo: 'PAGO-NO-LEIDO',
    titulo: 'No se pudo leer el pago de la publicación',
    paraElUsuario: 'Cancelamos tu publicación y dejamos el dinero como saldo a favor. Administración va a revisar que el monto sea el correcto.',
    queSignifica: 'La consulta del pago falló, así que la liquidación se hizo con los datos del trabajo y no con los del pago real.',
    causas: ['Error temporal de la base de datos.'],
    queHacer: [{ texto: 'Comprobá que el saldo acreditado coincida con lo que pagó el cliente (pago menos lo que no vuelve).', ruta: '/admin/auditoria-saldos' }],
    gravedad: 'media',
  },

  'SALDO-ACREDITACION-FALLIDA': {
    codigo: 'SALDO-ACREDITACION-FALLIDA',
    titulo: 'Se canceló la publicación pero no se pudo acreditar el saldo al cliente',
    paraElUsuario: 'Cancelamos tu publicación, pero no pudimos acreditar tu dinero todavía. No lo perdiste: administración ya fue avisada y te lo acredita a la brevedad.',
    queSignifica: 'El trabajo quedó cancelado y la plata sin mover. Es el peor caso: el cliente pagó y no tiene su dinero.',
    causas: ['Falló la base de datos al escribir el asiento.', 'El usuario no existe o está bloqueado.', 'Un control de seguridad frenó el movimiento (mirá el detalle).'],
    queHacer: [
      { texto: 'Acreditá el saldo con un asiento (cancelación de la publicación), por el monto que indica el detalle.', ruta: '/admin/auditoria-saldos' },
      { texto: 'Avisale al usuario cuando esté hecho.' },
    ],
    gravedad: 'alta',
  },

  'TRABAJADOR-COMPENSACION-FALLIDA': {
    codigo: 'TRABAJADOR-COMPENSACION-FALLIDA',
    titulo: 'No se pudo acreditar la compensación al trabajador por una cancelación tardía',
    paraElUsuario: 'La compensación al trabajador está en proceso y administración ya fue avisada.',
    queSignifica: 'Una cancelación con menos de 24 horas le corresponde la mitad al trabajador y su asiento falló.',
    causas: ['Falló la base de datos al escribir el asiento.'],
    queHacer: [{ texto: 'Acreditá la compensación con un asiento y avisale al trabajador.', ruta: '/admin/auditoria-saldos' }],
    gravedad: 'alta',
  },
} as const satisfies Record<string, ProblemaCatalogado>;

export type CodigoDeProblema = keyof typeof CATALOGO_DE_PROBLEMAS;

export function problemaDelCatalogo(codigo: string): ProblemaCatalogado | null {
  return (CATALOGO_DE_PROBLEMAS as Record<string, ProblemaCatalogado>)[codigo] ?? null;
}

/** Dirección de la guía para un código (la web la abre posicionada en ese problema). */
export function rutaDeLaGuia(codigo: string): string {
  return `/admin/guia-de-errores#${encodeURIComponent(codigo)}`;
}

/**
 * Un problema concreto, tal como ocurrió: el código dice qué es, `detalle` trae los números exactos de ESTE caso (solo para
 * administración) y `controles` las comprobaciones que se hicieron, si las hubo.
 */
export interface ProblemaDeDinero {
  codigo: CodigoDeProblema;
  detalle: string;
  controles?: Array<{ id: string; titulo: string; ok: boolean; bloqueante: boolean; esperado?: string; encontrado?: string }>;
}
