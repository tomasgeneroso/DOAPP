/**
 * Cómo se llama un reclamo «cancelado» (estado `cancelled`).
 *
 * Ese estado guarda tres finales muy distintos y la pantalla del equipo decía «Cerrada sin decisión» en todos (pedido del dueño, 2026-11-22: «la disputa sigue diciendo
 * cerrada sin decisión cuando fue resuelta»):
 *  - las partes llegaron a un acuerdo de rehacer el trabajo (`Acuerdo directo entre las partes…`): está RESUELTO;
 *  - quien reclamó lo retiró (`Reclamo retirado por quien lo abrió…`): se resolvió por su cuenta;
 *  - el equipo lo cerró sin decidir nada (con su motivo): ese sí es «cerrada sin decisión».
 */
export interface CierreDeReclamo {
  texto: string;
  /** El reclamo terminó bien (acuerdo o retiro), no porque el equipo lo descartó. */
  resuelto: boolean;
}

export function cierreDeReclamo(resolucion?: string | null): CierreDeReclamo {
  const r = String(resolucion || '').trim();
  if (/^Acuerdo directo/i.test(r)) return { texto: 'Resuelta por acuerdo de las partes', resuelto: true };
  if (/^Reclamo retirado/i.test(r)) return { texto: 'Retirada por quien reclamó', resuelto: true };
  return { texto: 'Cerrada sin decisión', resuelto: false };
}

/** El texto del estado de un reclamo, con el final correcto para los cancelados. `null` si no hay nada que corregir (se usa el texto de siempre). */
export function etiquetaDelEstadoDelReclamo(estado: string, resolucion?: string | null): string | null {
  return estado === 'cancelled' ? cierreDeReclamo(resolucion).texto : null;
}
