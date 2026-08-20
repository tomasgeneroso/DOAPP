import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  X,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface PostWorkRatingModalProps {
  open: boolean;
  contractId: string;
  /** Nombre de la contraparte a puntuar */
  reviewedName: string;
  /** Rol de la contraparte: define el texto de la primera pregunta */
  reviewedRole?: "doer" | "client";
  /** Cerrar sin responder ("Ahora no") */
  onClose: () => void;
  /** Se llamó a la API con éxito */
  onSubmitted?: () => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5];

/**
 * Puntuación post-trabajo: encuesta corta de como máximo 2 preguntas.
 *
 *   1) ¿Querés puntuar el trabajo del doer?   → estrellas (1-5)
 *   2) ¿Recomendarías la app?                 → sí / no
 *   + nota opcional
 *
 * Las dos preguntas son opcionales: se puede enviar respondiendo una sola.
 */
export default function PostWorkRatingModal({
  open,
  contractId,
  reviewedName,
  reviewedRole = "doer",
  onClose,
  onSubmitted,
}: PostWorkRatingModalProps) {
  const { t } = useTranslation();
  const { token } = useAuth();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [recommendsApp, setRecommendsApp] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Al reabrir la encuesta (el modal queda montado) empezamos de cero
  useEffect(() => {
    if (open) {
      setRating(0);
      setHoverRating(0);
      setRecommendsApp(null);
      setNote("");
      setError("");
      setDone(false);
    }
  }, [open]);

  if (!open) return null;

  const hasAnswer =
    rating > 0 || recommendsApp !== null || note.trim().length > 0;

  const ratingQuestion =
    reviewedRole === "client"
      ? t(
          "review.postWork.rateClient",
          "¿Querés puntuar a {{name}} como cliente?",
          {
            name: reviewedName,
          },
        )
      : t(
          "review.postWork.rateDoer",
          "¿Querés puntuar el trabajo de {{name}}?",
          {
            name: reviewedName,
          },
        );

  const handleSubmit = async () => {
    if (!hasAnswer) {
      setError(
        t(
          "review.postWork.errorNoAnswer",
          "Respondé al menos una pregunta o dejá una nota",
        ),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/post-work", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contractId,
          rating: rating > 0 ? rating : undefined,
          recommendsApp: recommendsApp === null ? undefined : recommendsApp,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.message ||
            t(
              "review.postWork.errorSubmit",
              "No pudimos guardar tu puntuación",
            ),
        );
      }
      setDone(true);
      onSubmitted?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
        {done ? (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-white">
              {t("review.postWork.thanksTitle", "¡Gracias por tu opinión!")}
            </h3>
            <p className="mb-5 text-slate-300">
              {t(
                "review.postWork.thanksDesc",
                "Tu respuesta nos ayuda a mejorar DoApp para todos.",
              )}
            </p>
            <button
              onClick={onClose}
              className="rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:from-green-600 hover:to-green-700"
            >
              {t("common.understood", "Entendido")}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {t("review.postWork.title", "Dos preguntas rápidas")}
                </h3>
                <p className="text-sm text-slate-400">
                  {t(
                    "review.postWork.subtitle",
                    "Son opcionales: respondé lo que quieras.",
                  )}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label={t("common.close", "Cerrar")}
                className="rounded-lg p-1.5 transition hover:bg-slate-800"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Pregunta 1 — puntuar el trabajo */}
            <div className="mb-4 rounded-xl bg-slate-800/60 p-4">
              <p className="mb-3 text-sm font-medium text-white">
                {ratingQuestion}
              </p>
              <div className="flex items-center gap-1">
                {STAR_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={t(
                      "review.postWork.starsAria",
                      "{{stars}} estrellas",
                      {
                        stars: value,
                      },
                    )}
                    onClick={() => setRating(value === rating ? 0 : value)}
                    onMouseEnter={() => setHoverRating(value)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-0.5 focus:outline-none"
                  >
                    <Star
                      className={`h-8 w-8 transition-colors ${
                        value <= (hoverRating || rating)
                          ? "fill-current text-yellow-400"
                          : "text-slate-600"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Pregunta 2 — recomendaría la app */}
            <div className="mb-4 rounded-xl bg-slate-800/60 p-4">
              <p className="mb-3 text-sm font-medium text-white">
                {t("review.postWork.recommendApp", "¿Recomendarías DoApp?")}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setRecommendsApp(recommendsApp === true ? null : true)
                  }
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                    recommendsApp === true
                      ? "border-green-500 bg-green-500/20 text-green-400"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <ThumbsUp className="h-4 w-4" />
                  {t("common.yes", "Sí")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRecommendsApp(recommendsApp === false ? null : false)
                  }
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                    recommendsApp === false
                      ? "border-red-500 bg-red-500/20 text-red-400"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <ThumbsDown className="h-4 w-4" />
                  {t("common.no", "No")}
                </button>
              </div>
            </div>

            {/* Nota opcional */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                {t("review.postWork.noteLabel", "Nota (opcional)")}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t(
                  "review.postWork.notePlaceholder",
                  "Contanos algo más si querés...",
                )}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-transparent focus:ring-2 focus:ring-sky-500"
              />
              <p className="mt-1 text-right text-xs text-slate-500">
                {note.length}/1000
              </p>
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !hasAnswer}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? t("review.postWork.sending", "Enviando...")
                  : t("review.postWork.send", "Enviar")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-5 py-3 font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                {t("review.postWork.skip", "Ahora no")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
