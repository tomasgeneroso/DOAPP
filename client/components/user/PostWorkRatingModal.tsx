import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ThumbsUp,
  ThumbsDown,
  Loader2,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DimensionKey,
  ReviewedRole,
  StarPicker,
  dimensionsForRole,
  emptyDimensions,
  getRatingLabels,
} from "./reviewDimensions";

/** Progreso guardado de una puntuación empezada y no terminada */
export interface PostWorkRatingDraft {
  rating?: number | null;
  timeliness?: number | null;
  attendance?: number | null;
  communication?: number | null;
  fairPrice?: number | null;
  quality?: number | null;
  professionalism?: number | null;
  recommendsApp?: boolean | null;
  note?: string | null;
}

interface PostWorkRatingModalProps {
  open: boolean;
  contractId: string;
  /** Nombre de la contraparte a puntuar */
  reviewedName: string;
  /** Rol de la contraparte: define el texto y las dimensiones a puntuar */
  reviewedRole?: ReviewedRole;
  /** Progreso guardado de un intento anterior, para retomarlo */
  draft?: PostWorkRatingDraft | null;
  /** Se cierra sólo después de completar las dos pantallas */
  onClose: () => void;
  /** Se guardó la puntuación con éxito */
  onSubmitted?: () => void;
}

type Step = 1 | 2;

/**
 * Puntuación post-trabajo. Un solo modal con dos pantallas, ambas obligatorias:
 *
 *   Pantalla 1 — puntuación del trabajo + sus dimensiones
 *                (puntualidad, como persona, calidad, etc.)
 *   Pantalla 2 — ¿recomendarías DoApp? + nota
 *
 * No se puede cerrar sin completarlas: no hay botón de omitir ni cierre.
 */
export default function PostWorkRatingModal({
  open,
  contractId,
  reviewedName,
  reviewedRole = "doer",
  draft,
  onClose,
  onSubmitted,
}: PostWorkRatingModalProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const LABELS = getRatingLabels(t);
  const dimensionList = dimensionsForRole(reviewedRole);

  const [step, setStep] = useState<Step>(1);
  const [overallRating, setOverallRating] = useState(0);
  const [dimensions, setDimensions] =
    useState<Record<DimensionKey, number>>(emptyDimensions);
  const [recommendsApp, setRecommendsApp] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Marca si hay cambios sin guardar, para no reenviar el mismo borrador
  const dirty = useRef(false);

  // Referencia al último estado, para poder guardar el progreso al desmontar
  const latest = useRef({
    overallRating: 0,
    dimensions: emptyDimensions(),
    recommendsApp: null as boolean | null,
    note: "",
    done: false,
  });
  latest.current = { overallRating, dimensions, recommendsApp, note, done };

  // Al abrir la encuesta retomamos el progreso guardado (si lo hay)
  useEffect(() => {
    if (!open) return;
    const base = emptyDimensions();
    const restored: Record<DimensionKey, number> = {
      ...base,
      timeliness: draft?.timeliness || 0,
      attendance: draft?.attendance || 0,
      communication: draft?.communication || 0,
      fairPrice: draft?.fairPrice || 0,
      quality: draft?.quality || 0,
      professionalism: draft?.professionalism || 0,
    };
    setOverallRating(draft?.rating || 0);
    setDimensions(restored);
    setRecommendsApp(draft?.recommendsApp ?? null);
    setNote(draft?.note || "");
    // Si ya había puntuado el trabajo, retomamos en la segunda pantalla
    setStep(draft?.rating ? 2 : 1);
    setError("");
    setDone(false);
    dirty.current = false;
  }, [open, draft]);

  const buildPayload = useCallback(
    (
      rating: number,
      dims: Record<DimensionKey, number>,
      recommends: boolean | null,
      text: string,
    ) => {
      const payload: Record<string, any> = { contractId };
      if (rating > 0) payload.rating = rating;
      if (recommends !== null) payload.recommendsApp = recommends;
      if (text.trim()) payload.note = text.trim();
      for (const dim of dimensionsForRole(reviewedRole)) {
        if (dims[dim.key] > 0) payload[dim.key] = dims[dim.key];
      }
      return payload;
    },
    [contractId, reviewedRole],
  );

  /** Guarda el progreso para poder retomar la puntuación más tarde */
  const saveDraft = useCallback(async () => {
    const current = latest.current;
    if (current.done || !dirty.current) return;

    const dims = current.dimensions;
    const filled = dimensionsForRole(reviewedRole)
      .map((d) => dims[d.key])
      .filter((v) => v > 0);
    const auto =
      filled.length > 0
        ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length)
        : 0;
    const rating = current.overallRating || auto;

    const hasProgress =
      rating > 0 ||
      current.recommendsApp !== null ||
      current.note.trim().length > 0;
    if (!hasProgress) return;

    try {
      await fetch("/api/reviews/post-work/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          buildPayload(rating, dims, current.recommendsApp, current.note),
        ),
      });
      dirty.current = false;
    } catch {
      // El guardado de progreso es best-effort: no interrumpe la encuesta
    }
  }, [buildPayload, reviewedRole, token]);

  // Autoguardado del progreso mientras el usuario responde
  useEffect(() => {
    if (!open || done || loading) return;
    const timer = setTimeout(() => {
      void saveDraft();
    }, 2500);
    return () => clearTimeout(timer);
  }, [
    open,
    done,
    loading,
    overallRating,
    dimensions,
    recommendsApp,
    note,
    saveDraft,
  ]);

  // Si el usuario se va de la pantalla, guardamos lo que haya respondido
  useEffect(() => {
    if (!open) return;
    return () => {
      void saveDraft();
    };
  }, [open, saveDraft]);

  if (!open) return null;

  const markDirty = () => {
    dirty.current = true;
  };

  const setDim = (key: DimensionKey, value: number) => {
    markDirty();
    setDimensions((prev) => ({ ...prev, [key]: value }));
  };

  // La puntuación general se calcula del promedio de las dimensiones
  // mientras el usuario no la fije a mano.
  const filledDims = dimensionList
    .map((d) => dimensions[d.key])
    .filter((v) => v > 0);
  const autoOverall =
    filledDims.length > 0
      ? Math.round(filledDims.reduce((a, b) => a + b, 0) / filledDims.length)
      : 0;
  const effectiveOverall = overallRating || autoOverall;

  const displayName =
    reviewedName?.trim() ||
    (reviewedRole === "client"
      ? t("review.postWork.theClient", "el cliente")
      : t("review.postWork.theWorker", "el trabajador"));

  const ratingQuestion =
    reviewedRole === "client"
      ? t("review.postWork.rateClient", "Puntuá a {{name}} como cliente", {
          name: displayName,
        })
      : t("review.postWork.rateDoer", "Puntuá el trabajo de {{name}}", {
          name: displayName,
        });

  const goToStep2 = () => {
    if (effectiveOverall === 0) {
      setError(
        t("review.postWork.errorNoRating", "Puntuá el trabajo para continuar"),
      );
      return;
    }
    setError("");
    setStep(2);
    // Checkpoint: la primera pantalla queda guardada
    void saveDraft();
  };

  const handleSubmit = async () => {
    if (recommendsApp === null) {
      setError(
        t(
          "review.postWork.errorNoRecommend",
          "Contanos si recomendarías DoApp",
        ),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      const body = buildPayload(
        effectiveOverall,
        dimensions,
        recommendsApp,
        note,
      );

      const res = await fetch("/api/reviews/post-work", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Si ya estaba puntuado (otra pestaña, doble envío) no dejamos al
        // usuario encerrado en el modal: lo damos por terminado.
        if (data.code === "ALREADY_RATED") {
          setDone(true);
          onSubmitted?.();
          return;
        }
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
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
            {/* Encabezado con el paso actual */}
            <div className="mb-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-400">
                {t("review.postWork.stepOf", "Paso {{step}} de 2", { step })}
              </p>
              <h3 className="text-xl font-bold text-white">
                {step === 1
                  ? ratingQuestion
                  : t("review.postWork.step2Title", "Una última cosa")}
              </h3>
              <p className="text-sm text-slate-400">
                {step === 1
                  ? t(
                      "review.postWork.step1Subtitle",
                      "Es obligatorio para cerrar el trabajo.",
                    )
                  : t(
                      "review.postWork.step2Subtitle",
                      "Contanos qué te pareció DoApp.",
                    )}
              </p>
              <div className="mt-3 flex gap-1.5">
                <span className="h-1 flex-1 rounded-full bg-sky-500" />
                <span
                  className={`h-1 flex-1 rounded-full ${
                    step === 2 ? "bg-sky-500" : "bg-slate-700"
                  }`}
                />
              </div>
            </div>

            {step === 1 ? (
              <>
                {/* Puntuación general */}
                <div className="mb-4 rounded-xl bg-slate-800/60 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      {t("review.overallRating", "Puntuación general")}
                    </span>
                    {effectiveOverall > 0 && (
                      <span className="text-xs text-slate-400">
                        {LABELS[effectiveOverall]}
                      </span>
                    )}
                  </div>
                  <StarPicker
                    value={effectiveOverall}
                    onChange={(v) => {
                      markDirty();
                      setOverallRating(v);
                    }}
                    color="text-yellow-400"
                    emptyColor="text-slate-600"
                    size="w-8 h-8"
                  />
                  {autoOverall > 0 && overallRating === 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      {t(
                        "review.autoCalculated",
                        "Calculado automáticamente del promedio de dimensiones",
                      )}
                    </p>
                  )}
                </div>

                {/* Dimensiones */}
                <div className="mb-4 space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t(
                      "review.dimensionsHeader",
                      "Dimensiones (opcionales pero recomendadas)",
                    )}
                  </p>
                  {dimensionList.map(
                    ({
                      key,
                      labelKey,
                      labelDefault,
                      descKey,
                      descDefault,
                      icon: Icon,
                      color,
                    }) => (
                      <div key={key} className="flex items-start gap-3 py-1">
                        <div className="flex w-44 shrink-0 items-start gap-2">
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${color}`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight text-white">
                              {t(labelKey, labelDefault)}
                            </p>
                            <p className="mt-0.5 text-xs leading-snug text-slate-400">
                              {t(descKey, descDefault)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-1 pt-0.5">
                          <StarPicker
                            value={dimensions[key]}
                            onChange={(v) => setDim(key, v)}
                            color={color}
                            emptyColor="text-slate-600"
                          />
                          {dimensions[key] > 0 && (
                            <span className="text-xs text-slate-400">
                              {LABELS[dimensions[key]]}
                            </span>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                {error && (
                  <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={goToStep2}
                  disabled={effectiveOverall === 0}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("review.postWork.next", "Continuar")}
                </button>
              </>
            ) : (
              <>
                {/* ¿Recomendarías la app? */}
                <div className="mb-4 rounded-xl bg-slate-800/60 p-4">
                  <p className="mb-3 text-sm font-medium text-white">
                    {t("review.postWork.recommendApp", "¿Recomendarías DoApp?")}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        markDirty();
                        setRecommendsApp(true);
                      }}
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
                      onClick={() => {
                        markDirty();
                        setRecommendsApp(false);
                      }}
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

                {/* Nota */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    {t("review.postWork.noteLabel", "Nota (opcional)")}
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => {
                      markDirty();
                      setNote(e.target.value);
                    }}
                    rows={4}
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
                    onClick={() => {
                      setError("");
                      setStep(1);
                    }}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("review.postWork.back", "Volver")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || recommendsApp === null}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading
                      ? t("review.postWork.sending", "Enviando...")
                      : t("review.postWork.send", "Enviar")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
