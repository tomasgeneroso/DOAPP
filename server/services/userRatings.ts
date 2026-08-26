import { Op } from "sequelize";
import { Review } from "../models/sql/Review.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { User } from "../models/sql/User.model.js";
import { POST_WORK_DRAFT } from "./postWorkRating.js";

/**
 * Reputación por rol.
 *
 * Al doer se lo puntúa en las seis dimensiones y al cliente sólo en las que
 * le aplican (puntualidad, como persona, precio justo), así que promediarlas
 * juntas compara cosas distintas. Un usuario que trabaja y contrata tiene dos
 * reputaciones separadas, cada una con su cantidad de opiniones, y cada
 * dimensión promedia sólo sobre las reseñas que efectivamente la puntuaron.
 */

export type ReviewedRole = "doer" | "client";

/** Dimensiones que se puntúan a cada rol */
export const ROLE_DIMENSIONS: Record<ReviewedRole, readonly string[]> = {
  doer: [
    "timeliness",
    "attendance",
    "communication",
    "fairPrice",
    "quality",
    "professionalism",
  ],
  client: ["timeliness", "communication", "fairPrice"],
};

const ALL_DIMENSIONS = ROLE_DIMENSIONS.doer;

/** Nombre del campo plano en users para cada dimensión (compatibilidad) */
const LEGACY_DIMENSION_COLUMN: Record<string, string> = {
  timeliness: "puntualidadRating",
  attendance: "presencialidadRating",
  communication: "comoPersonaRating",
  fairPrice: "precioJustoRating",
  quality: "calidadTrabajoRating",
  professionalism: "profesionalidadRating",
};

export interface DimensionStat {
  avg: number;
  count: number;
}

export interface RoleStats {
  rating: number;
  count: number;
  dimensions: Record<string, DimensionStat>;
}

export interface RatingBreakdown {
  overall: { rating: number; count: number };
  doer: RoleStats;
  client: RoleStats;
  updatedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

const average = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

const emptyRoleStats = (): RoleStats => ({ rating: 0, count: 0, dimensions: {} });

/**
 * Promedia una dimensión sobre las reseñas que la puntuaron. Las que la
 * dejaron vacía no cuentan: no bajan el promedio ni inflan la cantidad.
 */
function dimensionStats(reviews: Review[], dimensions: readonly string[]) {
  const stats: Record<string, DimensionStat> = {};
  for (const dimension of dimensions) {
    const values = reviews
      .map((r) => (r as any)[dimension])
      .filter((v: any): v is number => v !== null && v !== undefined);
    if (values.length === 0) continue; // sin datos ≠ puntuación baja
    stats[dimension] = { avg: round2(average(values)), count: values.length };
  }
  return stats;
}

function roleStats(reviews: Review[], role: ReviewedRole): RoleStats {
  if (reviews.length === 0) return emptyRoleStats();
  return {
    rating: round1(average(reviews.map((r) => r.rating as number))),
    count: reviews.length,
    dimensions: dimensionStats(reviews, ROLE_DIMENSIONS[role]),
  };
}

/**
 * Determina el rol de cada reseña. Las filas viejas pueden no tenerlo
 * guardado, así que se deduce del contrato en una sola consulta.
 */
async function resolveRoles(reviews: Review[]): Promise<Map<string, ReviewedRole>> {
  const roles = new Map<string, ReviewedRole>();
  const missing: Review[] = [];

  for (const review of reviews) {
    if (review.reviewedRole === "doer" || review.reviewedRole === "client") {
      roles.set(review.id, review.reviewedRole);
    } else {
      missing.push(review);
    }
  }

  if (missing.length > 0) {
    const contracts = await Contract.findAll({
      where: { id: { [Op.in]: missing.map((r) => r.contractId) } },
      attributes: ["id", "doerId", "clientId"],
    });
    const doerByContract = new Map(
      contracts.map((c) => [c.id.toString(), c.doerId?.toString()])
    );
    for (const review of missing) {
      const doerId = doerByContract.get(review.contractId.toString());
      roles.set(
        review.id,
        doerId && doerId === review.reviewedId.toString() ? "doer" : "client"
      );
    }
  }

  return roles;
}

/**
 * Recalcula la reputación de un usuario: global, por rol y por dimensión.
 */
export async function recalculateUserRatings(userId: string): Promise<RatingBreakdown | null> {
  const allReviews = await Review.findAll({
    where: { reviewedId: userId, isVisible: true },
  });

  // Los borradores y las reseñas sin estrellas no promedian
  const reviews = allReviews.filter(
    (r) =>
      r.rating !== null &&
      r.rating !== undefined &&
      r.source !== POST_WORK_DRAFT
  );

  if (reviews.length === 0) return null;

  const roles = await resolveRoles(reviews);
  const asDoer = reviews.filter((r) => roles.get(r.id) === "doer");
  const asClient = reviews.filter((r) => roles.get(r.id) === "client");

  const doer = roleStats(asDoer, "doer");
  const client = roleStats(asClient, "client");

  const breakdown: RatingBreakdown = {
    overall: {
      rating: round1(average(reviews.map((r) => r.rating as number))),
      count: reviews.length,
    },
    doer,
    client,
    updatedAt: new Date().toISOString(),
  };

  // Campos planos globales: se mantienen por compatibilidad con lo que ya
  // los consume (búsqueda, listados). El detalle fiel está en el breakdown.
  const globalDimensions = dimensionStats(reviews, ALL_DIMENSIONS);
  const legacyValues: Record<string, number> = {};
  for (const dimension of ALL_DIMENSIONS) {
    legacyValues[LEGACY_DIMENSION_COLUMN[dimension]] =
      globalDimensions[dimension]?.avg ?? 0;
  }

  await User.update(
    {
      rating: breakdown.overall.rating,
      reviewsCount: breakdown.overall.count,
      doerRating: doer.rating,
      doerReviewsCount: doer.count,
      clientRating: client.rating,
      clientReviewsCount: client.count,
      ratingBreakdown: breakdown,
      ...legacyValues,
    },
    { where: { id: userId } }
  );

  return breakdown;
}

export default recalculateUserRatings;
