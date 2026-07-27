import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Phone, Check, Loader2, MessageCircle } from "lucide-react";

/**
 * Phone verification via a WhatsApp code the user copies and pastes back.
 * Calls POST /auth/phone/send-code then /auth/phone/verify-code.
 */
export default function PhoneVerification({
  phone,
  verified,
  onVerified,
}: {
  phone?: string;
  verified?: boolean;
  onVerified?: () => void;
}) {
  const { token } = useAuth();
  const [localPhone, setLocalPhone] = useState(phone || "");
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(!!verified);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const sendCode = async () => {
    if (!localPhone.trim()) { setError("Ingresá tu número de teléfono."); return; }
    setLoading(true); setError(null); setInfo(null);
    try {
      const res = await fetch("/api/auth/phone/send-code", {
        method: "POST", headers: authHeaders, body: JSON.stringify({ phone: localPhone.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("sent");
        setInfo(data.devCode ? `Modo prueba — tu código es: ${data.devCode}` : "Te enviamos un código por WhatsApp.");
      } else {
        setError(data.message || "No se pudo enviar el código.");
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!code.trim()) { setError("Pegá el código que te llegó."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/auth/phone/verify-code", {
        method: "POST", headers: authHeaders, body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        setStep("idle");
        onVerified?.();
      } else {
        setError(data.message || "Código incorrecto.");
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        <Check className="h-4 w-4" /> Teléfono verificado
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-slate-400" />
        <input
          value={localPhone}
          onChange={(e) => setLocalPhone(e.target.value)}
          placeholder="Ej: +54 9 11 1234-5678"
          disabled={step === "sent"}
          className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60"
        />
      </div>

      {step === "idle" ? (
        <button
          onClick={sendCode}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Enviar código por WhatsApp
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Pegá el código que te llegó por WhatsApp
          </label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm tracking-[0.3em] text-center bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
            <button
              onClick={verify}
              disabled={loading}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Verificar
            </button>
          </div>
          <button onClick={sendCode} disabled={loading} className="text-xs text-sky-600 dark:text-sky-400 hover:underline">
            Reenviar código
          </button>
        </div>
      )}

      {info && <p className="text-xs text-emerald-600 dark:text-emerald-400">{info}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
