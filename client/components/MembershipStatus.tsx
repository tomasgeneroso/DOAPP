import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Loader2, Rocket, ShieldCheck } from "lucide-react";

interface Usage {
  membershipTier?: string | null;
  hasMembership?: boolean;
  proContractsUsedThisMonth?: number;
  freeContractsRemaining?: number;
  membershipExpiresAt?: string | null;
  monthlyFreeLimit?: number;
}

const LABEL: Record<string, string> = {
  free: "FREE",
  pro: "PRO",
  super_pro: "SUPER PRO",
};

function daysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

/**
 * Which membership the account has, why it has it, and until when.
 *
 * The "why" is not decoration. Right now a lot of accounts read as SUPER PRO
 * without having bought anything — the beta grants it to everyone and the owner
 * keeps it permanently — and a badge with no explanation reads as something
 * purchased. When the beta ends, that misreading becomes "you took away what I
 * was paying for".
 */
export default function MembershipStatus() {
  const { user, token } = useAuth() as any;
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/membership/usage", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setUsage(d.data ?? d.usage ?? d); })
      .catch(() => { /* the paid tier below still renders from the session */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const effective = (user?.membershipTier ?? "free") as string;
  const paid = (user?.realMembershipTier ?? user?.membershipTier ?? "free") as string;
  const fromBeta = !!user?.membershipIsFromBeta;
  const fromOwner = !!user?.membershipIsFromOwner;
  const granted = fromBeta || fromOwner;

  const renewsIn = daysLeft(usage?.membershipExpiresAt);
  const betaEndsIn = user?.platform?.betaDaysLeft as number | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${
            effective === "super_pro"
              ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white"
              : effective === "pro"
                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          }`}
        >
          <Crown className="h-3.5 w-3.5" />
          {LABEL[effective] ?? effective.toUpperCase()}
        </span>

        {granted && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            {fromOwner ? <ShieldCheck className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
            {fromOwner ? "por tu rol de owner" : "sin costo durante la beta"}
          </span>
        )}
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1.5">
          {granted && (
            <p>
              Tu plan contratado es <strong>{LABEL[paid] ?? paid.toUpperCase()}</strong>.
              {fromBeta && typeof betaEndsIn === "number" && betaEndsIn > 0 && (
                <> Al terminar la beta, en {betaEndsIn} días, tu cuenta vuelve a ese plan salvo que contrates otro.</>
              )}
            </p>
          )}

          {usage?.hasMembership && renewsIn !== null && (
            <p>
              Tu suscripción se renueva en <strong>{renewsIn} {renewsIn === 1 ? "día" : "días"}</strong>.
            </p>
          )}

          {typeof usage?.freeContractsRemaining === "number" && usage.freeContractsRemaining > 0 && (
            <p>
              Te quedan <strong>{usage.freeContractsRemaining}</strong>{" "}
              {usage.freeContractsRemaining === 1 ? "publicación inicial" : "publicaciones iniciales"} sin comisión.
            </p>
          )}

          {typeof usage?.proContractsUsedThisMonth === "number" && (usage.monthlyFreeLimit ?? 0) > 0 && (
            <p>
              Contratos mensuales sin comisión usados: <strong>{usage.proContractsUsedThisMonth}</strong> de{" "}
              {usage.monthlyFreeLimit}.
            </p>
          )}

          {/* Prices are quoted in euros and charged in pesos, so the peso amount
              is not stated here — it would be out of date by the time anyone
              read it. The checkout shows the exact figure. */}
          <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
            PRO €5/mes · SUPER PRO €8/mes. Se cobran en pesos al cambio del día, así que el importe puede
            variar entre meses.
          </p>

          <Link
            to="/membership"
            className="inline-block text-sm text-sky-600 dark:text-sky-400 hover:underline pt-1"
          >
            Ver planes y beneficios
          </Link>
        </div>
      )}
    </div>
  );
}
