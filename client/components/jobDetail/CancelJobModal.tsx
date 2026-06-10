import { useTranslation } from "react-i18next";
import { XCircle, Clock, Loader2 } from "lucide-react";

interface CancelJobModalProps {
  open: boolean;
  timeRemaining: string | null;
  reason: string;
  onReasonChange: (value: string) => void;
  publicationAmount?: number;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation modal for cancelling a job listing. Extracted from JobDetail. */
export default function CancelJobModal({
  open,
  timeRemaining,
  reason,
  onReasonChange,
  publicationAmount,
  loading,
  onConfirm,
  onClose,
}: CancelJobModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
            <XCircle className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-white">
            {t("jobs.cancelListing", "Cancel Listing")}
          </h3>
        </div>

        <div className="mb-6 space-y-4">
          <p className="text-slate-300">
            {t("jobs.confirmCancelListing", "Are you sure you want to cancel this listing?")}
          </p>

          {/* Time remaining info */}
          {timeRemaining && (
            <div className="rounded-xl border border-amber-600/50 bg-amber-900/20 p-3">
              <p className="text-sm text-amber-300">
                <Clock className="inline h-4 w-4 mr-1" />
                {t(
                  "jobs.remember24hCancel",
                  "Remember: You can only cancel up to 24 hours before the job starts.",
                )}
                <br />
                <span className="text-xs text-amber-400 mt-1 block">
                  {t("jobs.actions.timeRemaining", "Time remaining:")}{" "}
                  <strong>{timeRemaining}</strong>
                </span>
              </p>
            </div>
          )}

          {/* Reason textarea */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {t("jobs.cancellationReasonOptional", "Cancellation reason (optional)")}
            </label>
            <textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={t(
                "jobs.cancellationReasonPlaceholder",
                "E.g.: I no longer need the service, found another solution...",
              )}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
            />
            <p className="mt-1 text-xs text-slate-500 text-right">{reason.length}/500</p>
          </div>

          {publicationAmount && (
            <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
              <p className="text-sm font-bold text-red-300 mb-2">
                {t("common.importantWarning", "Important warning")}:
              </p>
              <p className="text-sm text-red-200">
                {t("jobs.cancelWarningCommission", "By cancelling the listing")}{" "}
                <span className="font-bold">
                  {t("jobs.willLoseCommission", "you will lose the commission paid")}
                </span>{" "}
                (${publicationAmount?.toLocaleString("es-AR")} ARS).{" "}
                {t("common.cannotBeUndone", "This action cannot be undone.")}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
          >
            {t("jobs.keepPublished", "No, keep published")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              t("common.yesCancel", "Yes, cancel")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
