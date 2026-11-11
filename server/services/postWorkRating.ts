import { Op } from "sequelize";
import { Review } from "../models/sql/Review.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { Job } from "../models/sql/Job.model.js";

/**
 * Puntuación post-trabajo: obligatoria para poder volver a publicar o trabajar.
 *
 * Una fila de `reviews` con source = 'post_work_draft' es una puntuación
 * empezada y sin terminar (guarda el progreso). Cuando el usuario completa
 * las dos pantallas, la fila pasa a source = 'post_work'.
 */
export const POST_WORK_DRAFT = "post_work_draft";
export const POST_WORK_DONE = "post_work";

export interface PendingPostWorkRating {
  contractId: string;
  reviewedId: string;
  reviewedName: string;
  reviewedAvatar: string | null;
  reviewedRole: "doer" | "client";
  jobTitle: string | null;
  /** Para agrupar las de un mismo trabajo con varios trabajadores */
  jobId: string | null;
  /** Cuántas personas hay que puntuar en ese trabajo, y qué puesto ocupa esta */
  totalDelTrabajo: number;
  posicionEnElTrabajo: number;
  completedAt: Date | null;
  /** Progreso guardado de una puntuación empezada y no terminada */
  draft: {
    rating: number | null;
    timeliness: number | null;
    attendance: number | null;
    communication: number | null;
    fairPrice: number | null;
    quality: number | null;
    professionalism: number | null;
    recommendsApp: boolean | null;
    note: string | null;
    privateNote: string | null;
  } | null;
}

const draftFrom = (review: Review | undefined): PendingPostWorkRating["draft"] => {
  if (!review) return null;
  return {
    rating: review.rating ?? null,
    timeliness: review.timeliness ?? null,
    attendance: review.attendance ?? null,
    communication: review.communication ?? null,
    fairPrice: review.fairPrice ?? null,
    quality: review.quality ?? null,
    professionalism: review.professionalism ?? null,
    recommendsApp: review.recommendsApp ?? null,
    note: review.comment ?? null,
    privateNote: review.privateComment ?? null,
  };
};

/**
 * Desde cuándo se exige la puntuación post-trabajo. Los contratos que ya
 * estaban completados antes de activar la función no bloquean a nadie.
 * Configurable con POST_WORK_RATING_SINCE (ISO 8601).
 */
export function enforcedFrom(): Date {
  const configured = process.env.POST_WORK_RATING_SINCE;
  if (configured) {
    const parsed = new Date(configured);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date("2026-08-21T00:00:00Z");
}

/**
 * Contratos completados en los que el usuario todavía no terminó su
 * puntuación, del más reciente al más viejo.
 */
export async function findPendingPostWorkRatings(
  userId: string,
  limit = 20
): Promise<PendingPostWorkRating[]> {
  // Contratos que el usuario ya puntuó (los borradores siguen pendientes)
  const finished = await Review.findAll({
    where: { reviewerId: userId, source: { [Op.ne]: POST_WORK_DRAFT } },
    attributes: ["contractId"],
  });
  const finishedIds = finished.map((r) => r.contractId);

  const where: any = {
    status: "completed",
    updatedAt: { [Op.gte]: enforcedFrom() },
    [Op.or]: [{ clientId: userId }, { doerId: userId }],
  };
  if (finishedIds.length > 0) {
    where.id = { [Op.notIn]: finishedIds };
  }

  const contracts = await Contract.findAll({
    where,
    // El título del trabajo se mostraba siempre vacío porque faltaba traerlo.
    // En un trabajo con varios trabajadores hace toda la diferencia: sin él, la
    // misma pantalla aparece una vez por persona sin decir de qué trabajo es.
    include: [{ model: Job, as: "job", attributes: ["id", "title", "maxWorkers"] }],
    order: [["updatedAt", "DESC"]],
    limit,
  });

  if (contracts.length === 0) return [];

  // Progreso guardado de las que quedaron a medias
  const drafts = await Review.findAll({
    where: {
      reviewerId: userId,
      source: POST_WORK_DRAFT,
      contractId: { [Op.in]: contracts.map((c) => c.id) },
    },
  });
  const draftByContract = new Map<string, Review>();
  for (const draft of drafts) {
    draftByContract.set(draft.contractId.toString(), draft);
  }

  const pending: PendingPostWorkRating[] = [];

  for (const contract of contracts) {
    const isClient = contract.clientId.toString() === userId.toString();
    const reviewedId = isClient ? contract.doerId : contract.clientId;
    const reviewed = await User.findByPk(reviewedId, {
      attributes: ["id", "name", "avatar"],
    });

    pending.push({
      contractId: contract.id,
      reviewedId,
      reviewedName: reviewed?.name || "",
      reviewedAvatar: reviewed?.avatar || null,
      reviewedRole: isClient ? "doer" : "client",
      jobTitle: (contract as any).job?.title || null,
      jobId: (contract as any).jobId?.toString() || null,
      totalDelTrabajo: 1,
      posicionEnElTrabajo: 1,
      completedAt: contract.actualEndDate || contract.updatedAt || null,
      draft: draftFrom(draftByContract.get(contract.id.toString())),
    });
  }

  return agruparPorTrabajo(pending);
}

/**
 * Las de un mismo trabajo salen juntas y numeradas.
 *
 * Un trabajo con varios trabajadores crea un contrato por persona, así que el
 * cliente termina con una puntuación pendiente por cada uno. Sin agrupar, le
 * aparecen salteadas entre las de otros trabajos y sin saber cuántas le quedan;
 * agrupadas, completa un trabajo y después pasa al siguiente.
 */
function agruparPorTrabajo(pending: PendingPostWorkRating[]): PendingPostWorkRating[] {
  const porTrabajo = new Map<string, PendingPostWorkRating[]>();
  const sueltas: PendingPostWorkRating[] = [];

  for (const item of pending) {
    if (!item.jobId) { sueltas.push(item); continue; }
    const grupo = porTrabajo.get(item.jobId);
    if (grupo) grupo.push(item);
    else porTrabajo.set(item.jobId, [item]);
  }

  const ordenadas: PendingPostWorkRating[] = [];
  // El orden de inserción del Map conserva el de `pending`: lo más reciente primero
  for (const grupo of porTrabajo.values()) {
    grupo.forEach((item, i) => {
      item.totalDelTrabajo = grupo.length;
      item.posicionEnElTrabajo = i + 1;
      ordenadas.push(item);
    });
  }
  return [...ordenadas, ...sueltas];
}

/** ¿Al usuario le queda alguna puntuación post-trabajo sin terminar? */
export async function hasPendingPostWorkRating(userId: string): Promise<boolean> {
  const pending = await findPendingPostWorkRatings(userId, 1);
  return pending.length > 0;
}

/**
 * Avisa en notificaciones que quedó una puntuación sin finalizar.
 * No duplica: si ya hay una sin leer para ese contrato, no crea otra.
 */
export async function notifyPostWorkRatingPending(
  recipientId: string,
  contractId: string,
  options: { unfinished?: boolean } = {}
): Promise<void> {
  try {
    // Puede haber otras notificaciones del mismo contrato: buscamos la nuestra
    const contractNotifications = await Notification.findAll({
      where: { recipientId, relatedId: contractId, read: false },
    });
    const existing = contractNotifications.find((n) => n.data?.postWorkRating);

    if (existing) {
      // Ya hay un aviso pendiente para este contrato: sólo lo actualizamos
      if (options.unfinished && !existing.data?.unfinished) {
        existing.title = "Tenés una puntuación sin terminar";
        existing.message =
          "Dejaste una puntuación a medias. Terminala para poder volver a publicar o postularte.";
        existing.data = { ...existing.data, unfinished: true };
        existing.changed("data", true);
        await existing.save();
      }
      return;
    }

    await Notification.create({
      recipientId,
      type: "warning",
      category: "contract",
      title: options.unfinished
        ? "Tenés una puntuación sin terminar"
        : "Puntuá el trabajo",
      message: options.unfinished
        ? "Dejaste una puntuación a medias. Terminala para poder volver a publicar o postularte."
        : "El trabajo terminó. Puntualo para poder volver a publicar o postularte.",
      relatedModel: "Contract",
      relatedId: contractId,
      actionUrl: `/contracts/${contractId}`,
      actionText: "Puntuar",
      sentVia: ["in_app"],
      read: false,
      data: { postWorkRating: true, unfinished: !!options.unfinished, contractId },
    });
  } catch (error: any) {
    console.warn(
      "⚠️ No se pudo crear la notificación de puntuación pendiente:",
      error.message
    );
  }
}

/** Marca como leído el aviso de puntuación pendiente de un contrato. */
export async function clearPostWorkRatingNotification(
  recipientId: string,
  contractId: string
): Promise<void> {
  try {
    const notifications = await Notification.findAll({
      where: { recipientId, relatedId: contractId, read: false },
    });
    for (const notification of notifications) {
      if (notification.data?.postWorkRating) {
        notification.read = true;
        notification.readAt = new Date();
        await notification.save();
      }
    }
  } catch (error: any) {
    console.warn(
      "⚠️ No se pudo limpiar la notificación de puntuación pendiente:",
      error.message
    );
  }
}
