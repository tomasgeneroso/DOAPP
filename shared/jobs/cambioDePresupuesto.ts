/**
 * Cuándo se puede cambiar el presupuesto de un trabajo. UNA sola regla para el servidor (todas las rutas que cambian el precio) y para las pantallas, que la usan
 * ANTES de ofrecer el cambio (pedido del dueño, 2026-11-27: «me deja cambiar el presupuesto faltando 3 minutos y con un postulante ya aceptado»).
 *
 *  - Con alguien ya elegido, el precio quedó acordado en su contrato.
 *  - Con la publicación pagada, el cambio mueve plata: se puede hasta `CAMBIO_DE_PRESUPUESTO_HASTA_HORAS_ANTES` antes del inicio.
 *  - Sin pagar todavía, el precio se cambia libremente y SIN mover plata (no hay nada que devolver ni que cobrar aparte).
 *  - Un trabajo terminado o cancelado no cambia de precio: su plata ya se liquidó.
 */
import { POLITICAS } from '../constants/policies.js';

export type CodigoDeBloqueoDelPresupuesto = 'TRABAJO_TERMINADO' | 'TRABAJO_CANCELADO' | 'YA_HAY_ALGUIEN_ELEGIDO' | 'FALTA_POCO_PARA_EL_INICIO';

export interface DatosDelPresupuesto {
  status: string;
  publicationPaid?: boolean | null;
  startDate?: Date | string | null;
  hayAlguienElegido: boolean;
}

export interface BloqueoDelPresupuesto {
  codigo: CodigoDeBloqueoDelPresupuesto;
  mensaje: string;
}

const HORAS = POLITICAS.CAMBIO_DE_PRESUPUESTO_HASTA_HORAS_ANTES;

export const MENSAJES_DEL_PRESUPUESTO: Record<CodigoDeBloqueoDelPresupuesto, string> = {
  TRABAJO_TERMINADO: 'El trabajo ya terminó: su precio quedó cerrado.',
  TRABAJO_CANCELADO: 'El trabajo está cancelado. Para volver a publicarlo, editalo y cargá las fechas nuevas.',
  YA_HAY_ALGUIEN_ELEGIDO: 'Ya elegiste a quien va a hacer el trabajo: el precio quedó acordado en el contrato. Si necesitan cambiarlo, escribí a soporte desde el contrato.',
  FALTA_POCO_PARA_EL_INICIO: `El presupuesto se puede cambiar hasta ${HORAS} horas antes del inicio.`,
};

const bloqueo = (codigo: CodigoDeBloqueoDelPresupuesto): BloqueoDelPresupuesto => ({ codigo, mensaje: MENSAJES_DEL_PRESUPUESTO[codigo] });

export function bloqueoDelPresupuesto(d: DatosDelPresupuesto, ahora: Date = new Date()): BloqueoDelPresupuesto | null {
  if (d.status === 'completed') return bloqueo('TRABAJO_TERMINADO');
  if (d.status === 'cancelled') return bloqueo('TRABAJO_CANCELADO');
  if (d.hayAlguienElegido) return bloqueo('YA_HAY_ALGUIEN_ELEGIDO');
  if (d.publicationPaid && d.startDate && new Date(d.startDate).getTime() - ahora.getTime() < HORAS * 3_600_000) return bloqueo('FALTA_POCO_PARA_EL_INICIO');
  return null;
}
