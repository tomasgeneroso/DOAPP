/**
 * Human-readable descriptions for the status values shown across admin tables.
 * Used as `title` tooltips so hovering a status explains what it means and when
 * it happens. Keep these in sync with the status flows in the models.
 */

export const jobStatusDescriptions: Record<string, string> = {
  draft: 'Borrador: el cliente todavía no pagó la publicación. No es visible.',
  pending_payment: 'Esperando pago: se creó la publicación pero falta abonar (o subir el comprobante).',
  pending_approval: 'Pendiente de aprobación: el pago fue realizado y un admin debe revisar/aprobar la publicación.',
  open: 'Abierta: publicada y visible; los profesionales pueden postularse.',
  in_progress: 'En curso: hay al menos un trabajador seleccionado y el trabajo está en marcha.',
  completed: 'Completada: todos los contratos del trabajo fueron confirmados.',
  cancelled: 'Cancelada: la publicación fue cancelada (por el dueño o un admin).',
  paused: 'Pausada: temporalmente oculta; el dueño puede reactivarla.',
  suspended: 'Suspendida: dada de baja por el sistema/admin (p. ej. fecha flexible vencida).',
  rejected: 'Rechazada: un admin rechazó la publicación; requiere corrección.',
};

export const contractStatusDescriptions: Record<string, string> = {
  pending: 'Pendiente: contrato creado desde una propuesta; espera aprobación del admin.',
  ready: 'Listo: aprobado por el admin; espera que ambas partes acepten.',
  accepted: 'Aceptado: cliente y trabajador aceptaron; próximo a iniciar.',
  in_progress: 'En curso: el trabajo se está ejecutando.',
  awaiting_confirmation: 'Esperando confirmación: el trabajo se marcó como terminado; falta que ambos confirmen (auto-confirma a las 2h).',
  completed: 'Completado: ambos confirmaron; el escrow se liberó al trabajador.',
  cancelled: 'Cancelado: el contrato fue cancelado.',
  disputed: 'En disputa: hay un reclamo abierto; el escrow queda congelado hasta resolver.',
  rejected: 'Rechazado: el contrato fue rechazado por el admin.',
  in_review: 'En revisión: bajo análisis administrativo.',
};

export const contractPaymentDescriptions: Record<string, string> = {
  pending: 'Pago pendiente: aún no se acreditó el pago del contrato.',
  held: 'Retenido: los fondos están retenidos a la espera de avanzar el contrato.',
  escrow: 'En escrow: fondos retenidos hasta que se complete y confirme el trabajo.',
  released: 'Liberado: el escrow se liberó y el trabajador cobró.',
  refunded: 'Reembolsado: los fondos se devolvieron al cliente.',
  completed: 'Completado: el flujo de pago del contrato finalizó.',
};

export const withdrawalStatusDescriptions: Record<string, string> = {
  pending: 'Pendiente: el usuario solicitó el retiro; espera aprobación del admin.',
  approved: 'Aprobado: el admin aprobó el retiro; falta procesar la transferencia.',
  processing: 'Procesando: la transferencia bancaria está en curso.',
  completed: 'Retirado: la transferencia se completó y los fondos salieron de la plataforma.',
  rejected: 'Rechazado: el retiro fue rechazado (motivo indicado por el admin).',
};

export const paymentVerificationDescriptions: Record<string, string> = {
  pending: 'Pendiente: pago iniciado, esperando comprobante o confirmación.',
  pending_verification: 'Pendiente de comprobación: hay un comprobante para verificar, o se espera el pago.',
  verified: 'Verificado: el comprobante fue validado por un admin.',
  held_escrow: 'En escrow: fondos retenidos hasta completar y confirmar el trabajo.',
  confirmed_for_payout: 'Listo para pagar: confirmado para transferir al trabajador.',
  completed: 'Completado: el pago se procesó correctamente.',
  rejected: 'Rechazado: el pago/comprobante fue rechazado.',
  refunded: 'Reembolsado: los fondos se devolvieron al saldo del usuario.',
  withdrawn: 'Retirado: los fondos ya fueron transferidos a la cuenta del usuario.',
};

export function statusDescription(map: Record<string, string>, status?: string | null): string {
  if (!status) return '';
  return map[status] || `Estado: ${status}`;
}
