import { Pause, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PauseApprovalModalProps {
  open: boolean;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks the client to request the assigned worker's approval to pause. Extracted from JobDetail. */
export default function PauseApprovalModal({ open, loading, onConfirm, onClose }: PauseApprovalModalProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-600 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
            <Pause className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Pausar publicación</h3>
            <p className="text-sm text-slate-400">Hay un trabajador asignado</p>
          </div>
        </div>
        <p className="text-slate-300 text-sm mb-5">
          Tu publicación tiene un trabajador asignado. Para pausarla necesitás su aprobación.
          ¿Querés enviarle una solicitud de pausa?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            Enviar solicitud
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
