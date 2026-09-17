import { useEffect, useState } from "react";
import { Lock, Star } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "/api";

interface Reseña {
  id: string;
  reviewerId: string;
  reviewedId: string;
  rating?: number | null;
  comment?: string | null;
  privateComment?: string | null;
  createdAt: string;
  reviewer?: { id: string; name: string; avatar?: string };
}

/**
 * Las reseñas de un contrato terminado, para sus partes. La publica es la que
 * ve todo el mundo en el perfil; la privada llega solo a quien la recibio, y
 * este es el unico lugar donde la lee (el servidor no la manda a nadie mas).
 */
export default function ContractReviewsPanel({ contractId, userId }: { contractId: string; userId: string }) {
  const [reseñas, setReseñas] = useState<Reseña[] | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_URL}/reviews/contract/${contractId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setReseñas(d.success ? d.data : []))
      .catch(() => setReseñas([]));
  }, [contractId]);

  if (!reseñas || reseñas.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg bg-white p-6 shadow-md dark:bg-slate-800">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Reseñas de este contrato</h2>
      <div className="space-y-4">
        {reseñas.map((r) => {
          const paraMi = String(r.reviewedId) === String(userId);
          const mia = String(r.reviewerId) === String(userId);
          return (
            <div key={r.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {mia ? "Tu reseña" : `Reseña de ${r.reviewer?.name || "la otra parte"}`}
                  {paraMi && !mia && <span className="ml-2 text-xs text-slate-500">sobre vos</span>}
                </div>
                {typeof r.rating === "number" && (
                  <div className="flex items-center gap-0.5" aria-label={`${r.rating} de 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-4 w-4 ${n <= (r.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} aria-hidden="true" />
                    ))}
                  </div>
                )}
              </div>
              {r.comment && <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{r.comment}</p>}
              {r.privateComment && (paraMi || mia) && (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-600 dark:bg-slate-900/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Lock className="h-3 w-3" aria-hidden="true" /> {mia ? "Tu nota privada" : "Nota privada para vos"}
                  </div>
                  <p className="mt-1 text-slate-700 dark:text-slate-200">{r.privateComment}</p>
                  <p className="mt-1 text-xs text-slate-500">{mia ? "Solo la lee la otra parte y el equipo de DOAPP." : "Solo la ves vos y el equipo de DOAPP. No está en tu perfil ni cambia tu puntuación."}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
