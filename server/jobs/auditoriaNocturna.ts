import { auditarSaldos, type ResultadoAuditoria } from '../services/auditoriaSaldos.js';
import { avisarProblemasDeDinero } from '../services/controlesDeDinero.js';
import { logger } from '../services/logger.js';

/**
 * Auditoría de saldos todas las noches.
 *
 * `auditarSaldos()` ya sabía encontrar lo que tiene que ser verdad siempre (saldo = libro, nada trabado en escrow, nadie cobra dos veces…),
 * pero solo corría si alguien abría el panel. Un descuadre podía vivir semanas sin que nadie lo mirara. Ahora corre a las 3 de la mañana y,
 * si encuentra algo, avisa a administración con el código y el enlace a la guía.
 *
 * No corrige nada: marca y avisa. Corregir sin entender qué pasó convierte una diferencia en dos.
 */

const HORA_DE_LA_AUDITORIA = 3;

export interface ResultadoDeLaNoche extends ResultadoAuditoria {
  avisado: boolean;
}

export async function correrAuditoriaNocturna(): Promise<ResultadoDeLaNoche> {
  const r = await auditarSaldos();
  if (r.hallazgos.length === 0) {
    logger.info('auditoriaNocturna', `Auditoría de saldos: sin diferencias (${r.usuariosRevisados} usuarios revisados).`);
    return { ...r, avisado: false };
  }

  const porInvariante = Object.entries(r.resumen).map(([k, n]) => `${k}: ${n}`).join(', ');
  const primeros = r.hallazgos
    .slice(0, 5)
    .map((h) => `${h.titulo} — ${h.detalle}`)
    .join(' | ');
  await avisarProblemasDeDinero(
    [{ codigo: 'AUDITORIA-CON-HALLAZGOS', detalle: `${r.hallazgos.length} diferencia(s) (${porInvariante}). Primeras: ${primeros}` }],
    { titulo: `Auditoría nocturna de saldos: ${r.hallazgos.length} diferencia(s)`, actor: 'cron:auditoriaNocturna' },
  );
  logger.error('auditoriaNocturna', `Auditoría de saldos con ${r.hallazgos.length} diferencia(s): ${porInvariante}`);
  return { ...r, avisado: true };
}

let ultimoDiaCorrido = '';

/** Una vez por hora mira si es la hora; corre como mucho una vez por día (aunque se reinicie el proceso a las 3:xx). */
export function startAuditoriaNocturna(): void {
  const UNA_HORA = 60 * 60 * 1000;
  const correrSiEsHora = () => {
    const ahora = new Date();
    const dia = ahora.toISOString().slice(0, 10);
    if (ahora.getHours() !== HORA_DE_LA_AUDITORIA || ultimoDiaCorrido === dia) return;
    ultimoDiaCorrido = dia;
    correrAuditoriaNocturna().catch((e: any) => logger.error('auditoriaNocturna', `Falló la auditoría nocturna: ${e?.message}`));
  };
  setInterval(correrSiEsHora, UNA_HORA);
}
