import { useEffect, useState } from "react";
import { Wallet, Loader2 } from "lucide-react";

const plata = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

interface SaldoDelCliente {
  balance: number;
  /** Saldo liberado que puede usar ya (sin lo que está en liberación ni lo reservado para un retiro). */
  saldoParaPagar: number;
  /** Lo pendiente de cada publicación cancelada (`jobId` → monto): sirve para volver a publicar ESA publicación y ninguna otra. */
  pendientePorPublicacion: Record<string, number>;
  saldoVinculado?: number;
  saldoEnRetiroPendiente?: number;
  publicacionesVinculadas?: Array<{ jobId: string; titulo: string; monto: number }>;
}

/**
 * Pagar una publicación con el saldo liberado, sin pasarela (y sin costo de procesamiento). Aparece cuando el saldo liberado cubre el total; si no alcanza,
 * se paga por Mercado Pago o transferencia. Si el saldo viene de ESTA publicación (se canceló y volvió), el texto lo dice.
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
  /** `confirmaRetiroPendiente`: la persona ya vio el aviso de que su retiro pendiente se cancela. */
  onPagar: (confirmaRetiroPendiente: boolean) => Promise<void>;
}) {
  const [saldo, setSaldo] = useState<SaldoDelCliente | null>(null);
  const [pagando, setPagando] = useState(false);
  const [avisando, setAvisando] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    fetch("/api/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado && d?.success) setSaldo({ balance: Number(d.balance) || 0, saldoParaPagar: Number(d.saldoParaPagar) || 0, pendientePorPublicacion: d.pendientePorPublicacion || {}, saldoVinculado: Number(d.saldoVinculado) || 0, saldoEnRetiroPendiente: Number(d.saldoEnRetiroPendiente) || 0, publicacionesVinculadas: d.publicacionesVinculadas });
      })
      .catch(() => {
        /* sin saldo conocido no se ofrece */
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const propio = saldo?.publicacionesVinculadas?.find((p) => p.jobId === jobId)?.monto ?? 0;
  const pendienteDeEsta = saldo?.pendientePorPublicacion?.[jobId] ?? 0;
  if (!saldo || !(total > 0) || saldo.saldoParaPagar + pendienteDeEsta + 0.005 < total) return null;
  const usaLoPendiente = saldo.saldoParaPagar + 0.005 < total;

  return (
    <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-900/20">
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        <div className="flex-1 text-sm text-emerald-900 dark:text-emerald-100">
          <p className="font-semibold">{propio > 0 ? 'Reprogramar con el saldo de esta publicación' : 'Pagar con tu saldo'}</p>
          <p className="mt-1">
            {propio > 0
              ? `Cuando se canceló, ${plata(propio)} volvieron a tu saldo vinculados a ella. `
              : `Tenés ${plata(saldo.saldoParaPagar)} de saldo liberado. `}
            Se descuentan {plata(total)} y no pagás costo de procesamiento.
          </p>
          {usaLoPendiente && (
            <p className="mt-1 text-xs">
              Tu saldo liberado ({plata(saldo.saldoParaPagar)}) no alcanza solo: se completa con lo que está pendiente de esta publicación ({plata(pendienteDeEsta)} pendientes de liquidar). Lo pendiente solo se puede usar para volver a publicar la misma publicación.
            </p>
          )}
          {avisando && (
            <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
              Tenés un retiro pendiente por {plata(saldo.saldoEnRetiroPendiente ?? 0)}. Si pagás con este saldo, <strong>ese retiro se cancela</strong>. Podés volver a pedirlo con lo que te quede.
            </p>
          )}
          <button
            type="button"
            disabled={disabled || pagando}
            onClick={async () => {
              // Con un retiro pendiente que este pago dejaría sin saldo, primero se avisa (la segunda vez se confirma)
              const pendiente = saldo.saldoEnRetiroPendiente ?? 0;
              const afecta = pendiente > 0 && saldo.balance - total < pendiente - 0.005;
              if (afecta && !avisando) {
                setAvisando(true);
                return;
              }
              setPagando(true);
              try {
                await onPagar(afecta);
              } finally {
                setPagando(false);
              }
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pagando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {avisando ? `Entiendo: cancelar mi retiro y pagar ${plata(total)}` : `Pagar ${plata(total)} con mi saldo`}
          </button>
        </div>
      </div>
    </div>
  );
}
