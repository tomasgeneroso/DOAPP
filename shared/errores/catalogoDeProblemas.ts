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
      'La devolución supera $200.000: por encima de ese monto la aprueba el dueño (mientras tanto queda como saldo, que no sale de la plataforma).',
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

  'RETIRO-REQUIERE-DUENO': {
    codigo: 'RETIRO-REQUIERE-DUENO',
    titulo: 'Un retiro supera el tope diario del usuario y espera la aprobación del dueño',
    paraElUsuario: 'Tu retiro supera el tope diario de $200.000, así que lo tiene que aprobar el dueño de la plataforma antes de transferirse. Puede demorar un poco más de lo habitual.',
    queSignifica:
      'Un usuario puede retirar hasta $200.000 por día sin aprobación especial. Lo que pasa de ahí se crea igual, pero solo el dueño puede aprobarlo, procesarlo o completarlo: ningún otro rol de administración. El mensaje trae cuánto pidió ese día.',
    causas: [
      'El saldo del usuario es mayor que el tope (el retiro es siempre por todo lo disponible).',
      'El usuario hizo varios retiros el mismo día que, sumados, superan el tope.',
    ],
    queHacer: [
      { texto: 'Si sos admin: no hay nada que hacer salvo avisarle al dueño. El retiro queda pendiente hasta que él lo apruebe.', ruta: '/admin/withdrawals' },
      { texto: 'Si sos el dueño: revisá el origen del saldo (movimientos del usuario) y aprobá o rechazá. Al aprobar queda anotado quién y cuándo, y el circuito sigue como siempre.', ruta: '/admin/search' },
    ],
    gravedad: 'media',
  },

  'AUDITORIA-CON-HALLAZGOS': {
    codigo: 'AUDITORIA-CON-HALLAZGOS',
    titulo: 'La auditoría nocturna de saldos encontró diferencias',
    paraElUsuario: 'Estamos revisando tu cuenta para confirmar que todo cierra. No hace falta que hagas nada.',
    queSignifica:
      'Todas las noches se comprueba lo que tiene que ser verdad siempre: el saldo de cada usuario es la suma de sus movimientos, no hay publicaciones canceladas con la plata trabada, nadie cobra dos veces un contrato, ningún retiro pendiente supera el saldo, no se devolvió plata de una publicación que no se cobró y ningún pago por transferencia lo aprobó la misma cuenta que pagó y no se devolvió al saldo más presupuesto del que sobraba. El aviso dice cuántas diferencias hay y las primeras.',
    causas: [
      'Un saldo se tocó sin dejar un movimiento en el libro (o al revés).',
      'Un reembolso o una cancelación quedó a medias.',
      'Un proceso viejo acreditó plata sin asiento.',
    ],
    queHacer: [
      { texto: 'Abrí la auditoría de saldos: cada diferencia trae el usuario, el monto y el detalle.', ruta: '/admin/auditoria-saldos' },
      { texto: 'Corregí cada una con un asiento de ajuste que diga quién, cuándo y por qué (nunca editando el saldo). Mientras un usuario tenga el saldo descuadrado, no puede retirar.' },
    ],
    gravedad: 'alta',
  },

  'APROBACION-DE-PAGO-PROPIO': {
    codigo: 'APROBACION-DE-PAGO-PROPIO',
    titulo: 'Un administrador no puede aprobar un pago propio',
    paraElUsuario: 'Este pago lo tiene que revisar otra persona del equipo antes de confirmarse. Sigue en la cola de aprobación.',
    queSignifica:
      'Aprobar una transferencia es dar por buena una afirmación («el dinero entró al banco») que ninguna pasarela comprueba. Si quien la aprueba es quien la hizo, o quien la va a cobrar, no hay una segunda persona que la compruebe: así llegó a devolverse al saldo una transferencia de $431.956,80 que nunca tuvo dinero detrás. Por eso el sistema frena la aprobación (403). El dueño sí puede aprobar pagos propios, y queda anotado como aprobación propia.',
    causas: [
      'Un administrador pagó una publicación o un contrato por transferencia y quiso aprobar su propio comprobante.',
      'Un administrador es el trabajador de un contrato y quiso confirmar su propio cobro (o la verificación del pago de su contrato).',
    ],
    queHacer: [
      { texto: 'Pedile a otra persona del equipo (o al dueño) que apruebe el pago desde Pagos pendientes, comprobando en el banco que el dinero entró.', ruta: '/admin/pending-payments' },
      { texto: 'Si es una prueba y no hay dinero real, no lo apruebes: dejalo pendiente o rechazalo.' },
      { texto: 'Para ver los pagos que ya se aprobaron a mano por quien pagó, mirá el invariante 7 de la auditoría de saldos.', ruta: '/admin/auditoria-saldos' },
    ],
    gravedad: 'media',
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

  'DEVOLUCION-DE-PRESUPUESTO-FALLIDA': {
    codigo: 'DEVOLUCION-DE-PRESUPUESTO-FALLIDA',
    titulo: 'No se pudo devolver al saldo lo que sobró del presupuesto de una publicación',
    paraElUsuario: 'Tu trabajo ya está contratado. Lo que sobró del presupuesto todavía no figura en tu saldo: administración ya fue avisada y se acredita a la brevedad. No perdiste ese dinero.',
    queSignifica:
      'El equipo de la publicación quedó cerrado (completo, o empezó con menos lugares) y lo que no se contrató tenía que pasar al saldo del cliente, pero la acreditación falló. El sistema lo reintenta solo cada 15 minutos; si el aviso se repite para la misma publicación, algo lo está frenando.',
    causas: ['Error temporal de la base de datos.', 'Un control de saldo frenó el movimiento (mirá el detalle).'],
    queHacer: [
      { texto: 'Esperá unos minutos: se reintenta solo. Si el aviso vuelve a aparecer para la misma publicación, abrí su expediente y mirá el pago y los contratos.', ruta: '/admin/jobs' },
      { texto: 'Si hay que acreditarlo a mano, hacelo con un asiento de ajuste que diga quién, cuándo y por qué (nunca editando el saldo).', ruta: '/admin/auditoria-saldos' },
    ],
    gravedad: 'media',
  },

  'SALDO-PENDIENTE-BLOQUEADO': {
    codigo: 'SALDO-PENDIENTE-BLOQUEADO',
    titulo: 'Un saldo a favor pendiente no se pudo pasar al saldo del cliente',
    paraElUsuario: 'Tu saldo a favor pendiente está en revisión: administración tiene que confirmar el pago original antes de acreditarlo. Ya fue avisada.',
    queSignifica:
      'Lo que sobró del presupuesto de una publicación quedó a favor del cliente como PENDIENTE hasta que Mercado Pago liberara el pago original. Llegó la fecha, pero el pago original se devolvió, se cayó, se contracargó o ya no existe, así que acreditarlo daría la misma plata dos veces. El asiento queda marcado como bloqueado y no se vuelve a intentar solo.',
    causas: ['El pago original se reembolsó (total o parcialmente), por Mercado Pago o por un administrador.', 'Hubo un contracargo o el pago figura caído.', 'El pago original ya no existe en la base.'],
    queHacer: [
      { texto: 'Abrí el expediente de la publicación: mirá el estado del pago y qué se devolvió.', ruta: '/admin/jobs' },
      { texto: 'Si el cliente ya recibió esa plata por el reembolso, el asiento pendiente no corresponde: queda bloqueado y no suma a su saldo. Si el pago original es válido, avisá a ingeniería para desbloquearlo.' },
    ],
    gravedad: 'media',
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

  'PAGO-APROBADO-SIN-DINERO': {
    codigo: 'PAGO-APROBADO-SIN-DINERO',
    titulo: 'Un pago figura como recibido pero el dinero nunca entró',
    paraElUsuario: 'Estamos verificando un pago de tu cuenta. Administración ya fue avisada y te vamos a escribir si hace falta algo de tu parte.',
    queSignifica:
      'Una transferencia se aprobó a mano sin comprobar el banco (o fue un pago de prueba): figura como ingreso y pudo haber generado saldo a favor, pero esa plata no existe. Se corrige con el script `anularPago`, que por defecto SOLO muestra qué haría (vista previa) y solo escribe con `--aplicar`. No sirve para un pago confirmado por una pasarela: ahí el dinero entró de verdad y corresponde un reembolso.',
    causas: [
      'Una transferencia bancaria se aprobó a mano sin mirar el banco.',
      'Un pago de prueba quedó como confirmado en producción.',
      'El pago se aprobó por error sobre un comprobante que no era.',
    ],
    queHacer: [
      { texto: 'En el servidor, desde la carpeta de la app, corré la VISTA PREVIA (no escribe nada): npx tsx server/scripts/anularPago.ts --pago=<id del pago> --motivo="Transferencia de prueba aprobada sin dinero real"' },
      { texto: 'Leé lo que muestra: quién pagó y quién aprobó, la publicación, la factura y si ese pago ya devolvió saldo. Si dice «Falta descontar $X», primero se descuenta ese saldo con un ajuste (npx tsx server/scripts/ajustarSaldo.ts --email=<correo del cliente> --monto=-<lo que falta> --motivo="…" --publicacion=<id de la publicación>, también primero en vista previa). Si dice «a favor pendiente», no hay nada que descontar: se cancela junto con el pago porque nunca llegó a ser saldo.' },
      { texto: 'Si el pago lo confirmó una pasarela (Mercado Pago, AstroPay, PayPal) el script lo rechaza: el dinero entró y lo que corresponde es un reembolso desde el panel. Solo el dueño usa --forzar.', ruta: '/admin/payments' },
      { texto: 'Cuando la vista previa sea la esperada, repetí el MISMO comando agregando --aplicar. Es todo o nada (pago, facturas y a favor pendiente cambian juntos) y queda en el registro de auditoría como PAYMENT_VOIDED.' },
      { texto: 'Si el script dice «permission denied for table invoices», la base no deja escribir en facturas: el mismo mensaje explica el permiso que falta darle al usuario de la aplicación. Nada se anuló todavía; reintentá cuando esté dado.' },
      { texto: 'Si la factura ya se informó a ARCA, consultá al contador por la nota de crédito.' },
    ],
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
