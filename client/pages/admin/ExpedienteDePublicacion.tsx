import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Briefcase, CheckCircle2, CircleDashed, Clock, FileText, History, Info, Loader2, Users, Wallet,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { BarraDePestanas, PanelDePestana, usePestana, type Pestana } from "../../components/admin/Pestanas";
import { Tarjeta, Tabla, Vacio } from "../../components/admin/PiezasDeFicha";
import { $, dia, diaYHora, estado, enlace } from "../../components/admin/formatosDeFicha";

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface Persona { id: string; nombre: string; email: string | null; rol: string | null }
interface Alerta { nivel: "alta" | "media" | "info"; titulo: string; detalle: string; queHacer?: string }
interface Movimiento {
  id: string; fecha: string; tipo: string; monto: number; estado: string; descripcion: string; usuario: Persona | null; origen: string | null;
  hechoPor: { tipo: string | null; persona: Persona | null } | null; saldoAntes: number; saldoDespues: number; pagoId: string | null; sinPago: boolean;
}
interface Evento { fecha: string; tipo: "publicacion" | "pago" | "saldo" | "contrato" | "postulacion" | "auditoria"; titulo: string; detalle?: string; quien?: string | null; monto?: number | null }
interface Expediente {
  publicacion: {
    id: string; titulo: string; estado: string; precio: number; modoDePrecio: string | null; trabajadoresPedidos: number; trabajadoresElegidos: number;
    puedeEmpezarConMenos: boolean; inicio: string | null; fin: string | null; creadaEl: string | null; dueno: Persona | null; figuraPagada: boolean;
    pagadaEl: string | null; pagoId: string | null; pagadaConSaldo: boolean; creditoVinculado: number; revisadaPor: Persona | null; revisadaEl: string | null;
    motivoDeRechazo: string | null; pausadaPorAdmin: boolean; reprogramadaDesde: { inicio: string | null; fin: string | null; el: string | null } | null;
    canceladaPor: Persona | null; canceladaComo: string | null; canceladaEl: string | null; motivoDeCancelacion: string | null; cancelacionDefinitiva: boolean;
  };
  pago: {
    id: string; monto: number; moneda: string; estado: string; medio: string; mercadoPago: { id: string | null; estado: string | null }; confirmadoPor: string | null;
    pagador: Persona | null; aprobadoPor: Persona | null; aprobadoEl: string | null; aprobadoPorElPagador: boolean; esManual: boolean;
    comision: number; devuelto: number; creadoEl: string | null; pagadoEl: string | null;
  } | null;
  pagosDeContratos: Array<{ id: string; contratoId: string | null; monto: number; moneda: string; estado: string; tipo: string; creadoEl: string | null }>;
  movimientos: Movimiento[];
  contratos: Array<{
    id: string; estado: string; trabajador: Persona | null; precio: number; comision: number; total: number; pago: string; garantia: string;
    confirmoElDueno: boolean; confirmoElTrabajador: boolean; inicio: string | null; fin: string | null; creadoEl: string | null;
    canceladoPor: Persona | null; motivoDeCancelacion: string | null;
  }>;
  postulaciones: { total: number; porEstado: Record<string, number> };
  auditoria: Array<{ fecha: string; accion: string; descripcion: string; gravedad: string; quien: string | null; sobre: string }>;
  linea: Evento[];
  alertas: Alerta[];
  avisos: string[];
}

const TIPOS_DE_MOVIMIENTO: Record<string, string> = {
  refund: "Devolución", adjustment: "Descuento / ajuste", payment: "Pago al trabajador", withdrawal: "Retiro", bonus: "Bono",
};

const ESTILO_DE_ALERTA: Record<Alerta["nivel"], { caja: string; icono: ReactNode; rotulo: string }> = {
  alta: { caja: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100", icono: <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />, rotulo: "Grave" },
  media: { caja: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100", icono: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />, rotulo: "A revisar" },
  info: { caja: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-100", icono: <Info className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />, rotulo: "Dato" },
};

const COLOR_DE_EVENTO: Record<Evento["tipo"], string> = {
  publicacion: "bg-sky-500", pago: "bg-emerald-500", saldo: "bg-violet-500", contrato: "bg-amber-500", postulacion: "bg-slate-400", auditoria: "bg-slate-500",
};
const ROTULO_DE_EVENTO: Record<Evento["tipo"], string> = {
  publicacion: "Publicación", pago: "Pago", saldo: "Saldo", contrato: "Contrato", postulacion: "Postulación", auditoria: "Auditoría",
};

function PersonaEnlace({ p, vacio = "—" }: { p: Persona | null | undefined; vacio?: string }) {
  if (!p) return <span className="text-slate-500 dark:text-slate-400">{vacio}</span>;
  return (
    <span>
      <Link to={`/admin/users/${p.id}`} className={enlace}>{p.nombre}</Link>
      {p.rol && p.rol !== "user" && <span className="ml-1 rounded bg-slate-100 px-1 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">{p.rol}</span>}
      {p.email && <span className="block text-xs text-slate-500 dark:text-slate-400">{p.email}</span>}
    </span>
  );
}

function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500 dark:text-slate-400">{rotulo}</dt>
      <dd className="text-slate-800 dark:text-slate-100">{children}</dd>
    </>
  );
}

function Alertas({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> Sin alertas: la plata de esta publicación cierra.
      </p>
    );
  }
  return (
    <div className="space-y-2" role="region" aria-label="Alertas de la publicación">
      {alertas.map((a, i) => {
        const e = ESTILO_DE_ALERTA[a.nivel];
        return (
          <div key={i} role={a.nivel === "alta" ? "alert" : "note"} className={`flex gap-3 rounded-lg border p-3 ${e.caja}`}>
            {e.icono}
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                <span className="mr-2 rounded bg-white/60 px-1.5 py-0.5 text-[11px] uppercase tracking-wide dark:bg-black/20">{e.rotulo}</span>
                {a.titulo}
              </p>
              <p className="mt-1">{a.detalle}</p>
              {a.queHacer && <p className="mt-1"><strong>Qué hacer:</strong> {a.queHacer}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ExpedienteDePublicacion() {
  const { jobId } = useParams<{ jobId: string }>();
  // Con otra publicación se vuelve a montar entera: el expediente anterior no queda a la vista mientras carga el nuevo.
  return <Pagina key={jobId} jobId={jobId || ""} />;
}

function Pagina({ jobId }: { jobId: string }) {
  const { token } = useAuth();
  const [e, setE] = useState<Expediente | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/admin/jobs/${jobId}/expediente`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => (d.success ? setE(d.data) : setError(d.message || "No se pudo cargar el expediente")))
      .catch(() => setError("No se pudo cargar el expediente"));
  }, [jobId, token]);

  const pestanas: Pestana[] = [
    { id: "resumen", rotulo: "Resumen", icono: Briefcase },
    { id: "cronologia", rotulo: "Cronología", icono: History, insignia: e?.linea.length },
    { id: "dinero", rotulo: "Dinero", icono: Wallet, insignia: e ? e.movimientos.length + (e.pago ? 1 : 0) + e.pagosDeContratos.length : undefined },
    { id: "contratos", rotulo: "Contratos", icono: FileText, insignia: e?.contratos.length },
    { id: "postulaciones", rotulo: "Postulaciones", icono: Users, insignia: e?.postulaciones.total },
    { id: "auditoria", rotulo: "Auditoría", icono: Clock, insignia: e?.auditoria.length },
  ];
  const [actual, cambiar] = usePestana(pestanas, "resumen");

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link to="/admin/jobs" className={`inline-flex items-center gap-1 text-sm ${enlace}`}><ArrowLeft className="h-4 w-4" /> Publicaciones</Link>
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">{error}</p>
      </div>
    );
  }
  if (!e) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-sky-500" aria-label="Cargando" /></div>;
  }

  const p = e.publicacion;
  const hayGraves = e.alertas.some((a) => a.nivel === "alta");

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link to="/admin/jobs" className={`inline-flex items-center gap-1 text-sm ${enlace}`}><ArrowLeft className="h-4 w-4" /> Gestión de publicaciones</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Expediente de la publicación</p>
          <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-white">{p.titulo}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.estado === "cancelled" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"}`}>{estado(p.estado)}</span>
            <span className="tabular-nums font-semibold">{$(p.precio)}</span>
            <span>Dueño: <PersonaEnlace p={p.dueno} /></span>
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-400">{p.id}</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to={`/jobs/${p.id}`} className={enlace}>Ver como lo ve la gente</Link>
          {p.dueno && <Link to={`/admin/users/${p.dueno.id}?tab=dinero`} className={enlace}>Saldo del dueño</Link>}
        </div>
      </header>

      {/* Las alertas van arriba de todo: si hay algo grave, es lo primero que se ve. */}
      <Alertas alertas={e.alertas} />
      {e.avisos.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Algunas listas no se pudieron leer: {e.avisos.join(" · ")}</p>}

      <BarraDePestanas pestanas={pestanas} actual={actual} onCambiar={cambiar} etiqueta={`Expediente de ${p.titulo}`} />

      <PanelDePestana id={actual}>
        {actual === "resumen" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Tarjeta titulo="La publicación">
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                <Dato rotulo="Precio">{$(p.precio)}{p.modoDePrecio ? <span className="ml-1 text-xs text-slate-500">({p.modoDePrecio})</span> : null}</Dato>
                <Dato rotulo="Equipo">{p.trabajadoresElegidos} de {p.trabajadoresPedidos}{p.trabajadoresPedidos > 1 ? (p.puedeEmpezarConMenos ? " · puede empezar con menos" : " · necesita el equipo completo") : ""}</Dato>
                <Dato rotulo="Fechas">{p.inicio ? diaYHora(p.inicio) : "—"}{p.fin ? ` → ${dia(p.fin)}` : ""}</Dato>
                {p.reprogramadaDesde && <Dato rotulo="Reprogramada"><span className="text-amber-700 dark:text-amber-300">antes: {p.reprogramadaDesde.inicio ? diaYHora(p.reprogramadaDesde.inicio) : "—"}{p.reprogramadaDesde.fin ? ` → ${dia(p.reprogramadaDesde.fin)}` : ""}</span></Dato>}
                <Dato rotulo="Creada">{p.creadaEl ? diaYHora(p.creadaEl) : "—"}</Dato>
                {p.pausadaPorAdmin && <Dato rotulo="Pausa">La pausó un administrador</Dato>}
                {p.creditoVinculado > 0 && <Dato rotulo="Saldo vinculado">{$(p.creditoVinculado)}</Dato>}
              </dl>
            </Tarjeta>

            <Tarjeta titulo="El pago">
              {e.pago ? (
                <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                  <Dato rotulo="Monto"><span className="tabular-nums">{$(e.pago.monto)}</span> {e.pago.moneda}</Dato>
                  <Dato rotulo="Estado">{estado(e.pago.estado)}</Dato>
                  <Dato rotulo="Medio">{e.pago.medio}{e.pago.mercadoPago.id ? ` · MP ${e.pago.mercadoPago.id}` : ""}{e.pago.mercadoPago.estado ? ` (${e.pago.mercadoPago.estado})` : ""}</Dato>
                  <Dato rotulo="Confirmado">{e.pago.confirmadoPor || <span className="text-red-700 dark:text-red-400">nadie lo confirmó</span>}</Dato>
                  <Dato rotulo="Pagó"><PersonaEnlace p={e.pago.pagador} /></Dato>
                  {e.pago.aprobadoPor && (
                    <Dato rotulo="Aprobó">
                      <PersonaEnlace p={e.pago.aprobadoPor} />
                      {e.pago.aprobadoPorElPagador && <strong className="block text-xs text-amber-700 dark:text-amber-300">⚠ la misma cuenta que pagó</strong>}
                    </Dato>
                  )}
                  {e.pago.comision > 0 && <Dato rotulo="Comisión">{$(e.pago.comision)}</Dato>}
                  {e.pago.devuelto > 0 && <Dato rotulo="Devuelto por MP">{$(e.pago.devuelto)}</Dato>}
                  <Dato rotulo="Fecha">{e.pago.creadoEl ? diaYHora(e.pago.creadoEl) : "—"}</Dato>
                </dl>
              ) : p.pagadaConSaldo ? (
                <p className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Se pagó con saldo del dueño (hay un descuento de saldo por esta publicación).</p>
              ) : p.figuraPagada ? (
                <p className="flex items-start gap-2 text-sm font-medium text-red-700 dark:text-red-400"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Figura pagada, pero no hay pago registrado ni descuento de saldo: no se cobró.</p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><CircleDashed className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Todavía no se pagó.</p>
              )}
            </Tarjeta>

            <Tarjeta titulo="Quién hizo qué">
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                <Dato rotulo="Creó"><PersonaEnlace p={p.dueno} /></Dato>
                <Dato rotulo="Revisó">{p.revisadaPor ? <><PersonaEnlace p={p.revisadaPor} />{p.revisadaEl && <span className="text-xs text-slate-500"> · {diaYHora(p.revisadaEl)}</span>}</> : <span className="text-slate-500 dark:text-slate-400">nadie la revisó</span>}</Dato>
                {p.motivoDeRechazo && <Dato rotulo="Rechazo">{p.motivoDeRechazo}</Dato>}
                <Dato rotulo="Canceló">
                  {p.canceladaEl || p.canceladaPor || p.canceladaComo ? (
                    <>
                      <PersonaEnlace p={p.canceladaPor} vacio="no figura quién" />
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {p.canceladaComo ? `como ${p.canceladaComo === "owner" ? "dueño" : p.canceladaComo === "admin" ? "administrador" : p.canceladaComo}` : ""}
                        {p.canceladaEl ? ` · ${diaYHora(p.canceladaEl)}` : ""}
                      </span>
                      {p.motivoDeCancelacion && <span className="block text-xs">{p.motivoDeCancelacion}</span>}
                      {p.cancelacionDefinitiva && <span className="block text-xs font-semibold text-red-700 dark:text-red-400">Cancelación definitiva</span>}
                    </>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">no está cancelada</span>
                  )}
                </Dato>
              </dl>
            </Tarjeta>
          </div>
        )}

        {actual === "cronologia" && (
          <Tarjeta titulo="Qué pasó, en orden">
            {e.linea.length === 0 ? <Vacio texto="Sin eventos." /> : (
              <ol className="relative space-y-3 border-l border-slate-200 pl-5 dark:border-slate-700">
                {e.linea.map((ev, i) => (
                  <li key={i} className="relative text-sm">
                    <span className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${COLOR_DE_EVENTO[ev.tipo]}`} aria-hidden />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {diaYHora(ev.fecha)} · <span className="font-medium">{ROTULO_DE_EVENTO[ev.tipo]}</span>{ev.quien ? ` · ${ev.quien}` : ""}
                    </p>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {ev.titulo}
                      {typeof ev.monto === "number" && ev.monto !== 0 && <span className={`ml-2 tabular-nums ${ev.monto < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{$(ev.monto)}</span>}
                    </p>
                    {ev.detalle && <p className="text-slate-600 dark:text-slate-300">{ev.detalle}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Tarjeta>
        )}

        {actual === "dinero" && (
          <div className="space-y-4">
            <Tarjeta titulo="Movimientos de saldo que generó">
              {e.movimientos.length === 0 ? <Vacio texto="No generó movimientos de saldo." /> : (
                <Tabla
                  columnas={["Fecha", "Movimiento", "Cuenta", "Monto", "Saldo", "Estado"]}
                  filas={e.movimientos.map((m) => [
                    diaYHora(m.fecha),
                    <span key="d">
                      <strong>{TIPOS_DE_MOVIMIENTO[m.tipo] || m.tipo}</strong>
                      {m.sinPago && <span className="ml-1 rounded bg-red-100 px-1 text-[11px] font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-200">sin pago detrás</span>}
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{m.descripcion}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {m.origen ? `origen: ${m.origen}` : ""}
                        {m.hechoPor ? ` · lo hizo: ${m.hechoPor.persona?.nombre || m.hechoPor.tipo}${m.hechoPor.tipo && m.hechoPor.persona ? ` (${m.hechoPor.tipo})` : ""}` : ""}
                        {m.pagoId ? ` · pago ${m.pagoId.slice(0, 8)}…` : ""}
                      </span>
                    </span>,
                    <PersonaEnlace key="u" p={m.usuario} />,
                    <span key="m" className={`tabular-nums ${m.monto < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{$(m.monto)}</span>,
                    <span key="s" className="whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400">{m.estado === "pending" ? "a liquidar (no movió el saldo)" : `${$(m.saldoAntes)} → ${$(m.saldoDespues)}`}</span>,
                    estado(m.estado),
                  ])}
                />
              )}
            </Tarjeta>
            <Tarjeta titulo="Pagos de la publicación y de sus contratos">
              {!e.pago && e.pagosDeContratos.length === 0 ? <Vacio texto="No hay pagos registrados." /> : (
                <Tabla
                  columnas={["Fecha", "Tipo", "Monto", "Estado"]}
                  filas={[
                    ...(e.pago ? [[e.pago.creadoEl ? diaYHora(e.pago.creadoEl) : "—", "Publicación", <span key="a" className="tabular-nums">{$(e.pago.monto)}</span>, estado(e.pago.estado)]] : []),
                    ...e.pagosDeContratos.map((x) => [x.creadoEl ? diaYHora(x.creadoEl) : "—", x.tipo, <span key={x.id} className="tabular-nums">{$(x.monto)}</span>, estado(x.estado)]),
                  ]}
                />
              )}
            </Tarjeta>
          </div>
        )}

        {actual === "contratos" && (
          <Tarjeta titulo="Contratos de esta publicación">
            {e.contratos.length === 0 ? <Vacio texto="Todavía no hay contratos." /> : (
              <Tabla
                columnas={["Trabajador", "Estado", "Cobra", "Comisión", "Total", "Pago / garantía", "Confirmaron", ""]}
                filas={e.contratos.map((c) => [
                  <PersonaEnlace key="t" p={c.trabajador} />,
                  <span key="e">{estado(c.estado)}{c.canceladoPor && <span className="block text-xs text-slate-500">canceló: {c.canceladoPor.nombre}{c.motivoDeCancelacion ? ` · ${c.motivoDeCancelacion}` : ""}</span>}</span>,
                  <span key="p" className="tabular-nums">{$(c.precio)}</span>,
                  <span key="c" className="tabular-nums">{$(c.comision)}</span>,
                  <span key="to" className="tabular-nums font-semibold">{$(c.total)}</span>,
                  <span key="g" className="text-xs">{estado(c.pago)}<span className="block text-slate-500 dark:text-slate-400">{estado(c.garantia)}</span></span>,
                  <span key="co" className="text-xs">{c.confirmoElDueno ? "✔" : "✖"} dueño · {c.confirmoElTrabajador ? "✔" : "✖"} trabajador</span>,
                  <Link key="l" to={`/contracts/${c.id}/summary`} className={enlace}>Ver contrato</Link>,
                ])}
              />
            )}
          </Tarjeta>
        )}

        {actual === "postulaciones" && (
          <Tarjeta titulo="Postulaciones">
            {e.postulaciones.total === 0 ? <Vacio texto="Nadie se postuló." /> : (
              <ul className="flex flex-wrap gap-2 text-sm">
                {Object.entries(e.postulaciones.porEstado).map(([k, n]) => (
                  <li key={k} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-700 dark:text-slate-200">{estado(k)}: <strong>{n}</strong></li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}

        {actual === "auditoria" && (
          <Tarjeta titulo="Registro de acciones sobre esta publicación">
            {e.auditoria.length === 0 ? (
              <Vacio texto={hayGraves ? "No hay registro de acciones sobre esta publicación (las anteriores a la auditoría no quedaron anotadas)." : "Sin registros."} />
            ) : (
              <Tabla
                columnas={["Fecha", "Sobre", "Acción", "Quién", "Detalle"]}
                filas={e.auditoria.map((a) => [diaYHora(a.fecha), a.sobre, <span key="a" className="font-mono text-xs">{a.accion}</span>, a.quien || "—", a.descripcion])}
              />
            )}
          </Tarjeta>
        )}
      </PanelDePestana>
    </div>
  );
}
