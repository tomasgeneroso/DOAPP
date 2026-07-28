import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { BadgeCheck, Loader2, ShieldCheck, AlertTriangle, LifeBuoy } from "lucide-react";

/**
 * Starts a Didit KYC session and redirects to Didit's hosted flow. On approval
 * the backend sets dniVerified (level 1). Handles the declined / in-review /
 * error states, with a "report a problem" action that opens a support ticket.
 */
export default function KycButton({ verified, kycStatus }: { verified?: boolean; kycStatus?: string }) {
  const { token, user } = useAuth() as any;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  if (verified) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        <ShieldCheck className="h-4 w-4" /> Identidad verificada
      </div>
    );
  }

  const declined = kycStatus === 'Declined';
  const inReview = kycStatus === 'In Review';

  const start = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/kyc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.message || "No se pudo iniciar la verificación.");
        setLoading(false);
      }
    } catch {
      setError("Error de conexión.");
      setLoading(false);
    }
  };

  const reportProblem = async () => {
    setReporting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: user?.email,
          subject: "Problema con la verificación automática (KYC)",
          category: "support",
          message: "No pude completar la verificación de identidad automática. Por favor revisen mi caso para poder terminar el registro.",
        }),
      });
      const data = await res.json();
      if (data.success) setReported(true);
      else setError(data.message || "No se pudo enviar el reporte.");
    } catch {
      setError("No se pudo enviar el reporte.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="space-y-2">
      {inReview ? (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Tu verificación está en revisión.
        </div>
      ) : declined ? (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-3">
          <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300 mb-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Tu verificación de identidad fue rechazada, así que tu registro quedó sin terminar. Podés reintentar o reportar un problema.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={start} disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Reintentar verificación
            </button>
            {reported ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 self-center">Reporte enviado ✓</span>
            ) : (
              <button onClick={reportProblem} disabled={reporting}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                {reporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
                Reportar problema
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <button onClick={start} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Verificar mi identidad
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Verificación automática con documento y selfie (Didit). Toma un par de minutos.
          </p>
        </>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
