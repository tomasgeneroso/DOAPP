import { useTranslation } from "react-i18next";
import { CheckCircle } from "lucide-react";

interface ConfirmationSuccessModalProps {
  open: boolean;
  onClose: () => void;
}

/** Success modal shown after a job is confirmed. Extracted from JobDetail. */
export default function ConfirmationSuccessModal({ open, onClose }: ConfirmationSuccessModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-green-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            {t("jobs.thanksForConfirming", "Thank you for confirming the job!")}
          </h3>
          <p className="text-slate-300">
            {t(
              "jobs.weHandlePayment",
              "Thank you for trusting DoApp, we make sure the payment reaches its destination.",
            )}
          </p>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:from-green-600 hover:to-green-700"
          >
            {t("common.understood", "Understood")}
          </button>
        </div>
      </div>
    </div>
  );
}
