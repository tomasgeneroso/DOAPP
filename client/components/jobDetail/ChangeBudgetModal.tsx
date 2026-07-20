import { useTranslation } from "react-i18next";
import { DollarSign, Loader2 } from "lucide-react";
import { parseArgentineNumber, formatBudgetInput } from "../../utils/numberFormat";

interface ChangeBudgetModalProps {
  open: boolean;
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

/** Budget-change modal (price + reason, ARS). Extracted from JobDetail. */
export default function ChangeBudgetModal({
  open,
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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
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
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {t("jobs.newBudgetARS", "New budget (ARS)")} *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={newBudget}
              onChange={(e) => onNewBudgetChange(formatBudgetInput(e.target.value))}
              placeholder={t("jobs.newBudgetPlaceholder", "E.g.: 25000 or 25.000")}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {newBudget && (
              <p className="mt-1 text-xs text-slate-400">
                {t("common.value", "Value")}: ${parseArgentineNumber(newBudget).toLocaleString("es-AR")} ARS
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {t("jobs.changeReason", "Reason for change")} * ({t("jobs.min10chars", "minimum 10 characters")})
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={t(
                "jobs.changeReasonPlaceholder",
                "E.g.: Additional tasks were added, scope of work changed...",
              )}
              rows={4}
              maxLength={500}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
            <p className="mt-1 text-xs text-slate-500 text-right">
              {reason.length}/500 ({t("jobs.min10", "min 10")})
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
              <p className="text-sm font-medium text-red-300">{error}</p>
            </div>
          )}

          <div className="rounded-xl border border-amber-600/50 bg-amber-900/20 p-3">
            <p className="text-sm text-amber-300">
              <strong>{t("common.note", "Note")}:</strong>{" "}
              {t(
                "jobs.budgetChangeNote",
                "You can only change the budget of jobs that are not in progress or completed.",
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !newBudget || !reason || reason.length < 10}
            className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              t("common.confirmChange", "Confirm change")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
