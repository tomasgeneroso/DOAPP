import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { diasHabilesDesde, DIAS_HABILES_ANTES_DE_PAUSAR } from '../services/quotePayment.js';
import { Notification } from '../models/sql/Notification.model.js';
import cacheService from '../services/cacheService.js';
import { logger } from '../services/logger.js';

/**
 * Pausa las publicaciones que no consiguieron cotizacion aceptada.
 *
 * Un trabajo abierto sin contratar ocupa lugar en el muro y le hace perder
 * tiempo a los trabajadores que cotizan sobre algo que el cliente ya abandono.
 * Diez dias habiles es el corte: dos semanas de calendario, suficiente para que
 * un cliente que sigue interesado haya elegido a alguien.
 *
 * Se pausa, no se cancela. La diferencia importa: cancelar destruye las
 * cotizaciones recibidas y obliga a republicar desde cero. El cliente reanuda
 * con un boton y el trabajo vuelve al muro con todo lo que tenia.
 *
 * Los trabajos ya pagados NO se pausan. Es el beneficio concreto de pagar la
 * publicacion por adelantado: el trabajo queda en el muro hasta que el cliente
 * lo cancele. Quien ya puso la plata demostro que el trabajo es real, que es
 * justamente lo que esta regla busca filtrar; el problema son las
 * publicaciones "a cotizar" que nadie atiende y que le hacen perder tiempo a
 * los trabajadores que cotizan sobre algo abandonado.
 */

export async function pauseStaleJobs(): Promise<number> {
  const limite = new Date();
  // Se filtra por fecha de calendario primero, que el indice puede resolver, y
  // recien despues se cuentan dias habiles. 10 dias habiles nunca son menos de
  // 10 corridos, asi que este filtro no puede descartar un candidato valido.
  limite.setDate(limite.getDate() - DIAS_HABILES_ANTES_DE_PAUSAR);

  const candidatos = await Job.findAll({
    where: {
      status: 'open',
      createdAt: { [Op.lt]: limite },
      // Un trabajo ya pausado por esto no se vuelve a pausar: si el cliente lo
      // reanudo, la cuenta arranca de nuevo desde la reanudacion.
      pausedForInactivityAt: { [Op.is]: null } as any,
      // Pagar la publicacion compra permanencia. El filtro va en la consulta y
      // no en el bucle para que un trabajo pagado no aparezca nunca entre los
      // candidatos, ni siquiera para descartarlo despues.
      publicationPaid: false,
    },
    limit: 500,
  });

  let pausados = 0;

  for (const job of candidatos) {
    try {
      // La antiguedad se mide desde la reanudacion si la hubo, no desde la
      // publicacion: si no, un trabajo reanudado se volveria a pausar al dia
      // siguiente y el boton no serviria de nada.
      const desde = (job as any).resumedAt || job.createdAt;
      if (diasHabilesDesde(new Date(desde)) < DIAS_HABILES_ANTES_DE_PAUSAR) continue;

      // Si ya hay una propuesta aceptada el trabajo esta encaminado, aunque el
      // contrato todavia no exista.
      const aceptada = await Proposal.count({
        where: { jobId: job.id, status: 'approved' },
      });
      if (aceptada > 0) continue;

      job.status = 'paused';
      (job as any).pausedForInactivityAt = new Date();
      await job.save();
      pausados++;

      await Notification.create({
        recipientId: job.clientId,
        type: 'job_paused_inactivity',
        category: 'jobs',
        title: 'Tu publicación se pausó',
        message:
          `"${job.title}" estuvo ${DIAS_HABILES_ANTES_DE_PAUSAR} días hábiles sin una cotización aceptada, ` +
          'así que la pausamos para que no siga ocupando el muro. Podés reanudarla cuando quieras y ' +
          'vuelve con todas las cotizaciones que ya recibiste.',
        relatedModel: 'Job',
        relatedId: job.id,
        actionText: 'Reanudar',
        data: { jobId: job.id, pausadoPorInactividad: true },
      } as any);
    } catch (error: any) {
      // Un trabajo que falla no puede frenar a los demas.
      logger.error('jobs', `No se pudo pausar el trabajo ${job.id}: ${error.message}`);
    }
  }

  if (pausados > 0) {
    await cacheService.delPattern('jobs:*');
    logger.info('jobs', `Publicaciones pausadas por inactividad: ${pausados}`);
  }

  return pausados;
}

export function startPauseStaleJobs(): void {
  // Una vez por dia alcanza: el umbral se mide en dias habiles, no en horas.
  const UNA_HORA = 60 * 60 * 1000;
  setInterval(() => {
    pauseStaleJobs().catch((e) => logger.error('jobs', `pauseStaleJobs: ${e.message}`));
  }, 12 * UNA_HORA);
}
