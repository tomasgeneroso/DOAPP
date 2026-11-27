/** Qué se puede dibujar y ofrecer en una tarjeta del chat. Una sola regla para que la pantalla no ofrezca algo que el servidor va a rechazar. */
export interface MetadataDeTarjeta {
  action?: string;
  proposalId?: string;
  proposalStatus?: string;
  jobStatus?: string;
}

const SON_POSTULACION = ['job_application', 'direct_contract_proposal'];
const SON_SOLO_AVISO = ['direct_proposal_accepted', 'direct_proposal_rejected', 'quote_payment_confirmed', 'group_chat_created', 'job_attachment'];

/** ¿Es una postulación (tarjeta con estado y botones) o un aviso? Los avisos del equipo se dibujaban como postulaciones «Pendientes» y vacías. */
export function esTarjetaDePostulacion(mensaje: string, metadata: MetadataDeTarjeta | null | undefined): boolean {
  const accion = metadata?.action ?? '';
  if (SON_SOLO_AVISO.includes(accion)) return false;
  return Boolean(metadata?.proposalId) || SON_POSTULACION.includes(accion) || String(mensaje).startsWith('direct_proposal');
}

const POR_QUE_NO: Record<string, string> = {
  in_progress: 'Este trabajo ya empezó: no se pueden sumar más trabajadores.',
  completed: 'Este trabajo ya terminó.',
  cancelled: 'Este trabajo fue cancelado.',
  paused: 'Este trabajo está pausado: volvé a publicarlo para elegir.',
  draft: 'Este trabajo todavía no está publicado.',
  pending_payment: 'Falta el pago de la publicación para poder elegir.',
  pending_approval: 'La publicación está en revisión: cuando se apruebe vas a poder elegir.',
};

/** Por qué ya no se puede elegir a quien se postuló. `null`: se puede. Una propuesta directa crea su propio trabajo y no se mide así. */
export function motivoParaNoAceptar(metadata: MetadataDeTarjeta | null | undefined): string | null {
  if (!metadata?.jobStatus || metadata.action === 'direct_contract_proposal') return null;
  return metadata.jobStatus === 'open' ? null : POR_QUE_NO[metadata.jobStatus] ?? 'Este trabajo no está abierto.';
}
