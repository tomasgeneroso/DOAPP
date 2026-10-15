/**
 * En qué está una publicación y qué sigue, dicho para quien la publicó («Mis trabajos»).
 *
 * Un estado a secas («Borrador», «Pendiente de aprobación») no le dice a la persona si tiene que hacer algo, si está esperando a
 * alguien o por qué su trabajo no aparece en el muro. Acá cada estado trae su explicación y, cuando hay algo para hacer, el enlace.
 */
export interface EstadoDePublicacion {
  /** El estado en pocas palabras. */
  etiqueta: string;
  /** Qué significa y qué pasa después. */
  explicacion: string;
  /** Lo que la persona puede hacer ahora, si hay algo. */
  accion?: { texto: string; ruta: string };
  /** ¿Está visible en el muro? */
  enElMuro: boolean;
  /** Para elegir el color: info, atención (hay algo para hacer), espera, bien, cierre. */
  tono: 'atencion' | 'espera' | 'bien' | 'info' | 'cierre';
}

export function estadoDePublicacion(job: { id: string; status: string }): EstadoDePublicacion {
  const pagar = { texto: 'Pagar y publicar', ruta: `/jobs/${job.id}/payment` };
  switch (job.status) {
    case 'draft':
      return {
        etiqueta: 'Sin publicar',
        explicacion: 'Todavía no está en el muro: falta pagar la publicación (o verificar tu identidad, si no lo hiciste).',
        accion: pagar,
        enElMuro: false,
        tono: 'atencion',
      };
    case 'pending_payment':
      return {
        etiqueta: 'Pago en proceso',
        explicacion: 'Estamos esperando que se acredite tu pago. Cuando se confirme pasa a revisión.',
        accion: { texto: 'Ver el pago', ruta: `/jobs/${job.id}/payment` },
        enElMuro: false,
        tono: 'espera',
      };
    case 'pending_approval':
      return {
        etiqueta: 'En revisión',
        explicacion: 'Ya está pagado. Un administrador lo revisa y, cuando lo aprueba, aparece en el muro.',
        enElMuro: false,
        tono: 'espera',
      };
    case 'open':
    case 'published':
      return { etiqueta: 'Publicado', explicacion: 'Está en el muro: los trabajadores ya pueden postularse.', accion: { texto: 'Ver en el muro', ruta: `/jobs/${job.id}` }, enElMuro: true, tono: 'bien' };
    case 'paused':
      return { etiqueta: 'Pausado', explicacion: 'No se muestra en el muro hasta que lo reanudes.', accion: { texto: 'Abrir el trabajo', ruta: `/jobs/${job.id}` }, enElMuro: false, tono: 'atencion' };
    case 'in_progress':
      return { etiqueta: 'En curso', explicacion: 'Ya tiene un trabajador contratado y está en marcha.', enElMuro: false, tono: 'info' };
    case 'completed':
      return { etiqueta: 'Completado', explicacion: 'El trabajo terminó.', enElMuro: false, tono: 'cierre' };
    case 'cancelled':
      return { etiqueta: 'Cancelado', explicacion: 'Se canceló y ya no está en el muro.', enElMuro: false, tono: 'cierre' };
    case 'disputed':
      return { etiqueta: 'En disputa', explicacion: 'Hay un reclamo abierto: un administrador lo está revisando.', enElMuro: false, tono: 'atencion' };
    default:
      return { etiqueta: job.status, explicacion: '', enElMuro: false, tono: 'info' };
  }
}
