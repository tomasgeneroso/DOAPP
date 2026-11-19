import { IVA, splitFees } from './processingCost.js';

/**
 * El precio de un día de promoción del perfil (pedido del dueño, 2026-11-19: «1 euro por día + IVA + comisión; encontrar la forma de que aumente de manera razonable
 * relacionado con la cantidad de usuarios, impresiones, vistas posibles, el porcentaje de quienes tienen la app, qué hace el perfil, entre otras cosas»).
 *
 * Arranca en 1 € por día (SIN IVA) y sube con lo que vale esa visibilidad, nunca por encima del tope. Cada factor es un número ≥ 1 que se explica en palabras (la
 * pantalla muestra «¿por qué este precio?») y todos salen de datos propios de DOAPP, no de una suposición:
 *
 *   audiencia   1 + 0,5 × log10(1 + usuariosActivos / 500)       más gente activa en los últimos 30 días, más vale cada día (con 5.000 activos: ×1,52)
 *   app         1 + 0,2 × (activos con la app / activos)           quienes tienen la app instalada ven el muro con más frecuencia (todos con la app: ×1,2)
 *   demanda     1 + mín(1, trabajosDelRubro30d / 200)             trabajos publicados en los rubros del perfil en 30 días (200 o más: ×2)
 *   escasez     1 + 0,25 × perfilesYaPromocionadosEseDía          en el muro entran PERFILES_POR_DIA por día; cada lugar ocupado encarece los que quedan
 *   perfil      ×1,1 si tiene 4,5 o más con al menos 5 opiniones   un perfil con buena reputación convierte mejor las visitas
 *
 * Y un PISO por impresiones: si ya hay datos reales (al menos 5 días promocionados en 30 días), un día nunca vale menos que sus impresiones promedio a CPM_EUR por
 * mil. Con pocas personas el precio queda cerca de 1 €; crece solo a medida que crece la audiencia. Lo que se ve en pantalla es este mismo cálculo.
 *
 * Después del precio se suman el IVA (21 %) y el costo de procesamiento de la pasarela con su IVA (T&C 7.16). La comisión de DOAPP no se suma: DOAPP es quien vende esta
 * promoción, no hay otra parte a la que cobrarle una comisión (si el dueño la quiere, se agrega en `desglosePromocion`).
 */
export const PRECIO_BASE_POR_DIA_EUR = 1;
export const TOPE_POR_DIA_EUR = 10;
/** Cuántos perfiles promocionados entran en el muro por día. */
export const PERFILES_POR_DIA = 3;
/** Lo que vale mil impresiones, en euros (el piso por impresiones). */
export const CPM_EUR = 5;
export const DIAS_PROMOCIONADOS_PARA_USAR_IMPRESIONES = 5;

export interface SenalesDePrecio {
  /** Cuentas que ingresaron en los últimos 30 días. */
  usuariosActivos30d: number;
  /** De esas, cuántas tienen la app instalada (con aviso push registrado). */
  usuariosConApp30d: number;
  /** Trabajos publicados en los últimos 30 días en los rubros del perfil (o en todos si no tiene rubros). */
  trabajosDelRubro30d: number;
  /** Otros perfiles ya promocionados (pagos) ese día. */
  reservasDelDia: number;
  /** Impresiones promedio por día promocionado en los últimos 30 días, o null si todavía no hay datos suficientes. */
  impresionesPorDia: number | null;
  rating: number;
  reviews: number;
}

export interface FactorDePrecio {
  clave: 'audiencia' | 'app' | 'demanda' | 'escasez' | 'perfil';
  etiqueta: string;
  valor: number;
  explicacion: string;
}

export interface PrecioDelDia {
  /** El precio del día en euros, sin IVA. */
  eur: number;
  factores: FactorDePrecio[];
  /** El piso por impresiones (€), o null si todavía no hay datos. */
  pisoPorImpresionesEur: number | null;
  /** ¿Llegó al tope? */
  conTope: boolean;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const dosDecimales = (n: number): number => Math.round(n * 100) / 100;

export function precioDelDiaEur(senales: SenalesDePrecio): PrecioDelDia {
  const activos = num(senales.usuariosActivos30d);
  const conApp = Math.min(activos, num(senales.usuariosConApp30d));
  const trabajos = num(senales.trabajosDelRubro30d);
  const reservas = Math.min(PERFILES_POR_DIA, Math.floor(num(senales.reservasDelDia)));

  const factores: FactorDePrecio[] = [
    {
      clave: 'audiencia',
      etiqueta: 'Personas activas',
      valor: dosDecimales(1 + 0.5 * Math.log10(1 + activos / 500)),
      explicacion: `${activos.toLocaleString('es-AR')} personas ingresaron en los últimos 30 días: cuanta más gente activa, más vale cada día.`,
    },
    {
      clave: 'app',
      etiqueta: 'Personas con la app',
      valor: dosDecimales(1 + 0.2 * (activos > 0 ? conApp / activos : 0)),
      explicacion: `${activos > 0 ? Math.round((conApp / activos) * 100) : 0} % de las personas activas tiene la app y entra más seguido.`,
    },
    {
      clave: 'demanda',
      etiqueta: 'Demanda de tu rubro',
      valor: dosDecimales(1 + Math.min(1, trabajos / 200)),
      explicacion: `${trabajos.toLocaleString('es-AR')} ${trabajos === 1 ? 'trabajo publicado' : 'trabajos publicados'} en tus rubros en los últimos 30 días.`,
    },
    {
      clave: 'escasez',
      etiqueta: 'Lugares de ese día',
      valor: dosDecimales(1 + 0.25 * reservas),
      explicacion: `En el muro entran ${PERFILES_POR_DIA} perfiles por día y ese día ya hay ${reservas}.`,
    },
    {
      clave: 'perfil',
      etiqueta: 'Tu perfil',
      valor: num(senales.rating) >= 4.5 && num(senales.reviews) >= 5 ? 1.1 : 1,
      explicacion: 'Un perfil con 4,5 estrellas o más y al menos 5 opiniones convierte mejor las visitas.',
    },
  ];

  const porFactores = factores.reduce((acc, f) => acc * f.valor, PRECIO_BASE_POR_DIA_EUR);
  const piso = senales.impresionesPorDia !== null && senales.impresionesPorDia !== undefined ? dosDecimales((num(senales.impresionesPorDia) / 1000) * CPM_EUR) : null;
  const sinTope = Math.max(PRECIO_BASE_POR_DIA_EUR, porFactores, piso ?? 0);
  const eur = dosDecimales(Math.min(TOPE_POR_DIA_EUR, sinTope));
  return { eur, factores, pisoPorImpresionesEur: piso, conTope: sinTope > TOPE_POR_DIA_EUR };
}

export interface DesglosePromocion {
  /** La suma de los días, sin IVA (es el ingreso de DOAPP). */
  neto: number;
  /** IVA del precio. */
  iva: number;
  /** Costo de procesamiento de la pasarela (sin IVA). */
  procesamiento: number;
  /** IVA del procesamiento. */
  ivaProcesamiento: number;
  /** Lo que paga la persona. */
  total: number;
}

/**
 * Del precio de los días al total que se cobra: precio + IVA + costo de procesamiento con su IVA (misma cuenta que el resto de la plataforma). Todo en pesos con centavos.
 * `comisionRate` queda en 0 a propósito (ver arriba); si cambia la regla se pasa acá y la cuenta sigue cerrando.
 */
export function desglosePromocion(netoEnPesos: number, comisionRate = 0): DesglosePromocion {
  const neto = dosDecimales(num(netoEnPesos));
  const comision = dosDecimales(neto * comisionRate);
  const iva = dosDecimales((neto + comision) * IVA);
  const r = splitFees(neto, comision, iva);
  return { neto, iva: r.vat, procesamiento: r.processingCharge, ivaProcesamiento: r.processingVat, total: r.clientPays };
}
