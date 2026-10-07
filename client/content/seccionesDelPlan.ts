/**
 * Cómo se llaman y cómo se numeran las secciones del plan, en un solo lugar.
 *
 * Las pantallas las rotulan, la guía las nombra ("la sección 04"), la ayuda de cada
 * pantalla las cita y los tests comprueban que cada una exista. Cuando el orden era
 * 01 a 08 y alguien movió una, los textos que decían "la sección 03" quedaron
 * apuntando a otra cosa sin que nada lo avisara. Ahora todos leen de acá.
 *
 * El orden es el del negocio: primero lo que se gasta en la beta, después en la
 * etapa real, y de ahí la proyección a 1, 3, 5 y 10 años.
 */

export const SECCIONES_DEL_PLAN = {
  tramite: '01 · Trámite',
  gastosBeta: '02 · Gastos de la beta',
  gastosReal: '03 · Gastos de la etapa real',
  unitEconomics: '04 · Unit economics',
  supuestos: '05 · Supuestos de la proyección',
  resultado: '06 · Resultado',
  informe: '07 · Informe',
  decision: '08 · Decisión',
  cronograma: '09 · Cronograma',
} as const;

export type ClaveDeSeccion = keyof typeof SECCIONES_DEL_PLAN;

/** Sólo el número: "02". */
export const N: Record<ClaveDeSeccion, string> = Object.fromEntries(
  Object.entries(SECCIONES_DEL_PLAN).map(([k, v]) => [k, v.slice(0, 2)]),
) as Record<ClaveDeSeccion, string>;

/** Las etapas en las que se agrupan las secciones en la pantalla. */
export const ETAPAS_DEL_PLAN = {
  antes: { titulo: 'Antes de empezar', detalle: 'Crear la sociedad.' },
  beta: {
    titulo: 'Etapa 1 · Beta',
    detalle: 'Lo que se gasta mientras no se cobra comisión.',
  },
  real: {
    titulo: 'Etapa 2 · Etapa real',
    detalle: 'Lo que se gasta cuando se cobra comisión, y lo que deja cada usuario.',
  },
  proyeccion: {
    titulo: 'Etapa 3 · Proyección a 1, 3, 5 y 10 años',
    detalle: 'Lo de las dos etapas anteriores, mes a mes, con impuestos.',
  },
  seguimiento: { titulo: 'Seguimiento', detalle: 'Decidir, planificar y comparar con lo que pasa de verdad.' },
} as const;
