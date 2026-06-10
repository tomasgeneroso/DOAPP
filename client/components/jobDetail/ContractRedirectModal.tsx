import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

interface ContractRedirectModalProps {
  open: boolean;
  message: string;
  redirectUrl: string;
  onClose: () => void;
}

/** Modal redirecting the user to the active contract. Extracted from JobDetail. */
export default function ContractRedirectModal({
  open,
  message,
  redirectUrl,
  onClose,
}: ContractRedirectModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-purple-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
            <ExternalLink className="h-6 w-6 text-purple-500" />
          </div>
          <h3 className="text-xl font-bold text-white">
            {t("jobs.redirectToContract", "Redirect to Contract")}
          </h3>
        </div>

        <div className="mb-6 space-y-4">
          <p className="text-slate-300">{message}</p>

          <div className="rounded-xl border border-purple-600 bg-purple-900/30 p-4">
            <p className="text-sm text-purple-300">
              <strong>{t("common.note", "Note")}:</strong>{" "}
              {t(
                "jobs.changeBudgetFromContract",
                "To change the budget of a job in progress, you must do it from the active contract.",
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={() => {
              if (redirectUrl) {
                window.location.href = redirectUrl;
              }
            }}
            className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-purple-600 hover:to-purple-700"
          >
            {t("jobs.goToContract", "Go to Contract")}
          </button>
        </div>
      </div>
    </div>
  );
}
