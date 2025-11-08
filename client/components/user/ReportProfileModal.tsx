import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import Button from "../ui/Button";

interface ReportProfileModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const REPORT_REASONS = [
  { value: "identity_theft", label: "Está ocupando mi identidad" },
  { value: "fake_profile", label: "Perfil falso o fraudulento" },
  { value: "inappropriate_content", label: "Contenido inapropiado" },
  { value: "harassment", label: "Acoso o comportamiento abusivo" },
  { value: "scam", label: "Estafa o intento de fraude" },
  { value: "spam", label: "Spam o publicidad no deseada" },
  { value: "other", label: "Otro motivo" },
];

export default function ReportProfileModal({
  userId,
  userName,
  onClose,
  onSuccess,
}: ReportProfileModalProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedReason) {
      setError("Por favor selecciona un motivo");
      return;
    }

    if (!description.trim()) {
      setError("Por favor describe el problema");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          subject: `Denuncia de perfil: ${userName}`,
          description: `Motivo: ${REPORT_REASONS.find(r => r.value === selectedReason)?.label}\n\nDescripción: ${description}\n\nPerfil reportado: ${userId}`,
          priority: "high",
          category: "abuse",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al enviar la denuncia");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al enviar la denuncia");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Denunciar Perfil
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {userName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Motivo de la denuncia *
            </label>
            <div className="space-y-2">
              {REPORT_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-900 dark:text-white">
                    {reason.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Descripción del problema *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Por favor proporciona detalles sobre el problema..."
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
              maxLength={1000}
              required
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {description.length}/1000 caracteres
            </p>
          </div>

          {/* Warning */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Las denuncias falsas pueden resultar en la suspensión de tu cuenta.
              El equipo de soporte revisará tu reporte.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="error"
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Enviando..." : "Enviar Denuncia"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
