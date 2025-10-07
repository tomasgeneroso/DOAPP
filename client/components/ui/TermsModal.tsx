import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "app" | "contract";
}

export function TermsModal({ isOpen, onClose, type }: TermsModalProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadTerms();
    }
  }, [isOpen, type]);

  const loadTerms = async () => {
    try {
      setLoading(true);
      const endpoint = type === "app"
        ? "/legal/terminos-condiciones-app.txt"
        : "/legal/terminos-condiciones-contrato.txt";

      const response = await fetch(endpoint);
      const text = await response.text();
      setContent(text);
    } catch (error) {
      console.error("Error cargando términos:", error);
      setContent("Error al cargar los términos y condiciones.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-bold text-slate-900">
            {type === "app"
              ? "Términos y Condiciones de Uso"
              : "Términos y Condiciones del Contrato"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent"></div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed">
              {content}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4">
          <Button onClick={onClose} className="w-full">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
