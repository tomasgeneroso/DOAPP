/**
 * Cuándo se puede RETIRAR cada peso (pedido del dueño, 2026-11-27: «atar los retiros por contrato y verificar estados antes de mostrarlos como disponibles»).
 *
 * Cada crédito del saldo sabe de qué trabajo o contrato viene y se mira el estado de AHORA:
 *  - lo que cobró quien trabajó: el contrato tiene que haber terminado;
 *  - lo que quedó a favor por bajar un presupuesto (o porque sobró): el trabajo tiene que haber terminado;
 *  - cualquiera: sin reclamo abierto y con la plata ya liberada por la pasarela.
 *
 * Usar el saldo DENTRO de la app no sale de la plataforma: eso solo espera la liberación de la pasarela.
 */
export type ConceptoDelCredito = 'cobro_del_trabajo' | 'baja_de_presupuesto' | 'sobrante_de_presupuesto' | 'devolucion' | 'otro';

export const NOMBRE_DEL_CONCEPTO: Record<ConceptoDelCredito, string> = {
  cobro_del_trabajo: 'Cobro por un trabajo',
  baja_de_presupuesto: 'Baja de presupuesto',
  sobrante_de_presupuesto: 'Sobrante de un presupuesto',
  devolucion: 'Devolución',
  otro: 'Otro saldo',
};

export function conceptoDelCredito(tipo: string, metadata: Record<string, any> | null | undefined): ConceptoDelCredito {
  if (tipo === 'payment') return 'cobro_del_trabajo';
  if (tipo !== 'refund') return 'otro';
  const origen = String(metadata?.origen ?? '');
  const razon = String(metadata?.reason ?? '');
  if (origen === 'baja_de_precio' || razon.startsWith('price_decrease') || metadata?.previousPrice !== undefined) return 'baja_de_presupuesto';
  if (origen === 'equipo_parcial' || (origen === 'cotizacion_menor' && !razon)) return 'sobrante_de_presupuesto';
  return 'devolucion';
}

export interface CreditoParaRetirar {
  concepto: ConceptoDelCredito;
  creadoEl: Date | string;
  /** Desde cuándo la pasarela tiene la plata liberada (si hay que esperarla). */
  disponibleDesde?: string | null;
  tieneTrabajo: boolean;
  /** null: dice venir de un trabajo y no se encuentra. */
  trabajo?: { estado: string; canceladoEl?: Date | string | null } | null;
  tieneContrato: boolean;
  contrato?: { estado: string } | null;
  conReclamo?: boolean;
}

export type MotivoDeEspera = 'reclamo' | 'contrato_sin_terminar' | 'trabajo_en_curso' | 'sin_respaldo' | 'liberacion';

export interface EsperaDelCredito {
  motivo: MotivoDeEspera;
  texto: string;
}

const CONTRATO_CERRADO = ['completed', 'cancelled', 'rejected'];
const TRABAJO_CERRADO = ['completed', 'cancelled'];
const espera = (motivo: MotivoDeEspera, texto: string): EsperaDelCredito => ({ motivo, texto });

/** Por qué este crédito todavía no se puede retirar; null si ya se puede. */
export function esperaDelCredito(c: CreditoParaRetirar, ahora: Date = new Date()): EsperaDelCredito | null {
  if (c.conReclamo) return espera('reclamo', 'Hay un reclamo abierto en su contrato: se puede retirar cuando se resuelva.');

  if (c.concepto !== 'otro' && c.tieneContrato) {
    if (!c.contrato) return espera('sin_respaldo', 'No encontramos su contrato. Escribinos desde el Centro de ayuda.');
    if (!CONTRATO_CERRADO.includes(c.contrato.estado)) return espera('contrato_sin_terminar', 'Se puede retirar cuando el contrato termine.');
  }

  if (c.concepto === 'baja_de_presupuesto' || c.concepto === 'sobrante_de_presupuesto') {
    if (c.tieneTrabajo) {
      if (!c.trabajo) return espera('sin_respaldo', 'No encontramos el trabajo del que viene. Escribinos desde el Centro de ayuda.');
      // Si el trabajo se canceló después de anotarse, ese presupuesto ya se cerró (aunque después se haya vuelto a publicar).
      const canceladoDespues = !!c.trabajo.canceladoEl && new Date(c.trabajo.canceladoEl).getTime() >= new Date(c.creadoEl).getTime();
      if (!TRABAJO_CERRADO.includes(c.trabajo.estado) && !canceladoDespues) return espera('trabajo_en_curso', 'Se puede retirar cuando el trabajo termine.');
    }
  }

  if (c.disponibleDesde && new Date(c.disponibleDesde).getTime() > ahora.getTime()) {
    return espera('liberacion', `La pasarela libera ese pago el ${new Date(c.disponibleDesde).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}.`);
  }
  return null;
}
