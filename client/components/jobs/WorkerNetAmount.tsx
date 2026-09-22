import { useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';

/**
 * Lo que el trabajador necesita ver antes de postularse: cuánto cobra.
 *
 * Es el precio, entero. La comisión de DOAPP y el costo de procesamiento del
 * pago los paga el cliente aparte, así que no hay nada que restar. Se dice
 * explícitamente porque es lo que la gente espera que NO pase: que le
 * descuenten algo al cobrar. Antes pasaba (el trabajador absorbía la pasarela
 * y cobraba "entre X e Y según cómo pague el cliente"); ya no.
 *
 * El número sigue viniendo del servidor: es la misma cuenta que se cobra.
 */

interface Props {
  /** El trabajo del que se quiere saber. */
  jobId?: string;
  /** Alternativa cuando todavía no hay trabajo creado (una contraoferta). */
  price?: number;
  className?: string;
}

interface Quote {
  price: number;
  workerReceives: number;
  isBeta: boolean;
}

const ars = (n: number) =>
  'ARS $' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });

export default function WorkerNetAmount({ jobId, price, className = '' }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId && !price) return;
    let cancelado = false;

    const params = jobId ? `jobId=${jobId}` : `price=${price}`;
    const token = localStorage.getItem('token');

    fetch(`/api/payments/quote?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelado && d.success) setQuote(d.data); })
      .catch(() => { /* sin presupuesto se muestra sólo lo que ya se sabe */ })
      .finally(() => { if (!cancelado) setLoading(false); });

    return () => { cancelado = true; };
  }, [jobId, price]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando lo que vas a cobrar…
      </div>
    );
  }

  // Sin presupuesto no se inventa un número: se calla en vez de mostrar uno
  // que después no coincide con la liquidación.
  if (!quote) return null;

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-900 dark:text-white">Vos cobrás</span>
        <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
          {ars(quote.workerReceives)}
        </span>
      </div>

      <p className="flex items-start gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        El precio completo, sin descuentos. La comisión de DOAPP y el costo de procesamiento del pago
        los paga el cliente aparte; a vos no se te resta nada, pagues como pague el cliente.
      </p>
    </div>
  );
}
