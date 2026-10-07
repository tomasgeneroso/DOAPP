import { COMMISSION_RATES } from '../../shared/constants/membershipPricing';
import {
  calcularUnidad,
  mauDeEquilibrio,
  FACTORES_DE_CHURN,
  META_RUNWAY_FASE1_MESES,
  REFERENCIA_LTV_CAC,
  SUPUESTOS_UE_DE_ARRANQUE,
  BASE_DE_LOS_SUPUESTOS_MINIMOS,
  SUPUESTOS_MINIMOS_SIN_REDONDEAR,
} from '../../shared/pricing/unidadEconomica';
import { ROTULO_DE_TIPO } from '../../shared/pricing/gastos';
import { SCENARIOS } from '../utils/financialProjection';
import { N, SECCIONES_DEL_PLAN } from './seccionesDelPlan';
import { ACTIVOS_PCT_POR_DEFECTO } from '../../shared/pricing/planCoordinado';

/**
 * La guía del análisis: qué es, de qué partes se compone y cómo se lee.
 *
 * Para quién: la gente que colabora con los números y no necesariamente viene de
 * finanzas. Se escribió para que alguien que abre `/analisis` por primera vez
 * entienda qué está mirando y para qué sirve, sin tener que preguntarle a quien
 * armó el plan.
 *
 * ── Por qué los números salen del código ───────────────────────────────────
 *
 * Una explicación escrita a mano con "el LTV/CAC de referencia es 3" y "la meta
 * son 4 meses" se vuelve falsa el día que alguien cambia el código y no el
 * texto, y es peor que no tener explicación porque se lee con autoridad. Acá
 * ninguna cifra está escrita como texto: la referencia de LTV/CAC, los factores
 * de churn de los escenarios, los multiplicadores de la proyección, la comisión,
 * la meta de runway y hasta el ejemplo resuelto salen de las mismas constantes y
 * de la misma función de cálculo que usan las pantallas.
 *
 * Y un test (`tests/guiaDelAnalisis.test.ts`) verifica que cada sección y cada
 * panel que muestran las pantallas esté explicado acá: agregar uno sin explicarlo
 * hace fallar el test.
 */

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

export interface Termino {
  termino: string;
  definicion: string;
  /** Cómo se calcula, si es una cuenta. */
  formula?: string;
}

export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export interface PantallaExplicada {
  /** El nombre tal como aparece en la pantalla. */
  nombre: string;
  muestra: string;
  comoLeerla: string;
}

export type Bloque =
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'lista'; items: string[] }
  | { tipo: 'pasos'; items: string[] }
  | { tipo: 'formula'; lineas: string[] }
  | { tipo: 'aviso'; tono: 'info' | 'cuidado'; texto: string }
  | { tipo: 'terminos'; items: Termino[] }
  | { tipo: 'pantallas'; items: PantallaExplicada[] }
  | { tipo: 'preguntas'; items: Pregunta[] };

export interface Seccion {
  id: string;
  titulo: string;
  /** Una línea: de qué trata, para el índice. */
  resumen: string;
  bloques: Bloque[];
}

export type PantallaConAyuda = 'economia-unitaria' | 'proyeccion';

/* ------------------------------------------------------------------ *
 * Formato
 * ------------------------------------------------------------------ */

const num = (n: number, decimales = 0) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const usd = (n: number, decimales = 2) => `US$${num(n, decimales)}`;

/** Un multiplicador: ×1,5 · ×0,85 */
const veces = (f: number) => `×${f.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

/* ------------------------------------------------------------------ *
 * El ejemplo resuelto: la cuenta de verdad con los números de verdad
 * ------------------------------------------------------------------ */

const A = SUPUESTOS_UE_DE_ARRANQUE;

const unidad = calcularUnidad({
  ticket: A.ticket,
  contratos: A.contratos,
  comisionPct: A.comision,
  soporte: A.soporte,
  disputasPct: A.disputas,
  fraudePct: A.fraude,
});

const equilibrioDelEjemplo = mauDeEquilibrio(A.fijos, unidad.exacto.margen);
const costoVariableDelEjemplo = unidad.exacto.costo - A.soporte;
const margenSobreIngresoPct = (unidad.exacto.margen / unidad.exacto.ingreso) * 100;

/**
 * Un caso que da margen NEGATIVO, calculado con la misma función.
 *
 * Es el que más se pregunta —"¿por qué me da margen negativo?"— y se explica
 * mejor con la cuenta delante. Se arma con `calcularUnidad` y no se escribe a
 * mano: un ejemplo que dijera un número y la pantalla otro sería peor que no
 * tenerlo.
 */
const NEGATIVO = { ticket: 21, contratos: 0.55, comision: 10, soporte: 1, disputas: 1, fraude: 0.5 };
const unidadNegativa = calcularUnidad({
  ticket: NEGATIVO.ticket,
  contratos: NEGATIVO.contratos,
  comisionPct: NEGATIVO.comision,
  soporte: NEGATIVO.soporte,
  disputasPct: NEGATIVO.disputas,
  fraudePct: NEGATIVO.fraude,
});

/** Lo que calcula el ejemplo de margen negativo, para que el test lo contraste. */
export const EJEMPLO_NEGATIVO = {
  ingreso: unidadNegativa.exacto.ingreso,
  costo: unidadNegativa.exacto.costo,
  margen: unidadNegativa.exacto.margen,
};

/** Con el signo menos de verdad (−), no el guion, y delante del símbolo. */
const usdConSigno = (n: number, decimales = 3) => `${n < 0 ? '−' : ''}${usd(Math.abs(n), decimales)}`;

/** Lo que el ejemplo calcula, para que el test lo contraste con la función. */
export const EJEMPLO_RESUELTO = {
  ingreso: unidad.exacto.ingreso,
  costo: unidad.exacto.costo,
  margen: unidad.exacto.margen,
  equilibrio: equilibrioDelEjemplo,
};

const C = SCENARIOS.conservador;
const O = SCENARIOS.optimista;
const F = FACTORES_DE_CHURN;

/* ------------------------------------------------------------------ *
 * Las secciones
 * ------------------------------------------------------------------ */

const GLOSARIO: Termino[] = [
  {
    termino: 'Usuario activo (MAU)',
    definicion:
      'Persona distinta que tuvo al menos un contrato en los últimos 30 días, ya sea como cliente o como profesional. No cuenta a quien sólo entró a mirar: la medida es contratar, que es lo que genera ingreso.',
  },
  {
    termino: 'Usuario registrado',
    definicion:
      'Persona que se dio de alta y no se fue, haya contratado este mes o no. La proyección cuenta usuarios registrados; la economía unitaria cuenta usuarios activos. Un porcentaje (usuarios activos del mes) pasa de uno a otro.',
  },
  {
    termino: 'Ticket promedio',
    definicion:
      'Lo que vale, en promedio, un trabajo contratado en la plataforma. Es el monto del trabajo, no lo que cobra DOAPP.',
  },
  {
    termino: 'Comisión',
    definicion: `Porcentaje del valor del trabajo que se queda DOAPP: ${COMMISSION_RATES.free}%, y la paga el cliente. Durante la beta es 0%. Por eso el LTV y el payback se calculan con la comisión de después de la beta: responden cuánto valdría un cliente cuando empiece a cobrarse, no cuánto vale hoy.`,
  },
  {
    termino: 'Contratos por usuario por mes',
    definicion:
      'Cuántos trabajos contrata en promedio un usuario activo en un mes. En oficios es menor a uno por naturaleza: a un plomero no se lo llama todos los meses.',
  },
  {
    termino: 'Costo de soporte, disputas y fraude',
    definicion:
      'Lo que cuesta atender a un usuario. El soporte es un importe fijo por usuario y por mes. Las disputas y el fraude son un porcentaje del volumen, porque crecen con la plata que pasa y no con la cantidad de gente.',
  },
  {
    termino: 'Margen de contribución',
    definicion:
      'Lo que deja un usuario activo en un mes después de pagar lo que cuesta atenderlo: soporte, disputas y fraude. No cuenta los costos fijos ni la publicidad. Se llama "de contribución" porque es lo que cada usuario aporta para pagar esos costos fijos. Si es positivo, cada usuario ayuda a cubrirlos. Si es cero o negativo, cada usuario nuevo agrega pérdida y no existe punto de equilibrio: ninguna cantidad de usuarios alcanza.',
    formula: 'ingreso − (soporte + volumen × (disputas % + fraude %))',
  },
  {
    termino: 'Costos fijos',
    definicion:
      'Lo que se paga por mes aunque no haya ni un usuario: equipo, infraestructura, herramientas, honorarios. En el plan son los rubros de tipo Fijo de la tabla de gastos de la etapa real: la publicidad (que compra usuarios) y el soporte (que se calcula por usuario) no entran. No es lo mismo que la quema mensual, que es todo lo que se gasta en el mes.',
  },
  {
    termino: 'Punto de equilibrio',
    definicion:
      'Cuántos usuarios activos por mes hacen falta para que el margen de contribución cubra los costos fijos. Si el margen no es positivo, no existe: ninguna cantidad de usuarios alcanza.',
    formula: 'costos fijos ÷ margen de contribución, redondeado hacia arriba',
  },
  {
    termino: 'EBITDA',
    definicion:
      'El resultado de operar, antes de impuestos, intereses y amortizaciones. En este análisis: lo que entra menos lo que cuesta operar. "Cubre sus costos" significa EBITDA positivo; "llegar a EBITDA = 0" es el punto de equilibrio.',
  },
  {
    termino: 'CAC (costo de adquisición)',
    definicion:
      'Lo que cuesta conseguir un cliente. Se muestra de dos maneras: por registro, que divide el gasto por todas las altas, y por cliente real, que lo divide sólo por las altas que además contrataron. El segundo es el que importa: un registro que nunca contrata no es un cliente.',
    formula: 'gasto en adquisición ÷ altas que contrataron',
  },
  {
    termino: 'Churn',
    definicion:
      'El porcentaje de usuarios que dejan de usar la plataforma cada mes. Cuanto más alto, menos dura un cliente.',
  },
  {
    termino: 'LTV (valor de vida del cliente)',
    definicion:
      'Cuánto deja un cliente en toda su vida en la plataforma. Un churn alto lo acorta y lo hace valer menos.',
    formula: 'contribución mensual ÷ churn mensual',
  },
  {
    termino: 'LTV / CAC',
    definicion: `Cuántas veces devuelve un cliente lo que costó conseguirlo. La referencia es ${REFERENCIA_LTV_CAC}× o más. Entre 1× y ${REFERENCIA_LTV_CAC}× el cliente se paga pero no sobra para crecer; por debajo de 1× se pierde plata con cada cliente que se consigue.`,
    formula: 'LTV ÷ CAC',
  },
  {
    termino: 'Payback',
    definicion: 'Cuántos meses tarda un cliente en devolver lo que costó conseguirlo.',
    formula: 'CAC ÷ contribución mensual',
  },
  {
    termino: 'Runway',
    definicion:
      'Cuántos meses dura la plata disponible al ritmo de gasto actual, sin contar lo que pueda entrar. Es la respuesta a "¿cuánto aguantamos?".',
    formula: 'caja disponible ÷ quema mensual',
  },
  {
    termino: 'Cohorte y retención',
    definicion:
      'Una cohorte es el grupo de gente que se registró el mismo mes. La retención mide cuántos de ellos siguen contratando 1, 2 y 3 meses después. Es la forma de medir el churn con datos reales en lugar de suponerlo.',
  },
  {
    termino: 'Caja acumulada y capital mínimo necesario',
    definicion:
      'La caja acumulada es la plata disponible mes a mes. Si cae por debajo de cero hace falta financiamiento. El capital mínimo necesario es lo más hondo que llega ese pozo: cuánto hay que tener para no quedarse sin plata.',
  },
  {
    termino: 'Escenarios',
    definicion: `Se usan en dos lugares y no significan lo mismo. En Economía unitaria, el churn del escenario moderado es el del plan; el pesimista es ${veces(F.pesimista)} ese churn (con tope de ${num(F.tope)}%) y el optimista ${veces(F.optimista)} (con piso de ${num(F.piso, 1)}%). En la Proyección, el escenario base usa los supuestos tal cual; el conservador aplica crecimiento ${veces(C.growth)}, ticket ${veces(C.ticket)}, CAC ${veces(C.cac)} y churn ${veces(C.churn)}; el optimista, crecimiento ${veces(O.growth)}, ticket ${veces(O.ticket)}, CAC ${veces(O.cac)} y churn ${veces(O.churn)}.`,
  },
  {
    termino: 'Beta',
    definicion:
      `El período de lanzamiento, durante el cual la comisión es 0%. Mientras dure, no hay ingresos por comisión que medir, y por eso muchas celdas dicen "sin datos". En la proyección es una etapa propia: dura los meses que se cargan en la sección ${N.gastosBeta}, con sus propios gastos y sus propias altas.`,
  },
  {
    termino: 'Etapa real',
    definicion:
      'Lo que viene después de la beta: se cobra comisión, y los gastos y el crecimiento son los que se cargan en la sección de gastos de la etapa real.',
  },
  {
    termino: 'SAS y Go / No-Go',
    definicion:
      `La SAS (Sociedad por Acciones Simplificada) es la figura legal que se está constituyendo; sus costos están en la sección ${N.tramite}. El Go / No-Go es la lista de la sección ${N.decision}: lo que tiene que estar resuelto antes de pagar el primer trámite.`,
  },
];

const PANTALLAS_ECONOMIA: PantallaExplicada[] = [
  {
    nombre: 'Diagnóstico',
    muestra: 'La conclusión, en una frase, arriba de todo. Se pone en rojo si el margen por contrato es negativo.',
    comoLeerla:
      'Leelo primero, antes que cualquier número. Si dice que cada contrato deja margen negativo, no hay nada más que mirar hasta resolverlo: más usuarios agrandan la pérdida.',
  },
  {
    nombre: 'Cuánto cuesta conseguir un cliente',
    muestra: 'El gasto en adquisición, las altas de los últimos 30 días y el CAC de las dos maneras.',
    comoLeerla:
      'Mirá el CAC por cliente real, no el CAC por registro. Si dice "sin datos", falta cargar el gasto en adquisición o todavía no hubo altas que contrataran.',
  },
  {
    nombre: 'Cuánto deja un cliente',
    muestra:
      'De dónde sale cada peso de un contrato (ticket, comisión, costo de atenderlo, margen), y el ticket, los contratos por usuario, la contribución mensual y el churn.',
    comoLeerla:
      'El margen por contrato es la cifra más importante de toda la pantalla: tiene que ser positivo. La contribución mensual es el margen multiplicado por los contratos que hace un usuario en el mes.',
  },
  {
    nombre: 'LTV y salud, en tres escenarios',
    muestra: 'Para un churn pesimista, moderado y optimista: cuánto vale un cliente (LTV) y cuántas veces devuelve lo que costó (LTV / CAC).',
    comoLeerla: `Hay tres escenarios y no uno porque la retención todavía no está medida. Buscá ${REFERENCIA_LTV_CAC}× o más en el moderado. Los números en verde cumplen la referencia, los rojos no.`,
  },
  {
    nombre: 'Caja y recuperación',
    muestra: 'La caja disponible, la quema mensual, el runway y el payback.',
    comoLeerla: `El runway dice cuánto aguanta la plata (la meta de la Fase 1 es de ${META_RUNWAY_FASE1_MESES} meses). El payback dice en cuánto tiempo se recupera lo gastado en conseguir un cliente.`,
  },
  {
    nombre: 'Retención',
    muestra: 'Un diagnóstico en palabras y una tabla por cohorte: cuántos de los que se registraron cada mes siguen contratando 1, 2 y 3 meses después.',
    comoLeerla:
      'En un marketplace de oficios la frecuencia es baja por naturaleza, así que el porcentaje se lee contra lo esperado del rubro y no contra el de una app de uso diario.',
  },
];

const PANTALLAS_PROYECCION: PantallaExplicada[] = [
  {
    nombre: 'Cotización del día',
    muestra: 'Cuántos pesos y cuántos dólares valen un euro, que es la base de todas las conversiones. El botón "Traer" busca la del día; también se puede cargar a mano. Debajo, "Mostrar todo en" elige la moneda de referencia de las columnas con el símbolo ≈.',
    comoLeerla: 'Es una sola cotización para todo el plan. Si cambia, los equivalentes que dependen de ella se recalculan.',
  },
  {
    nombre: 'Datos reales de la plataforma',
    muestra: 'Usuarios activos, contratos, contratos por usuario, ticket promedio y comisión promedio de los últimos 30 días.',
    comoLeerla:
      `Son mediciones, no supuestos. El botón "Usar datos reales" de la sección ${N.unitEconomics} los copia como punto de partida, y vale la pena usarlo apenas haya datos.`,
  },
  {
    nombre: SECCIONES_DEL_PLAN.tramite,
    muestra: 'Los costos de constituir la SAS (honorarios, tasas, publicación, capital social) con su estado: pendiente, en trámite o pagado.',
    comoLeerla:
      'Son valores orientativos: confirmalos con un contador antes de pagar. Lo que queda del capital después de constituir es con lo que arranca la beta.',
  },
  {
    nombre: SECCIONES_DEL_PLAN.gastosBeta,
    muestra:
      'Lo que se gasta por mes mientras no se cobra comisión: publicidad, abogado, infraestructura, soporte, contingencia. Cada rubro tiene su tipo (fijo, publicidad o soporte) y arriba se carga cuántos meses dura la beta. Abajo, cuánta plata queda al terminar la beta.',
    comoLeerla: `Mirá primero el capital al terminar la beta: es con lo que arranca la etapa real, y si es negativo la beta no se puede sostener. Después los meses de runway contra la meta de la Fase 1 (${META_RUNWAY_FASE1_MESES}). El tipo importa: la publicidad no es un costo fijo, es lo que compra usuarios (altas = publicidad ÷ CAC).`,
  },
  {
    nombre: SECCIONES_DEL_PLAN.gastosReal,
    muestra:
      'Lo que se gasta por mes cuando ya se cobra comisión, con la misma tabla y los mismos tipos que la beta. Arrancó como copia de la tabla de la beta. Debajo, lo que el modelo toma de ella: los costos fijos, las altas que compra la publicidad y, en amarillo, lo que no encaja.',
    comoLeerla:
      'Es la única sección donde se cargan los costos fijos y la publicidad de la etapa real: la economía unitaria y la proyección los toman de acá. Sólo suman a los costos fijos los rubros de tipo Fijo; el soporte no se suma porque se calcula por usuario.',
  },
  {
    nombre: SECCIONES_DEL_PLAN.unitEconomics,
    muestra:
      'El punto de equilibrio: cuántos usuarios activos por mes hacen falta para cubrir los costos fijos de la etapa real, a partir del ticket, la comisión, los contratos por usuario y los costos de atender.',
    comoLeerla:
      'Es la cuenta del ejemplo de la sección "La cuenta de fondo". Los costos fijos no se editan acá: vienen de los gastos de la etapa real. Si el estado dice "Margen negativo" no hay equilibrio posible. El número es una cantidad de usuarios: no cambia con la moneda. No incluye la publicidad ni reponer a los que se van: eso lo suma la proyección.',
  },
  {
    nombre: SECCIONES_DEL_PLAN.supuestos,
    muestra:
      'Los supuestos del modelo mes a mes, en cuatro grupos: usuarios, ingresos, costos e impuestos, y el selector de escenario. Los que vienen de otra sección se muestran con su valor y de dónde vienen, y no se editan acá.',
    comoLeerla:
      'De acá salen todos los gráficos y el informe. Pasá el mouse por un concepto para ver qué es; en esta guía están todos juntos en "Los supuestos de la Proyección". Los impuestos están modelados para una SAS argentina inscripta en IVA; las alícuotas son las habituales pero Ingresos Brutos depende de la provincia y Ganancias tiene tramos, así que se confirman con un contador.',
  },
  {
    nombre: SECCIONES_DEL_PLAN.resultado,
    muestra:
      'Una tabla con los cuatro horizontes juntos (1, 3, 5 y 10 años), un selector para ver uno en detalle, cuatro hitos (en qué mes cubre sus costos, en qué mes el resultado neto es positivo, capital mínimo necesario y caja acumulada), cuatro gráficos con la beta sombreada (caja acumulada, ingresos / costos / impuestos, en qué se va la plata y base de usuarios) y, bajo el botón "Ver detalle mensual", la tabla mes a mes con su etapa.',
    comoLeerla:
      'Empezá por la tabla de horizontes: dice si el negocio se sostiene y cuánto capital pide en cada plazo. Los ingresos y el EBITDA son de los últimos 12 meses de cada horizonte y no del acumulado, porque un mes suelto no dice si se sostiene y el acumulado mezcla la beta con el régimen. El "capital mínimo necesario" es lo que hay que tener para no quedarse sin caja en el peor momento del camino.',
  },
  {
    nombre: SECCIONES_DEL_PLAN.informe,
    muestra:
      'La lectura escrita del horizonte y el escenario elegidos: un titular y un resumen, el análisis por temas y un recuadro de alertas cuando hay algo que atender. Debajo, la comparación de los tres escenarios lado a lado (cuándo cubre costos, capital mínimo, caja, usuarios y LTV / CAC). Se puede copiar el informe o bajarlo como archivo .md, y el detalle mes a mes como .csv.',
    comoLeerla:
      'Es el resumen para compartir: dice con palabras lo que muestran los gráficos. Empezá por las alertas, si las hay, y mirá la fila del escenario conservador de la comparación: es el que responde "¿y si sale peor de lo que pensamos?".',
  },
  {
    nombre: `${SECCIONES_DEL_PLAN.decision} (Go / No-Go)`,
    muestra: 'Una lista de condiciones que tienen que estar resueltas antes de pagar el primer trámite, con un porcentaje de avance.',
    comoLeerla:
      'Los tres primeros pesan más: son los riesgos que pueden convertir la inversión en capital quemado. Se marca lo que ya está resuelto, no lo que se piensa resolver.',
  },
  {
    nombre: SECCIONES_DEL_PLAN.cronograma,
    muestra: 'Los hitos hacia una ronda Serie A, con fecha objetivo y estado.',
    comoLeerla: 'Es una hoja de seguimiento: las fechas son objetivos editables y se actualiza el estado a medida que se cumple cada hito.',
  },
  {
    nombre: 'Estado real',
    muestra: 'Lo que pasó en los últimos 30 días: cuánto falta para cubrir los gastos del mes, cuánto se facturó, y cuántos contratos y usuarios activos equivale lo que falta.',
    comoLeerla:
      'Está separado de la proyección a propósito: un número supuesto y uno medido se ven iguales en pantalla y no conviene confundirlos. Si todavía no hay comisiones cobradas, los dos últimos números salen de los supuestos del plan y la pantalla lo avisa.',
  },
];

/* ------------------------------------------------------------------ *
 * Los supuestos de la Proyección (sección 06), uno por uno
 * ------------------------------------------------------------------ */

export interface SupuestoExplicado {
  /** El texto del campo, tal como aparece en la pantalla. */
  etiqueta: string;
  explicacion: string;
  /**
   * Si NO se carga en esta sección: de qué sección lo toma. La pantalla lo muestra
   * como "viene de …" y no lo deja editar, para que no haya dos versiones del
   * mismo número.
   */
  viene?: string;
}

export interface GrupoDeSupuestos {
  grupo: string;
  intro: string;
  items: SupuestoExplicado[];
}

/**
 * Qué es cada campo de la sección 05 y qué hace el motor con él.
 *
 * Cada explicación sale de leer `projectFinancials` (client/utils/financialProjection.ts),
 * no de la intuición: varias cosas que parecen obvias no lo son. "Crecimiento
 * mensual" es sólo lo que ENTRA (el crecimiento neto es ése menos el churn), y es
 * de usuarios, no de la caja ni de los contratos —éstos se calculan después a
 * partir de los usuarios—. Y el crecimiento en porcentaje arrancando de cero
 * usuarios nunca arranca, porque el 10% de cero es cero. Un test fija esas
 * afirmaciones contra el motor.
 *
 * La explicación LARGA vive acá y se muestra en la guía. Al pasar el mouse por el
 * campo se ve una versión breve (client/content/conceptos.ts).
 */
export const SUPUESTOS_DE_LA_PROYECCION: GrupoDeSupuestos[] = [
  {
    grupo: 'Usuarios: cuántos hay cada mes',
    intro:
      'Estos supuestos definen la base de usuarios REGISTRADOS mes a mes: los que se dieron de alta y no se fueron. Todo lo demás —contratos, ingresos, costo de soporte— se calcula a partir de esa base. Cada mes, usuarios al cierre = usuarios + altas − bajas. Durante la beta las altas son las de la beta; desde la etapa real, las de la etapa real.',
    items: [
      {
        etiqueta: 'Mes de inicio',
        explicacion:
          'El mes en que arranca la proyección (el mes 1). Sólo cambia las etiquetas de los gráficos y de la tabla.',
      },
      {
        etiqueta: 'Usuarios registrados al arrancar',
        explicacion:
          'Cuántos usuarios registrados hay el día que empieza la proyección. En el lanzamiento son cero. Si ya hay datos reales, el botón "Arrancar de los datos reales" lo completa con los usuarios registrados de hoy.',
      },
      {
        etiqueta: 'Usuarios activos del mes (% de los registrados)',
        explicacion:
          'De cada 100 usuarios registrados, cuántos usan la plataforma en un mes (contratan al menos una vez). La economía unitaria habla de usuarios ACTIVOS —por eso sus contratos por usuario no bajan de 0,5— y la proyección cuenta usuarios REGISTRADOS, incluidos los que se dieron de alta y no volvieron. Este porcentaje pasa de uno a otro: contratos por usuario registrado = contratos por usuario activo × este porcentaje, y lo mismo con el soporte. Sin él, la proyección multiplicaba toda la base por el ritmo de los activos y sobreestimaba los ingresos. El botón "Arrancar de los datos reales" lo completa con lo que mide hoy la plataforma.',
      },
      {
        etiqueta: 'Cómo crece la base',
        explicacion:
          'Cómo se suman usuarios nuevos en la etapa real: "altas fijas" (entra la misma cantidad cada mes, la que compra la publicidad de la etapa real) o "% sobre la base" (cada mes entra un porcentaje de los que ya hay). Con cero usuarios el porcentaje no sirve: el 10% de cero es cero y la base nunca arranca. En ese caso usá altas fijas. En la beta las altas son siempre fijas.',
      },
      {
        etiqueta: 'Crecimiento mensual de usuarios',
        explicacion:
          'Usuarios nuevos que se suman cada mes, como porcentaje de los usuarios registrados que ya hay. Es sólo lo que entra: lo que se va lo define el churn, así que el crecimiento neto es este número menos el churn. No es crecimiento de la caja ni de los contratos: ésos se calculan después, a partir de los usuarios.',
      },
      {
        etiqueta: 'Altas por mes en la etapa real',
        explicacion:
          'Usuarios nuevos que se suman cada mes en la etapa real, siempre la misma cantidad. No se carga acá: es la publicidad de la tabla de gastos de la etapa real dividida por el costo de adquirir un usuario (CAC). Para tener más altas hay que subir la publicidad o bajar el CAC.',
        viene: SECCIONES_DEL_PLAN.gastosReal,
      },
      {
        etiqueta: 'Altas por mes en la beta',
        explicacion:
          'Usuarios nuevos que se suman cada mes durante la beta. No se carga acá: es la publicidad de la tabla de gastos de la beta dividida por el costo de adquirir un usuario (CAC).',
        viene: SECCIONES_DEL_PLAN.gastosBeta,
      },
      {
        etiqueta: 'Duración de la beta',
        explicacion:
          'Cuántos meses dura la beta, contados desde el mes 1 de la proyección. Mientras dura no se cobra comisión, las altas son las de la beta y los costos fijos son los de la tabla de la beta. No se carga acá: está en la sección de gastos de la beta.',
        viene: SECCIONES_DEL_PLAN.gastosBeta,
      },
      {
        etiqueta: 'Churn mensual',
        explicacion:
          'Porcentaje de los usuarios registrados que dejan de usar la plataforma cada mes. Con 10%, de cada 100 usuarios se van 10 por mes. Cuanto más alto, menos dura un usuario y más hay que gastar para reponerlo. En oficios es alto porque a un plomero no se lo llama todos los meses.',
      },
      {
        etiqueta: 'Techo de mercado (0 = sin techo)',
        explicacion:
          'Cantidad máxima de usuarios registrados que el mercado puede dar. A medida que la base se acerca al techo las altas se frenan, las de la beta también: con la base en la mitad del techo entra la mitad de las altas. En 0 no hay límite, y con crecimiento porcentual eso proyecta una curva exponencial irreal.',
      },
    ],
  },
  {
    grupo: 'Ingresos: cuánta plata entra',
    intro:
      'Los contratos del mes salen de multiplicar los usuarios por los contratos por usuario; el volumen es contratos × ticket; y DOAPP se queda con un porcentaje de ese volumen. Durante la beta ese porcentaje es 0.',
    items: [
      {
        etiqueta: 'Ticket promedio por contrato',
        explicacion:
          'Valor medio de un trabajo contratado. Es el monto del trabajo, no lo que cobra DOAPP: la comisión se calcula sobre este monto. No se carga acá: es el de Unit economics, expresado en la moneda de esta sección.',
        viene: SECCIONES_DEL_PLAN.unitEconomics,
      },
      {
        etiqueta: 'Contratos por usuario registrado / mes',
        explicacion:
          'Cuántos contratos cierra, en promedio, cada usuario registrado en un mes. Contratos del mes = usuarios × este número. No se carga acá: es el de Unit economics (por usuario ACTIVO, y por eso no baja de 0,5) multiplicado por el porcentaje de usuarios activos.',
        viene: `${SECCIONES_DEL_PLAN.unitEconomics} × % de activos`,
      },
      {
        etiqueta: 'Comisión de la plataforma',
        explicacion:
          'Porcentaje del valor de cada contrato que se queda DOAPP. Ingreso por comisión = volumen × este porcentaje. Viene de Unit economics. Durante la beta es 0% sin importar este valor.',
        viene: SECCIONES_DEL_PLAN.unitEconomics,
      },
      {
        etiqueta: 'Usuarios con membresía',
        explicacion: 'Porcentaje de los usuarios de la base que paga una membresía mensual.',
      },
      {
        etiqueta: 'Precio de la membresía / mes',
        explicacion:
          'Lo que paga por mes cada usuario con membresía. Ingreso por membresías = usuarios × % con membresía × este precio.',
      },
      {
        etiqueta: 'Publicidad de terceros (ingreso) / mes',
        explicacion:
          'Ingreso mensual fijo por publicidad de terceros dentro de la plataforma. No es lo que DOAPP gasta en publicidad propia: eso está en las tablas de gastos y es lo que compra usuarios.',
      },
      {
        etiqueta: 'La comisión se cobra con IVA incluido',
        explicacion:
          'Si está marcada, los ingresos cargados ya traen el IVA adentro, así que se lo descuenta (se divide por 1 más la alícuota) para quedarse con el ingreso real. El IVA no es de DOAPP: es del fisco.',
      },
    ],
  },
  {
    grupo: 'Costos: cuánta plata sale',
    intro:
      'Hay costos que crecen con cada usuario (soporte, infraestructura), costos que crecen con la plata que se mueve (medio de pago, disputas, fraude), costos que no dependen de nada (los fijos) y el costo de conseguir usuarios nuevos.',
    items: [
      {
        etiqueta: 'Soporte por usuario registrado / mes',
        explicacion:
          'Costo de atender a un usuario registrado en un mes. Costo de soporte = usuarios × este número. No se carga acá: es el de Unit economics (por usuario activo) multiplicado por el porcentaje de usuarios activos. En la beta el soporte se cuenta como monto fijo en la tabla de gastos de la beta y este valor no se aplica.',
        viene: `${SECCIONES_DEL_PLAN.unitEconomics} × % de activos`,
      },
      {
        etiqueta: 'Infraestructura por usuario / mes',
        explicacion:
          'Costo de servidores y servicios que crece con cada usuario (almacenamiento, mensajes). El servidor base, que se paga igual haya o no usuarios, va en la tabla de gastos como "Fijo".',
      },
      {
        etiqueta: 'Comisión del medio de pago',
        explicacion:
          'Porcentaje del volumen que se lleva el medio de pago (Mercado Pago). Dejalo en 0 si ese costo se le traslada al cliente como línea aparte, como hace hoy la plataforma con el cargo de procesamiento.',
      },
      {
        etiqueta: 'Disputas (% del volumen)',
        explicacion:
          'Plata que se pierde en disputas, como porcentaje del volumen total de los contratos: la plata que mueven, no la cantidad de contratos. Viene de Unit economics.',
        viene: SECCIONES_DEL_PLAN.unitEconomics,
      },
      {
        etiqueta: 'Fraude y contracargos (% del volumen)',
        explicacion:
          'Plata que se pierde por fraude y contracargos, como porcentaje del volumen total. Con escrow sólo se pierde lo que ya se le pagó al profesional antes de que el banco reclame. Viene de Unit economics.',
        viene: SECCIONES_DEL_PLAN.unitEconomics,
      },
      {
        etiqueta: 'Costo de adquirir un usuario (CAC)',
        explicacion:
          'Cuánto cuesta conseguir un usuario nuevo. Costo de adquisición del mes = altas × CAC. Es el gasto en publicidad dividido por las altas que consigue, y es MEZCLADO: cuenta también a los que llegan solos, sin anuncio. Cuanto más alto, menos usuarios compra la misma publicidad: las altas de las dos etapas son publicidad ÷ CAC. La verificación de identidad se paga una vez por alta, no todos los meses: va acá y no en el soporte.',
      },
      {
        etiqueta: 'Costos fijos de la etapa real',
        explicacion:
          'Lo que se paga por mes aunque no haya ni un usuario: equipo, servidor, servicios, honorarios. No se carga acá: es la suma de los rubros de tipo Fijo de la tabla de gastos de la etapa real. La publicidad no entra (ya se cuenta como altas × CAC, y sumarla acá la cuenta dos veces) ni el soporte (se calcula por usuario).',
        viene: SECCIONES_DEL_PLAN.gastosReal,
      },
      {
        etiqueta: 'Crecimiento mensual de los fijos',
        explicacion:
          'Cuánto suben los costos fijos cada mes, en porcentaje compuesto. Sirve para modelar contrataciones y aumentos. Sólo corre en la etapa real: durante la beta no se contrata. En 0 los fijos no cambian durante toda la proyección.',
      },
      {
        etiqueta: 'Costos con IVA computable',
        explicacion:
          'Qué porcentaje de los costos incluye IVA que se puede descontar (crédito fiscal). Servidores y servicios lo tienen; sueldos y tasas, no.',
      },
    ],
  },
  {
    grupo: 'Impuestos: cuánto se lleva el fisco',
    intro:
      'Están modelados para una SAS argentina inscripta en IVA. Las alícuotas son las habituales: se confirman con un contador.',
    items: [
      {
        etiqueta: 'IVA',
        explicacion:
          'Alícuota del IVA. DOAPP cobra IVA por sus ingresos (débito) y descuenta el de sus gastos (crédito): paga la diferencia, y si le sobra crédito se arrastra al mes siguiente.',
      },
      {
        etiqueta: 'Ingresos Brutos',
        explicacion:
          'Porcentaje sobre la facturación neta que se paga a la provincia. Depende de la provincia y de la actividad.',
      },
      {
        etiqueta: 'Débitos y créditos bancarios',
        explicacion:
          'Impuesto sobre cada peso que entra y sale de la cuenta bancaria: se calcula sobre los ingresos más los egresos del mes.',
      },
      {
        etiqueta: 'Impuesto a las Ganancias',
        explicacion:
          'Porcentaje sobre la utilidad del mes, después de Ingresos Brutos y del impuesto bancario. Las pérdidas de meses anteriores se descuentan antes de calcularlo.',
      },
    ],
  },
];

/** Para buscar la explicación de un campo por su texto. */
export const EXPLICACION_DE_SUPUESTO: Record<string, string> = Object.fromEntries(
  SUPUESTOS_DE_LA_PROYECCION.flatMap((g) => g.items.map((i) => [i.etiqueta, i.explicacion])),
);

export const GUIA: Seccion[] = [
  {
    id: 'objetivo',
    titulo: 'Para qué sirve este análisis',
    resumen: 'Las tres preguntas que responde y las decisiones que apoya.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'DOAPP todavía no tiene suficiente historia para saber, midiendo, si el negocio funciona. Este análisis es la manera de responderlo antes de gastar plata: con cuentas explícitas que cualquiera puede revisar, discutir y corregir.',
      },
      { tipo: 'parrafo', texto: 'Responde tres preguntas:' },
      {
        tipo: 'lista',
        items: [
          '¿Cada cliente deja más de lo que cuesta conseguirlo y atenderlo? Lo responde la pestaña Economía unitaria.',
          `¿Cuánta plata hace falta para llegar al lanzamiento y cuánto dura? Lo responden las secciones ${N.tramite}, ${N.gastosBeta} y ${N.gastosReal} de la pestaña Proyección.`,
          `¿Cuántos usuarios hacen falta para que el negocio se sostenga solo, y en qué mes ocurre, a 1, 3, 5 y 10 años? Lo responden las secciones ${N.unitEconomics}, ${N.supuestos} y ${N.resultado}.`,
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          `Con esas respuestas se toman tres decisiones: si conviene gastar en publicidad para conseguir usuarios, si conviene pagar ya los trámites de constitución de la sociedad (el Go / No-Go de la sección ${N.decision}) y cuánto capital hay que conseguir.`,
      },
      {
        tipo: 'aviso',
        tono: 'cuidado',
        texto:
          'Hoy casi todo lo que se ve son supuestos y no mediciones: la plataforma recién arranca. Cada número dice cuál es —medido, supuesto, mixto o sin datos— y conviene leerlo siempre junto con esa etiqueta.',
      },
    ],
  },
  {
    id: 'pestanas',
    titulo: 'Las dos pestañas y cómo se relacionan',
    resumen: 'Economía unitaria para decidir, Proyección para operar.',
    bloques: [
      { tipo: 'parrafo', texto: 'Hay dos pestañas y responden preguntas distintas:' },
      {
        tipo: 'lista',
        items: [
          'Economía unitaria responde si el negocio cierra: si conseguir un cliente cuesta menos de lo que ese cliente deja y en cuánto tiempo se recupera lo gastado. Combina datos reales de la plataforma con los supuestos del plan.',
          'Proyección es la hoja de trabajo: se cargan supuestos (crecimiento, precios, costos, impuestos) y muestra qué pasaría mes a mes. Se guarda sola.',
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          `Comparten los mismos supuestos: el ticket, el soporte y los costos fijos de Economía unitaria son los de la Proyección, no una copia. Corregir un supuesto corrige las dos pestañas, y no hay que tocarlos por separado. Dentro de la Proyección, cada número se carga en una sola sección y las demás lo toman de ahí: está explicado en "Las etapas del plan y qué se carga dónde".`,
      },
      {
        tipo: 'parrafo',
        texto:
          'Una manera de recordarlo: la Proyección sirve para operar ("si pasa tal cosa, cuánto gano") y Economía unitaria sirve para decidir ("conviene poner más plata en conseguir clientes").',
      },
    ],
  },
  {
    id: 'etapas',
    titulo: 'Las etapas del plan y qué se carga dónde',
    resumen: 'Beta, etapa real y proyección: cada número se carga una sola vez.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'La pestaña Proyección sigue el orden en que se piensa el negocio: primero lo que se gasta en la beta, después lo que se gasta cuando ya se cobra comisión, y de ahí la proyección a 1, 3, 5 y 10 años. Las secciones están agrupadas en esas etapas.',
      },
      {
        tipo: 'terminos',
        items: [
          {
            termino: `Etapa 1 · Beta (${N.gastosBeta})`,
            definicion:
              'No se cobra comisión. Se cargan los gastos mensuales de la beta y cuántos meses dura. La publicidad de esta etapa compra los usuarios de la beta. Abajo se ve cuánta plata queda al terminar.',
          },
          {
            termino: `Etapa 2 · Etapa real (${N.gastosReal} y ${N.unitEconomics})`,
            definicion:
              'Se cobra comisión. Se cargan los gastos de esta etapa y lo que deja cada usuario: ticket, comisión, contratos por usuario, soporte, disputas y fraude.',
          },
          {
            termino: `Etapa 3 · Proyección (${N.supuestos} a ${N.informe})`,
            definicion:
              'Junta las dos etapas mes a mes, con impuestos, hasta 10 años, y lo resume a 1, 3, 5 y 10 años. Lo que viene de otra sección no se carga acá: se muestra con "viene de…".',
          },
        ],
      },
      { tipo: 'subtitulo', texto: 'Cada número se carga una sola vez' },
      {
        tipo: 'terminos',
        items: [
          {
            termino: 'Costos fijos de la etapa real',
            definicion: `Se cargan en la sección ${N.gastosReal}, en los rubros de tipo Fijo. Unit economics y la proyección los toman de ahí.`,
          },
          {
            termino: 'Publicidad → usuarios nuevos',
            definicion:
              'La publicidad de cada tabla de gastos dividida por el costo de adquirir un usuario (CAC) da los usuarios nuevos por mes de esa etapa. No hay un campo de altas aparte.',
            formula: 'altas por mes = publicidad por mes ÷ CAC',
          },
          {
            termino: 'Ticket, comisión, soporte, disputas y fraude',
            definicion: `Se cargan en la sección ${N.unitEconomics}, por usuario ACTIVO. La proyección los toma de ahí.`,
          },
          {
            termino: 'Duración de la beta',
            definicion: `Se carga en la sección ${N.gastosBeta}. Por defecto son los meses que faltan hasta la fecha de cierre de la beta.`,
          },
          {
            termino: 'Lo que se carga en la proyección',
            definicion:
              'El churn, el techo de mercado, el CAC, el porcentaje de usuarios activos, la infraestructura por usuario, las membresías, la publicidad que se cobra a terceros, el crecimiento de los fijos y los impuestos.',
          },
        ],
      },
      {
        tipo: 'aviso',
        tono: 'info',
        texto:
          'Por qué: antes la proyección tenía su propio ticket, sus propios costos fijos y sus propias altas, que no coincidían con los de Unit economics, y el informe contradecía a la pantalla de al lado sin que nada avisara. Ahora lo que viene de otra sección no se puede editar donde se lo ve.',
      },
      { tipo: 'subtitulo', texto: 'Qué es cada tipo de gasto' },
      {
        tipo: 'terminos',
        items: [
          {
            termino: ROTULO_DE_TIPO.fijo,
            definicion:
              'Se paga igual haya o no usuarios: abogado, servidores, sueldos, contingencia. Entra a los costos fijos del modelo.',
          },
          {
            termino: ROTULO_DE_TIPO.adquisicion,
            definicion:
              'Plata para conseguir usuarios. NO es un costo fijo: el modelo la convierte en altas dividiéndola por el CAC, y el costo de adquisición del mes sale de esas altas. Contarla también como fija la cuenta dos veces.',
          },
          {
            termino: ROTULO_DE_TIPO.soporte,
            definicion:
              'Atención y disputas. En la beta, con pocos usuarios, se hace a mano y cuenta como monto fijo. En la etapa real se calcula por usuario (con los supuestos de Unit economics), así que un rubro de soporte en esa tabla no se suma y la pantalla avisa. Si es un sueldo o un servicio que se paga igual, cambiale el tipo a Fijo.',
          },
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          'El tipo se deduce del nombre del rubro (por ejemplo, "Meta Ads" es publicidad) y se puede cambiar a mano; lo que se elige a mano manda sobre el nombre.',
      },
      { tipo: 'subtitulo', texto: 'Usuarios registrados y usuarios activos' },
      {
        tipo: 'parrafo',
        texto: `Unit economics cuenta usuarios ACTIVOS: personas que contrataron en los últimos 30 días, y por eso los contratos por usuario no bajan de 0,5 (cada contrato involucra a dos personas). La proyección cuenta usuarios REGISTRADOS, incluidos los que se dieron de alta y no volvieron. Para pasar de uno a otro hay un porcentaje (usuarios activos del mes, ${num(ACTIVOS_PCT_POR_DEFECTO)}% de arranque): contratos por usuario registrado = contratos por usuario activo × ese porcentaje, y lo mismo con el soporte.`,
      },
    ],
  },
  {
    id: 'procedencia',
    titulo: 'Cómo leer cada número: medido, supuesto, mixto, sin datos',
    resumen: 'La etiqueta de color que dice de dónde sale cada cifra.',
    bloques: [
      { tipo: 'parrafo', texto: 'Cada número de Economía unitaria lleva una etiqueta que dice de dónde sale:' },
      {
        tipo: 'terminos',
        items: [
          { termino: 'medido', definicion: 'Sale de datos reales de la plataforma (usuarios, contratos, pagos). Es un hecho.' },
          { termino: 'supuesto', definicion: 'Alguien lo cargó en el plan. Es una hipótesis: puede ser razonable y seguir siendo una apuesta.' },
          { termino: 'mixto', definicion: 'Combina una parte medida con una parte supuesta.' },
          { termino: 'sin datos', definicion: 'Todavía no se puede calcular. En vez de un cero, la celda dice qué falta para poder calcularlo.' },
        ],
      },
      {
        tipo: 'aviso',
        tono: 'info',
        texto:
          'Por qué nunca se dibuja un cero donde falta el dato: un tablero lleno de ceros se lee como "el negocio va mal" cuando en realidad no hay nada que medir todavía. Y meses después nadie recuerda qué celda era una medición y cuál era un supuesto.',
      },
    ],
  },
  {
    id: 'cuenta',
    titulo: 'La cuenta de fondo, con un ejemplo',
    resumen: 'De un trabajo contratado al punto de equilibrio, paso por paso.',
    bloques: [
      { tipo: 'parrafo', texto: 'Casi todo el análisis sale de una misma cuenta, que se hace por usuario activo y por mes:' },
      {
        tipo: 'formula',
        lineas: [
          'volumen = ticket × contratos por mes',
          'ingreso = volumen × comisión',
          'costo = soporte + volumen × (disputas % + fraude %)',
          'margen de contribución = ingreso − costo',
          'punto de equilibrio = costos fijos ÷ margen de contribución',
        ],
      },
      {
        tipo: 'parrafo',
        texto: `Un ejemplo resuelto, con los valores con que arranca el plan: un trabajo de ${usd(A.ticket, 0)}, ${num(A.contratos, 1)} contratos por usuario al mes y ${num(A.comision)}% de comisión.`,
      },
      {
        tipo: 'pasos',
        items: [
          `Volumen: ${usd(A.ticket, 0)} × ${num(A.contratos, 1)} = ${usd(unidad.volumen)} por usuario y por mes.`,
          `Ingreso para DOAPP: ${usd(unidad.volumen)} × ${num(A.comision)}% = ${usd(unidad.exacto.ingreso)}.`,
          `Costo de atenderlo: ${usd(A.soporte)} de soporte más ${usd(costoVariableDelEjemplo, 4)} entre disputas (${num(A.disputas, 1)}% del volumen) y fraude (${num(A.fraude, 1)}%), en total ${usd(unidad.exacto.costo, 4)}.`,
          `Margen de contribución: ${usd(unidad.exacto.ingreso)} − ${usd(unidad.exacto.costo, 4)} = ${usd(unidad.exacto.margen, 4)} por usuario y por mes.`,
          `Con ${usd(A.fijos, 0)} de costos fijos por mes: ${usd(A.fijos, 0)} ÷ ${usd(unidad.exacto.margen, 4)} = ${num(equilibrioDelEjemplo ?? 0)} usuarios activos.`,
        ],
      },
      {
        tipo: 'aviso',
        tono: 'cuidado',
        texto: `Fijate lo que muestra el ejemplo: el margen es una diferencia chica entre dos números grandes (apenas el ${num(margenSobreIngresoPct, 1)}% del ingreso). Por eso un cambio mínimo en el soporte, en las disputas o en la comisión mueve muchísimo el punto de equilibrio. Y si el margen llega a cero o a negativo no hay cantidad de usuarios que alcance, porque cada usuario nuevo agrega pérdida. Es lo primero que hay que mirar.`,
      },
      {
        tipo: 'parrafo',
        texto:
          'El punto de equilibrio es una cantidad de usuarios y no un monto, así que no cambia al cambiar de moneda: lo que sí cambia es el valor de los costos y del margen, que se ven en la moneda elegida.',
      },
    ],
  },
  {
    id: 'glosario',
    titulo: 'Glosario',
    resumen: 'Cada término que aparece en las pantallas, en lenguaje común.',
    bloques: [{ tipo: 'terminos', items: GLOSARIO }],
  },
  {
    id: 'pantallas',
    titulo: 'Pantalla por pantalla',
    resumen: 'Qué muestra cada bloque y cómo leerlo.',
    bloques: [
      { tipo: 'subtitulo', texto: 'Pestaña Economía unitaria' },
      { tipo: 'pantallas', items: PANTALLAS_ECONOMIA },
      { tipo: 'subtitulo', texto: 'Pestaña Proyección (en el orden en que aparece)' },
      { tipo: 'pantallas', items: PANTALLAS_PROYECCION },
    ],
  },
  {
    id: 'supuestos',
    titulo: `Los supuestos de la Proyección (sección ${N.supuestos}), uno por uno`,
    resumen: 'Qué significa cada campo y qué hace el modelo con él.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          `La sección ${N.supuestos} tiene unos treinta supuestos. Acá están todos, agrupados como en la pantalla y en el orden en que el modelo los usa. En la pantalla cada concepto trae una explicación breve al pasar el mouse; acá está la completa. Los que dicen "viene de" no se cargan en esa sección: los toma de otra.`,
      },
      { tipo: 'subtitulo', texto: 'El orden en que el modelo hace la cuenta, mes a mes' },
      {
        tipo: 'formula',
        lineas: [
          'altas = publicidad del mes ÷ CAC   (o usuarios × crecimiento %, en la etapa real), frenadas por el techo',
          'bajas = usuarios × churn %',
          'usuarios al cierre = usuarios + altas − bajas',
          'contratos = usuarios promedio del mes × contratos por usuario registrado',
          'volumen = contratos × ticket',
          'ingreso = volumen × comisión % (0 en la beta) + usuarios × % con membresía × precio + publicidad de terceros',
          'costos = (soporte + infraestructura) × usuarios + (medio de pago + disputas + fraude) % × volumen + CAC × altas + costos fijos',
          'EBITDA = ingreso neto − costos  →  impuestos  →  resultado neto  →  caja',
        ],
      },
      {
        tipo: 'aviso',
        tono: 'cuidado',
        texto:
          'Una trampa: si se arranca con cero usuarios y se elige crecimiento en porcentaje, la base nunca arranca, porque el 10% de cero es cero. Con cero usuarios iniciales hay que usar altas fijas.',
      },
      {
        tipo: 'aviso',
        tono: 'info',
        texto:
          `La caja con la que arranca la proyección no es un supuesto de esta sección: es el capital que queda después de pagar la constitución de la sociedad (sección ${N.tramite}). Los gastos de la beta (${N.gastosBeta}) la van gastando desde el mes 1.`,
      },
      ...SUPUESTOS_DE_LA_PROYECCION.flatMap((g): Bloque[] => [
        { tipo: 'subtitulo', texto: g.grupo },
        { tipo: 'parrafo', texto: g.intro },
        {
          tipo: 'terminos',
          items: g.items.map((i) => ({ termino: i.etiqueta, definicion: i.explicacion })),
        },
      ]),
    ],
  },
  {
    id: 'primeros-valores',
    titulo: 'Qué valores poner cuando todavía no hay datos',
    resumen: 'Soporte, disputas y fraude: los mínimos supuestos del plan y cómo reemplazarlos.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'El soporte, las disputas y el fraude son los tres supuestos más difíciles de estimar antes del lanzamiento: no hay volumen que medir. Dejarlos en cero hace ver un negocio mejor de lo que es, e inventar números sin base es peor. Por eso el plan arranca con los mínimos que se pueden defender, y cada uno sale de una cuenta que se puede discutir:',
      },
      {
        tipo: 'terminos',
        items: [
          {
            termino: `Soporte: ${usd(A.soporte)} por usuario activo y mes`,
            definicion: `${num(BASE_DE_LOS_SUPUESTOS_MINIMOS.pedidosDeSoportePorUsuarioYMes, 1)} pedidos de soporte por usuario y por mes (uno cada cinco meses) × ${num(BASE_DE_LOS_SUPUESTOS_MINIMOS.minutosPorPedidoDeSoporte)} minutos × ${usd(BASE_DE_LOS_SUPUESTOS_MINIMOS.costoDeLaHoraUsd, 0)} la hora = ${usd(SUPUESTOS_MINIMOS_SIN_REDONDEAR.soporte)}, redondeado a ${usd(A.soporte)}. No incluye la verificación de identidad: se paga una vez por alta, no todos los meses, y va en el CAC.`,
          },
          {
            termino: `Disputas: ${num(A.disputas)}% del volumen`,
            definicion: `${num(BASE_DE_LOS_SUPUESTOS_MINIMOS.disputasCada100Contratos)} de cada 100 contratos terminan en disputa y cada una lleva ${num(BASE_DE_LOS_SUPUESTOS_MINIMOS.horasPorDisputa, 1)} horas × ${usd(BASE_DE_LOS_SUPUESTOS_MINIMOS.costoDeLaHoraUsd, 0)} la hora. Sobre un ticket de ${usd(A.ticket, 0)}, eso es el ${num(SUPUESTOS_MINIMOS_SIN_REDONDEAR.disputas, 2)}% del volumen, redondeado a ${num(A.disputas)}%.`,
          },
          {
            termino: `Fraude y contracargos: ${num(A.fraude, 1)}% del volumen`,
            definicion:
              'No se calcula: se supone. Con el pago retenido hasta que el cliente confirma y la identidad verificada, se espera que quede por debajo del 0,5% que suele tomarse de referencia para pagos online. Es el más incierto de los tres: un solo contracargo después de liberar el pago se come el contrato entero.',
          },
        ],
      },
      {
        tipo: 'aviso',
        tono: 'cuidado',
        texto:
          'Son supuestos, no mediciones: ninguno de los números de esas cuentas (el costo de la hora, cuántos pedidos, cuántas disputas) está medido. Sirven para no arrancar de cero, no para decidir con ellos.',
      },
      { tipo: 'subtitulo', texto: 'Cómo reemplazarlos por datos reales' },
      {
        tipo: 'pasos',
        items: [
          'Disputas: contratos en disputa ÷ contratos creados. "Estado real" ya muestra los dos de los últimos 30 días. Con unas decenas de contratos ya orienta; con cien, es un dato. Multiplicalo por las horas que lleva atender cada una.',
          'Soporte: pedidos de soporte del mes ÷ usuarios activos, por el tiempo que lleva cada uno. Los pedidos están en el centro de ayuda de la plataforma (tickets).',
          'Fraude: contracargos reclamados por el medio de pago ÷ volumen cobrado. Hasta que haya un contracargo real, el 0,3% queda como supuesto.',
          'Cuando haya medición, se carga en Unit economics y la proyección se actualiza sola: no hay que tocar nada más.',
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          'Una forma de saber si lo que se carga es razonable: el costo por contrato (soporte ÷ contratos por usuario + volumen × disputas y fraude) tiene que quedar en el mismo orden que lo que el código usa para fijar el mínimo de una ampliación. Si el plan da un costo muy distinto, Economía unitaria lo avisa.',
      },
    ],
  },
  {
    id: 'monedas',
    titulo: 'Monedas y cotizaciones',
    resumen: 'Cómo se cambia de moneda y de dónde sale la cotización.',
    bloques: [
      {
        tipo: 'parrafo',
        texto:
          'Las cuentas se pueden ver en pesos, dólares o euros. Todo se convierte a través del euro: la cotización del plan dice cuántos pesos y cuántos dólares valen un euro, y de ahí se pasa a cualquier moneda.',
      },
      {
        tipo: 'parrafo',
        texto:
          'La cotización sale del dólar blue (precio de venta) de dolarapi.com o de Bluelytics, y el euro se calcula cruzándolo con ese dólar. El botón "Traer" busca la del día; si no se puede, aparece un aviso y se carga a mano.',
      },
      { tipo: 'subtitulo', texto: `La sección ${N.unitEconomics} (Unit economics) convierte` },
      {
        tipo: 'parrafo',
        texto:
          'Al cambiar la "Moneda de la sección" se puede ir de cualquier moneda a cualquier otra, en el orden que sea, y los importes (ticket, soporte y costos fijos) se muestran siempre en su valor equivalente. El plan recuerda cada importe tal como se escribió y en qué moneda, y deriva desde ahí todo lo demás: por eso ir de dólares a pesos, a euros y volver a dólares devuelve exactamente el número del principio, sin acumular diferencias de redondeo.',
      },
      {
        tipo: 'lista',
        items: [
          'Los porcentajes (comisión, disputas, fraude) y las cantidades (contratos, usuarios) no cambian con la moneda, porque no son plata.',
          'Si se escribe un importe estando en otra moneda, ese pasa a ser el original de ese campo: por ejemplo, escribir 20 estando en euros fija "20 euros", y en pesos se verá su equivalente.',
          'Si cambia la cotización, los equivalentes se recalculan solos: lo escrito en dólares sigue valiendo lo mismo en dólares y su valor en pesos sale con la cotización nueva.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Las tablas de gastos declaran, no convierten' },
      {
        tipo: 'aviso',
        tono: 'cuidado',
        texto: `En las secciones ${N.tramite}, ${N.gastosBeta} y ${N.gastosReal} el selector de moneda indica en qué moneda se cargaron los montos: cambiarlo NO convierte los números, solamente le avisa al plan en qué moneda están. Por eso cada monto se carga en la moneda en que se paga o se cobra, y la columna de equivalencia ya los muestra en la moneda de referencia.`,
      },
      { tipo: 'subtitulo', texto: `La sección ${N.supuestos} convierte lo que se carga en ella` },
      {
        tipo: 'parrafo',
        texto:
          'Al cambiar la moneda de la proyección se convierten los importes que se cargan a mano en ella (el CAC, la infraestructura por usuario, el precio de la membresía y la publicidad de terceros) y se recalcula lo que viene de otras secciones, que ya está expresado en la moneda nueva. Es necesario: si el ticket cambiara de moneda y el CAC no, la proyección compraría más o menos usuarios con la misma publicidad sólo por mirarla en otra moneda.',
      },
    ],
  },
  {
    id: 'decidir',
    titulo: 'Cómo usarlo para decidir',
    resumen: 'El orden de lectura, de lo que más importa a lo que menos.',
    bloques: [
      { tipo: 'parrafo', texto: 'Este es el orden en que conviene leer los números. Cada paso depende del anterior:' },
      {
        tipo: 'pasos',
        items: [
          'El margen. ¿Cada contrato (y cada usuario) deja un margen positivo? Si es negativo, nada de lo que sigue importa: más usuarios agrandan la pérdida. Las salidas son subir el ticket mínimo, bajar el costo de atender (automatizar disputas y soporte) o subir la comisión.',
          `El LTV / CAC. En el escenario moderado, ${REFERENCIA_LTV_CAC}× o más es sano. Entre 1× y ${REFERENCIA_LTV_CAC}× alcanza para sostener pero no para escalar gastando más. Por debajo de 1× se pierde plata con cada cliente conseguido, y aumentar la publicidad multiplica la pérdida.`,
          'El payback. ¿En cuántos meses se recupera lo gastado en conseguir un cliente? Cuanto más corto, antes se libera plata para volver a invertir.',
          `El runway. ¿Cuántos meses aguanta el capital? La meta de la Fase 1 es de ${META_RUNWAY_FASE1_MESES} meses.`,
          'La retención. ¿Los usuarios vuelven a contratar? Es el dato que más cambia todo lo anterior y el que todavía no se puede medir.',
          'El Go / No-Go. Recién con todo lo anterior claro se decide si se paga el primer trámite de constitución.',
        ],
      },
      {
        tipo: 'aviso',
        tono: 'info',
        texto:
          'Antes del lanzamiento, el diagnóstico va a decir que no hay negocio que medir todavía: eso es lo esperable. Lo único que se puede hacer hoy es fijar de antemano cuánto se está dispuesto a pagar por un cliente, para tener contra qué comparar cuando empiece a haberlos.',
      },
    ],
  },
  {
    id: 'preguntas',
    titulo: 'Preguntas frecuentes',
    resumen: 'Lo que más se pregunta al abrir estas pantallas.',
    bloques: [
      {
        tipo: 'preguntas',
        items: [
          {
            pregunta: 'Una celda dice "sin datos" o "sin CAC todavía". ¿Está mal?',
            respuesta:
              'No: dice que ese número todavía no se puede calcular y por qué. Antes del lanzamiento casi todo lo medido está en ese estado. El CAC necesita que se cargue el gasto en adquisición y que haya altas que contraten; el LTV / CAC necesita el CAC.',
          },
          {
            pregunta: 'Cambié la moneda y el punto de equilibrio no cambió. ¿Funciona?',
            respuesta:
              'Sí. El punto de equilibrio es una cantidad de usuarios, no un monto, así que da lo mismo en pesos, dólares o euros. Lo que cambia son los importes (ticket, margen, costos fijos). Si cambiara, sería un error.',
          },
          {
            pregunta: '¿Se guarda solo?',
            respuesta:
              'Sí, un instante después de cada cambio. Arriba se ve "Guardando…", "Guardado" o "Error al guardar". Si se intenta cerrar la pestaña con cambios sin guardar, el navegador avisa.',
          },
          {
            pregunta: '¿Por qué no puedo editar el ticket ni los costos fijos en la proyección?',
            respuesta: `Porque se cargan en otra sección y la proyección los toma de ahí. Antes había un ticket en Unit economics y otro en la proyección, y no coincidían: el informe contradecía a la pantalla de al lado. Ahora el ticket, la comisión, el soporte, las disputas y el fraude se cargan en la sección ${N.unitEconomics}; los costos fijos y la publicidad, en las tablas de gastos (${N.gastosBeta} y ${N.gastosReal}). Donde no se editan dice "viene de …".`,
          },
          {
            pregunta: '¿Por qué los costos fijos no incluyen la publicidad ni el soporte?',
            respuesta:
              'Porque ya se cuentan de otra manera y sumarlos acá los contaría dos veces. La publicidad compra usuarios: el modelo la divide por el CAC para sacar las altas, y el costo de adquisición del mes sale de esas altas. El soporte, en la etapa real, se calcula por usuario. Si algo de eso es un monto que se paga igual haya o no usuarios (un sueldo, un servicio), cambiale el tipo a Fijo y entra.',
          },
          {
            pregunta: '¿Qué valores pongo en soporte, disputas y fraude si todavía no hay datos?',
            respuesta: `Los del plan de arranque, que son supuestos mínimos y no mediciones: soporte de ${usd(A.soporte)} por usuario activo y mes, disputas de ${num(A.disputas)}% del volumen y fraude de ${num(A.fraude, 1)}%. La cuenta de cada uno está en "Qué valores poner cuando todavía no hay datos", junto con cómo reemplazarlos apenas haya datos. Evitá dejarlos en cero: hace ver un negocio mejor de lo que es.`,
          },
          {
            pregunta: '¿Por qué hay un porcentaje de usuarios activos en la proyección?',
            respuesta:
              'Porque la proyección cuenta usuarios registrados y Unit economics cuenta usuarios activos. Sin ese porcentaje, la proyección multiplicaba toda la base de registrados por el ritmo de contratación de los activos y sobreestimaba los ingresos varias veces.',
          },
          {
            pregunta: '¿Quién puede ver esto?',
            respuesta:
              'El owner y los colaboradores con el rol de analista. El analista ve únicamente estas pantallas: no incluye usuarios, pagos, contratos ni documentación de identidad.',
          },
          {
            pregunta: '¿Los números son reales?',
            respuesta:
              'Sólo los que dicen "medido". Todo lo marcado como "supuesto" es una hipótesis cargada por una persona, y se puede corregir en la Proyección.',
          },
          {
            pregunta: '¿Por qué me da "Margen negativo"? ¿Qué hago?',
            respuesta: `Es la advertencia más importante. Significa que cada usuario activo cuesta más de lo que deja: lo que deja en un mes es ticket × contratos × comisión, y lo que cuesta atenderlo es el soporte más un porcentaje del volumen por disputas y fraude. Por ejemplo, con un ticket de ${usd(NEGATIVO.ticket, 0)}, ${num(NEGATIVO.contratos, 2)} contratos por usuario, ${num(NEGATIVO.comision)}% de comisión, soporte de ${usd(NEGATIVO.soporte)}, disputas de ${num(NEGATIVO.disputas, 1)}% y fraude de ${num(NEGATIVO.fraude, 1)}%, el usuario deja ${usd(unidadNegativa.exacto.ingreso, 3)} y cuesta ${usd(unidadNegativa.exacto.costo, 3)}: margen de ${usdConSigno(unidadNegativa.exacto.margen)}. Casi siempre lo da vuelta uno de cuatro supuestos: pocos contratos por usuario, un soporte alto frente a lo que deja cada usuario, disputas y fraude altos, o un ticket chico (la comisión es un porcentaje del ticket). Los costos fijos no influyen en el signo: sólo deciden cuántos usuarios hacen falta cuando el margen ya es positivo. Antes de buscar otra causa, revisá que los importes estén bien cargados y en la moneda de la sección. Hay que resolverlo antes de gastar en conseguir usuarios; las salidas están en "Cómo usarlo para decidir".`,
          },
        ],
      },
    ],
  },
  {
    id: 'limites',
    titulo: 'Lo que este análisis no dice',
    resumen: 'Sus límites, dichos de frente.',
    bloques: [
      {
        tipo: 'lista',
        items: [
          'No predice: es un modelo. Un supuesto razonable puede estar equivocado, y por eso hay tres escenarios en lugar de uno.',
          'No mide la retención todavía. Mientras no pase al menos un mes completo con usuarios reales, el churn es un supuesto.',
          'Los impuestos son orientativos. Están modelados para una SAS argentina inscripta en IVA con las alícuotas habituales, pero Ingresos Brutos depende de la provincia y Ganancias tiene tramos. Se confirman con un contador.',
          'Los costos de constitución son valores orientativos: los aranceles y honorarios varían y se confirman antes de pagar.',
          'No es asesoramiento contable ni legal.',
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * La ayuda corta que va dentro de cada pantalla
 * ------------------------------------------------------------------ */

export const AYUDA_DE_PANTALLA: Record<
  PantallaConAyuda,
  { titulo: string; responde: string; pasos: string[] }
> = {
  'economia-unitaria': {
    titulo: '¿Cómo se lee esta pantalla?',
    responde: '¿Conseguir un cliente cuesta menos de lo que deja, y en cuánto tiempo se recupera?',
    pasos: [
      'Empezá por el Diagnóstico de arriba: es la conclusión en una frase.',
      'Mirá "Cuánto deja un cliente": si el margen por contrato es negativo, nada más importa.',
      `En la tabla de escenarios buscá un LTV / CAC de ${REFERENCIA_LTV_CAC}× o más en el moderado.`,
      'Fijate la etiqueta de cada número: medido, supuesto, mixto o sin datos.',
    ],
  },
  proyeccion: {
    titulo: '¿Cómo se lee esta pantalla?',
    responde: '¿Cuánta plata hace falta, cuánto dura y cuántos usuarios hacen falta para sostenerse?',
    pasos: [
      'Arriba elegí la cotización del día; cada sección tiene su moneda.',
      `En ${SECCIONES_DEL_PLAN.gastosBeta} mirá cuánta plata queda al terminar la beta y cuántos meses dura el capital: la meta de la Fase 1 es de ${META_RUNWAY_FASE1_MESES}.`,
      `En ${SECCIONES_DEL_PLAN.gastosReal} cargá lo que se gasta cuando se cobra comisión; los costos fijos y las altas salen de ahí.`,
      `En ${SECCIONES_DEL_PLAN.unitEconomics} está el punto de equilibrio, en usuarios activos.`,
      `En ${SECCIONES_DEL_PLAN.resultado}, a 1, 3, 5 y 10 años: en qué mes cubre sus costos y cuánto capital hace falta como mínimo.`,
    ],
  },
};
