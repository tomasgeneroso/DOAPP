import { useEffect, useState } from "react";
import { Landmark, Loader2 } from "lucide-react";

interface Datos {
  porLiquidarARS: number;
  pagosPorLiquidar: number;
  pagosSinNeto: number;
  proximaLiberacion: string | null;
  porDia: Array<{ dia: string; montoARS: number; pagos: number }>;
}

const plata = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** «2026-10-30» → «30/10» (el día ya viene en hora argentina desde el servidor). */
const diaCorto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Lo que Mercado Pago todavía tiene que liquidarle a DOAPP, por fecha: es la cifra que el panel de Mercado Pago llama «a liquidar» y que
 * este panel no mostraba. Es el NETO (ya descontada la tarifa de Mercado Pago) de los pagos cobrados cuya plata aún no se libera.
 */
export default function MercadoPagoPorLiquidar() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/hubs/financial/mercadopago", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d?.success) setDatos(d.mercadopago);
        else setFallo(true);
      })
      .catch(() => {
        if (vivo) setFallo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section aria-label="Mercado Pago a liquidar" className="mb-8 rounded-lg border-l-4 border-sky-500 bg-white p-4 shadow dark:bg-slate-800">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-sky-600" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mercado Pago · a liquidar</h2>
      </div>
      {!datos && !fallo && <Loader2 className="mt-3 h-5 w-5 animate-spin text-sky-500" aria-label="Cargando" />}
      {fallo && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No se pudo leer lo que Mercado Pago tiene por liquidar.</p>}
      {datos && (
        <>
          <p className="mt-2 text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">{plata(datos.porLiquidarARS)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {datos.pagosPorLiquidar === 0
              ? "No hay pagos esperando su liberación."
              : `${datos.pagosPorLiquidar} ${datos.pagosPorLiquidar === 1 ? "pago" : "pagos"}, ya descontada la tarifa de Mercado Pago.`}
          </p>
          {datos.porDia.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-700">
              {datos.porDia.map((d) => (
                <li key={d.dia} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-600 dark:text-slate-300">
                    {diaCorto(d.dia)} <span className="text-xs text-slate-400">({d.pagos} {d.pagos === 1 ? "pago" : "pagos"})</span>
                  </span>
                  <span className="font-medium tabular-nums text-slate-800 dark:text-slate-100">{plata(d.montoARS)}</span>
                </li>
              ))}
            </ul>
          )}
          {datos.pagosSinNeto > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {datos.pagosSinNeto} {datos.pagosSinNeto === 1 ? "pago" : "pagos"} sin el neto informado por Mercado Pago (cobrados antes de que se guardara): no suman acá.
            </p>
          )}
        </>
      )}
    </section>
  );
}
