import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AyudaDePantalla from "../../components/admin/AyudaDePantalla";
import {
  Loader2,
  TrendingUp,
  AlertTriangle,
  Info,
  HelpCircle,
  Calculator,
  Users,
  Wallet,
  Target,
} from "lucide-react";

/**
 * CAC, LTV, LTV/CAC, payback, runway y retención por cohorte.
 *
 * La otra pantalla financiera —la proyección— responde "si pasa X, cuánto
 * gano". Ésta responde si el negocio cierra: si conseguir un cliente cuesta
 * menos de lo que ese cliente deja, y en cuánto tiempo se recupera. Con la
 * primera se opera; con la segunda se decide si poner más plata en pauta.
 *
 * La decisión de diseño que manda acá: **un número que no se puede calcular no
 * se dibuja como cero**. Se dibuja como la pregunta que falta responder, en
 * gris, con el motivo. Un tablero lleno de ceros en una app que todavía no
 * lanzó se lee como "el negocio va mal" cuando lo que pasa es que no hay nada
 * que medir, y peor: seis meses después nadie recuerda qué celda era medición
 * y cuál era supuesto.
 *
 * Por eso cada celda lleva su procedencia (medido / supuesto / mixto) a la
 * vista. Un supuesto marcado es una hipótesis; un supuesto sin marcar, con el
 * tiempo, se convierte en un hecho que nadie verificó.
 */

interface Metrica<T = number> {
  valor: T | null;
  motivo?: string;
  origen: "medido" | "supuesto" | "mixto" | "sin-datos";
}

type Escenario = "pesimista" | "moderado" | "optimista";

interface Datos {
  calculadoEn: string;
  eurArs: number;
  contexto: {
    fase: string;
    comisionVigentePct: number;
    comisionPostBetaPct: number;
    advertencia: string | null;
    inconsistenciaDelPlan: string | null;
  };
  adquisicion: {
    gastoMarketingMensual: Metrica;
    altas30: Metrica;
    altasQueTransaccionaron30: Metrica;
    cacPorRegistro: Metrica;
    cacPorClienteReal: Metrica;
  };
  valor: {
    ticketPromedio: Metrica;
    contratosPorUsuarioMes: Metrica;
    contribucionMensual: Metrica;
    desglosePorContrato: {
      ticket: number;
      comisionGanada: number;
      costoVariable: number;
      margen: number;
    } | null;
    churnMensualPct: Metrica;
    ltv: Record<Escenario, Metrica>;
    churnPorEscenario: Record<Escenario, number>;
  };
  salud: {
    ltvSobreCac: Record<Escenario, Metrica>;
    paybackMeses: Metrica;
    referenciaLtvCac: number;
    veredicto: string;
  };
  caja: {
    disponible: Metrica;
    quemaMensual: Metrica;
    runwayMeses: Metrica;
  };
  retencion: {
    cohortes: Array<{
      mes: string;
      altas: number;
      activosM1: number;
      activosM2: number;
      activosM3: number;
    }>;
    diagnostico: string;
  };
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

const ORIGEN: Record<Metrica["origen"], { texto: string; clase: string }> = {
  medido: { texto: "medido", clase: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  supuesto: { texto: "supuesto", clase: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  mixto: { texto: "mixto", clase: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  "sin-datos": { texto: "sin datos", clase: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
};

/** Una métrica: el número, su procedencia, o la pregunta que falta responder. */
function Celda({
  etiqueta,
  metrica,
  formato = (n: number) => String(n),
  ayuda,
}: {
  etiqueta: string;
  metrica: Metrica;
  formato?: (n: number) => string;
  ayuda?: string;
}) {
  const origen = ORIGEN[metrica.origen];
  const hay = metrica.valor !== null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {etiqueta}
          {ayuda && (
            <span title={ayuda} className="cursor-help">
              <HelpCircle className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </p>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${origen.clase}`}>
          {origen.texto}
        </span>
      </div>

      {hay ? (
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
          {formato(metrica.valor as number)}
        </p>
      ) : (
        <p className="text-sm leading-snug text-slate-500 dark:text-slate-400">
          {metrica.motivo || "Todavía no se puede calcular."}
        </p>
      )}
    </div>
  );
}

export default function UnitEconomics() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/business-plan/unit-economics", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const json = await res.json();
        if (!vivo) return;
        if (json?.success) setDatos(json.data);
        else setError(json?.message || "No se pudo calcular");
      } catch (e: any) {
        if (vivo) setError(e?.message || "No se pudo calcular");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-hidden="true" />
      </div>
    );
  }

  if (error || !datos) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
          <p className="font-semibold text-red-800 dark:text-red-300">No se pudo calcular</p>
          <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const { contexto, adquisicion, valor, salud, caja, retencion } = datos;
  const ESCENARIOS: Escenario[] = ["pesimista", "moderado", "optimista"];
  const margenNegativo = (valor.desglosePorContrato?.margen ?? 0) < 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Calculator className="h-6 w-6 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Economía unitaria
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Si conseguir un cliente cuesta menos de lo que ese cliente deja, y en cuánto tiempo se
          recupera. Los supuestos salen de{" "}
          <Link to="/admin/business-plan" className="underline decoration-dotted">
            la proyección
          </Link>
          : corregirlos ahí corrige esto.
        </p>
      </header>

      <AyudaDePantalla pantalla="economia-unitaria" />

      {/* Lo primero que hay que leer, antes que cualquier número. */}
      <div
        className={`mb-6 flex gap-3 rounded-xl border p-5 ${
          margenNegativo
            ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
            : "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/20"
        }`}
      >
        {margenNegativo ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        ) : (
          <Target className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
        )}
        <div>
          <p
            className={`font-semibold ${
              margenNegativo
                ? "text-red-900 dark:text-red-200"
                : "text-sky-900 dark:text-sky-200"
            }`}
          >
            Diagnóstico
          </p>
          <p
            className={`mt-1 text-sm leading-relaxed ${
              margenNegativo ? "text-red-800 dark:text-red-300" : "text-sky-800 dark:text-sky-300"
            }`}
          >
            {salud.veredicto}
          </p>
        </div>
      </div>

      {contexto.advertencia && (
        <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{contexto.advertencia}</span>
        </div>
      )}

      {contexto.inconsistenciaDelPlan && (
        <div className="mb-6 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{contexto.inconsistenciaDelPlan}</span>
        </div>
      )}

      {/* ── Adquisición ──────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
        Cuánto cuesta conseguir un cliente
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Celda etiqueta="Gasto en adquisición / mes" metrica={adquisicion.gastoMarketingMensual} formato={pesos} />
        <Celda etiqueta="Altas (30 días)" metrica={adquisicion.altas30} />
        <Celda
          etiqueta="CAC por registro"
          metrica={adquisicion.cacPorRegistro}
          formato={pesos}
          ayuda="Gasto dividido por altas. Es el número que suele mostrarse y el que engaña: un registro que nunca contrata no es un cliente."
        />
        <Celda
          etiqueta="CAC por cliente real"
          metrica={adquisicion.cacPorClienteReal}
          formato={pesos}
          ayuda="Gasto dividido por las altas que además contrataron. Es el que importa."
        />
      </div>

      {/* ── Valor ────────────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <TrendingUp className="h-5 w-5 text-slate-400" aria-hidden="true" />
        Cuánto deja un cliente
      </h2>

      {valor.desglosePorContrato && (
        <div
          className={`mb-3 rounded-xl border p-4 ${
            margenNegativo
              ? "border-red-200 bg-red-50/60 dark:border-red-800/60 dark:bg-red-900/10"
              : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          }`}
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            De dónde sale cada peso, por contrato
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Ticket</dt>
              <dd className="tabular-nums text-slate-800 dark:text-slate-200">
                {pesos(valor.desglosePorContrato.ticket)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                Comisión ({contexto.comisionPostBetaPct}%)
              </dt>
              <dd className="tabular-nums text-emerald-700 dark:text-emerald-400">
                +{pesos(valor.desglosePorContrato.comisionGanada)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Costo de atenderlo</dt>
              <dd className="tabular-nums text-red-700 dark:text-red-400">
                −{pesos(valor.desglosePorContrato.costoVariable)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-700 dark:text-slate-300">Margen</dt>
              <dd
                className={`font-bold tabular-nums ${
                  margenNegativo
                    ? "text-red-700 dark:text-red-400"
                    : "text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {pesos(valor.desglosePorContrato.margen)}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Celda etiqueta="Ticket promedio" metrica={valor.ticketPromedio} formato={pesos} />
        <Celda
          etiqueta="Contratos por usuario / mes"
          metrica={valor.contratosPorUsuarioMes}
          formato={(n) => n.toFixed(2)}
          ayuda="En oficios la frecuencia es baja por naturaleza: a un plomero no se lo llama todos los meses."
        />
        <Celda etiqueta="Contribución mensual" metrica={valor.contribucionMensual} formato={pesos} />
        <Celda
          etiqueta="Churn mensual"
          metrica={valor.churnMensualPct}
          formato={(n) => `${n}%`}
        />
      </div>

      {/* ── Escenarios ───────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900 dark:text-white">
        LTV y salud, en tres escenarios
      </h2>
      <p className="mb-3 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        Tres y no uno porque la retención todavía no está medida. El moderado es el supuesto del
        plan; los otros dos se derivan de él, así que corregir el plan los mueve juntos.
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Escenario", "Churn", "LTV", `LTV / CAC (ideal > ${salud.referenciaLtvCac}×)`].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800">
            {ESCENARIOS.map((esc) => {
              const ratio = salud.ltvSobreCac[esc];
              const sano = ratio.valor !== null && ratio.valor >= salud.referenciaLtvCac;
              return (
                <tr key={esc} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-2.5 font-medium capitalize text-slate-800 dark:text-slate-200">
                    {esc}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                    {valor.churnPorEscenario[esc]}%
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-800 dark:text-slate-200">
                    {valor.ltv[esc].valor !== null ? pesos(valor.ltv[esc].valor as number) : "—"}
                  </td>
                  <td
                    className={`px-4 py-2.5 tabular-nums ${
                      ratio.valor === null
                        ? "text-slate-400 dark:text-slate-500"
                        : sano
                          ? "font-semibold text-emerald-700 dark:text-emerald-400"
                          : "font-semibold text-red-700 dark:text-red-400"
                    }`}
                    title={ratio.motivo}
                  >
                    {ratio.valor !== null ? `${ratio.valor}×` : "sin CAC todavía"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Caja ─────────────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
        <Wallet className="h-5 w-5 text-slate-400" aria-hidden="true" />
        Caja y recuperación
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Celda etiqueta="Caja disponible" metrica={caja.disponible} formato={pesos} />
        <Celda etiqueta="Quema mensual" metrica={caja.quemaMensual} formato={pesos} />
        <Celda
          etiqueta="Runway"
          metrica={caja.runwayMeses}
          formato={(n) => `${n} meses`}
          ayuda="Caja dividida por la quema mensual, sin contar ingresos."
        />
        <Celda
          etiqueta="Payback"
          metrica={salud.paybackMeses}
          formato={(n) => `${n} meses`}
          ayuda="Meses hasta recuperar lo gastado en conseguir al cliente."
        />
      </div>

      {/* ── Retención ────────────────────────────────────────────────── */}
      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900 dark:text-white">Retención</h2>
      <p className="mb-3 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        {retencion.diagnostico}
      </p>

      {retencion.cohortes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Mes de alta", "Altas", "Mes +1", "Mes +2", "Mes +3"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800">
              {retencion.cohortes.map((c) => (
                <tr key={c.mes} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{c.mes}</td>
                  <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-400">{c.altas}</td>
                  {[c.activosM1, c.activosM2, c.activosM3].map((v, i) => (
                    <td key={i} className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                      {c.altas > 0 ? `${v} (${Math.round((v / c.altas) * 100)}%)` : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
        Calculado el {new Date(datos.calculadoEn).toLocaleString("es-AR")} · EUR/ARS{" "}
        {datos.eurArs.toLocaleString("es-AR")} · fase {contexto.fase}
      </p>
    </div>
  );
}
