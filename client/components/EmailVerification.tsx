import { useState } from "react";
import { MailCheck, Mail, Loader2 } from "lucide-react";

/**
 * Email verification status plus a resend action.
 *
 * The email is half of credibility level 2 (User.getCredibilityInfo pairs
 * `isVerified` with `phoneVerified`), but until now the only way to trigger a
 * resend was the login screen — a user who lost the original mail and was
 * already signed in had nowhere to go.
 *
 * POST /auth/resend-verification is public and deliberately vague about
 * whether the address exists, so its message is shown verbatim.
 */
export default function EmailVerification({ email, verified }: { email?: string; verified?: boolean }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  if (verified) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
        <MailCheck className="h-4 w-4" /> Correo verificado
      </div>
    );
  }

  const resend = async () => {
    if (!email) return;
    setSending(true); setMessage(null); setFailed(false);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMessage(data.message || "Te enviamos un nuevo enlace de verificación.");
      setFailed(!data.success);
    } catch {
      setMessage("No pudimos enviar el correo. Probá de nuevo en un momento.");
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Tu correo <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span> todavía no está
        confirmado. Revisá tu bandeja y el correo no deseado, o pedí un enlace nuevo.
      </p>
      <button
        type="button"
        onClick={resend}
        disabled={sending || !email}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-600 dark:text-sky-400 border border-sky-300 dark:border-sky-700 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50 transition-colors"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {sending ? "Enviando..." : "Reenviar enlace de verificación"}
      </button>
      {message && (
        <p className={`text-xs ${failed ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
