/**
 * Una explicación breve de cada concepto del plan, para mostrar al pasar el mouse
 * (o tocar) sobre su nombre.
 *
 * Son BREVES a propósito —una o dos oraciones, sin cuentas—: lo que alguien
 * necesita para no tener que ir a buscar qué significa una palabra. La explicación
 * larga (qué hace el modelo con el número, con ejemplos) está en la guía, y desde
 * la pantalla se llega con "Guía del análisis".
 *
 * La clave es el texto del concepto TAL COMO APARECE en la pantalla. Un test exige
 * que cada campo de la proyección tenga la suya, que ninguna supere el largo que
 * entra en un globo, y que cada concepto usado en las pantallas exista acá: un
 * concepto sin texto no muestra nada al pasar el mouse, y eso no se ve hasta que
 * alguien lo prueba.
 */

import { COMMISSION_RATES } from '../../shared/constants/membershipPricing';
import { META_RUNWAY_FASE1_MESES, REFERENCIA_LTV_CAC } from '../../shared/pricing/unidadEconomica';
import { SCENARIOS, type ScenarioKey } from '../utils/financialProjection';

/** Lo más largo que entra cómodo en el globo, en caracteres. */
export const LARGO_MAXIMO_DE_CONCEPTO = 200;

/**
 * Cuánto se mueve un escenario respecto del caso base, leído de `SCENARIOS`: lo que
 * dice el globo tiene que ser lo que hace el motor, no una copia a mano.
 */
const relativo = (factor: number) => {
  const p = Math.round(Math.abs(factor - 1) * 100);
  return factor < 1 ? `−${p}%` : `+${p}%`;
};
const deEscenario = (k: ScenarioKey) => {
  const s = SCENARIOS[k];
  return `Respecto del caso base: altas ${relativo(s.growth)}, ticket ${relativo(s.ticket)}, costo de adquirir un usuario ${relativo(s.cac)}, churn ${relativo(s.churn)}.`;
};

export const CONCEPTOS: Record<string, string> = {
  /* ---------------- Resumen del plan ---------------- */
  'Costo de constitución':
    'Lo que cuesta crear la sociedad (trámites, tasas, honorarios). Se paga una sola vez, antes de empezar a operar.',
  'Capital inicial aportado':
    'La plata que ponen los socios al crear la sociedad. Es con lo que se paga la constitución y se sostiene la beta.',
  'Capital restante':
    'El capital aportado menos lo que cuesta constituir la sociedad. Es la plata con la que arranca la operación.',
  'Runway Fase 1': `Cuántos meses alcanza el capital restante al ritmo de gasto de la beta. La meta es tener al menos ${META_RUNWAY_FASE1_MESES}.`,
  'Preparación Go/No-Go':
    'Qué porcentaje de las condiciones previas ya está resuelto. Los primeros puntos pesan más porque son los que pueden quemar el capital.',

  /* ---------------- Gastos de la beta y de la etapa real ---------------- */
  'Duración de la beta':
    'Cuántos meses dura la beta desde el mes 1. Mientras dura no se cobra comisión y los gastos son los de la tabla de la beta.',
  'Tipo de gasto':
    'Qué es cada gasto para el modelo: Fijo (se paga igual haya o no usuarios), Publicidad (compra usuarios) o Soporte (atención y disputas).',
  Fijo: 'Un gasto que se paga igual haya o no usuarios: abogado, servidores, sueldos. Entra a los costos fijos del modelo.',
  'Publicidad (conseguir usuarios)':
    'Plata para conseguir usuarios. No es un costo fijo: el modelo la convierte en altas dividiéndola por el costo de adquirir un usuario (CAC).',
  'Soporte y disputas':
    'Atención al cliente y resolución de disputas. En la beta es un monto fijo a mano; en la etapa real se calcula por usuario y no se suma acá.',
  'Gasto mensual': 'Todo lo que se gasta por mes en esta etapa, sumando todos los rubros.',
  'Capital al terminar la beta':
    'La caja que queda cuando termina la beta, ya con impuestos. Es con lo que arranca la etapa real.',
  'Costos fijos de la etapa real':
    'La suma de los gastos fijos de la tabla de la etapa real. No incluye la publicidad (se cuenta como altas × CAC) ni el soporte (se calcula por usuario).',
  'Altas por mes (publicidad ÷ CAC)':
    'Usuarios nuevos por mes que compra la publicidad: lo que se gasta en publicidad dividido por lo que cuesta conseguir un usuario.',

  /* ---------------- Economía unitaria ---------------- */
  'Punto de equilibrio':
    'Cuántos usuarios activos por mes hacen falta para que el margen de contribución cubra los costos fijos. Por debajo se pierde plata.',
  MAU: 'Usuarios activos del mes: personas distintas que tuvieron al menos un contrato en los últimos 30 días.',
  'Comisión promedio (%)': `El porcentaje del valor de cada trabajo que se queda la plataforma. Hoy es ${COMMISSION_RATES.free}% para todos y lo paga el cliente. Durante la beta es 0%.`,
  'Ticket promedio por contrato':
    'El valor medio de un trabajo contratado. La comisión se calcula sobre este monto.',
  'Contratos por usuario activo / mes':
    'Cuántos contratos cierra por mes un usuario ACTIVO. Como activo es quien contrató, el mínimo posible es 0,5 (cada contrato involucra a dos personas).',
  'Costo de disputas (% del volumen)':
    'La plata que cuesta resolver disputas, como porcentaje del volumen que mueven los contratos (no de la cantidad de contratos).',
  'Costo de soporte por usuario / mes':
    'Lo que cuesta atender a un usuario activo en un mes. Se estima como horas de soporte × costo de la hora ÷ usuarios.',
  'Costos fijos mensuales (de la etapa real)':
    'Los costos fijos de la etapa real. No se cargan acá: salen de la tabla de gastos de la etapa real.',
  'Fraude / chargebacks (% del volumen)':
    'La plata que se pierde por fraude y contracargos, como porcentaje del volumen. Con el pago retenido hasta que el cliente confirma, sólo se pierde lo ya liberado.',
  'Usuarios activos actuales (MAU)':
    'Cuántos usuarios activos hay hoy. Sirve para ver cuántos faltan para llegar al punto de equilibrio.',
  'Ingreso / usuario / mes':
    'Lo que deja la comisión de un usuario activo en un mes: contratos por usuario × ticket × comisión.',
  'Costo variable / usuario':
    'Lo que cuesta atender a un usuario activo en un mes: soporte más lo que se pierde en disputas y fraude.',
  'Margen de contribución':
    'Lo que le queda a la plataforma por cada usuario activo después de sus costos variables. Con él se pagan los costos fijos. Si es negativo, más usuarios no arreglan nada.',
  'MAU actuales': 'Los usuarios activos que se cargaron como punto de partida.',
  'Faltan (MAU)': 'Cuántos usuarios activos más hacen falta para llegar al punto de equilibrio.',
  Estado: 'Si el margen es negativo, si falta para el equilibrio o si ya se alcanzó.',

  /* ---------------- Supuestos de la proyección ---------------- */
  'Mes de inicio': 'El mes en que arranca la proyección (mes 1). Sólo cambia las etiquetas de los gráficos y tablas.',
  'Usuarios registrados al arrancar':
    'Cuántos usuarios registrados hay el día que empieza la proyección. En un lanzamiento son cero. Con el botón de datos reales se completa solo.',
  'Usuarios activos del mes (% de los registrados)':
    'De cada 100 usuarios registrados, cuántos usan la plataforma en un mes. Pasa del usuario activo de Unit economics al registrado de la proyección.',
  'Cómo crece la base':
    'Cómo se suman usuarios nuevos: un porcentaje de los que ya hay, o una cantidad fija por mes (la que compra la publicidad).',
  'Crecimiento mensual de usuarios':
    'Usuarios nuevos por mes como porcentaje de los que ya hay. Es sólo lo que entra: el crecimiento neto es este número menos el churn.',
  'Altas por mes en la etapa real':
    'Usuarios nuevos por mes en la etapa real. Salen de la tabla de gastos: la publicidad dividida por el costo de adquirir un usuario.',
  'Altas por mes en la beta':
    'Usuarios nuevos por mes durante la beta. Salen de la publicidad de la tabla de la beta dividida por el costo de adquirir un usuario.',
  'Churn mensual':
    'Porcentaje de usuarios que dejan de usar la plataforma cada mes. Con 10%, de cada 100 se van 10. Cuanto más alto, más hay que gastar para reponerlos.',
  'Techo de mercado (0 = sin techo)':
    'El máximo de usuarios que el mercado puede dar. Al acercarse, las altas se frenan. En 0 no hay límite.',
  'Contratos por usuario registrado / mes':
    'Contratos por mes de cada usuario registrado: los contratos por usuario activo de Unit economics × el porcentaje de activos.',
  'Comisión de la plataforma':
    'El porcentaje de cada contrato que se queda la plataforma. Viene de Unit economics. Durante la beta es 0%.',
  'Usuarios con membresía': 'Porcentaje de los usuarios que paga una membresía mensual.',
  'Precio de la membresía / mes': 'Lo que paga por mes cada usuario con membresía.',
  'Publicidad de terceros (ingreso) / mes':
    'Lo que la plataforma cobra por mes a anunciantes. No es lo que gasta en publicidad propia: eso es la tabla de gastos.',
  'La comisión se cobra con IVA incluido':
    'Si está marcada, los ingresos ya traen el IVA adentro y se lo descuenta: el IVA es del fisco, no de la plataforma.',
  'Soporte por usuario registrado / mes':
    'Costo de soporte por usuario registrado en un mes: el de Unit economics (por usuario activo) × el porcentaje de activos.',
  'Infraestructura por usuario / mes':
    'Costo de servidores y servicios que crece con cada usuario. El servidor base, que se paga igual, va en los costos fijos.',
  'Comisión del medio de pago':
    'Lo que se lleva el medio de pago (Mercado Pago) como porcentaje del volumen. En 0 si ese costo se le traslada al cliente.',
  'Disputas (% del volumen)':
    'Plata que se pierde en disputas, como porcentaje del volumen. Viene de Unit economics.',
  'Fraude y contracargos (% del volumen)':
    'Plata que se pierde por fraude y contracargos, como porcentaje del volumen. Viene de Unit economics.',
  'Costo de adquirir un usuario (CAC)':
    'Lo que cuesta conseguir un usuario nuevo: publicidad ÷ altas. Es mezclado: cuenta también a los que llegan solos.',
  'Crecimiento mensual de los fijos':
    'Cuánto suben los costos fijos por mes (compuesto), para modelar contrataciones. Sólo corre en la etapa real: en la beta no se contrata.',
  'Costos con IVA computable':
    'Qué porcentaje de los costos trae IVA que se puede descontar. Servidores y servicios sí; sueldos y tasas no.',
  IVA: 'Alícuota del IVA. La plataforma cobra IVA por sus ingresos y descuenta el de sus gastos: paga la diferencia.',
  'Ingresos Brutos': 'Impuesto provincial sobre la facturación neta. Depende de la provincia y la actividad.',
  'Débitos y créditos bancarios': 'Impuesto sobre cada peso que entra y sale de la cuenta bancaria.',
  'Impuesto a las Ganancias':
    'Porcentaje sobre la utilidad, después de Ingresos Brutos y del impuesto bancario. Las pérdidas anteriores se descuentan antes.',

  /* ---------------- Resultado ---------------- */
  Beta: 'La etapa de lanzamiento: no se cobra comisión, entran pocos usuarios y el soporte se hace a mano.',
  'Etapa real': 'Después de la beta: se cobra comisión y los costos y el crecimiento son los de la etapa real.',
  'Cubre sus costos':
    'El primer mes en que los ingresos superan a todos los costos (EBITDA positivo). Antes de impuestos.',
  'Resultado neto positivo': 'El primer mes con ganancia después de pagar todos los impuestos.',
  'Capital mínimo necesario':
    'Lo más hondo que llega la caja en rojo. Es la plata que hay que conseguir como mínimo para no quedarse sin fondos.',
  'Caja acumulada':
    'La plata disponible mes a mes: capital inicial más todo lo ganado o perdido hasta ese mes. Por debajo de cero hace falta financiamiento.',
  'Ingresos, costos e impuestos':
    'Cuánto entra, cuánto cuesta operar y cuánto se paga de impuestos cada mes. Donde ingresos cruza a costos está el equilibrio.',
  'En qué se va la plata': 'Los costos y los impuestos de cada mes, apilados, para ver cuál crece más rápido que los ingresos.',
  'Base de usuarios': 'Los usuarios registrados y las altas de cada mes. Si las altas se aplanan, el techo de mercado ya pesa.',
  Usuarios: 'Usuarios registrados al cierre del mes.',
  'Usuarios registrados': 'Usuarios registrados al cierre del último mes del horizonte.',
  Contratos: 'Contratos cerrados en el mes: usuarios × contratos por usuario registrado.',
  Ingresos: 'Lo que entra en el mes sin IVA: comisión, membresías y publicidad de terceros.',
  Costos: 'Todo lo que cuesta operar en el mes: fijos, variables y adquisición de usuarios. Sin impuestos.',
  EBITDA:
    'Ingresos menos costos, antes de impuestos. Dice si la operación se sostiene sola. Es la sigla en inglés de "resultado operativo".',
  Impuestos: 'IVA, Ingresos Brutos, impuesto bancario y Ganancias del mes.',
  Neto: 'Lo que queda en el mes después de pagar todo, impuestos incluidos.',
  Caja: 'La plata disponible al cierre del mes.',
  Etapa: 'Si el mes es de la beta o de la etapa real.',
  'Ingresos del último año':
    'Lo que se facturó en los últimos 12 meses de ese horizonte, sin IVA. Un mes suelto no dice si el negocio se sostiene.',
  'EBITDA del último año': 'Ingresos menos costos de los últimos 12 meses de ese horizonte, antes de impuestos.',
  'Resultado acumulado': 'Todo lo ganado o perdido desde el mes 1 hasta el final del horizonte, ya con impuestos.',
  'Mes en que cubre costos': 'El primer mes de la proyección con EBITDA positivo, dentro de ese horizonte.',
  Escenario:
    'Una variante del caso base: el conservador crece menos y cuesta más; el optimista crece más y cuesta menos. Sirve para ver el rango.',
  Conservador: deEscenario('conservador'),
  Base: 'Los supuestos tal como están cargados.',
  Optimista: deEscenario('optimista'),
  'LTV/CAC': `Cuánto devuelve un usuario durante su vida por cada peso que costó conseguirlo. Se pide al menos ${REFERENCIA_LTV_CAC}. Por debajo, cada usuario nuevo pierde plata.`,
  'Capital mínimo':
    'Lo más hondo que llega la caja en rojo en ese escenario: la plata que hay que conseguir como mínimo.',
};
