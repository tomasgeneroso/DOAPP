import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { POST_WORK_RATING_EVENT } from "@/utils/postWorkRating";
import PostWorkRatingModal, {
  PostWorkRatingDraft,
} from "./PostWorkRatingModal";
import { ReviewedRole } from "./reviewDimensions";

interface PendingRating {
  contractId: string;
  reviewedName: string;
  reviewedRole: ReviewedRole;
  draft: PostWorkRatingDraft | null;
}

/** No re-consultamos en cada navegación: alcanza con un chequeo por minuto */
const MIN_INTERVAL_MS = 60_000;

/**
 * Portero de la puntuación post-trabajo.
 *
 * La puntuación es obligatoria: mientras quede una sin terminar, este
 * componente la muestra en cualquier pantalla de la app y el backend
 * bloquea publicar y postularse. El progreso queda guardado, así que
 * la encuesta se retoma donde el usuario la dejó.
 */
export default function PendingPostWorkRatingGate() {
  const { isAuthenticated, token } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState<PendingRating[]>([]);
  const lastFetch = useRef(0);

  const fetchPending = useCallback(
    async (force = false) => {
      if (!isAuthenticated || !token) {
        setPending([]);
        return;
      }
      const now = Date.now();
      if (!force && now - lastFetch.current < MIN_INTERVAL_MS) return;
      lastFetch.current = now;

      try {
        const res = await fetch("/api/reviews/post-work/pending", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setPending(
            data.data.map((item: any) => ({
              contractId: item.contractId,
              reviewedName: item.reviewedName,
              reviewedRole: item.reviewedRole === "client" ? "client" : "doer",
              draft: item.draft || null,
            })),
          );
        }
      } catch {
        // Si falla el chequeo no interrumpimos la navegación
      }
    },
    [isAuthenticated, token],
  );

  // Al entrar a la app y al navegar (como mucho una vez por minuto)
  useEffect(() => {
    void fetchPending();
  }, [fetchPending, location.pathname]);

  // Cuando una pantalla avisa que se completó un trabajo
  useEffect(() => {
    const handler = () => void fetchPending(true);
    window.addEventListener(POST_WORK_RATING_EVENT, handler);
    return () => window.removeEventListener(POST_WORK_RATING_EVENT, handler);
  }, [fetchPending]);

  const current = pending[0];
  if (!current) return null;

  return (
    <PostWorkRatingModal
      open
      contractId={current.contractId}
      reviewedName={current.reviewedName}
      reviewedRole={current.reviewedRole}
      draft={current.draft}
      onClose={() => setPending((prev) => prev.slice(1))}
    />
  );
}
