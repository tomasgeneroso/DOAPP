import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { PROCESSING_COST_LABEL } from '../../../shared/pricing/processingCost';

/**
 * El estimado de lo que se va a pagar, ANTES de llegar a Mercado Pago (pedido del dueño, 2026-11-19: con un trabajo de $10.000 Mercado Pago pedía $10.560,99 y en el formulario
 * solo decía «Comisión mínima $3.600»). Sale del mismo cálculo que hace el cobro (`GET /api/payments/quote`): precio, comisión de DOAPP (0 durante la beta o con contrato libre),
 * costo de procesamiento del pago, IVA y total. La cuenta es la misma que vas a ver en la pantalla de pago.
 */
interface Quote {
  price: number; commission: number; commissionRate: number; minimumApplied: boolean;
  vat: number; vatRate: number; processingCharge: number; processingVat: number; processingRate: number; totalVat: number;
  totalToPay: number; isBeta: boolean;
}

const ars = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EstimadoDelPago({ precio }: { precio: number }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [falla, setFalla] = useState(false);

  useEffect(() => {
    if (!(precio >= 1000)) {
      setQuote(null);
      return;
    }
    let vigente = true;
    const espera = setTimeout(async () => {
      try {
        const r = await fetch(`/api/payments/quote?price=${Math.round(precio)}`);
        const d = await r.json();
        if (!vigente) return;
        if (d.success) {
          setQuote(d.data);
          setFalla(false);
        } else {
          setFalla(true);
        }
      } catch {
        if (vigente) setFalla(true);
      }
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [precio]);

  if (!(precio >= 1000)) return null;
  if (falla && !quote) return <p className="text-xs text-slate-500 dark:text-slate-400">No pudimos calcular el estimado ahora: lo vas a ver completo antes de pagar.</p>;
  if (!quote) return <p className="text-xs text-slate-500 dark:text-slate-400">Calculando cuánto vas a pagar…</p>;

  const sinComision = quote.commission === 0;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sm dark:border-sky-800 dark:bg-sky-900/10" data-testid="estimado-del-pago">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-300">
        <Receipt className="h-4 w-4" aria-hidden="true" /> Estimado de lo que vas a pagar
      </p>
      <dl className="space-y-1 text-slate-700 dark:text-slate-200">
        <div className="flex justify-between gap-3"><dt>Precio del trabajo <span className="text-xs text-slate-500">(se le paga entero a quien lo hace)</span></dt><dd className="whitespace-nowrap">{ars(quote.price)}</dd></div>
        <div className="flex justify-between gap-3">
          <dt>
            Comisión de DOAPP{!sinComision && ` (${quote.commissionRate}%)`}
            {sinComision && <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400">{quote.isBeta ? 'sin comisión durante la beta' : 'libre de comisión'}</span>}
          </dt>
          <dd className="whitespace-nowrap">{ars(quote.commission)}</dd>
        </div>
        {quote.processingCharge > 0 && (
          <div className="flex justify-between gap-3"><dt>{PROCESSING_COST_LABEL} ({quote.processingRate}%)</dt><dd className="whitespace-nowrap">{ars(quote.processingCharge)}</dd></div>
        )}
        {quote.totalVat > 0 && (
          <div className="flex justify-between gap-3"><dt>IVA ({quote.vatRate}%) sobre {sinComision ? 'el procesamiento' : 'comisión y procesamiento'}</dt><dd className="whitespace-nowrap">{ars(quote.totalVat)}</dd></div>
        )}
        <div className="flex justify-between gap-3 border-t border-sky-200 pt-1 text-base font-bold text-slate-900 dark:border-sky-800 dark:text-white"><dt>Total estimado</dt><dd className="whitespace-nowrap">{ars(quote.totalToPay)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Es lo que te va a pedir Mercado Pago. Con otros medios de pago el total es el mismo. {' '}
        <a href="/legal/terminos-y-condiciones#s7p3" target="_blank" rel="noreferrer" className="text-sky-600 underline dark:text-sky-400">Ver tarifas y comisiones</a>
      </p>
    </div>
  );
}
