import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export interface PhaseInfo {
  phase: "beta" | "live";
  isBeta: boolean;
  betaEndsAt: string;
  betaDaysLeft: number;
  /** When the owner actually flipped the switch, if they did. */
  phaseChangedAt?: string | null;
}

/**
 * The platform phase, wherever you are.
 *
 * Prefers the value already on the user payload — most screens have it and it
 * costs nothing. Falls back to the public endpoint for the screens that need
 * it before there is a session: the registration confirmation and onboarding
 * both announce the beta, and neither has a logged-in user to read.
 */
export function usePlatformPhase(): { phase: PhaseInfo | null; loading: boolean } {
  const { user } = useAuth() as any;
  const fromUser: PhaseInfo | undefined = user?.platform;

  const [phase, setPhase] = useState<PhaseInfo | null>(fromUser ?? null);
  const [loading, setLoading] = useState(!fromUser);

  useEffect(() => {
    if (fromUser) { setPhase(fromUser); setLoading(false); return; }

    let cancelled = false;
    fetch("/api/config/phase")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setPhase(d.data); })
      .catch(() => { /* no notice is better than a wrong one */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fromUser]);

  return { phase, loading };
}

/**
 * Formats the beta end date, pinned to Argentine time.
 *
 * The deadline is 31 Dec 2026 23:59 ART, which is 1 Jan 2027 in UTC. Without an
 * explicit timeZone the browser formats in its own, so anyone on UTC or in
 * Europe was shown "1 de enero de 2027" — a different end date than the one the
 * terms state, inside a commercial promise. The platform is Argentine and so is
 * the deadline, so everyone sees the Argentine date.
 */
export function formatBetaEnd(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
