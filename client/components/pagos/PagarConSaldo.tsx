import { useEffect, useState } from "react";
import { Wallet, Loader2 } from "lucide-react";

const plata = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

interface SaldoDelCliente {
  balance: number;
  saldoVinculado?: number;
  publicacionesVinculadas?: Array<{ jobId: string; titulo: string; monto: number }>;
}

/**
 * Pagar la publicación con el saldo a favor, sin pasarela (y sin el costo de procesamiento). Solo aparece si el saldo alcanza.
 * El saldo vinculado a esta misma publicación (lo que volvió cuando se canceló sin trabajador) se gasta primero.
 */
export default function PagarConSaldo({
  token,
  jobId,
  total,
  disabled,
  onPagar,
}: {
  token: string | null;
  jobId: string;
  /** Precio + comisión + IVA de la comisión: lo que sale del saldo (sin procesamiento de la pasarela). */
  total: number;
  disabled?: boolean;
  onPagar: () => Promise<void>;
}) {
  const [saldo, setSaldo] = useState<SaldoDelCliente | null>(null);
  const [pagando, setPagando] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    fetch("/api/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado && d?.success) setSaldo({ balance: Number(d.balance) || 0, saldoVinculado: Number(d.saldoVinculado) || 0, publicacionesVinculadas: d.publicacionesVinculadas });
      })
      .catch(() => {
        /* sin saldo conocido no se ofrece */
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  if (!saldo || !(total > 0) || saldo.balance + 0.005 < total) return null;
  const propio = saldo.publicacionesVinculadas?.find((p) => p.jobId === jobId)?.monto ?? 0;

  return (
    <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/20">
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        <div className="flex-1 text-sm text-emerald-900 dark:text-emerald-100">
          <p className="font-semibold">Pagar con tu saldo a favor</p>
          <p className="mt-1">
            Tenés {plata(saldo.balance)}
            {propio > 0 ? ` (${plata(propio)} vienen de esta misma publicación)` : ""}. Se descuentan {plata(total)} y no pagás costo de procesamiento.
          </p>
          <button
            type="button"
            disabled={disabled || pagando}
            onClick={async () => {
              setPagando(true);
              try {
                await onPagar();
              } finally {
                setPagando(false);
              }
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pagando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Pagar {plata(total)} con mi saldo
          </button>
        </div>
      </div>
    </div>
  );
}
