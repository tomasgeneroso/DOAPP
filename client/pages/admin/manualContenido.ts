import { POLITICAS } from "../../../shared/constants/policies";

/**
 * El manual del equipo. Vive en código y no en una base de datos a propósito:
 * cada proceso acá describe lo que el código hace, y cuando el código cambia,
 * el manual se edita en el mismo commit. Un manual en otro lado se desactualiza
 * el primer día y nadie se entera.
 *
 * Los números salen de POLITICAS, así que un cambio de política reescribe el
 * manual solo.
 */

export type RolManual = "admin" | "owner" | "support" | "marketing" | "dpo";

export interface EntradaManual {
  id: string;
  titulo: string;
  /** Quién necesita leer esto. */
  roles: RolManual[];
  /** Una línea: qué resuelve. */
  resumen: string;
  /** Palabras por las que alguien la va a buscar, además del texto. */
  claves: string[];
  /** Pasos o reglas. El texto puede traer <b> y <code>. */
  cuerpo: string[];
  /** Links internos o externos. */
  links?: Array<{ texto: string; href: string; externo?: boolean }>;
}

export const ROLES: Record<RolManual, string> = {
  admin: "Administración",
  owner: "Dueño",
  support: "Soporte",
  marketing: "Marketing",
  dpo: "Datos personales",
};

export const MANUAL: EntradaManual[] = [
  {
    id: "plata",
    titulo: "Qué pasa con la plata en cada fase",
    roles: ["admin", "owner", "support"],
    resumen: "A dónde va cada peso cuando algo se cancela, se reclama o llega un contracargo.",
    claves: ["dinero", "plata", "cancelación", "reembolso", "devolución", "escrow", "comisión", "pasarela", "contracargo", "saldo"],
    cuerpo: [
      "Es la página de referencia: las siete fases de una publicación con un mismo ejemplo numérico, quién se lleva cada peso y qué tiene que hacer el admin en cada caso.",
      "Tres cosas no cambian nunca: <b>el cliente nunca paga la pasarela</b> y DOAPP tampoco (la paga quien recibe el dinero, y solo cuando lo recibe en efectivo); <b>la comisión se retiene en el acto solo si hubo un trabajador seleccionado</b>; y <b>lo que vuelve al cliente por una cancelación va a su saldo a favor</b>, con el que puede republicar sin pagar de nuevo.",
      "El IVA de la tarifa de Mercado Pago no se le traslada a nadie: es crédito fiscal de DOAPP. Al trabajador se le descuenta la tarifa sin IVA.",
    ],
    links: [{ texto: "Abrir la página completa", href: "https://claude.ai/artifact/NiuAeCNy4vzu4164CF5HFN", externo: true }],
  },
  {
    id: "reclamo",
    titulo: `Reclamo directo: las ${POLITICAS.RECLAMO_DIRECTO_HORAS} h entre las partes`,
    roles: ["admin", "support"],
    resumen: "Qué podés y qué no podés hacer mientras el reclamo está en manos de las partes.",
    claves: ["reclamo", "disputa", "72 horas", "acuerdo", "negociación", "intervenir"],
    cuerpo: [
      `Abrir una disputa no te llama a vos: abre un reclamo con un reloj de ${POLITICAS.RECLAMO_DIRECTO_HORAS} h a la vista. Las partes pueden retirarlo, proponer devolver todo o parte del precio, o acordar que el trabajador rehaga el trabajo.`,
      "<b>Mientras está en reclamo no podés resolver.</b> El panel devuelve 409 si lo intentás. Si hace falta meterse antes (abuso evidente, emergencia), usá <b>Intervenir antes del plazo</b> y escribí por qué: la justificación la leen las dos partes en el registro.",
      `Si vence sin acuerdo, escala solo. Si una parte ya respondió y no se ponen de acuerdo, cualquiera de las dos puede pedirte a vos antes de tiempo.`,
      "Cuando las partes aceptan un acuerdo con plata, <b>la transacción no se ejecuta sola</b>: aparece el botón «Ejecutar el acuerdo y mover la plata». Antes de apretarlo, mirá que el acuerdo tenga sentido: dos partes pueden acordar algo imposible, o una puede haber aceptado bajo presión.",
    ],
  },
  {
    id: "disputa",
    titulo: "Resolver una disputa",
    roles: ["admin", "support"],
    resumen: "Las tres salidas, qué mirar antes y en cuánto tiempo.",
    claves: ["disputa", "resolver", "liberar", "devolver", "parcial", "pruebas", "evidencia", "sla"],
    cuerpo: [
      "Antes de decidir, mirá las <b>pruebas por detalle obligatorio</b>: cada tarea del trabajo con sus fotos y si fue reclamada. Solo esos detalles pueden fundar una disputa (T&C 10.5). Abajo está el control diario con quién subió cada foto.",
      "Tres salidas: <b>liberar todo</b> al trabajador, <b>devolver todo</b> al cliente (el precio, no la comisión) o <b>devolución parcial</b> con el monto que fijes. La devolución sale por Mercado Pago al medio con que pagó el cliente, aunque el dinero todavía esté a liberar.",
      `Objetivo del equipo: resolver en ${POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS} días, tope ${POLITICAS.DISPUTA_MAXIMO_RESOLUCION_DIAS}. El reloj de cada disputa está en la lista y en el detalle. Si está en gris («esperando parte»), la demora no cuenta contra el equipo.`,
      `Si una parte deja de responder ${POLITICAS.DISPUTA_DIAS_PARA_RESPONDER} días, el sistema marca la disputa como lista y te dice a favor de quién corresponde resolver según el punto 10.10. <b>No mueve la plata: la resolvés vos.</b>`,
      "En una parcial, explicá en la resolución por qué ese monto y no otro. Es lo que más se discute después.",
    ],
  },
  {
    id: "publicaciones",
    titulo: "Aprobar, rechazar y cancelar publicaciones",
    roles: ["admin"],
    resumen: "La cola de revisión y qué pasa con la plata en cada decisión.",
    claves: ["publicación", "aprobar", "rechazar", "cancelar", "tablero", "revisión"],
    cuerpo: [
      "El tablero ordena por lo que está trabado, no por fecha. Primero «Pidió cancelar», después «Pagada fantasma» (pagó y nadie la atiende).",
      "<b>Rechazar exige motivo</b> (10 caracteres o más). El cliente lo lee tal cual, así que escribilo como para que pueda corregir y volver a publicar.",
      "Rechazar y aprobar una cancelación liquidan igual: sin trabajador seleccionado, todo lo que pagó vuelve a su saldo a favor, comisión incluida. Solo si retira ese saldo al banco se le descuentan media comisión y la pasarela.",
      "No se puede aprobar una publicación cuyo dueño ya pidió cancelar: el panel rebota. Si querés publicarla igual, hablá con el cliente primero.",
    ],
  },
  {
    id: "trabajador-se-baja",
    titulo: "El trabajador se baja",
    roles: ["admin", "support"],
    resumen: "Quién decide, qué pasa con la plata y por qué el aviso tiene que quedar registrado.",
    claves: ["trabajador", "no puede", "se baja", "abandona", "escalera", "penalidad", "republicar"],
    cuerpo: [
      "El trabajador avisa desde el contrato que no puede (antes de empezar o en curso). El aviso queda registrado como solicitud de cancelación suya: es lo que hace correr la <b>escalera</b> (aviso → marca visible 90 días → 7 días sin postularse → 14) y lo que le permite al cliente decidir.",
      "El cliente elige entre tres salidas, desde el contrato: <b>dejarla publicada</b> con la plata que ya está (otro trabajador la toma por el mismo precio, sin pagar de nuevo); <b>republicarla por menos</b> (la diferencia a su saldo); o <b>pasar el precio a su saldo a favor</b>. En las tres la comisión de publicación se retiene: ya hubo un trabajador seleccionado (T&C 7.5). La pasarela se descuenta solo si retira el saldo al banco.",
      "<b>Sin aviso registrado el cliente no puede usar este camino.</b> Si lo intenta, el sistema le dice que le pida al trabajador que avise por la app, o que use la cancelación normal (que es suya, con sus reglas de 24 h). Es lo que impide que un cliente cancele por su cuenta y le cargue la penalidad al otro.",
      "Un trabajo ya entregado (esperando confirmación o completado) no pasa por acá: hay trabajo hecho que valorar y eso es un reclamo.",
    ],
  },
  {
    id: "pagos",
    titulo: "Pagarle al trabajador",
    roles: ["admin", "owner"],
    resumen: "Cuándo se puede pagar, cuánto, y por qué el panel a veces rebota.",
    claves: ["pago", "pendientes", "transferencia", "cbu", "liberar", "retención"],
    cuerpo: [
      `El día de pago es el <b>máximo</b> entre dos relojes: contrato completado + ${POLITICAS.DIAS_PARA_DISPUTAR} días de reclamo, y pago del cliente + los días que Mercado Pago retiene (10 con tarjeta de crédito). El panel ya lo calcula y lo muestra.`,
      "Antes de esa fecha, «marcar pagado» devuelve 409. Se puede forzar con justificación de 15 caracteres o más, y queda en el libro con severidad alta. Forzar es para casos raros, no para apurar.",
      "<b>Transferí el monto que muestra el panel</b>, no lo recalcules: ya descuenta la pasarela real del pago y lo que se haya devuelto en una disputa parcial. Subí el comprobante antes de marcar pagado.",
      "Es el único movimiento irreversible de todo el circuito. Si hay una disputa abierta, el ledger bloquea el pago solo.",
    ],
  },
  {
    id: "contracargo",
    titulo: "Contracargo",
    roles: ["admin", "owner"],
    resumen: "Llega por webhook, congela el pago y corre un plazo que fija la tarjeta.",
    claves: ["contracargo", "chargeback", "banco", "descargo", "fraude"],
    cuerpo: [
      "El webhook congela el pago, pone el contrato en disputa, arma el expediente (control diario, fotos, chat) y avisa con la <b>fecha límite para presentar descargo</b>, que fija Mercado Pago según la marca de la tarjeta.",
      "Si el webhook no pudo asociar el pago, igual avisa: hay que buscarlo a mano en el panel de MP.",
      "Si llega antes de pagarle al trabajador, no hay pérdida: la plata está. Si llega después y perdemos, la absorbe DOAPP. Por eso el expediente diario existe: es lo que se le muestra al banco.",
      "Después de resolverlo, mirá al usuario en «Usuarios con advertencia» y en su historial.",
    ],
  },
  {
    id: "emergencia",
    titulo: "Botón de emergencia",
    roles: ["admin", "support", "owner"],
    resumen: "Qué hacer cuando entra un aviso, y qué no prometemos.",
    claves: ["emergencia", "911", "seguridad", "pánico", "gps"],
    cuerpo: [
      "Llega por app, socket y email, con quién apretó, la otra parte, la dirección del trabajo y la ubicación GPS si el navegador la dio.",
      "<b>Llamá a quien apretó.</b> Si no contesta, a la otra parte. El evento queda registrado con severidad crítica aunque después se cancele el contrato.",
      "DOAPP no es un servicio de seguridad ni de respuesta (T&C 11.3). No prometas que va a ir alguien: el botón acerca el 911 y avisa al equipo.",
    ],
  },
  {
    id: "retiros",
    titulo: "Retiros de saldo",
    roles: ["admin", "owner"],
    resumen: "Qué se descuenta al sacar plata de la plataforma y por qué.",
    claves: ["retiro", "cbu", "saldo", "transferencia", "withdrawal"],
    cuerpo: [
      "Usar el saldo dentro de la app no cuesta nada. Sacarlo a un CBU sí: se le descuenta la pasarela que se cobró al entrar y, si la publicación se canceló sin trabajador, la mitad de la comisión.",
      "El usuario ve los dos números antes de confirmar. Si no acepta, el saldo queda disponible sin vencimiento.",
      "Cambiar el CBU activa un enfriamiento: es la única protección contra una cuenta tomada. No lo saltees.",
    ],
  },
  {
    id: "usuarios",
    titulo: "Usuarios con advertencia e historial",
    roles: ["admin", "support", "owner"],
    resumen: "Cómo leer la marca y el expediente antes de decidir sobre alguien.",
    claves: ["abuso", "advertencia", "historial", "patrón", "reincidente"],
    cuerpo: [
      "La marca es una <b>proporción</b>, no un número: tres disputas en tres contratos es un patrón; tres en cuarenta es mala suerte. Con menos de 3 contratos no se evalúa.",
      "No bloquea nada: es lo que mirás antes de resolver la próxima disputa o devolución de esa persona.",
      "El historial muestra el patrón por mes y cómo terminó cada disputa (a favor de quién y por cuánto).",
    ],
    links: [{ texto: "Usuarios con advertencia", href: "/admin/usuarios-marcados" }],
  },
  {
    id: "datos",
    titulo: "Datos sensibles: qué se puede mostrar",
    roles: ["admin", "support", "dpo", "marketing"],
    resumen: "La regla que no se negocia, ni para ayudar a alguien.",
    claves: ["privacidad", "dirección", "teléfono", "email", "datos", "gdpr", "dpo"],
    cuerpo: [
      `Entre usuarios <b>nunca</b> se muestran teléfono ni email: para eso está el chat. La dirección exacta la ve el trabajador contratado desde ${POLITICAS.DIRECCION_VISIBLE_HORAS_ANTES} h antes del inicio; antes de eso, y para todos los demás, solo barrio y zona.`,
      "Si un usuario te pide el contacto del otro «para coordinar», la respuesta es el chat. La dirección de una casa donde va a entrar un desconocido es el dato más sensible de la plataforma.",
      "Un pedido de borrado o de exportación de datos va al rol DPO, no se resuelve por chat.",
    ],
  },
  {
    id: "owner",
    titulo: "Lo que solo ve el dueño",
    roles: ["owner"],
    resumen: "Balance de la empresa, variables de entorno y cambios de política.",
    claves: ["owner", "dueño", "balance", "empresa", "env", "política", "comisión"],
    cuerpo: [
      "El balance de la empresa y el libro de movimientos de dinero son del rol <code>owner</code>.",
      "Las tarifas y plazos de Mercado Pago son <b>espejo del panel de MP</b>: se configuran en el <code>.env</code> del VPS y no cambian nada en MP. Si el número de acá no coincide con el del panel, se le descuenta de más o de menos al trabajador y nadie lo nota.",
      "Cambiar una comisión, un piso o un plazo se hace en <code>shared/constants/policies.ts</code>: los Términos y Condiciones lo leen de ahí y cambian en el mismo deploy. Nunca edites el número en el texto legal.",
    ],
  },
  {
    id: "soporte",
    titulo: "Tickets: qué es ticket y qué es disputa",
    roles: ["support", "admin"],
    resumen: "Para no meter un problema de plata en la cola equivocada.",
    claves: ["ticket", "soporte", "ayuda", "consulta"],
    cuerpo: [
      "<b>Ticket</b>: dudas, bugs, problemas de cuenta, preguntas de pago. No congela plata.",
      "<b>Disputa</b>: un problema con un contrato concreto (no lo hizo, lo hizo mal, no pagó). Congela el pago hasta resolverse.",
      "Si alguien abre un ticket que es una disputa, decile que la abra desde el contrato: un ticket no frena el pago y el plazo para reclamar sigue corriendo.",
    ],
  },
];
