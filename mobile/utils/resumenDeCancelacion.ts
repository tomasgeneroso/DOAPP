/**
 * El resultado de cancelar una publicación, ordenado para un cartel del celular: qué pasó, tu dinero en filas y lo que hay que saber.
 * Antes era un único párrafo de texto plano («Se canceló "x"… Tenés $… Hubo un problema al mover el dinero: …») que costaba entender.
 *
 * Es el mismo contenido que muestra la web en `CancelacionResultadoModal`; el servidor manda los números y los avisos ya redactados.
 */
export interface RespuestaDeCancelacion {
  message?: string;
  salida?: 'saldo' | 'devolucion';
  /** false = el dinero quedó para revisión y todavía NO está en la cuenta. */
  plataMovida?: boolean;
  devueltoPorMp?: number;
  refund?: {
    toClient: number;
    toWorker: number;
    commissionWithheld: number;
    processingNotRefunded: number;
    onWithdrawal?: { comision?: number };
  };
  avisos?: Array<{ codigo: string; mensaje: string; gravedad: 'alta' | 'media' | 'baja' }>;
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

export interface ResumenDeCancelacion {
  titulo: string;
  cuerpo: string;
  /** Hay algo que el usuario tiene que leer con atención (dinero en revisión o un aviso que no es solo informativo). */
  paraRevisar: boolean;
}

export function resumenDeCancelacion(tituloDelTrabajo: string, r: RespuestaDeCancelacion): ResumenDeCancelacion {
  const refund = r.refund;
  const enRevision = r.plataMovida === false && (refund?.toClient ?? 0) > 0;
  const porMp = r.salida === 'devolucion' && !enRevision;
  const avisos = r.avisos ?? [];
  const paraRevisar = enRevision || avisos.some((a) => a.gravedad !== 'baja');

  const estado = enRevision
    ? '⏳ Tu dinero está en revisión. Cancelamos la publicación, pero todavía no pudimos acreditarlo. Administración ya fue avisada y te avisamos apenas esté.'
    : porMp
      ? '↩️ Devolución en camino a tu medio de pago. Según el banco puede tardar unos días en verse.'
      : '✅ Saldo a favor acreditado. Lo usás para volver a publicar sin pagar de nuevo, o lo retirás a tu banco.';

  const filas: string[] = [];
  if (refund && !enRevision) {
    if (porMp) filas.push(`• Devuelto a tu medio de pago: ${pesos(r.devueltoPorMp ?? 0)}`);
    else if (refund.toClient > 0) filas.push(`• Saldo a favor: ${pesos(refund.toClient)}`);
    if (refund.toWorker > 0) filas.push(`• Para el trabajador (cancelación tardía): ${pesos(refund.toWorker)}`);
    if (refund.commissionWithheld > 0) filas.push(`• Comisión que no se devuelve: ${pesos(refund.commissionWithheld)}`);
    if (refund.processingNotRefunded > 0) filas.push(`• Costo de procesamiento (no se devuelve, la pasarela ya lo cobró): ${pesos(refund.processingNotRefunded)}`);
    const retencion = refund.onWithdrawal?.comision ?? 0;
    if (!porMp && retencion > 0) {
      filas.push(`• Si lo retirás a tu banco recibís: ${pesos(Math.max(0, refund.toClient - retencion))} (se descuentan ${pesos(retencion)} de comisión por la revisión ya hecha)`);
    }
  }

  const partes = [estado];
  if (filas.length > 0) partes.push(`TU DINERO\n${filas.join('\n')}`);
  if (avisos.length > 0) partes.push(`QUÉ PASÓ\n${avisos.map((a) => `• ${a.mensaje}\n  Referencia: ${a.codigo}`).join('\n')}`);

  return {
    titulo: paraRevisar ? 'Cancelado, pero revisá esto' : `Cancelaste «${tituloDelTrabajo}»`,
    cuerpo: partes.join('\n\n'),
    paraRevisar,
  };
}
