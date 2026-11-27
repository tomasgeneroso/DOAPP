/** Quién aceptó una postulación y cuándo (pedido del dueño, 2026-11-27: «no muestra si la aceptación fue por el dueño del trabajo ni si fue automática»). */
import { POLITICAS } from '../constants/policies.js';

export type ComoSeAcepto = 'cliente' | 'automatica' | 'directa';

export interface Aceptacion {
  como: ComoSeAcepto;
  cuando: string | null;
}

// Reloj de 24 horas: con «p. m.» la frase terminaba en dos puntos seguidos.
const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function textoDeAceptacion(a: { como?: string | null; cuando?: string | null } | null | undefined, miro: 'quien_publico' | 'quien_trabaja' | 'otro'): string | null {
  if (!a?.como) return null;
  const cuando = a.cuando ? ` el ${fecha(a.cuando)}` : '';
  if (a.como === 'automatica') return `Elección automática${cuando}: faltaban menos de ${POLITICAS.SELECCION_AUTOMATICA_HORAS_ANTES} horas para el inicio y no se había elegido a nadie.`;
  if (a.como === 'directa') return `Aceptada de forma directa${cuando}.`;
  if (miro === 'quien_publico') return `La aceptaste vos${cuando}.`;
  return `La aceptó quien publicó el trabajo${cuando}.`;
}
