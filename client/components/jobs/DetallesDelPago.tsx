import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ShieldCheck, Receipt } from "lucide-react";
import Transicion from "../ui/Transicion";
import type { DetalleDelPagoDeLaPublicacion, ModoDeAprobacion } from "../../../shared/pagos/detalleDelPagoDeLaPublicacion";

/**
 * «Detalles del pago» de una publicación, plegable. Lo ve el equipo (con más cosas adentro: comprobante y enlaces, por `children`) y la persona que publicó el
 * trabajo. Dice cuándo se aprobó el pago y cuándo el trabajo, y si fue automático o lo hizo una persona del equipo.
 */
const ROTULO_DEL_MODO: Record<ModoDeAprobacion, string> = {
  automatico: "Automático",
  administrador: "Por un administrador",
  pendiente: "Pendiente",
  no_llego: "No llegó a aprobarse",
  sin_dato: "Sin dato",
};
const COLOR_DEL_MODO: Record<ModoDeAprobacion, string> = {
  automatico: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  administrador: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  pendiente: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  no_llego: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  sin_dato: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

const cuando = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const pesos = (n: number): string => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Dato({ rotulo, valor, testid }: { rotulo: string; valor: ReactNode; testid?: string }) {
  return (
    <div data-testid={testid}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{rotulo}</p>
      <p className="font-medium text-slate-900 dark:text-white">{valor}</p>
    </div>
  );
}

export default function DetallesDelPago({
  detalle,
  paraEquipo = false,
  abiertoAlInicio = false,
  children,
}: {
  detalle: DetalleDelPagoDeLaPublicacion;
  paraEquipo?: boolean;
  abiertoAlInicio?: boolean;
  /** Lo que solo ve el equipo (comprobante, enlaces): va al final, adentro del panel plegable. */
  children?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  const idDelPanel = useId();
  const marco = paraEquipo
    ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-900/20"
    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800";

  return (
    <section className={`rounded-2xl border shadow-sm ${marco}`} data-testid="detalles-del-pago">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={idDelPanel}
        className="flex w-full items-center gap-2 p-5 text-left"
      >
        {paraEquipo ? <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" /> : <Receipt className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />}
        <h2 className="flex-1 text-lg font-bold text-slate-900 dark:text-white">{paraEquipo ? "Detalles del pago (equipo)" : "Detalles del pago"}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200" data-testid="resumen-del-pago">
          {detalle.estadoDelPago} · {pesos(detalle.monto)}
        </span>
        <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      <Transicion mostrar={abierto}>
        <div id={idDelPanel} className="space-y-4 px-5 pb-5">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Dato rotulo="Estado del pago" valor={detalle.estadoDelPago} />
            <Dato rotulo="Monto" valor={`${pesos(detalle.monto)} ARS`} />
            <Dato rotulo="Comisión de DOAPP (importe)" valor={pesos(detalle.comision)} testid="dato-comision" />
            <Dato rotulo="Tasa de comisión" valor={`${detalle.tasaDeComision.toFixed(1)} %`} testid="dato-tasa" />
            {detalle.metodo && <Dato rotulo="Método de pago" valor={detalle.metodo} testid="dato-metodo" />}
            {detalle.pagador && <Dato rotulo="Pagó" valor={detalle.pagador} />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            La <strong>comisión</strong> es el importe en pesos que cobra DOAPP; la <strong>tasa</strong> es el porcentaje del precio con el que se calculó ese importe. Si la tasa es 0 %, no se cobró comisión.
          </p>

          {/* La historia, de lo más reciente a lo más viejo (lo que todavía falta, arriba de todo) */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Historia</h3>
            <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-700" aria-label="Historia del pago y del trabajo, de lo más reciente a lo más viejo" data-testid="historia-del-pago">
              {detalle.historia.map((h, i) => (
                <li key={`${h.clave}-${i}`} className="mb-4 ml-5 last:mb-0" data-testid={`evento-${h.clave}`} data-pendiente={h.pendiente ? "true" : "false"}>
                  <span
                    className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-800 ${
                      h.pendiente ? "bg-amber-400" : h.clave === "trabajo_cancelado" || h.clave === "trabajo_no_aprobado" ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{h.titulo}</span>
                    {h.modo && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_DEL_MODO[h.modo]}`}>{ROTULO_DEL_MODO[h.modo]}</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{h.texto}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{h.cuando ? cuando(h.cuando) : "Todavía no pasó"}</p>
                </li>
              ))}
            </ol>
          </div>

          {children}
        </div>
      </Transicion>
    </section>
  );
}
