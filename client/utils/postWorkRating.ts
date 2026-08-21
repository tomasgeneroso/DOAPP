/**
 * Evento interno para pedirle al portero de puntuaciones que vuelva a
 * consultar si quedó alguna puntuación post-trabajo sin finalizar.
 */
export const POST_WORK_RATING_EVENT = "postwork-rating:check";

export function requestPostWorkRatingCheck() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(POST_WORK_RATING_EVENT));
}
