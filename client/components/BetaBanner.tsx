import { Link } from "react-router-dom";
import { Rocket, PartyPopper } from "lucide-react";
import { formatBetaEnd, usePlatformPhase } from "@/hooks/usePlatformPhase";
import { BETA_POST_SLUG } from "../../shared/content/betaPost";

/**
 * Standing notice that the platform is in its beta phase.
 *
 * Not dismissible on purpose. The beta is why people pay no commission and hold
 * SUPER PRO, and it ends on a fixed date — so the offer and its expiry have to
 * travel together. A banner someone closed in week one is exactly how a
 * scheduled price change turns into a broken promise.
 *
 * Reads `platform` off the user payload, so there is no extra request and no
 * screen can render pricing without it.
 */
export default function BetaBanner() {
  // usePlatformPhase, not the user object: the banner has to render for
  // visitors too. Someone deciding whether to sign up is exactly who the
  // "no cobramos comisión" line is for, and they have no session yet.
  const { phase: platform } = usePlatformPhase();

  // Out of beta: announce it for a while instead of the banner simply
  // vanishing. The free period was stated loudly, so its end has to be too —
  // a price change nobody was told about is the same as a broken promise.
  // LAUNCH_NOTICE_DAYS keeps it from becoming permanent furniture.
  const LAUNCH_NOTICE_DAYS = 30;
  if (!platform?.isBeta) {
    // Prefer the moment the owner actually flipped it; fall back to the
    // scheduled end for the case where the beta simply expired on its own.
    const ref = platform?.phaseChangedAt || platform?.betaEndsAt;
    const endedAt = ref ? new Date(ref).getTime() : 0;
    const daysSince = endedAt ? (Date.now() - endedAt) / 86_400_000 : Infinity;
    if (!endedAt || daysSince > LAUNCH_NOTICE_DAYS || daysSince < 0) return null;
    return (
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800">
        <div className="container mx-auto px-4 py-2 flex items-start gap-2 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
          <PartyPopper className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            <strong className="font-semibold">DOAPP salió de la beta.</strong>{" "}
            Ya estamos en la versión estable: desde ahora rigen las comisiones segun tu plan
            y las suscripciones PRO y SUPER PRO. Gracias por haber sido parte de la prueba.
          </p>
        </div>
      </div>
    );
  }

  const endsAt = formatBetaEnd(platform.betaEndsAt);

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
      <div className="container mx-auto px-4 py-2 flex items-start gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
        <Rocket className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <p>
          <strong className="font-semibold">Estás en la beta de DOAPP.</strong>{" "}
          Publicá y postulate gratis. Todas las cuentas tienen membresía{" "}
          <strong className="font-semibold">SUPER PRO</strong> con todas las funciones disponibles
          para que las pruebes. La versión beta está disponible hasta el{" "}
          <strong className="font-semibold">{endsAt}</strong>
          {typeof platform.betaDaysLeft === "number" && platform.betaDaysLeft > 0
            ? ` (faltan ${platform.betaDaysLeft} días)`
            : ""}
          ; luego se aplican comisiones y membresías.{" "}
          {/* The banner states the offer; the article states its limits. Anyone
              deciding based on "gratis" deserves one click to the detail. */}
          <Link
            to={`/blog/${BETA_POST_SLUG}`}
            className="underline font-semibold hover:no-underline"
          >
            Para más info hacé clic acá
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
