import { COMMISSION_RATES } from '../../shared/constants/membershipPricing';
import {
  calcularUnidad,
  mauDeEquilibrio,
  FACTORES_DE_CHURN,
  META_RUNWAY_FASE1_MESES,
  REFERENCIA_LTV_CAC,
  SUPUESTOS_UE_DE_ARRANQUE,
} from '../../shared/pricing/unidadEconomica';
import { SCENARIOS } from '../utils/financialProjection';

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
      'Lo que deja un usuario activo en un mes después de pagar lo que cuesta atenderlo. Es lo que "contribuye" a cubrir los costos fijos.',
    formula: 'ingreso − (soporte + volumen × (disputas % + fraude %))',
  },
  {
    termino: 'Costos fijos',
    definicion:
      'Lo que se paga por mes aunque no haya ni un usuario: equipo, infraestructura, herramientas. También se llama quema mensual.',
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
      'El período de lanzamiento, durante el cual la comisión es 0%. Mientras dure, no hay ingresos por comisión que medir, y por eso muchas celdas dicen "sin datos".',
  },
  {
    termino: 'SAS y Go / No-Go',
    definicion:
      'La SAS (Sociedad por Acciones Simplificada) es la figura legal que se está constituyendo; sus costos están en la sección 01. El Go / No-Go es la lista de la sección 04: lo que tiene que estar resuelto antes de pagar el primer trámite.',
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
      'Son mediciones, no supuestos. El botón "Usar datos reales" de la sección 03 los copia como punto de partida, y vale la pena usarlo apenas haya datos.',
  },
  {
    nombre: '01 · Trámite',
    muestra: 'Los costos de constituir la SAS (honorarios, tasas, publicación, capital social) con su estado: pendiente, en trámite o pagado.',
    comoLeerla:
      'Son valores orientativos: confirmalos con un contador antes de pagar. Lo que queda del capital después de constituir es lo que alimenta el runway.',
  },
  {
    nombre: '02 · Runway',
    muestra: 'El presupuesto mensual de lanzamiento en un solo barrio (publicidad, abogado, infraestructura, soporte, contingencia) y cuántos meses dura el capital.',
    comoLeerla: `Mirá los meses de runway contra la meta de la Fase 1: ${META_RUNWAY_FASE1_MESES}. Si los costos de constitución superan el capital, la pantalla lo avisa: no queda nada para validar.`,
  },
  {
    nombre: '03 · Unit economics',
    muestra:
      'El punto de equilibrio: cuántos usuarios activos por mes hacen falta para cubrir los costos fijos, a partir del ticket, la comisión, los contratos por usuario y los costos de atender.',
    comoLeerla:
      'Es la cuenta del ejemplo de la sección "La cuenta de fondo". Si el estado dice "Margen negativo" no hay equilibrio posible. El número es una cantidad de usuarios: no cambia con la moneda.',
  },
  {
    nombre: '04 · Decisión (Go / No-Go)',
    muestra: 'Una lista de condiciones que tienen que estar resueltas antes de pagar el primer trámite, con un porcentaje de avance.',
    comoLeerla:
      'Los tres primeros pesan más: son los riesgos que pueden convertir la inversión en capital quemado. Se marca lo que ya está resuelto, no lo que se piensa resolver.',
  },
  {
    nombre: '05 · Cronograma',
    muestra: 'Los hitos hacia una ronda Serie A, con fecha objetivo y estado.',
    comoLeerla: 'Es una hoja de seguimiento: las fechas son objetivos editables y se actualiza el estado a medida que se cumple cada hito.',
  },
  {
    nombre: '06 · Proyección',
    muestra:
      'Los supuestos del modelo mes a mes, en cuatro grupos: crecimiento, ingresos, costos e impuestos, y el selector de escenario.',
    comoLeerla:
      'De acá salen todos los gráficos y el informe. Los impuestos están modelados para una SAS argentina inscripta en IVA; las alícuotas son las habituales pero Ingresos Brutos depende de la provincia y Ganancias tiene tramos, así que se confirman con un contador.',
  },
  {
    nombre: '07 · Resultado',
    muestra:
      'Cuatro hitos (en qué mes cubre sus costos, en qué mes el resultado neto es positivo, capital mínimo necesario y caja al final), cuatro gráficos (caja acumulada, ingresos / costos / impuestos, en qué se va la plata y base de usuarios) y, bajo el botón "Ver detalle mensual", la tabla mes a mes con usuarios, contratos, ingresos, costos, EBITDA, impuestos, resultado neto y caja.',
    comoLeerla:
      'El mes en que la línea de ingresos cruza la de costos es el punto de equilibrio operativo. El "capital mínimo necesario" es lo que hay que tener para no quedarse sin caja en el peor momento del camino. La tabla mensual sirve para ver en qué mes exacto cambia cada número.',
  },
  {
    nombre: '08 · Informe',
    muestra:
      'La lectura escrita del escenario elegido: un titular y un resumen, el análisis por temas y un recuadro de alertas cuando hay algo que atender. Debajo, la comparación de los tres escenarios lado a lado (cuándo cubre costos, capital mínimo, caja final, usuarios y LTV / CAC). Se puede copiar el informe o bajarlo como archivo .md, y el detalle mes a mes como .csv.',
    comoLeerla:
      'Es el resumen para compartir: dice con palabras lo que muestran los gráficos. Empezá por las alertas, si las hay, y mirá la fila del escenario conservador de la comparación: es el que responde "¿y si sale peor de lo que pensamos?".',
  },
  {
    nombre: 'Estado real',
    muestra: 'Lo que pasó en los últimos 30 días: cuánto falta para cubrir los gastos del mes, cuánto se facturó, y cuántos contratos y usuarios activos equivale lo que falta.',
    comoLeerla:
      'Está separado de la proyección a propósito: un número supuesto y uno medido se ven iguales en pantalla y no conviene confundirlos. Si todavía no hay comisiones cobradas, los dos últimos números salen de los supuestos del plan y la pantalla lo avisa.',
  },
];

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
          '¿Cuánta plata hace falta para llegar al lanzamiento y cuánto dura? Lo responden las secciones 01 y 02 de la pestaña Proyección.',
          '¿Cuántos usuarios hacen falta para que el negocio se sostenga solo, y en qué mes ocurre? Lo responden las secciones 03, 06 y 07.',
        ],
      },
      {
        tipo: 'parrafo',
        texto:
          'Con esas respuestas se toman tres decisiones: si conviene gastar en publicidad para conseguir usuarios, si conviene pagar ya los trámites de constitución de la sociedad (el Go / No-Go de la sección 04) y cuánto capital hay que conseguir.',
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
          'Se conectan en un solo sentido: los supuestos de Economía unitaria (ticket, soporte, costos fijos, churn) salen de la Proyección. Corregir un supuesto ahí corrige las dos pestañas, y no hay que tocarlos por separado.',
      },
      {
        tipo: 'parrafo',
        texto:
          'Una manera de recordarlo: la Proyección sirve para operar ("si pasa tal cosa, cuánto gano") y Economía unitaria sirve para decidir ("conviene poner más plata en conseguir clientes").',
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
      { tipo: 'subtitulo', texto: 'La sección 03 (Unit economics) convierte' },
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
      { tipo: 'subtitulo', texto: 'Las demás secciones declaran, no convierten' },
      {
        tipo: 'aviso',
        tono: 'cuidado',
        texto:
          'En las secciones 01, 02 y 06 el selector de moneda indica en qué moneda se cargaron los montos: cambiarlo NO convierte los números, solamente le avisa al plan en qué moneda están. Por eso cada monto se carga en la moneda en que se paga o se cobra, y la columna de equivalencia ya los muestra en la moneda de referencia.',
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
            pregunta: '¿Por qué hay dos valores de ticket, uno en cada pestaña?',
            respuesta:
              'Hay un ticket en la sección 03 (unit economics) y otro en los supuestos de la proyección (sección 06). Si difieren más de un 25%, Economía unitaria lo avisa y usa el de la sección 03. Conviene unificarlos: con una diferencia grande los dos modelos describen negocios distintos.',
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
            pregunta: '¿Qué hago con "Margen negativo"?',
            respuesta:
              'Es la advertencia más importante. Significa que atender un contrato cuesta más que la comisión que deja. Hay que resolverlo antes de gastar en conseguir usuarios; las salidas están en la sección "Cómo usarlo para decidir".',
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
      `En 02 · Runway mirá cuántos meses dura el capital: la meta de la Fase 1 es de ${META_RUNWAY_FASE1_MESES}.`,
      'En 03 · Unit economics está el punto de equilibrio, en usuarios activos.',
      'En 07 · Resultado, en qué mes cubre sus costos y cuánto capital hace falta como mínimo.',
    ],
  },
};
