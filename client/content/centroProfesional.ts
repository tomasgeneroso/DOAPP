/**
 * Las explicaciones del Centro Profesional, en palabras simples (regla del dueño, 2026-11-09: «hacer pantallas educativas»).
 *
 * El Centro Profesional es parte de la membresía PRO: un tablero para trabajar como profesional dentro de DOAPP. Cada pestaña tiene su guía («para qué sirve, cómo se
 * lee, qué hacer») y hay una bienvenida con los primeros pasos. Los textos viven acá, en un solo lugar, y la pantalla solo los muestra.
 *
 * Todo es ORIENTATIVO: no es asesoramiento contable ni fiscal. Cada vez que hay una decisión fiscal, el texto manda a consultarla con un contador.
 */

export type PestanaDelCentro = 'finanzas' | 'impuestos' | 'reputacion' | 'crecimiento' | 'profesional';

export interface GuiaDePestana {
  titulo: string;
  paraQueSirve: string;
  comoSeLee: string[];
  queHacer: string[];
  /** Palabras que suenan técnicas, explicadas una vez. */
  glosario?: Array<{ termino: string; significa: string }>;
}

export const AVISO_ORIENTATIVO =
  'Esto es orientativo y no reemplaza a un contador: ante cualquier duda sobre tus obligaciones, consultalo con él.';

export interface PasoDeBienvenida {
  titulo: string;
  texto: string;
  pestana: PestanaDelCentro;
}

export const QUE_ES_EL_CENTRO =
  'Es tu tablero para trabajar como profesional dentro de DOAPP, y es parte de tu membresía PRO. Reúne en un solo lugar cuánto facturaste, qué obligaciones te tocan, cómo te ven tus clientes, cómo crecer y qué papeles tenés al día.';

export const PASOS_DE_BIENVENIDA: PasoDeBienvenida[] = [
  { titulo: 'Mirá tus números', texto: 'En «Finanzas» ves lo que facturaste este mes y en el año, y podés ponerte una meta mensual.', pestana: 'finanzas' },
  { titulo: 'Cargá tu situación fiscal', texto: 'En «Impuestos y Obligaciones» indicás si sos monotributista y en qué categoría: así te avisa cuánto te falta para el tope.', pestana: 'impuestos' },
  { titulo: 'Cuidá tu reputación', texto: 'En «Reputación» ves cómo te califican y qué insignias tenés; es lo que más pesa cuando un cliente elige.', pestana: 'reputacion' },
  { titulo: 'Descargá el resumen para tu contador', texto: 'Al final de «Finanzas» bajás tu facturación del año en CSV o PDF, lista para llevársela a tu contador.', pestana: 'finanzas' },
];

export const GUIAS: Record<PestanaDelCentro, GuiaDePestana> = {
  finanzas: {
    titulo: 'Finanzas: lo que facturaste',
    paraQueSirve: 'Para saber cuánto ganaste con los trabajos que terminaste y cobraste en DOAPP, y si vas bien respecto de tu meta.',
    comoSeLee: [
      'En DOAPP la comisión la paga el cliente: vos cobrás el precio acordado entero. Lo «facturado» es la suma de esos precios.',
      'La proyección es una estimación: si seguís al ritmo de ahora, cuánto llegarías a facturar al cierre del año.',
      'Cada fila de la tabla de facturas es un trabajo terminado, con su fecha y su monto.',
    ],
    queHacer: [
      'Ponete una meta mensual realista y mirá cuánto te falta.',
      'Si una factura no coincide con lo que esperabas, abrí un ticket desde el Centro de Ayuda con el trabajo en cuestión.',
      'Bajá el resumen anual cuando tu contador te lo pida.',
    ],
    glosario: [
      { termino: 'Facturación', significa: 'El total de lo que cobraste por tus trabajos en un período.' },
      { termino: 'Proyección', significa: 'Una cuenta aproximada de cómo cerrarías el año si el ritmo no cambia.' },
    ],
  },
  impuestos: {
    titulo: 'Impuestos y obligaciones, explicados simple',
    paraQueSirve: 'Para tener presente qué te toca como trabajador independiente y avisarte antes de pasarte del tope de tu categoría.',
    comoSeLee: [
      'La barra muestra cuánto de tu tope anual ya usaste con lo facturado.',
      'Las tarjetas de obligaciones dicen, en palabras comunes, qué hay que hacer y cada cuánto.',
    ],
    queHacer: [
      'Cargá si sos monotributista y tu categoría: el aviso del tope depende de eso.',
      'Si la barra se acerca al tope, hablalo con tu contador antes de la próxima recategorización.',
      'Guardá tus facturas: son tu respaldo ante cualquier consulta.',
    ],
    glosario: [
      { termino: 'Monotributo', significa: 'Un régimen simplificado para independientes: pagás una cuota mensual fija según tu categoría, que incluye impuesto y aportes.' },
      { termino: 'Categoría y tope', significa: 'Tu categoría depende de cuánto facturás en un año; cada una tiene un tope. Si lo superás, te corresponde pasar a otra.' },
      { termino: 'Recategorización', significa: 'La revisión periódica (dos veces al año) en la que se ajusta tu categoría según lo que facturaste.' },
      { termino: 'Ingresos Brutos (IIBB)', significa: 'Un impuesto provincial sobre lo que se factura. Si te corresponde y cuánto depende de tu provincia: consultalo con tu contador.' },
      { termino: 'Factura electrónica', significa: 'El comprobante que se emite por internet en ARCA (ex AFIP) por lo que cobrás.' },
    ],
  },
  reputacion: {
    titulo: 'Reputación: cómo te ven',
    paraQueSirve: 'Para entender qué mira un cliente antes de elegirte y qué podés mejorar.',
    comoSeLee: [
      'Las calificaciones salen de las reseñas que te dejan después de cada trabajo terminado.',
      'La tasa de finalización es la parte de tus trabajos que terminaste sin problemas; la de disputas, la que tuvo reclamos.',
      'Las insignias muestran lo que ya verificaste (identidad, matrícula, seguro).',
    ],
    queHacer: [
      'Terminá los trabajos en fecha y avisá si algo cambia: es lo que más sube la calificación.',
      'Respondé rápido en el chat.',
      'Sumá las verificaciones que te falten: dan más confianza.',
    ],
  },
  crecimiento: {
    titulo: 'Crecimiento: de la propuesta al trabajo',
    paraQueSirve: 'Para ver cuántas propuestas mandás, cuántas te aceptan y qué ajustar para conseguir más trabajos.',
    comoSeLee: [
      'El embudo cuenta tus propuestas enviadas, vistas y aceptadas.',
      'La tasa de aceptación es qué parte de tus propuestas terminó en un trabajo.',
    ],
    queHacer: [
      'Si te aceptan pocas, revisá el precio y el mensaje: sé concreto sobre qué vas a hacer y en cuánto tiempo.',
      'Mandá propuestas a trabajos que coincidan con tu oficio y tu zona.',
    ],
    glosario: [{ termino: 'Embudo', significa: 'El camino de tus propuestas: cuántas mandaste, cuántas se vieron y cuántas se convirtieron en trabajo.' }],
  },
  profesional: {
    titulo: 'Profesionalización: tus papeles al día',
    paraQueSirve: 'Para tener cargada tu matrícula y tu seguro, y que no se te venzan sin darte cuenta.',
    comoSeLee: [
      'Si tu oficio exige matrícula, acá figura y te avisamos antes del vencimiento.',
      'El seguro de responsabilidad civil cubre daños que podrías causar trabajando.',
    ],
    queHacer: [
      'Cargá tu matrícula y su fecha de vencimiento para recibir el recordatorio.',
      'Si todavía no tenés seguro, consultá con tu aseguradora cuál te conviene.',
    ],
    glosario: [
      { termino: 'Matrícula', significa: 'La habilitación que algunos oficios y profesiones necesitan para trabajar legalmente.' },
      { termino: 'Seguro de responsabilidad civil', significa: 'Un seguro que responde por daños a terceros mientras trabajás.' },
    ],
  },
};
