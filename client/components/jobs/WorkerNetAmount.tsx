import { useEffect, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';

/**
 * Las dos cifras que el trabajador necesita ver antes de postularse.
 *
 * El precio publicado es lo que ofrece el cliente; lo que el trabajador cobra
 * es eso menos el costo de la pasarela, que corre por su lado. Mostrar sólo el
 * bruto lo lleva a cotizar sobre un número que no va a recibir, y a reclamar
 * cuando le llega menos. Mostrar sólo el neto es peor: no entiende de dónde
 * sale ni contra qué comparar.
 *
 * Por eso van las dos, con el descuento explicado en el medio.
 */

interface Props {
  /** El trabajo del que se quiere saber. La comisión depende de su dueño. */
  jobId?: string;
  /** Alternativa cuando todavía no hay trabajo creado (una contraoferta). */
  price?: number;
  className?: string;
}

interface Quote {
  price: number;
  workerReceives: number;
  processingCost: number;
  processingRate: number;
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

  // Sin presupuesto no se inventa un neto: se calla en vez de mostrar un número
  // que después no coincide con la liquidación.
  if (!quote) return null;

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-600 dark:text-slate-400">El cliente ofrece</span>
        <span className="text-base font-semibold text-slate-900 dark:text-white tabular-nums">
          {ars(quote.price)}
        </span>
      </div>

      {quote.processingCost > 0 && (
        <div className="flex items-baseline justify-between gap-3 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          <span>
            Costo de la pasarela de pago
            {quote.processingRate ? ` (${quote.processingRate}%)` : ''}
          </span>
          <span className="tabular-nums">−{ars(quote.processingCost)}</span>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
        <span className="text-sm font-medium text-slate-900 dark:text-white">Vos recibís</span>
        <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
          {ars(quote.workerReceives)}
        </span>
      </div>

      <p className="flex items-start gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        {quote.isBeta
          ? 'Durante la beta DOAPP no cobra comisión. Sólo se descuenta lo que cobra la pasarela por transferirte el dinero.'
          : 'La comisión de DOAPP la paga el cliente aparte. A vos sólo se te descuenta lo que cobra la pasarela por transferirte el dinero.'}
      </p>
    </div>
  );
}
