import { POLITICAS } from '../constants/policies.js';

/**
 * Reclamo directo: la logica pura, compartida por servidor, web y mobile.
 *
 * Un reclamo empieza como una conversacion entre las dos partes con un reloj a
 * la vista. La otra parte tiene RECLAMO_DIRECTO_HORAS para responder, y las
 * dos ese mismo tiempo para arreglarlo (retirar el reclamo, devolver una
 * parte, rehacer el trabajo). Si el plazo vence sin acuerdo, interviene un
 * administrador. Si una parte ya respondio y esta claro que no se van a poner
 * de acuerdo, cualquiera puede pedir que intervenga antes: esperar el resto
 * del plazo no le sirve a nadie.
 *
 * Lo que NO puede hacer una parte: escalar antes del plazo si la otra todavia
 * no respondio. Ese plazo es de la otra parte, y pedirle a un admin que
 * decida sin haber escuchado a los dos es lo que el reclamo directo vino a
 * evitar.
 */

export const RECLAMO_HORAS = POLITICAS.RECLAMO_DIRECTO_HORAS;

export interface MensajeMinimo {
  from: string;
  isAdmin?: boolean;
  createdAt: Date | string;
}

export interface ReclamoMinimo {
  status: string;
  initiatedBy: string;
  against: string;
  createdAt: Date | string;
  negotiationDeadline?: Date | string | null;
  messages?: MensajeMinimo[];
  agreementProposal?: { propuestoPor: string } | null;
}

export interface EstadoReclamo {
  /** true mientras el reclamo esta en manos de las partes. */
  enReclamoDirecto: boolean;
  plazo: Date;
  vencido: boolean;
  horasRestantes: number;
  /** "2 d 5 h", "18 h", "vencido". */
  textoRestante: string;
  /** La parte reclamada ya escribio al menos una vez. */
  laOtraRespondio: boolean;
  /** Si QUIEN MIRA puede pedir que intervenga un admin ahora. */
  puedeEscalar: boolean;
  motivoNoEscalar?: string;
  /** Si quien mira puede aceptar la propuesta vigente (la hizo la otra parte). */
  puedeAceptarPropuesta: boolean;
  /** Si quien mira es quien abrio el reclamo (puede retirarlo). */
  esReclamante: boolean;
}

export function plazoDeReclamo(abiertoEl: Date | string): Date {
  return new Date(new Date(abiertoEl).getTime() + RECLAMO_HORAS * 60 * 60 * 1000);
}

function textoHoras(horas: number): string {
  if (horas <= 0) return 'vencido';
  const d = Math.floor(horas / 24);
  const h = Math.floor(horas % 24);
  if (d === 0) return `${Math.max(1, h)} h`;
  return h === 0 ? `${d} d` : `${d} d ${h} h`;
}

export function estadoDelReclamo(r: ReclamoMinimo, quienMira: string, ahora = new Date()): EstadoReclamo {
  const plazo = r.negotiationDeadline ? new Date(r.negotiationDeadline) : plazoDeReclamo(r.createdAt);
  const msRestantes = plazo.getTime() - ahora.getTime();
  const horasRestantes = Math.max(0, msRestantes / 3_600_000);
  const vencido = msRestantes <= 0;
  const enReclamoDirecto = r.status === 'negotiation';

  const yo = String(quienMira);
  const reclamante = String(r.initiatedBy);
  const reclamado = String(r.against);
  const esReclamante = yo === reclamante;

  const laOtraRespondio = (r.messages || []).some((m) => !m.isAdmin && String(m.from) === reclamado);

  let puedeEscalar = false;
  let motivoNoEscalar: string | undefined;
  if (!enReclamoDirecto) {
    motivoNoEscalar = 'El reclamo ya no esta en manos de las partes.';
  } else if (yo !== reclamante && yo !== reclamado) {
    motivoNoEscalar = 'Solo las partes pueden pedir que intervenga un administrador.';
  } else if (vencido || laOtraRespondio) {
    puedeEscalar = true;
  } else {
    motivoNoEscalar = esReclamante
      ? `La otra parte todavia tiene ${textoHoras(horasRestantes)} para responder. Si no responde, interviene un administrador solo.`
      : 'Responde primero: contar tu version es lo que permite que un administrador decida bien.';
  }

  const propuesta = r.agreementProposal;
  const puedeAceptarPropuesta =
    enReclamoDirecto && !!propuesta && String(propuesta.propuestoPor) !== yo && (yo === reclamante || yo === reclamado);

  return {
    enReclamoDirecto,
    plazo,
    vencido,
    horasRestantes,
    textoRestante: textoHoras(horasRestantes),
    laOtraRespondio,
    puedeEscalar,
    motivoNoEscalar,
    puedeAceptarPropuesta,
    esReclamante,
  };
}

/** Texto unico para los dos frentes: que significa cada tipo de acuerdo. */
export const TIPOS_DE_ACUERDO: Record<'reembolso_total' | 'reembolso_parcial' | 'rehacer', { titulo: string; explicacion: string }> = {
  reembolso_total: {
    titulo: 'Devolver todo el precio al cliente',
    explicacion:
      'El trabajador renuncia al pago y el precio del trabajo vuelve al cliente. La comision de publicacion no se devuelve (T&C 7.5). El contrato queda cancelado.',
  },
  reembolso_parcial: {
    titulo: 'Devolver una parte al cliente',
    explicacion:
      'Se acuerda un monto que vuelve al cliente; el resto se le paga al trabajador. El contrato queda terminado con ese reparto.',
  },
  rehacer: {
    titulo: 'El trabajador rehace o termina el trabajo',
    explicacion:
      'El reclamo se cierra y el contrato vuelve a estar en curso. Si el problema sigue, el cliente puede abrir un reclamo nuevo dentro del plazo.',
  },
};
