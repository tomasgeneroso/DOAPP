import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, DollarSign, Loader2 } from "lucide-react";
import { parseArgentineNumber, formatBudgetInput } from "../../utils/numberFormat";
import Transicion from "../ui/Transicion";

interface ChangeBudgetModalProps {
  open: boolean;
  jobId: string;
  currentPrice: number;
  newBudget: string;
  onNewBudgetChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  error: string | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

interface Revision {
  puede: boolean;
  efectos: string[];
  motivo?: string;
  paraEl: string;
  conAceptacion: boolean;
}

/**
 * Cambiar el presupuesto, en dos pasos (pedido del dueño, 2026-11-27): primero se ve lo que va a pasar (los saldos, las postulaciones que se quitan, quién tiene que
 * aceptar, lo que no se devuelve) y recién después se acepta. Lo analiza el servidor, que es quien aplica la regla.
 */
export default function ChangeBudgetModal({
  open,
  jobId,
  currentPrice,
  newBudget,
  onNewBudgetChange,
  reason,
  onReasonChange,
  error,
  loading,
  onConfirm,
  onClose,
}: ChangeBudgetModalProps) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState<Revision | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [errorDeRevision, setErrorDeRevision] = useState<string | null>(null);
  const monto = parseArgentineNumber(newBudget);
  const clave = `${monto}`;

  // Al abrir o cambiar el monto, lo revisado deja de valer.
  useEffect(() => {
    setRevision(null);
    setErrorDeRevision(null);
  }, [open, clave]);

  if (!open) return null;

  const revisar = async () => {
    setRevisando(true);
    setErrorDeRevision(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/budget/analisis`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPrice: monto }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || "No pudimos revisar el cambio. Probá de nuevo.");
      if (data.analisis.diferencia === 0) throw new Error("Ese es el presupuesto que ya tiene el trabajo.");
      setRevision({
        puede: data.analisis.puede,
        efectos: data.efectos || [],
        motivo: data.analisis.bloqueo?.mensaje,
        paraEl: clave,
        conAceptacion: data.analisis.modo === "con_aceptacion",
      });
    } catch (e: any) {
      setErrorDeRevision(e?.message || "No pudimos revisar el cambio. Revisá tu conexión y probá de nuevo.");
    } finally {
      setRevisando(false);
    }
  };

  const listoParaRevisar = monto > 0 && reason.trim().length >= 10;
  const revisado = revision && revision.paraEl === clave ? revision : null;
  const mensajeDeError = error || errorDeRevision || (revisado && !revisado.puede ? revisado.motivo : null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-auto w-full max-w-md rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
            <DollarSign className="h-6 w-6 text-sky-500" />
          </div>
          <h3 className="text-xl font-bold text-white">{t("jobs.changeBudget", "Change Budget")}</h3>
        </div>

        <div className="mb-6 space-y-4">
          <div className="rounded-xl border border-blue-600/50 bg-blue-900/20 p-3">
            <p className="text-sm text-blue-300">
              {t("jobs.currentBudget", "Current budget")}:{" "}
              <span className="font-bold">${Number(currentPrice || 0).toLocaleString("es-AR")} ARS</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="presupuesto-nuevo">
              {t("jobs.newBudgetARS", "New budget (ARS)")} *
            </label>
            <input
              id="presupuesto-nuevo"
              type="text"
              inputMode="decimal"
              value={newBudget}
              onChange={(e) => onNewBudgetChange(formatBudgetInput(e.target.value))}
              placeholder={t("jobs.newBudgetPlaceholder", "E.g.: 25000 or 25.000")}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {newBudget && (
              <p className="mt-1 text-xs text-slate-400">
                {t("common.value", "Value")}: ${monto.toLocaleString("es-AR")} ARS
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2" htmlFor="presupuesto-motivo">
              {t("jobs.changeReason", "Reason for change")} * ({t("jobs.min10chars", "minimum 10 characters")})
            </label>
            <textarea
              id="presupuesto-motivo"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={t(
                "jobs.changeReasonPlaceholder",
                "E.g.: Additional tasks were added, scope of work changed...",
              )}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
            <p className="mt-1 text-xs text-slate-500 text-right">
              {reason.length}/500 ({t("jobs.min10", "min 10")})
            </p>
          </div>

          <Transicion mostrar={!!revisado?.puede}>
            {revisado?.puede && (
              <div className="rounded-xl border border-amber-500/60 bg-amber-900/30 p-4" data-testid="efectos-del-cambio">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> Antes de aceptar, esto es lo que va a pasar:
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-amber-100">
                  {revisado.efectos.map((frase) => (
                    <li key={frase}>{frase}</li>
                  ))}
                </ul>
              </div>
            )}
          </Transicion>

          <Transicion mostrar={!!mensajeDeError}>
            {mensajeDeError && (
              <div role="alert" className="rounded-xl border border-red-600 bg-red-900/30 p-4">
                <p className="text-sm font-medium text-red-300">{mensajeDeError}</p>
              </div>
            )}
          </Transicion>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          {revisado?.puede ? (
            <button
              type="button"
              data-testid="aceptar-el-cambio"
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : revisado.conAceptacion ? "Aceptar y pedirlo" : "Aceptar y cambiar"}
            </button>
          ) : (
            <button
              type="button"
              data-testid="revisar-el-cambio"
              onClick={() => void revisar()}
              disabled={revisando || !listoParaRevisar}
              className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {revisando ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Ver qué va a pasar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
