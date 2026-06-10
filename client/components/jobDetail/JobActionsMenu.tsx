import { useTranslation } from "react-i18next";
import { DollarSign, Pause, XCircle, Headphones } from "lucide-react";

interface JobActionsMenuProps {
  open: boolean;
  loading: boolean;
  canPause: boolean;
  canCancel: boolean;
  onChangeBudget: () => void;
  onPause: () => void;
  onCancel: () => void;
  onContactSupport: () => void;
  onClose: () => void;
}

/** Owner actions dropdown (change budget / pause / cancel / support). Extracted from JobDetail. */
export default function JobActionsMenu({
  open,
  loading,
  canPause,
  canCancel,
  onChangeBudget,
  onPause,
  onCancel,
  onContactSupport,
  onClose,
}: JobActionsMenuProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[5]" onClick={onClose} />
      <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden z-10 relative">
        <button
          onClick={() => {
            onChangeBudget();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <DollarSign className="h-4 w-4 text-sky-500" />
          {t("jobs.actions.changeBudget")}
        </button>
        <button
          onClick={() => {
            onPause();
            onClose();
          }}
          disabled={loading || !canPause}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Pause className="h-4 w-4 text-amber-500" />
          {t("jobs.actions.pause")}
        </button>
        <button
          onClick={() => {
            onCancel();
            onClose();
          }}
          disabled={loading || !canCancel}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle className="h-4 w-4 text-red-500" />
          {t("jobs.actions.cancel")}
        </button>
        <div className="border-t border-slate-200 dark:border-slate-700" />
        <button
          onClick={() => {
            onContactSupport();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Headphones className="h-4 w-4 text-green-500" />
          {t("jobs.actions.contactSupport")}
        </button>
      </div>
    </>
  );
}
