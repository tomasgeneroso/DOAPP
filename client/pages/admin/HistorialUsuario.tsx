import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, AlertTriangle, Scale, XCircle, CreditCard } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface Mes { mes: string; contratos: number; disputas: number; cancelaciones: number; contracargos: number }
interface Evento {
  fecha: string; tipo: "disputa" | "cancelacion" | "contracargo"; titulo: string; detalle: string;
  monto: number | null; aFavorDe: string | null; contractId: string | null; disputeId: string | null;
}
interface Historial {
  usuario: { id: string; name: string; email: string; createdAt: string | null };
  resumen: {
    contratos: number; comoCliente: number; comoTrabajador: number; completados: number; cancelados: number;
    cancelacionesPropias: number; disputasAbiertas: number; disputasGanadas: number; disputasPerdidas: number;
    disputasEnCurso: number; contracargos: number;
  };
  dinero: { pagadoComoCliente: number; cobradoComoTrabajador: number; devueltoAEsteUsuario: number; saldoActual: number };
  meses: Mes[];
  eventos: Evento[];
}

const $ = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const mesCorto = (m: string) => {
  const [a, mm] = m.split("-");
  return `${["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(mm)]} ${a.slice(2)}`;
};

/**
 * Paleta de los incidentes. Validada con el validador de la guía de gráficos
 * (banda de luminosidad, piso de croma, separación para daltonismo y contraste
 * contra la superficie) en los dos modos. No se toca de a un color: si cambia
 * uno hay que volver a validar los tres juntos.
 */
const SERIES = [
  { clave: "disputas" as const, rotulo: "Disputas", claro: "#b45309", oscuro: "#d97706", Icono: Scale },
  { clave: "cancelaciones" as const, rotulo: "Cancelaciones", claro: "#7c3aed", oscuro: "#8b5cf6", Icono: XCircle },
  { clave: "contracargos" as const, rotulo: "Contracargos", claro: "#be123c", oscuro: "#f43f5e", Icono: CreditCard },
];

function useEsOscuro() {
  const [oscuro, setOscuro] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setOscuro(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return oscuro;
}

/** Barras de contratos por mes: una sola serie, así que no lleva leyenda. */
function ContratosPorMes({ meses }: { meses: Mes[] }) {
  const max = Math.max(1, ...meses.map((m) => m.contratos));
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Contratos por mes</figcaption>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Máximo en el período: {max}</p>
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`Contratos por mes: ${meses.map((m) => `${mesCorto(m.mes)} ${m.contratos}`).join(", ")}`}>
        {meses.map((m) => (
          <div key={m.mes} className="flex flex-1 flex-col items-center gap-1" title={`${mesCorto(m.mes)}: ${m.contratos} contratos`}>
            <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{m.contratos || ""}</span>
            <div
              className="w-full rounded-t bg-sky-600 dark:bg-sky-500"
              style={{ height: `${Math.max(m.contratos ? 4 : 0, (m.contratos / max) * 72)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {meses.map((m) => (
          <div key={m.mes} className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400">{mesCorto(m.mes)}</div>
        ))}
      </div>
    </figure>
  );
}

/** Incidentes apilados por mes. Tres series: leyenda siempre, y hueco entre segmentos. */
function IncidentesPorMes({ meses }: { meses: Mes[] }) {
  const oscuro = useEsOscuro();
  const total = (m: Mes) => m.disputas + m.cancelaciones + m.contracargos;
  const max = Math.max(1, ...meses.map(total));
  const hayAlguno = meses.some((m) => total(m) > 0);

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Incidentes por mes</figcaption>
      {hayAlguno ? (
        <>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
            {SERIES.map((s) => (
              <span key={s.clave} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: oscuro ? s.oscuro : s.claro }} aria-hidden="true" />
                {s.rotulo}
              </span>
            ))}
          </div>
          <div className="flex h-28 items-end gap-1" role="img" aria-label={`Incidentes por mes: ${meses.map((m) => `${mesCorto(m.mes)}: ${m.disputas} disputas, ${m.cancelaciones} cancelaciones, ${m.contracargos} contracargos`).join("; ")}`}>
            {meses.map((m) => (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{total(m) || ""}</span>
                <div className="flex w-full flex-col-reverse gap-[2px]">
                  {SERIES.map((s) =>
                    m[s.clave] > 0 ? (
                      <div
                        key={s.clave}
                        className="w-full first:rounded-t"
                        style={{ height: `${Math.max(4, (m[s.clave] / max) * 72)}px`, background: oscuro ? s.oscuro : s.claro }}
                        title={`${mesCorto(m.mes)}: ${m[s.clave]} ${s.rotulo.toLowerCase()}`}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {meses.map((m) => (
              <div key={m.mes} className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400">{mesCorto(m.mes)}</div>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
          Sin disputas, cancelaciones ni contracargos en el período.
        </p>
      )}
    </figure>
  );
}

/**
 * El expediente de un usuario. Se mira antes de decidir sobre él: en una
 * disputa, lo que importa no es el número de contratos sino el patrón.
 */
export default function HistorialUsuario() {
  const { userId } = useParams<{ userId: string }>();
  const { token } = useAuth();
  const [h, setH] = useState<Historial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/admin/hubs/historial/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => (d.success ? setH(d.data) : setError(d.message || "No se pudo cargar")))
      .catch(() => setError("No se pudo cargar"));
  }, [userId, token]);

  if (error) return <div className="p-6 text-red-600 dark:text-red-400">{error}</div>;
  if (!h) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;

  const r = h.resumen;
  const tiles: Array<{ l: string; v: string; sub?: string; alerta?: boolean }> = [
    { l: "Contratos", v: String(r.contratos), sub: `${r.comoCliente} como cliente · ${r.comoTrabajador} como trabajador` },
    { l: "Completados", v: String(r.completados), sub: r.contratos ? `${Math.round((r.completados / r.contratos) * 100)}% de sus contratos` : undefined },
    { l: "Canceló", v: String(r.cancelacionesPropias), sub: `de ${r.cancelados} contratos cancelados`, alerta: r.contratos >= 3 && r.cancelacionesPropias / r.contratos >= 0.34 },
    { l: "Disputas que abrió", v: String(r.disputasAbiertas), sub: `${r.disputasGanadas} a su favor · ${r.disputasPerdidas} en contra${r.disputasEnCurso ? ` · ${r.disputasEnCurso} en curso` : ""}`, alerta: r.contratos >= 3 && r.disputasAbiertas / r.contratos >= 0.34 },
    { l: "Contracargos", v: String(r.contracargos), sub: "desconoció el pago ante el banco", alerta: r.contracargos > 0 },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{h.usuario.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {h.usuario.email}
          {h.usuario.createdAt ? ` · en DOAPP desde ${new Date(h.usuario.createdAt).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link to={`/admin/users/${h.usuario.id}`} className="text-sky-600 hover:underline dark:text-sky-400">Ver ficha</Link>
          <Link to="/admin/usuarios-marcados" className="text-sky-600 hover:underline dark:text-sky-400">Usuarios con advertencia</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div
            key={t.l}
            className={`rounded-lg border p-3 ${t.alerta ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}
          >
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              {t.alerta && <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" aria-label="por encima del umbral" />}
              {t.l}
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{t.v}</div>
            {t.sub && <div className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t.sub}</div>}
          </div>
        ))}
      </section>

      <section className="grid gap-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2">
        <ContratosPorMes meses={h.meses} />
        <IncidentesPorMes meses={h.meses} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Plata</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Pagó como cliente", h.dinero.pagadoComoCliente],
            ["Cobró como trabajador", h.dinero.cobradoComoTrabajador],
            ["Se le devolvió", h.dinero.devueltoAEsteUsuario],
            ["Saldo a favor hoy", h.dinero.saldoActual],
          ].map(([l, v]) => (
            <div key={l as string}>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{l}</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{$(v as number)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <h2 className="border-b border-slate-200 p-4 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
          Qué pasó, del más reciente al más viejo
        </h2>
        {h.eventos.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">Ningún incidente registrado.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {h.eventos.map((e, i) => {
              const s = SERIES.find((x) => x.clave === (e.tipo === "disputa" ? "disputas" : e.tipo === "cancelacion" ? "cancelaciones" : "contracargos"))!;
              return (
                <li key={i} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                  <s.Icono className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{e.titulo}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{e.detalle}</div>
                    {e.aFavorDe && (
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        Terminó {e.aFavorDe === "repartido" ? "con reparto entre las partes" : `a favor de ${e.aFavorDe}`}
                        {e.monto ? ` · ${$(e.monto)}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                    <div>{new Date(e.fecha).toLocaleDateString("es-AR")}</div>
                    {e.disputeId && <Link to={`/admin/disputes/${e.disputeId}`} className="text-sky-600 hover:underline dark:text-sky-400">ver disputa</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
