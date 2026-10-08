import { Rocket, PartyPopper } from "lucide-react";
import { usePlatformPhase, formatBetaEnd } from "@/hooks/usePlatformPhase";
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from "../../shared/constants/membershipPricing";

/**
 * Inline beta notice, for the moments where the phase is worth restating:
 * finishing registration, onboarding, the payment breakdown.
 *
 * `variant="launch"` is the other half of the promise. When the phase flips to
 * live the app has to say so — announcing the free period loudly and then
 * switching prices in silence is how a scheduled change becomes a complaint.
 */
export default function BetaNotice({
  variant = "default",
  className = "",
}: {
  variant?: "default" | "compact" | "launch";
  className?: string;
}) {
  const { phase } = usePlatformPhase();
  if (!phase) return null;

  if (!phase.isBeta) {
    if (variant !== "launch") return null;
    return (
      <div className={`rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/15 p-3 flex items-start gap-2 ${className}`}>
        <PartyPopper className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-xs text-emerald-800 dark:text-emerald-300">
          <strong className="font-semibold">Ya salimos de la beta.</strong>{" "}
          DOAPP está en su versión estable: se cobra una comisión del {COMMISSION_RATES.free}% a cargo
          del cliente, igual para todos los planes, y la membresía PRO (€{MEMBERSHIP_PRICES_EUR.pro} por mes)
          está a la venta. Gracias por acompañarnos durante la prueba.
        </p>
      </div>
    );
  }

  const endsAt = formatBetaEnd(phase.betaEndsAt);

  if (variant === "compact") {
    return (
      <p className={`text-xs text-amber-700 dark:text-amber-300 ${className}`}>
        Versión <strong className="font-semibold">beta</strong> — sin comisión y con las funciones PRO
        para todos hasta el {endsAt}.
      </p>
    );
  }

  return (
    <div className={`rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/15 p-3 flex items-start gap-2 ${className}`}>
      <Rocket className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-xs text-amber-800 dark:text-amber-300">
        <strong className="font-semibold">Estás entrando en la beta de DOAPP.</strong>{" "}
        Durante esta etapa no cobramos comisión: el trabajador recibe el precio del trabajo
        entero y el cliente paga ese precio más el costo de procesamiento del pago. Además tu
        cuenta tiene las funciones de la membresía <strong className="font-semibold">PRO</strong>, sin costo.
        La beta va hasta el <strong className="font-semibold">{endsAt}</strong>
        {phase.betaDaysLeft > 0 ? ` (faltan ${phase.betaDaysLeft} días)` : ""}; después se cobra
        una comisión del {COMMISSION_RATES.free}% a cargo del cliente y la membresía PRO pasa a ser paga.
      </p>
    </div>
  );
}
