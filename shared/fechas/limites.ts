/**
 * Límites de las fechas que se cargan en formularios.
 *
 * Una fecha de «válido hasta», de vencimiento de la matrícula o del seguro, o de fin de un contrato no puede ser anterior a hoy: un año
 * anterior no tiene sentido y hasta ahora se aceptaba. La excepción es el nacimiento, que siempre tiene que ser ANTES de hoy.
 * «Hoy» es el día de Argentina (no el de UTC: de noche, el día de UTC ya es el siguiente).
 */

const ZONA = 'America/Argentina/Buenos_Aires';

/** El día de hoy en Argentina, AAAA-MM-DD. */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

const esFechaValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(new Date(v.slice(0, 10)).getTime());

/** AAAA-MM-DD de un valor (fecha o texto ISO), o null si no es una fecha. */
export function soloElDia(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : hoyEnArgentina(v);
  return esFechaValida(v) ? v.slice(0, 10) : null;
}

/** ¿Es hoy o un día futuro? (La fecha de «válido hasta» de hoy todavía vale.) */
export function noEsAnteriorAHoy(v: unknown, ahora: Date = new Date()): boolean {
  const dia = soloElDia(v);
  return dia !== null && dia >= hoyEnArgentina(ahora);
}

/** ¿Es un día ANTERIOR a hoy? (Para el nacimiento.) */
export function esAnteriorAHoy(v: unknown, ahora: Date = new Date()): boolean {
  const dia = soloElDia(v);
  return dia !== null && dia < hoyEnArgentina(ahora);
}

/** Para `<input type="date" min=…>` de las fechas que tienen que ser de hoy en adelante. */
export const minimoHoy = (ahora: Date = new Date()): string => hoyEnArgentina(ahora);
/** Para `<input type="date" max=…>` del nacimiento: hasta ayer. */
export function maximoNacimiento(ahora: Date = new Date()): string {
  const ayer = new Date(ahora.getTime() - 86_400_000);
  return hoyEnArgentina(ayer);
}
