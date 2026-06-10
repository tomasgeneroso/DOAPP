import { useTranslation } from "react-i18next";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteJobModalProps {
  open: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Permanent-delete confirmation modal. Extracted from JobDetail. */
export default function DeleteJobModal({ open, loading, onConfirm, onClose }: DeleteJobModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
            <Trash2 className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-white">{t("jobs.deleteJob", "Delete Job")}</h3>
        </div>

        <div className="mb-6 space-y-4">
          <p className="text-slate-300">
            {t("jobs.confirmDeletePermanently", "Are you sure you want to permanently delete this job?")}
          </p>

          <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
            <p className="text-sm font-bold text-red-300 mb-2">{t("common.warning", "Warning")}:</p>
            <p className="text-sm text-red-200">
              {t(
                "jobs.deleteWarningPermanent",
                "This action will permanently delete the job and cannot be undone.",
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
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              t("common.yesDelete", "Yes, delete")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
