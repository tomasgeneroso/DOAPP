/**
 * Intentos de pago que no se completaron (pedido del dueño, 2026-11-13): «intenté 3 veces el pago pero solo pude pagar una, y en Transacciones me salen las 3;
 * tienen que salir 2 como intento de pago (sin nada más que la info de que intentaron pagar) y la que tiene que salir es la última, cuando se pagó. Hay que
 * anidar esos dos intentos al pago efectivo, solo para mostrar el rastro».
 *
 * Cada vez que alguien toca «Pagar» se crea un pago `pending` con su preferencia de Mercado Pago; si no lo completa, queda ahí para siempre. Un intento es un
 * pago SIN dinero (nunca llegó a pagarse) que tiene, de la misma persona y del mismo trabajo o contrato y del mismo tipo, otro pago POSTERIOR. Ese pago posterior
 * es el que cuenta y lleva a los intentos anidados; los intentos no se listan por su cuenta.
 *
 * El que cuenta es el pago efectivo más cercano que vino después; si ninguno avanzó (pasa mientras el último pago todavía no se confirmó: en revisión, o
 * confirmado en Mercado Pago pero sin procesar acá), cuenta el ÚLTIMO de todos y los anteriores son sus intentos (pedido del dueño, 2026-11-13, pantalla «Pagos»).
 */

/** Estados de un pago en el que nunca entró dinero. */
export const ESTADOS_SIN_PAGO = ['pending', 'processing', 'failed', 'cancelled'] as const;

export const esEstadoSinPago = (estado: unknown): boolean => (ESTADOS_SIN_PAGO as readonly string[]).includes(String(estado));

export interface PagoParaEmparejar {
  id: string;
  status: string;
  payerId?: string | null;
  paymentType?: string | null;
  jobId?: string | null;
  metadataJobId?: string | null;
  contractId?: string | null;
  createdAt: Date | string;
}

const instante = (d: Date | string): number => new Date(d).getTime();
const trabajoDe = (p: PagoParaEmparejar): string => String(p.jobId || p.metadataJobId || '');

/** ¿Este intento y este pago son del mismo trabajo o contrato, de la misma persona y del mismo tipo? */
export function esDelMismoTrato(intento: PagoParaEmparejar, pago: PagoParaEmparejar): boolean {
  if (!intento.payerId || String(intento.payerId) !== String(pago.payerId)) return false;
  if (String(intento.paymentType || '') !== String(pago.paymentType || '')) return false;
  const trabajo = trabajoDe(intento);
  if (trabajo && trabajo === trabajoDe(pago)) return true;
  return !!intento.contractId && String(intento.contractId) === String(pago.contractId || '');
}

/**
 * A cada intento sin pago le toca el pago efectivo MÁS CERCANO que vino después o, si no hay, el último pago posterior (aunque tampoco esté pagado).
 * Devuelve, por id del pago que cuenta, sus intentos (del más viejo al más nuevo). Un intento sin ningún pago posterior no aparece en el resultado (sigue
 * listándose por su cuenta).
 */
export function emparejarIntentos(pagos: PagoParaEmparejar[], intentos: PagoParaEmparejar[]): Map<string, PagoParaEmparejar[]> {
  const salida = new Map<string, PagoParaEmparejar[]>();
  for (const intento of [...intentos].sort((a, b) => instante(a.createdAt) - instante(b.createdAt))) {
    if (!esEstadoSinPago(intento.status)) continue;
    const posteriores = pagos
      .filter((p) => p.id !== intento.id && instante(p.createdAt) > instante(intento.createdAt) && esDelMismoTrato(intento, p))
      .sort((a, b) => instante(a.createdAt) - instante(b.createdAt));
    const dueño = posteriores.find((p) => !esEstadoSinPago(p.status)) ?? posteriores[posteriores.length - 1];
    if (!dueño) continue;
    salida.set(dueño.id, [...(salida.get(dueño.id) ?? []), intento]);
  }
  return salida;
}

/**
 * La condición SQL equivalente (para no listar los intentos ni contarlos en el total): un pago sin dinero al que le sigue, del mismo trato, otro pago (pagado o
 * no: el último es el que cuenta). Se usa dentro de una consulta sobre `payments` con el alias "Payment".
 */
export const SQL_ES_UN_INTENTO_ANIDADO = `(
  "Payment"."status"::text IN (${ESTADOS_SIN_PAGO.map((e) => `'${e}'`).join(', ')})
  AND EXISTS (
    SELECT 1 FROM payments ok
    WHERE ok.payer_id = "Payment"."payer_id"
      AND ok.payment_type::text = "Payment"."payment_type"::text
      AND ok.id <> "Payment"."id"
      AND ok.created_at > "Payment"."created_at"
      AND (
        (COALESCE(ok.job_id::text, ok.metadata->>'jobId') IS NOT NULL
          AND COALESCE(ok.job_id::text, ok.metadata->>'jobId') = COALESCE("Payment"."job_id"::text, "Payment"."metadata"->>'jobId'))
        OR (ok.contract_id IS NOT NULL AND ok.contract_id = "Payment"."contract_id")
      )
  )
)`;
