import { useAuth } from "@/hooks/useAuth";
import { Rocket } from "lucide-react";

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
  const { user } = useAuth() as any;
  const platform = user?.platform;

  if (!platform?.isBeta) return null;

  const endsAt = new Date(platform.betaEndsAt).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
      <div className="container mx-auto px-4 py-2 flex items-start gap-2 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
        <Rocket className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <p>
          <strong className="font-semibold">Estás en la beta de DOAPP.</strong>{" "}
          No cobramos comisión: si el contrato es de $36.000, el trabajador recibe $36.000.
          Además todas las cuentas tienen <strong className="font-semibold">SUPER PRO</strong> con
          todas las funciones. La beta va hasta el <strong className="font-semibold">{endsAt}</strong>
          {typeof platform.betaDaysLeft === "number" && platform.betaDaysLeft > 0
            ? ` (faltan ${platform.betaDaysLeft} días)`
            : ""}
          ; después empiezan a regir las comisiones y las suscripciones.
        </p>
      </div>
    </div>
  );
}
