import { FileText } from "lucide-react";

export interface CotizacionDeLaPropuesta {
  id: string;
  quoteNumber?: string | null;
  title?: string | null;
  items?: Array<{ qty: number; description: string; unitPrice: number; amount?: number }> | null;
  subtotal?: number | string | null;
  taxRate?: number | string | null;
  taxAmount?: number | string | null;
  otherTaxes?: Array<{ name: string; rate: number; amount: number }> | null;
  total?: number | string | null;
  notes?: string | null;
  paymentTerms?: string | null;
  validUntil?: string | null;
  status?: string | null;
}

const plata = (n: unknown) => `$${(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADOS: Record<string, string> = {
  draft: "Borrador", sent: "Enviada", accepted: "Aceptada", rejected: "Rechazada", expired: "Vencida", revised: "Revisada", countered: "Contraofertada",
};

/**
 * El detalle de la cotización de una propuesta, desplegable: conceptos, subtotal, impuestos, total, notas y condiciones de pago. Quien se postula
 * con una cotización la manda como propuesta; antes quien la recibía veía la propuesta pero no lo que se cotizó. Sin cotización no se dibuja nada.
 */
export default function DetalleDeCotizacion({ cotizacion }: { cotizacion?: CotizacionDeLaPropuesta | null }) {
  if (!cotizacion) return null;
  const items = Array.isArray(cotizacion.items) ? cotizacion.items : [];
  const otros = Array.isArray(cotizacion.otherTaxes) ? cotizacion.otherTaxes : [];
  const iva = Number(cotizacion.taxAmount) || 0;

  return (
    <details className="group mt-2 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
        <FileText className="h-4 w-4 text-sky-600" aria-hidden />
        <span className="flex-1">
          Cotización {cotizacion.quoteNumber ? `${cotizacion.quoteNumber} · ` : ""}
          <span className="tabular-nums">{plata(cotizacion.total)}</span>
        </span>
        <span className="text-xs font-normal text-sky-700 group-open:hidden dark:text-sky-300">Ver detalle</span>
        <span className="hidden text-xs font-normal text-slate-500 group-open:inline">Ocultar</span>
      </summary>

      <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
        {cotizacion.title && <p className="font-medium text-slate-800 dark:text-slate-100">{cotizacion.title}</p>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1 pr-3 font-medium">Concepto</th>
                <th className="px-3 py-1 text-right font-medium">Cant.</th>
                <th className="px-3 py-1 text-right font-medium">Precio</th>
                <th className="py-1 pl-3 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 dark:divide-slate-700 dark:text-slate-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3">{it.description}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{it.qty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{plata(it.unitPrice)}</td>
                  <td className="py-1.5 pl-3 text-right tabular-nums">{plata(it.amount ?? Number(it.qty) * Number(it.unitPrice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto grid max-w-xs grid-cols-[1fr,auto] gap-x-4 gap-y-1 text-slate-700 dark:text-slate-200">
          <dt>Subtotal</dt>
          <dd className="text-right tabular-nums">{plata(cotizacion.subtotal)}</dd>
          {(iva > 0 || Number(cotizacion.taxRate) > 0) && (
            <>
              <dt>IVA ({Number(cotizacion.taxRate) || 0} %)</dt>
              <dd className="text-right tabular-nums">{plata(iva)}</dd>
            </>
          )}
          {otros.map((o, i) => (
            <div key={i} className="contents">
              <dt>{o.name} ({Number(o.rate) || 0} %)</dt>
              <dd className="text-right tabular-nums">{plata(o.amount)}</dd>
            </div>
          ))}
          <dt className="border-t border-slate-200 pt-1 font-semibold dark:border-slate-600">Total</dt>
          <dd className="border-t border-slate-200 pt-1 text-right font-semibold tabular-nums dark:border-slate-600">{plata(cotizacion.total)}</dd>
        </dl>

        {(cotizacion.paymentTerms || cotizacion.validUntil || cotizacion.notes || cotizacion.status) && (
          <ul className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            {cotizacion.paymentTerms && <li><strong>Condiciones de pago:</strong> {cotizacion.paymentTerms}</li>}
            {cotizacion.validUntil && <li><strong>Válida hasta:</strong> {new Date(cotizacion.validUntil).toLocaleDateString("es-AR")}</li>}
            {cotizacion.status && <li><strong>Estado:</strong> {ESTADOS[cotizacion.status] ?? cotizacion.status}</li>}
            {cotizacion.notes && <li><strong>Notas:</strong> {cotizacion.notes}</li>}
          </ul>
        )}
      </div>
    </details>
  );
}
