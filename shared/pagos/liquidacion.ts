/**
 * Cuándo se «liquida» el dinero de un contrato: cuándo se libera al trabajador y desde cuándo lo puede retirar.
 *
 * Lo arma el servidor (`services/liquidacionDelContrato.ts`) y la web y la app lo cuentan con las mismas frases desde acá, para que nadie lea dos versiones.
 *
 * Los tiempos son los de los T&C: 7.6 (si nadie confirma, a las `AUTO_CONFIRMACION_HORAS` de la hora de fin se da por terminado y se libera el pago) y la
 * retención posterior (`DIAS_PARA_DISPUTAR`, el plazo del Cliente para reclamar) más el plazo en que la pasarela libera el pago a la Plataforma.
 */
export type EstadoDeLaLiquidacion = 'sin_pago' | 'en_custodia' | 'esperando_confirmacion' | 'liberado' | 'devuelto';

export interface LiquidacionDelContrato {
  estado: EstadoDeLaLiquidacion;
  /** Si nadie confirma, a esta hora el contrato se da por terminado solo y se libera el pago (ISO). Null si ya no corre. */
  confirmaSolaEl: string | null;
  /** Desde cuándo el trabajador puede retirar este dinero. Con el contrato completado es la fecha real; si no, es una estimación (`esEstimado`). */
  transferibleDesde: string | null;
  /** Si las dos partes confirman HOY, desde cuándo se podría retirar (solo mientras el contrato no está completado). */
  transferibleSiConfirmanHoy: string | null;
  esEstimado: boolean;
  /** Días de plazo del cliente para reclamar después de terminado el trabajo. */
  diasDeReclamo: number;
  /** Cuándo la pasarela libera el pago original a la Plataforma, si todavía no lo hizo (ISO). */
  liberaLaPasarelaEl: string | null;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const fechaYHora = (iso: string) =>
  `${new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} a las ${new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

/** El título corto del estado del dinero. */
export const TITULO_DEL_ESTADO: Record<EstadoDeLaLiquidacion, string> = {
  sin_pago: 'Todavía no hay un pago acreditado',
  en_custodia: 'El pago está en custodia de DOAPP',
  esperando_confirmacion: 'El pago está en custodia, esperando la confirmación',
  liberado: 'El pago se liberó al trabajador',
  devuelto: 'El pago se devolvió al cliente',
};

/**
 * Las frases que se muestran en «Detalles del pago». `rol` cambia el sujeto («lo podés retirar» para el trabajador, «lo puede retirar» para el cliente).
 */
export function frasesDeLiquidacion(l: LiquidacionDelContrato | null | undefined, rol: 'trabajador' | 'cliente' | 'otro' = 'otro'): string[] {
  if (!l) return [];
  const quien = rol === 'trabajador' ? 'vos' : 'el trabajador';
  const out: string[] = [];

  if (l.estado === 'devuelto') return ['El dinero volvió al cliente.'];
  if (l.estado === 'sin_pago') return ['Cuando el pago esté acreditado, queda en custodia de DOAPP hasta que el trabajo se confirme.'];

  if (l.estado === 'liberado') {
    out.push('El pago ya se liberó al trabajador.');
    if (l.transferibleDesde) {
      const paso = new Date(l.transferibleDesde).getTime() <= Date.now();
      out.push(
        paso
          ? `${rol === 'trabajador' ? 'Ya lo podés retirar' : 'El trabajador ya lo puede retirar'}: pasaron los ${l.diasDeReclamo} días de plazo para reclamar${l.liberaLaPasarelaEl ? ' y la pasarela ya liberó el pago' : ''}.`
          : `${rol === 'trabajador' ? 'Lo vas a poder retirar' : 'El trabajador lo va a poder retirar'} desde el ${fecha(l.transferibleDesde)}: es el fin del plazo de ${l.diasDeReclamo} días para reclamar${l.liberaLaPasarelaEl ? ' y de la liberación del pago por la pasarela' : ''}.`,
      );
    }
    return out;
  }

  out.push('El dinero queda en custodia de DOAPP: no se le entrega al trabajador hasta que el trabajo se confirme.');
  if (l.confirmaSolaEl) {
    out.push(
      `Se libera cuando las dos partes tocan «terminó el trabajo» o, si nadie confirma, el ${fechaYHora(l.confirmaSolaEl)} (se da por terminado solo a las 24 horas de la hora de fin).`,
    );
  } else {
    out.push('Se libera cuando las dos partes tocan «terminó el trabajo»; si nadie confirma, se da por terminado solo a las 24 horas de la hora de fin.');
  }
  if (l.transferibleDesde) {
    const tope = `Después hay ${l.diasDeReclamo} días de plazo para reclamar${l.liberaLaPasarelaEl ? ' y la pasarela tiene que haber liberado el pago' : ''}.`;
    if (l.transferibleSiConfirmanHoy && l.transferibleSiConfirmanHoy !== l.transferibleDesde) {
      out.push(`${quien === 'vos' ? 'Lo podés retirar' : 'El trabajador lo puede retirar'} desde el ${fecha(l.transferibleSiConfirmanHoy)} si confirman hoy, o desde el ${fecha(l.transferibleDesde)} si se confirma solo. ${tope}`);
    } else {
      out.push(`${quien === 'vos' ? 'Lo podés retirar' : 'El trabajador lo puede retirar'} desde el ${fecha(l.transferibleDesde)}. ${tope}`);
    }
  }
  return out;
}
