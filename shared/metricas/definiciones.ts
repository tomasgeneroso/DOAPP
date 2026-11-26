/**
 * Índices de producto para marketing y el dueño (pedido del 2026-11-26): qué es cada uno, cómo se calcula y cómo se lee.
 *
 * Fuente única: la pantalla del panel (`/admin/metricas`) muestra estos textos y `server/services/metricasDeProducto.ts` calcula con las mismas reglas.
 * Siempre se muestra de cuántos casos sale cada porcentaje: con la beta recién abierta, «50 %» puede ser 1 de 2.
 */

/** Con menos casos que esto, un porcentaje cambia mucho con una sola persona: la pantalla avisa «pocos datos». */
export const MINIMO_PARA_CONFIAR = 30;

/** Segundos entre latidos mientras alguien está usando DOAPP. */
export const SEGUNDOS_ENTRE_LATIDOS = 60;
/** Entre dos latidos separados hasta acá se suma el tiempo (la persona siguió ahí). */
export const SEGUNDOS_MAXIMOS_SUMADOS = 150;
/** Después de este silencio, el siguiente latido es una visita nueva (el criterio habitual de las herramientas de analítica). */
export const MINUTOS_PARA_VISITA_NUEVA = 30;
/** Cuánto se guarda el registro de uso (13 meses: alcanza para comparar con el mismo mes del año anterior). */
export const DIAS_QUE_SE_GUARDA_EL_USO = 400;

export type Unidad = 'numero' | 'porcentaje' | 'segundos' | 'pesos' | 'horas' | 'decimal';

export interface Indice {
  valor: number | null;
  /** De cuántos casos sale (para un porcentaje o un promedio). */
  de?: number;
  sobre?: number;
  /** Por qué no hay valor todavía, en palabras simples. */
  falta?: string;
}

export interface Definicion {
  nombre: string;
  unidad: Unidad;
  formula: string;
  lectura: string;
}

const d = (nombre: string, unidad: Unidad, formula: string, lectura: string): Definicion => ({ nombre, unidad, formula, lectura });

export const DEFINICIONES = {
  // ── Uso ──
  dau: d('DAU (personas por día)', 'decimal', 'Promedio de personas distintas que usaron DOAPP en cada uno de los últimos 7 días completos.', 'Cuánta gente vuelve en un día cualquiera.'),
  wau: d('WAU (personas por semana)', 'numero', 'Personas distintas en los últimos 7 días completos.', 'El pulso semanal: en un mercado de servicios muchos no entran todos los días.'),
  mau: d('MAU (personas por mes)', 'numero', 'Personas distintas en los últimos 30 días completos.', 'El tamaño real de la comunidad activa.'),
  pegajosidad: d('DAU/MAU', 'porcentaje', 'Promedio diario de personas activas dividido las activas del mes.', 'Qué parte de la gente del mes entra un día cualquiera. En DOAPP nadie contrata servicios todos los días: mirá más la repetición de contratos.'),
  duracionDeVisita: d('Duración media de una visita', 'segundos', 'Tiempo con la pantalla en uso dividido la cantidad de visitas (30 días). Una visita nueva empieza tras 30 minutos sin actividad.', 'Más tiempo no siempre es mejor: miralo junto con el embudo.'),
  visitasPorPersona: d('Frecuencia de visitas', 'decimal', 'Visitas de los últimos 30 días divididas las personas activas del mes.', 'Cuántas veces por mes vuelve cada persona.'),
  primeraApertura: d('Primera apertura de la app', 'porcentaje', 'Teléfonos que abrieron la app por primera vez divididos las descargas del APK (30 días).', 'Cuántas descargas terminan en una app abierta. Una misma persona puede descargar dos veces.'),
  retencion1: d('Retención al día 1', 'porcentaje', 'De quienes se registraron, cuántos volvieron justo al día siguiente.', 'Si la primera experiencia convence.'),
  retencion7: d('Retención al día 7', 'porcentaje', 'De quienes se registraron, cuántos volvieron justo a los 7 días.', 'Si queda una razón para volver en la semana.'),
  retencion30: d('Retención al día 30', 'porcentaje', 'De quienes se registraron, cuántos volvieron justo a los 30 días.', 'Si DOAPP quedó entre sus herramientas.'),
  abandono: d('Abandono mensual (churn)', 'porcentaje', 'Personas activas el mes anterior que no volvieron en los últimos 30 días, sobre las activas el mes anterior.', 'Cuántas se van por mes. Cuanto más bajo, mejor.'),
  // ── Conversión y mensajes ──
  conversion: d('Conversión a primer contrato', 'porcentaje', 'De las cuentas creadas en los últimos 90 días, cuántas terminaron al menos un contrato.', 'El índice que resume si DOAPP cumple su promesa.'),
  conversionPro: d('Conversión a PRO', 'porcentaje', 'Cuentas con membresía PRO activa sobre las cuentas totales.', 'Cuántas personas ven valor en pagar la cuota.'),
  avisosAbiertos: d('Avisos abiertos (mensajes dentro de la app)', 'porcentaje', 'Notificaciones de los últimos 30 días que la persona abrió o marcó como leídas, sobre las enviadas.', 'Mide la apertura del aviso. El clic en su botón todavía no se mide por separado.'),
  // ── Dinero ──
  volumen: d('Volumen contratado (GMV)', 'pesos', 'Suma del precio de los contratos terminados en los últimos 30 días.', 'Cuánto trabajo pasó por DOAPP.'),
  ingresos: d('Ingresos de DOAPP', 'pesos', 'Comisiones cobradas más membresías (sin IVA) de los últimos 30 días. No incluye el costo de la pasarela.', 'Lo que entra para DOAPP. Es ingreso, no ganancia.'),
  tasaDeIngreso: d('Parte que queda en DOAPP (take rate)', 'porcentaje', 'Comisiones cobradas sobre el volumen contratado (30 días).', 'Durante la beta la comisión es 0 %.'),
  arpu: d('ARPU (ingreso por persona activa)', 'pesos', 'Ingresos de 30 días divididos las personas activas del mes.', 'Cuánto aporta en promedio cada persona activa por mes.'),
  arppu: d('ARPPU (ingreso por persona que paga)', 'pesos', 'Ingresos de 30 días divididos las personas que pagaron algo con comisión o membresía.', 'Cuánto aporta quien sí paga.'),
  ltv: d('LTV (ingreso esperado por persona)', 'pesos', 'ARPU dividido el abandono mensual.', 'Cuánto dejaría una persona mientras se queda. Es de ingreso, no de ganancia, y con pocos datos engaña.'),
  // ── Mercado de dos lados ──
  conPostulaciones: d('Publicaciones con al menos una postulación', 'porcentaje', 'De las publicaciones aprobadas en los últimos 30 días, cuántas recibieron postulaciones.', 'La oferta de trabajadores alcanza (o no) para lo que se pide.'),
  cubiertas: d('Publicaciones que llegan a contrato (fill rate)', 'porcentaje', 'De esas mismas publicaciones, cuántas tienen un contrato.', 'La salud del mercado: es el número que más conviene cuidar.'),
  horasHastaPostulacion: d('Horas hasta la primera postulación', 'horas', 'Mediana de horas entre publicar y recibir la primera postulación (30 días).', 'Cuánto espera quien publica antes de ver respuesta.'),
  clientesQueRepiten: d('Clientes que repiten', 'porcentaje', 'Clientes con dos o más contratos terminados sobre clientes con al menos uno (desde siempre).', 'La confianza real: vuelven a contratar.'),
  trabajadoresQueRepiten: d('Trabajadores que repiten', 'porcentaje', 'Trabajadores con dos o más contratos terminados sobre trabajadores con al menos uno (desde siempre).', 'Si a quien trabaja le conviene quedarse.'),
  trabajadoresPorCliente: d('Trabajadores activos por cliente activo', 'decimal', 'Personas que se postularon en 30 días divididas personas que publicaron en 30 días.', 'El equilibrio entre oferta y demanda.'),
  cancelados: d('Contratos cancelados', 'porcentaje', 'Contratos creados en 90 días que terminaron cancelados o rechazados.', 'Fricción o expectativas mal puestas.'),
  conReclamo: d('Contratos con reclamo', 'porcentaje', 'Contratos creados en 90 días que tienen un reclamo.', 'Problemas de calidad o de pago.'),
  calificacion: d('Calificación media', 'decimal', 'Promedio de las puntuaciones de los últimos 90 días (de 1 a 5).', 'Cómo se sienten después de trabajar juntos.'),
  recomiendan: d('Recomendarían DOAPP', 'porcentaje', 'Reseñas de 90 días que marcaron que recomiendan la aplicación, sobre las que contestaron.', 'La señal de afecto más directa que ya se pregunta.'),
} as const;

export type ClaveDeIndice = keyof typeof DEFINICIONES;

export const SECCIONES: Array<{ id: string; titulo: string; claves: ClaveDeIndice[] }> = [
  { id: 'uso', titulo: 'Uso y regreso', claves: ['dau', 'wau', 'mau', 'pegajosidad', 'visitasPorPersona', 'duracionDeVisita', 'retencion1', 'retencion7', 'retencion30', 'abandono', 'primeraApertura'] },
  { id: 'mercado', titulo: 'Salud del mercado', claves: ['cubiertas', 'conPostulaciones', 'horasHastaPostulacion', 'clientesQueRepiten', 'trabajadoresQueRepiten', 'trabajadoresPorCliente', 'cancelados', 'conReclamo', 'calificacion', 'recomiendan'] },
  { id: 'conversion', titulo: 'Conversión y avisos', claves: ['conversion', 'conversionPro', 'avisosAbiertos'] },
  { id: 'dinero', titulo: 'Dinero', claves: ['volumen', 'ingresos', 'tasaDeIngreso', 'arpu', 'arppu', 'ltv'] },
];

export interface PasoDelEmbudo { nombre: string; personas: number }
export interface AdopcionDeFuncion { nombre: string; personas: number; base: number }

export interface MetricasDeProducto {
  calculadasEl: string;
  /** Primer día con registro de uso (null: todavía no hay). Los índices de uso solo cuentan desde acá. */
  usoDesde: string | null;
  indices: Record<ClaveDeIndice, Indice>;
  embudo: PasoDelEmbudo[];
  adopcion: AdopcionDeFuncion[];
  plataformas: Array<{ plataforma: string; personas: number }>;
  usoPorDia: Array<{ dia: string; personas: number }>;
}

/** Un porcentaje con sus dos números; sin casos no hay valor (nunca «0 %» por falta de datos). */
export function proporcion(de: number, sobre: number, falta = 'Todavía no hay casos para calcularlo.'): Indice {
  return sobre > 0 ? { valor: (de / sobre) * 100, de, sobre } : { valor: null, de, sobre, falta };
}

export function promedio(suma: number, cantidad: number, falta = 'Todavía no hay casos para calcularlo.'): Indice {
  return cantidad > 0 ? { valor: suma / cantidad, sobre: cantidad } : { valor: null, sobre: 0, falta };
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Costo de conseguir una persona (CAC) y cuántas veces lo devuelve el LTV. La inversión la escribe quien mira: no se guarda. */
export function costoPorPersona(inversion: number, personasNuevas: number, ltv: number | null): { cac: number | null; ltvSobreCac: number | null } {
  if (!(inversion > 0) || !(personasNuevas > 0)) return { cac: null, ltvSobreCac: null };
  const cac = inversion / personasNuevas;
  return { cac, ltvSobreCac: ltv && ltv > 0 ? ltv / cac : null };
}
