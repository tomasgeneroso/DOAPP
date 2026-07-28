import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BadgeCheck, Loader2, ShieldCheck } from "lucide-react";

/**
 * Starts a Didit KYC session and redirects the user to Didit's hosted flow.
 * On approval the backend sets dniVerified (credibility level 1) via webhook.
 */
export default function KycButton({ verified }: { verified?: boolean }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (verified) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        <ShieldCheck className="h-4 w-4" /> Identidad verificada
      </div>
    );
  }

  const start = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/kyc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url; // redirect to Didit hosted verification
      } else {
        setError(data.message || "No se pudo iniciar la verificación.");
        setLoading(false);
      }
    } catch {
      setError("Error de conexión.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={start}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
        Verificar mi identidad
      </button>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Verificación automática con documento y selfie (Didit). Toma un par de minutos.
      </p>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
