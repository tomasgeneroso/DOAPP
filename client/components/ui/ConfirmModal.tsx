import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, Info, CheckCircle, XCircle } from "lucide-react";

export type ConfirmModalTone = "danger" | "warning" | "info" | "success";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** Body copy. Pass a node when you need formatting. */
  message: React.ReactNode;
  /** Colour/iconography. Defaults to "warning". */
  tone?: ConfirmModalTone;
  loading?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Hide the cancel button to use this as a plain acknowledge dialog (alert replacement). */
  hideCancel?: boolean;
}

const TONES: Record<ConfirmModalTone, { border: string; iconBg: string; icon: string; confirm: string; Icon: typeof AlertTriangle }> = {
  danger: {
    border: "border-red-600",
    iconBg: "bg-red-500/20",
    icon: "text-red-500",
    confirm: "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700",
    Icon: XCircle,
  },
  warning: {
    border: "border-amber-600",
    iconBg: "bg-amber-500/20",
    icon: "text-amber-500",
    confirm: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700",
    Icon: AlertTriangle,
  },
  info: {
    border: "border-sky-600",
    iconBg: "bg-sky-500/20",
    icon: "text-sky-500",
    confirm: "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700",
    Icon: Info,
  },
  success: {
    border: "border-green-600",
    iconBg: "bg-green-500/20",
    icon: "text-green-500",
    confirm: "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700",
    Icon: CheckCircle,
  },
};

/**
 * Generic confirmation/acknowledgement dialog — the replacement for native
 * `confirm()` / `alert()`, which are blocking, unstyled and untranslatable.
 * Set `hideCancel` to use it as a simple "OK" alert.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  tone = "warning",
  loading = false,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  hideCancel = false,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  const cfg = TONES[tone];
  const Icon = cfg.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={loading ? undefined : onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border ${cfg.border} bg-white dark:bg-slate-900 p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${cfg.iconBg}`}>
            <Icon className={`h-6 w-6 ${cfg.icon}`} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
        </div>

        <div className="mb-6 text-slate-600 dark:text-slate-300">{message}</div>

        <div className="flex gap-3">
          {!hideCancel && (
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-4 py-3 font-semibold text-slate-800 dark:text-white transition-colors hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {cancelLabel || t("common.cancel", "Cancelar")}
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${cfg.confirm}`}
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              confirmLabel || t("common.confirm", "Confirmar")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
