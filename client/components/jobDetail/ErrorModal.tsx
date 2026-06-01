import { useTranslation } from "react-i18next";
import { XCircle } from "lucide-react";

interface ErrorModalProps {
  open: boolean;
  message: string;
  onClose: () => void;
}

/** Generic error modal. Extracted from JobDetail. */
export default function ErrorModal({ open, message, onClose }: ErrorModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 mb-4">
            <XCircle className="h-10 w-10 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Error</h3>
          <p className="text-slate-300">{message}</p>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700"
          >
            {t("common.understood", "Understood")}
          </button>
        </div>
      </div>
    </div>
  );
}
