import { useEffect, useState } from "react";
import type { PaymentMethod } from "@/components/payments/PaymentMethodSelector";

/** Module id in `module_configs` for each checkout method. */
export const PAYMENT_MODULE_ID: Record<PaymentMethod, string> = {
  mercadopago: "payment:mercadopago",
  astropay: "payment:astropay",
  binance: "payment:binance",
  bank_transfer: "payment:bank_transfer",
};

/**
 * Which payment methods the checkout may offer.
 *
 * Source of truth is GET /api/config/modules, which already applies both gates:
 * the admin's toggle in `module_configs` AND whether the deployment can really
 * deliver the provider (credentials present). Offering a method the backend
 * cannot fulfil is what produced the "AstroPay no está configurado" failure at
 * checkout, so the selector must not hardcode its own list.
 *
 * If the request fails we fall back to MercadoPago alone rather than to
 * everything: leaving the user with one method that works beats showing four
 * where three may not.
 */
export function useEnabledPaymentMethods() {
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config/modules")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const ids: string[] = data?.success && Array.isArray(data.modules)
          ? data.modules.map((m: any) => m.moduleId)
          : [];
        // An empty module_configs table is "not configured yet", not "every
        // payment method is disabled". Without this a fresh deployment renders
        // a checkout with zero methods and no way forward — the endpoint
        // answers success:true with [], so the error path never fires.
        const hasAnyPayment = ids.some((id) => id.startsWith('payment:'));
        setEnabled(new Set(hasAnyPayment ? ids : [PAYMENT_MODULE_ID.mercadopago]));
      })
      .catch(() => {
        if (!cancelled) setEnabled(new Set([PAYMENT_MODULE_ID.mercadopago]));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isEnabled = (method: PaymentMethod): boolean =>
    enabled ? enabled.has(PAYMENT_MODULE_ID[method]) : false;

  return { isEnabled, loading };
}
