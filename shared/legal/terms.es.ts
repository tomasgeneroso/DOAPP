/**
 * Terms & Conditions — español copy. Single source for web and mobile.
 *
 * Web loads this through i18next (client/i18n/index.ts merges it into the
 * `termsPage` namespace); mobile imports it directly, since mobile has no i18n
 * runtime. The text previously lived twice — in client/i18n/locales/*.json and
 * hardcoded in mobile/app/legal/terms.tsx — which meant the two platforms could
 * silently drift apart on a legal document. Edit here and both follow.
 *
 * Keys are section-numbered: sNTitle / sNpM (paragraph) / sNliM (list item).
 *
 * Los numeros (plazos, comision, escalera) NO se escriben aca: se interpolan
 * desde shared/constants/policies.ts y shared/constants/membershipPricing.ts.
 * Asi el texto legal dice lo mismo que hace el codigo en el mismo deploy, y
 * tests/legal/terminosSincronizados.test.ts lo verifica.
 */

import { POLITICAS, DISPUTA_AVISO_DIAS_ANTES } from '../constants/policies.js';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../constants/membershipPricing.js';
import { MINIMUM_COMMISSION_EUR } from '../pricing/minimums.js';

const P = POLITICAS;
const COMISION = COMMISSION_RATES.free;
const PRO_EUR = MEMBERSHIP_PRICES_EUR.pro;
const PARTE_TRABAJADOR_PCT = Math.round(P.CANCELACION_TARDIA_PARTE_TRABAJADOR * 100);
// Cancelar antes de la aprobacion: se retiene esta parte de la comision. Con la
// comision vigente equivale a este porcentaje del precio y este piso en euros.
const REVISION_PARTE_PCT = Math.round(P.CANCELACION_EN_REVISION_PARTE_COMISION * 100);
const REVISION_COMISION_PCT = Math.round(COMISION * P.CANCELACION_EN_REVISION_PARTE_COMISION * 1000) / 10;
const REVISION_PISO_EUR = Math.round(MINIMUM_COMMISSION_EUR * P.CANCELACION_EN_REVISION_PARTE_COMISION * 100) / 100;

export const termsEs: Record<string, string> = {
  "metaTitle": "Términos y Condiciones - DOAPP",
  "metaDescription": "Términos y condiciones generales de uso de la plataforma DOAPP",
  "back": "Volver",
  "home": "Inicio",
  "title": "Términos y Condiciones Generales de Uso",
  "lastUpdated": "Última actualización: 17 de Septiembre de 2026",
  "intro1": "Los presentes Términos y Condiciones (en adelante, los \"Términos\") regulan el acceso y uso de la plataforma digital denominada DOAPP (en adelante, la \"Plataforma\"), por parte de cualquier persona humana o jurídica que se registre y/o utilice sus servicios (en adelante, el \"Usuario\").",
  "intro2": "La utilización de la Plataforma implica la aceptación plena y sin reservas de los presentes Términos, los cuales constituyen un contrato válido y vinculante conforme a los artículos 958 y concordantes del Código Civil y Comercial de la Nación.",
  "s1Title": "1. Identificación del Titular de la Plataforma",
  "s1p": "La Plataforma es operada por DOAPP, con domicilio legal en la República Argentina (en adelante, \"DOAPP\").",
  "s2Title": "2. Descripción del Servicio",
  "s2p": "DOAPP es una plataforma digital de intermediación tecnológica, bajo el modelo de marketplace y red social, que permite vincular:",
  "s2li1": "<b>Clientes:</b> personas humanas o jurídicas que demandan servicios.",
  "s2li2": "<b>Trabajadores / Doers:</b> personas humanas que ofrecen servicios profesionales u oficios de manera independiente.",
  "s2note": "DOAPP NO presta los servicios publicados, NO es empleador, NO actúa como parte del contrato de prestación de servicios, limitándose su rol a facilitar herramientas tecnológicas de contacto, gestión de pagos, custodia de fondos y mediación en disputas.",
  "s3Title": "3. Naturaleza Jurídica de la Relación",
  "s3p1": "3.1. Los Trabajadores se registran y actúan como prestadores independientes y autónomos, sin que exista relación laboral, societaria, de dependencia, mandato, agencia o franquicia con DOAPP.",
  "s3p2": "3.2. Cada contrato celebrado a través de la Plataforma se perfecciona exclusivamente entre Cliente y Trabajador, quienes asumen íntegramente los derechos y obligaciones emergentes del mismo.",
  "s3p3": "3.3. DOAPP no ejerce control técnico, disciplinario ni organizativo sobre los Trabajadores, limitándose a reglas de uso de la Plataforma.",
  "s4Title": "4. Registro de Usuarios",
  "s4p1": "4.1. El acceso a la Plataforma requiere registro previo y creación de una cuenta personal.",
  "s4p2": "4.2. El Usuario garantiza la veracidad, exactitud y actualización de los datos suministrados.",
  "s4p3": "4.3. DOAPP podrá requerir procesos de verificación de identidad (KYC), incluyendo validación de correo electrónico, teléfono, documento de identidad y datos fiscales, especialmente para Trabajadores y para la membresía PRO.",
  "s4p4": "4.4. Alcance de la verificación. Al día de hoy DOAPP verifica únicamente la identidad de los Usuarios. Dicha verificación se realiza mediante la herramienta de un tercero especializado, Didit (didit.me), que analiza el documento de identidad presentado y realiza una prueba de vida mediante reconocimiento facial. A tal fin, el Usuario consiente que DOAPP transmita a dicho proveedor las imágenes de su documento y de su rostro, con la única finalidad de verificar su identidad y prevenir el fraude. El tratamiento de esos datos por parte del proveedor se rige además por sus propias políticas. DOAPP NO verifica matrículas profesionales, habilitaciones, títulos ni pólizas de seguro. Un Usuario puede declarar que posee una matrícula o un seguro y acompañar documentación respaldatoria: dicha documentación se conserva a título informativo y su exhibición en la Plataforma NO implica que DOAPP haya comprobado su autenticidad, vigencia ni validez ante el organismo o la aseguradora correspondiente.",
  "s4p5": "4.5. Es responsabilidad exclusiva del Usuario contratante verificar, por sus propios medios y ante los registros oficiales pertinentes, que el profesional cuente con la matrícula, habilitación o seguro que declara, especialmente en actividades reguladas. DOAPP informará oportunamente si en el futuro incorpora la verificación de estos datos contra fuentes oficiales.",
  "s5Title": "5. Categorías de Servicios",
  "s5p": "La Plataforma permite la publicación y contratación de servicios, entre otros:",
  "s5li1": "Limpieza",
  "s5li2": "Mudanzas",
  "s5li3": "Jardinería",
  "s5li4": "Construcción",
  "s5li5": "Tecnología",
  "s5li6": "Servicios profesionales varios",
  "s5note": "DOAPP no garantiza la idoneidad, calidad, resultado ni legalidad de los servicios ofrecidos.",
  "s6Title": "6. Sistema de Contratación",
  "s6p1": "6.1. El ciclo de contratación incluye: publicación, postulación, aceptación, pago, ejecución, confirmación por parte de un administrador de la plataforma y completado.",
  "s6p2": "6.2. La aceptación del Trabajador y del Cliente genera un contrato digital vinculante entre ambos.",
  "s6p3": "6.3. El sistema requiere confirmación bilateral de finalización para la liberación de fondos.",
  "s6p4": "6.4. <b>El precio publicado es el precio del trabajo.</b> Cuando el Cliente publica indicando un monto, ése es el precio acordado y es el que se cobra, salvo que un Trabajador presente una cotización por un importe distinto y el Cliente decida aceptarla. Cuando el Cliente publica \"a cotizar\", no existe precio hasta que se acepta una cotización.",
  "s6p5": "6.5. <b>La aceptación de una cotización requiere el pago previo.</b> El Trabajador queda seleccionado y el contrato se genera únicamente después de que el pago se acredite. Si la cotización aceptada supera lo ya abonado en la publicación, el Cliente debe abonar la diferencia junto con la comisión correspondiente antes de que la selección tenga efecto. Mientras el pago no se acredite, la cotización permanece disponible y el Trabajador no queda comprometido.",
  "s6p6": `6.6. <b>Publicaciones sin cotización aceptada.</b> Las publicaciones \"a cotizar\" que no obtengan una cotización aceptada dentro de los ${P.COTIZAR_DIAS_HABILES_ANTES_DE_PAUSAR} días hábiles desde su publicación o desde su última reanudación serán pausadas automáticamente. La pausa no cancela la publicación ni elimina las cotizaciones recibidas: el Cliente puede reanudarla en cualquier momento y el plazo se computa nuevamente desde la reanudación. <b>Las publicaciones cuyo precio fue abonado al publicarse no se pausan por este motivo</b>, y permanecen disponibles mientras el Cliente no las cancele.`,
  "s6p7": `6.7. <b>Reseñas y puntuación.</b> Al terminar un contrato, cada parte califica a la otra y escribe una reseña pública, que se muestra en el perfil de la persona calificada y es obligatoria para seguir usando la Plataforma. Opcionalmente puede dejar además una nota privada, que solo lee la persona calificada y la administración de la Plataforma, no se publica y no modifica la puntuación. La puntuación que se muestra en el perfil se calcula con las reseñas de los últimos ${P.RATING_VENTANA_DIAS} días cuando en ese período hay al menos ${P.RATING_CONTRATOS_MINIMOS} reseñas; si no las hay, con las del último año, y en su defecto con todo el historial. El período utilizado se indica junto a la puntuación. Las reseñas deben referirse a la experiencia en el contrato; la Plataforma puede ocultar las que contengan datos personales, insultos o contenido ajeno al trabajo.`,
  "s7Title": "7. Pagos, Comisiones y Escrow",
  "s7p1": "7.1. Los pagos se procesan a través de MercadoPago, aceptándose los medios habilitados por dicho proveedor.",
  "s7p2": "7.2. DOAPP actúa como custodio de fondos (escrow), reteniendo el dinero hasta la confirmación del servicio.",
  "s7p3": `7.3. DOAPP percibe una comisión del ${COMISION}% sobre el precio del trabajo, a cargo del Cliente, que se informa antes de cada pago. La comisión es la misma con o sin membresía: la membresía otorga visibilidad (punto 8), no descuentos. Durante el período de lanzamiento (beta), cuya fecha de cierre se informa en la Plataforma, la comisión es del 0%; al finalizar rige la tasa indicada. El costo de procesamiento del pago (punto 7.10) es independiente de la comisión y se cobra también durante la beta. La tabla siguiente resume la comisión por plan:`,
  "thPlan": "Plan",
  "thCommission": "Comisión",
  "planProMonth": `PRO (€${PRO_EUR}/mes, al cambio del día)`,
  "s7p4": `7.4. <b>Comisión mínima.</b> La comisión tiene un piso equivalente a EUR ${MINIMUM_COMMISSION_EUR}, convertido a pesos al tipo de cambio del día e informado antes de pagar. El piso cubre el costo fijo que tiene cada contrato para la Plataforma. No existe un monto mínimo de trabajo: el Cliente puede publicar cualquier importe, y en trabajos pequeños la comisión mínima puede representar una proporción mayor del precio, lo que se informa antes de pagar.`,
  "s7p5": `7.5. La comisión de DOAPP no es reembolsable una vez que hubo un Trabajador seleccionado para la publicación, incluso en casos de cancelación o disputa. Si la publicación se cancela sin que haya habido un Trabajador seleccionado —antes o después de su aprobación—, la comisión se reintegra como saldo a favor conforme al punto 9.1, y al transferir ese saldo fuera de la Plataforma se retiene el ${REVISION_PARTE_PCT}% de la comisión.`,
  "s7p6": `7.6. <b>Liberación automática por ausencia del Cliente:</b> Si un trabajo finaliza (fecha de vencimiento alcanzada) y el Cliente no confirma la recepción del servicio dentro de las ${P.AUTO_CONFIRMACION_HORAS} horas siguientes, con recordatorios previos, el pago retenido en custodia será liberado automáticamente a los Trabajadores asignados. La comisión de la Plataforma correspondiente al plan del Cliente se retiene en todos los casos. La liberación automática queda registrada como tal y no equivale a una conformidad expresa del Cliente, que conserva su derecho a reclamar dentro del plazo del artículo 10.7. <b>La transferencia efectiva al Trabajador se realiza una vez vencido ese plazo</b>: liberar el pago significa que el Cliente ya no lo controla, no que el dinero salió de la Plataforma. Esta cláusula no aplica si existe una disputa activa sobre el contrato.`,
  "s7p7": "7.7. Los Trabajadores serán notificados antes del inicio del trabajo, durante su ejecución y al momento de la liberación del pago. En caso de ausencia del Cliente conforme al punto 7.6, los Trabajadores recibirán aviso inmediato por email y notificación en la Plataforma.",
  "s7p8": "7.8. <b>Monto mínimo de ampliación.</b> La Plataforma establece un monto mínimo para las ampliaciones de contrato, derivado del costo de procesamiento de la pasarela y del costo fijo que cada operación tiene para la Plataforma. El importe vigente se informa antes de confirmar la ampliación.",
  "s7p9": "7.9. <b>Saldo a favor y su transferencia.</b> Los importes que vuelven al Cliente —por una cotización menor al precio publicado, por una cancelación o por un rechazo de la publicación— se acreditan como saldo a favor dentro de la Plataforma. Ese saldo puede utilizarse sin costo alguno en cualquier publicación o contratación posterior; la parte de una publicación que se abona con saldo no pasa por la pasarela y no paga costo de procesamiento. El Cliente también puede solicitar su transferencia a una cuenta bancaria propia; <b>la transferencia no tiene costo</b>, salvo, cuando corresponda según el punto 9.1, la parte de la comisión allí indicada, que se informa antes de confirmar la solicitud. Si el Cliente no acepta ese descuento, el saldo permanece disponible en la Plataforma por tiempo indeterminado.",
  "s7p10": "7.10. <b>Costo de procesamiento del pago.</b> Cada pago que ingresa a la Plataforma a través de la pasarela tiene un costo de procesamiento, <b>a cargo del Cliente</b>, que se calcula con una única tasa sobre el total abonado, igual para todos los medios de pago, y se informa junto con su IVA antes de confirmar el pago. La tasa vigente se publica en la Plataforma. <b>El Trabajador recibe el precio del trabajo íntegro</b>: ni la comisión ni el costo de procesamiento se le descuentan. <b>El costo de procesamiento no es reembolsable</b> en ningún caso —cancelación, rechazo de la publicación, disputa o devolución—, porque la pasarela lo cobra al ingresar el pago y no lo devuelve. El plazo en que la pasarela pone el dinero a disposición puede variar según el medio de pago elegido; la fecha estimada de transferencia al Trabajador se informa en cada contrato.",
  "s8Title": "8. Membresías y Suscripciones",
  "s8p1": `8.1. DOAPP ofrece un plan gratuito y una membresía PRO de €${PRO_EUR} por mes (cobrada en pesos al cambio del día), con renovación automática mensual. La membresía otorga visibilidad —promoción del perfil, insignia, prioridad en las búsquedas y estadísticas— y no modifica la comisión. Durante el período de lanzamiento (beta) la membresía no está a la venta.`,
  "s8p2": "8.2. La cancelación no genera reintegro y los beneficios subsisten hasta el vencimiento del período abonado.",
  "s8p3": "8.3. DOAPP podrá modificar precios, notificando previamente al Usuario.",
  "s9Title": "9. Cancelaciones",
  "s9p1": `9.1. <b>Cancelaciones sin Trabajador seleccionado</b> (antes de la aprobación de la publicación, o después de aprobada mientras ningún Trabajador haya sido seleccionado): la totalidad de lo abonado, comisión incluida y con excepción del costo de procesamiento del pago (punto 7.10), se acredita como saldo a favor en la Plataforma, utilizable sin costo en nuevas publicaciones. Si el Cliente solicita transferir ese saldo a una cuenta bancaria, se descuenta el ${REVISION_PARTE_PCT}% de la comisión con su IVA, por la revisión ya realizada (con la comisión vigente, equivale al ${REVISION_COMISION_PCT}% del precio con un mínimo de EUR ${REVISION_PISO_EUR}). El rechazo de una publicación por parte de un Administrador se liquida de la misma manera, y el Administrador debe indicar el motivo.`,
  "s9p2": `9.2. <b>Cancelaciones del Cliente con Trabajador seleccionado y al menos ${P.CANCELACION_CLIENTE_HORAS_ANTES} horas de anticipación al inicio</b>: el precio del trabajo se acredita como saldo a favor en la Plataforma; la comisión de publicación no se reembolsa, ni el costo de procesamiento (punto 7.10). La transferencia de ese saldo a una cuenta bancaria no tiene costo (punto 7.9).`,
  "s9p3": `9.3. <b>Cancelaciones tardías del Cliente con Trabajador seleccionado</b> (con menos de ${P.CANCELACION_CLIENTE_HORAS_ANTES} horas de anticipación, o durante la ejecución): el ${PARTE_TRABAJADOR_PCT}% del precio se le paga al Trabajador, íntegro, por el tiempo que reservó; el resto se acredita al Cliente como saldo a favor. La comisión de publicación y el costo de procesamiento se retienen. Si el que cancela es el Trabajador —avisando a través de la función prevista en la Plataforma, antes del inicio o durante la ejecución—, el Trabajador no percibe importe alguno y queda sujeto al punto 9.4, y el Cliente elige: mantener la publicación abierta con los fondos ya abonados para seleccionar a otro Trabajador, republicarla por un precio menor (la diferencia se acredita como saldo a favor), o que el precio del trabajo se acredite íntegramente como saldo a favor. En los tres casos la comisión de publicación y el costo de procesamiento se retienen, y la transferencia del saldo no tiene costo (punto 7.9).`,
  "s9p4": `9.4. <b>Cancelación por parte del Trabajador de un contrato aceptado.</b> Cancelar un trabajo ya aceptado perjudica al Cliente y a la Plataforma. Por ello, las cancelaciones del Trabajador dentro de un período de ${P.CANCELACION_VENTANA_DIAS} días tienen consecuencias graduales: la primera genera un aviso; la segunda hace visible en el perfil del Trabajador, durante ${P.CANCELACION_MARCA_VISIBLE_DIAS} días, una marca que indica que canceló trabajos aceptados; la tercera suspende la posibilidad de postularse a nuevos trabajos durante ${P.CANCELACION_SUSPENSION_3RA_DIAS} días; la cuarta o siguientes, durante ${P.CANCELACION_SUSPENSION_4TA_DIAS} días. Los contratos en curso no se ven afectados por la suspensión. Avisar oportunamente que no se podrá realizar el trabajo, a través de la función prevista en la Plataforma, se considera igualmente una cancelación a estos efectos, pero permite al Cliente decidir cómo disponer de su dinero sin demoras.`,
  "s10Title": "10. Disputas y Mediación",
  "s10p1": "10.1. DOAPP actúa como mediador interno, sin carácter jurisdiccional.",
  "s10p2": "10.2. La apertura de una disputa congela los fondos hasta su resolución.",
  "s10p3": "10.3. Las decisiones del Administrador podrán consistir en liberación total, reembolso total, parcial o cierre sin acción. Para la toma de la resolución definitiva, se utilizará la información que voluntariamente remitieron las partes sobre las condiciones de contratación.",
  "s10p4": "10.4. La comisión de la Plataforma no se devuelve en ningún supuesto.",
  "s10p5": "10.5. <b>Detalles obligatorios y detalles deseables:</b> Al crear o ampliar un contrato, las partes acuerdan <b>detalles obligatorios</b>: condiciones concretas y verificables que definen qué se considera el trabajo cumplido (por ejemplo, «la canilla no debe dejar cinta de teflón visible saliendo de la rosca»). Sólo esos detalles pueden fundar una disputa. Los <b>detalles deseables</b> son preferencias que las partes pueden dejar asentadas para orientar el trabajo, pero <b>no fundan una disputa ni pueden originarla</b>.",
  "s10p6": "10.6. DOAPP no interviene ni resuelve reclamos basados en condiciones que no fueron acordadas como detalles obligatorios antes de comenzar el trabajo o antes de aprobarse la ampliación. Acordar bien los detalles obligatorios es responsabilidad de las partes; la Plataforma provee la herramienta para registrarlos.",
  "s10p7": `10.7. <b>Plazo para reclamar:</b> La disputa puede iniciarse mientras el contrato está en curso y hasta ${P.DIAS_PARA_DISPUTAR} días corridos después de su finalización. Pasado ese plazo, el contrato se considera aceptado sin observaciones y el pago se transfiere al Trabajador. La apertura de una disputa dentro de ese plazo <b>retiene la transferencia al Trabajador hasta que la disputa se resuelva</b>, habilita la mediación de DOAPP y queda registrada.`,
  "s10p8": "10.8. <b>Contracargos:</b> Si el Cliente desconoce un pago ante su banco o emisor de tarjeta (contracargo) en lugar de utilizar el sistema de disputas de la Plataforma, se compromete a notificarlo previamente a DOAPP. El Cliente será responsable por el monto reclamado cuando el servicio haya sido efectivamente prestado, y DOAPP podrá reclamarle el importe, suspender su cuenta y retener saldos disponibles hasta la resolución. DOAPP presentará ante el emisor la evidencia del contrato: confirmaciones de ambas partes, código de emparejamiento, historial de mensajes y fechas.",
  "s10p9": "10.9. El uso del sistema interno de disputas es la vía prevista para reclamar. Iniciar un contracargo sin haberlo intentado no exime al Usuario de las obligaciones asumidas en estos Términos.",
  "s10p10": `10.10. <b>Falta de respuesta en una disputa.</b> Cada parte tiene ${P.DISPUTA_DIAS_PARA_RESPONDER} días corridos para responder al último mensaje de la otra parte dentro de una disputa. Abrir la disputa cuenta como primer mensaje. Si una parte no responde en ese plazo, la disputa pasa a revisión de un Administrador con la recomendación de resolverla a favor de la parte que respondió última: si quien no respondió es el Trabajador, devolver el dinero retenido al Cliente; si quien no respondió es el Cliente, liberar el pago al Trabajador. <b>Ningún movimiento de dinero se ejecuta sin la decisión expresa de un Administrador.</b> La Plataforma envía un aviso a la parte en silencio ${DISPUTA_AVISO_DIAS_ANTES} días antes del vencimiento. Los mensajes de la administración de la Plataforma no interrumpen este plazo. La comisión de la Plataforma no se reembolsa en ningún caso, conforme al punto 7.5.`,
  "s10p11": `10.11. <b>Reclamo directo previo a la intervención del Administrador.</b> Al abrirse una disputa, comienza un período de reclamo directo de ${P.RECLAMO_DIRECTO_HORAS} horas en el que las partes pueden resolver el problema entre sí dentro de la Plataforma: quien abrió el reclamo puede retirarlo, y cualquiera de las partes puede proponer devolver todo o parte del precio al Cliente, o que el Trabajador rehaga o complete el trabajo. Una propuesta aceptada por la otra parte cierra la negociación y queda registrada como acuerdo; <b>si implica una devolución, la ejecuta un Administrador</b>, que verifica que coincida con lo acordado antes de mover el dinero. Las devoluciones acordadas siguen las mismas reglas de los puntos 7.5 y 10.4. Si el plazo vence sin acuerdo, o si una de las partes lo solicita una vez que la otra ya respondió, el reclamo pasa a ser una disputa y interviene un Administrador conforme a este apartado. Los fondos quedan congelados desde la apertura del reclamo (punto 10.2). El plazo del punto 10.10 se cuenta desde la apertura del reclamo. La Plataforma podrá intervenir antes del vencimiento cuando lo considere necesario para proteger a los Usuarios o a la Plataforma.`,
  "s11Title": "11. Responsabilidad",
  "s11p1": "11.1. DOAPP no responde por:",
  "s11li1": "La calidad, ejecución o resultado de los servicios.",
  "s11li2": "Daños personales, materiales o patrimoniales derivados de la prestación.",
  "s11p2": "11.2. El Usuario exonera a DOAPP de cualquier reclamo derivado de su relación contractual con otros Usuarios.",
  "s11p3": "11.3. <b>Herramientas de seguridad.</b> La Plataforma ofrece, sin cargo, herramientas de ayuda como el botón de emergencia, el código de emparejamiento y la posibilidad de compartir los datos de un contrato con un contacto de confianza. Son herramientas de asistencia que facilitan el contacto con servicios de emergencia o con terceros elegidos por el Usuario; <b>no constituyen un servicio de seguridad, vigilancia ni respuesta</b>, y DOAPP no garantiza la disponibilidad, la respuesta ni el resultado de ninguna de ellas. El Usuario es responsable de evaluar la situación y de recurrir directamente a los servicios de emergencia cuando corresponda.",
  "s12Title": "12. Impuestos y Facturación",
  "s12p1": "12.1. Los Trabajadores son responsables de emitir las facturas correspondientes y cumplir con sus obligaciones fiscales ante AFIP.",
  "s12p2": "12.2. DOAPP podrá emitir factura por el cobro de sus comisiones.",
  "s13Title": "13. Protección de Datos Personales",
  "s13p1": "13.1. DOAPP cumple con la Ley 25.326 de Protección de Datos Personales.",
  "s13p2": "13.2. Los datos bancarios y de identidad se almacenan de forma encriptada.",
  "s13p3": "13.3. El Usuario podrá ejercer los derechos de acceso, rectificación, supresión y oposición.",
  "s14Title": "14. Publicidad",
  "s14p": "DOAPP podrá ofrecer espacios publicitarios sujetos a disponibilidad, aprobación previa y pago anticipado.",
  "s15Title": "15. Sanciones",
  "s15p": "DOAPP podrá aplicar advertencias, suspensiones o cancelación definitiva de cuentas ante incumplimientos, fraude o uso indebido de la Plataforma.",
  "s16Title": "16. Modificaciones",
  "s16p": "DOAPP podrá modificar estos Términos, los cuales entrarán en vigencia desde su publicación.",
  "s17Title": "17. Ley Aplicable y Jurisdicción",
  "s17p": "Los presentes Términos se rigen por las leyes de la República Argentina. Para los consumidores, será competente el tribunal del domicilio del Usuario conforme Ley 24.240.",
  "s18Title": "18. Aceptación",
  "s18p": "El Usuario declara haber leído, comprendido y aceptado íntegramente los presentes Términos y Condiciones.",
  "importantNote": "<b>Nota importante:</b> Al registrarte y utilizar DOAPP, confirmas que has leído, entendido y aceptado estos Términos y Condiciones en su totalidad.",
  "acceptAndBack": "Acepto los términos, volver",
};
