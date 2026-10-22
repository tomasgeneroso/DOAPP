import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowLeft, Briefcase, CheckCircle2, CircleDashed, FileText, FolderOpen, History, Loader2, Wallet, XCircle, User as UserIcon,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { BarraDePestanas, PanelDePestana, usePestana, type Pestana } from "../../components/admin/Pestanas";
import KycMediaViewer from "../../components/admin/KycMediaViewer";
import HistorialUsuario from "./HistorialUsuario";
import { Etiqueta, Tarjeta, Vacio, Tabla } from "../../components/admin/PiezasDeFicha";
import { $, dia, diaYHora, estado, enlace } from "../../components/admin/formatosDeFicha";

const API_URL = import.meta.env.VITE_API_URL || "/api";

interface Expediente {
  usuario: {
    id: string; name: string; email: string; phone: string | null; avatar: string | null; role: string; adminRole: string | null;
    membershipType: string | null; createdAt: string; isBanned: boolean; banReason: string | null; bannedAt: string | null;
    balanceArs: number; rating: number | null;
  };
  documentos: {
    correo: { verificado: boolean };
    telefono: { verificado: boolean; numero: string | null };
    identidad: {
      verificada: boolean; dni: string | null; estadoKyc: string | null; verificadaEl: string | null; intentos: number;
      tieneVerificacionDidit: boolean; tieneFotosDelDocumento: boolean;
      fotosLocales: { dniPhotoFront?: string; dniPhotoBack?: string; selfieUrl?: string };
    };
    selfie: { cargada: boolean };
    matricula: { verificada: boolean; estado: string | null; vence: string | null; motivoRechazo: string | null; cargada: boolean };
    seguro: { verificado: boolean; estado: string | null; motivoRechazo: string | null; cargado: boolean };
  };
  contratos: Array<{
    id: string; estado: string; precio: number; creadoEl: string; rol: "cliente" | "trabajador";
    trabajo: { id: string; title: string } | null; cliente: { id: string; name: string } | null; trabajador: { id: string; name: string } | null;
  }>;
  trabajos: Array<{ id: string; title: string; estado: string; precio: number; creadoEl: string }>;
  dinero: {
    movimientos: Array<{ id: string; tipo: string; monto: number; estado: string; descripcion: string; saldoDespues: number; fecha: string; disponibleDesde: string | null; fueraDelSaldo: boolean; origen?: string | null; hechoPor?: { tipo: string | null; id: string | null } | null; trabajoId?: string | null; pagoId?: string | null; sinPago?: boolean }>;
    retiros: Array<{ id: string; monto: number; estado: string; pedidoEl: string; completadoEl: string | null; motivoRechazo: string | null }>;
    pagos: Array<{ id: string; monto: number; moneda: string; estado: string; tipo: string; rol: string; contractId: string | null; fecha: string }>;
  };
  actividad: Array<{ id: string; fecha: string; accion: string; descripcion: string; severidad: string; quien: { id: string; name: string } | null }>;
  avisos: string[];
}


/** De dónde salió un movimiento de saldo y quién lo hizo (cancelación, retiro, pago con saldo...), y una alerta si una devolución no tiene pago detrás. */
function procedencia(m: { origen?: string | null; hechoPor?: { tipo: string | null; id: string | null } | null; trabajoId?: string | null; pagoId?: string | null; sinPago?: boolean }) {
  if (!m.origen && !m.hechoPor && !m.trabajoId) return null;
  const partes = [m.origen ? `origen: ${m.origen}` : null, m.hechoPor?.tipo ? `lo hizo: ${m.hechoPor.tipo}${m.hechoPor.id ? ` (${m.hechoPor.id.slice(0, 8)}…)` : ""}` : null, m.pagoId ? `pago ${m.pagoId.slice(0, 8)}…` : null].filter(Boolean);
  return (
    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
      {partes.join(" · ")}
      {m.trabajoId && <>{partes.length > 0 ? " · " : ""}<Link to={`/admin/jobs/${m.trabajoId}/expediente`} className={enlace}>ver el expediente de la publicación</Link></>}
      {m.sinPago && <strong className="ml-1 text-red-700 dark:text-red-400">⚠ sin pago registrado detrás</strong>}
    </span>
  );
}

/**
 * La ficha de un usuario: todo lo que administración necesita saber de una persona en un solo lugar, en vez de saltar entre la lista de
 * usuarios, el historial, los padrones y el registro de acciones. Datos, historial, contratos, trabajos, documentos, dinero y actividad.
 */
export default function FichaUsuario() {
  const { userId } = useParams<{ userId: string }>();
  // Con otra persona se vuelve a montar entera: la ficha anterior no queda a la vista mientras carga la nueva.
  return <Ficha key={userId} userId={userId || ""} />;
}

function Ficha({ userId }: { userId: string }) {
  const { token } = useAuth();
  const [e, setE] = useState<Expediente | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/admin/users/${userId}/expediente`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => (d.success ? setE(d.data) : setError(d.message || "No se pudo cargar la ficha")))
      .catch(() => setError("No se pudo cargar la ficha"));
  }, [userId, token]);

  const pestanas: Pestana[] = [
    { id: "resumen", rotulo: "Resumen", icono: UserIcon },
    { id: "historial", rotulo: "Historial", icono: History },
    { id: "contratos", rotulo: "Contratos", icono: FileText, insignia: e?.contratos.length || undefined },
    { id: "trabajos", rotulo: "Trabajos", icono: Briefcase, insignia: e?.trabajos.length || undefined },
    { id: "documentos", rotulo: "Documentos", icono: FolderOpen },
    { id: "dinero", rotulo: "Dinero", icono: Wallet },
    { id: "actividad", rotulo: "Actividad", icono: Activity, insignia: e?.actividad.length || undefined },
  ];
  const [actual, cambiar] = usePestana(pestanas);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Link to="/admin/users" className={enlace}>Volver a usuarios</Link>
      </div>
    );
  }
  if (!e) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-label="Cargando" /></div>;

  const u = e.usuario;
  const d = e.documentos;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Usuarios
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        {u.avatar ? (
          <img src={u.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-600 text-lg font-semibold text-white">{u.name.substring(0, 2).toUpperCase()}</div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-white">{u.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{u.email} · en DOAPP desde {dia(u.createdAt)}</p>
        </div>
        {u.isBanned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Baneado
          </span>
        )}
      </header>

      {e.avisos.length > 0 && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          Algunas secciones no se pudieron cargar y se muestran vacías: {e.avisos.join(" · ")}
        </p>
      )}

      <BarraDePestanas pestanas={pestanas} actual={actual} onCambiar={cambiar} etiqueta={`Ficha de ${u.name}`} />

      <PanelDePestana id={actual}>
        {actual === "resumen" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Tarjeta titulo="Datos">
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">Rol</dt><dd className="text-slate-800 dark:text-slate-100">{u.adminRole ? `${u.role} · ${u.adminRole}` : u.role}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Plan</dt><dd className="text-slate-800 dark:text-slate-100">{u.membershipType || "—"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Teléfono</dt><dd className="text-slate-800 dark:text-slate-100">{u.phone || "—"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Calificación</dt><dd className="text-slate-800 dark:text-slate-100">{u.rating ?? "—"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Saldo</dt><dd className="tabular-nums text-slate-800 dark:text-slate-100">{$(u.balanceArs)}</dd>
              </dl>
              {u.isBanned && (
                <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300">
                  Baneado el {dia(u.bannedAt)}{u.banReason ? `: ${u.banReason}` : ""}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link to={`/profile/${u.id}`} className={enlace}>Ver perfil público</Link>
                <Link to={`/admin/users?search=${u.id}`} className={enlace}>Gestionar (banear, verificar, plan)</Link>
                <Link to={`/admin/analytics/user/${u.id}`} className={enlace}>Actividad en la app</Link>
              </div>
            </Tarjeta>

            <Tarjeta titulo="Verificaciones">
              <ul className="space-y-1.5 text-sm">
                <li><Etiqueta ok={d.correo.verificado} si="Correo verificado" no="Correo sin verificar" pendiente /></li>
                <li><Etiqueta ok={d.telefono.verificado} si="Teléfono verificado" no="Teléfono sin verificar" /></li>
                <li><Etiqueta ok={d.identidad.verificada} si="Identidad verificada" no={d.identidad.estadoKyc ? `Identidad: ${d.identidad.estadoKyc}` : "Identidad sin verificar"} pendiente={!!d.identidad.estadoKyc} /></li>
                <li><Etiqueta ok={d.matricula.verificada} si="Matrícula verificada" no={d.matricula.cargada ? "Matrícula a revisar" : "Sin matrícula"} pendiente={d.matricula.cargada} /></li>
                <li><Etiqueta ok={d.seguro.verificado} si="Seguro verificado" no={d.seguro.cargado ? "Seguro a revisar" : "Sin seguro"} pendiente={d.seguro.cargado} /></li>
              </ul>
              <button type="button" onClick={() => cambiar("documentos")} className={`mt-3 text-sm ${enlace}`}>Ver documentos</button>
            </Tarjeta>

            <Tarjeta titulo="De un vistazo">
              <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
                <li>{e.contratos.length} contratos ({e.contratos.filter((c) => c.rol === "cliente").length} como cliente, {e.contratos.filter((c) => c.rol === "trabajador").length} como trabajador)</li>
                <li>{e.trabajos.length} trabajos publicados</li>
                <li>{e.dinero.retiros.length} retiros pedidos · {e.dinero.pagos.length} pagos</li>
                <li>{e.actividad.length} acciones de administración sobre esta cuenta</li>
              </ul>
            </Tarjeta>
          </div>
        )}

        {actual === "historial" && <HistorialUsuario incrustado />}

        {actual === "contratos" && (
          e.contratos.length === 0 ? <Vacio texto="Todavía no tiene contratos." /> : (
            <Tabla
              columnas={["Fecha", "Trabajo", "Rol", "Con", "Estado", "Precio"]}
              filas={e.contratos.map((c) => [
                dia(c.creadoEl),
                c.trabajo ? <Link key="t" to={`/jobs/${c.trabajo.id}`} className={enlace}>{c.trabajo.title}</Link> : "—",
                c.rol === "cliente" ? "Cliente" : "Trabajador",
                (c.rol === "cliente" ? c.trabajador?.name : c.cliente?.name) || "—",
                estado(c.estado),
                <span key="p" className="tabular-nums">{$(c.precio)}</span>,
              ])}
            />
          )
        )}

        {actual === "trabajos" && (
          e.trabajos.length === 0 ? <Vacio texto="No publicó trabajos." /> : (
            <Tabla
              columnas={["Fecha", "Trabajo", "Estado", "Precio"]}
              filas={e.trabajos.map((j) => [
                dia(j.creadoEl),
                <span key="t"><Link to={`/jobs/${j.id}`} className={enlace}>{j.title}</Link><Link to={`/admin/jobs/${j.id}/expediente`} className={`ml-3 text-xs ${enlace}`}>Expediente</Link></span>,
                estado(j.estado),
                <span key="p" className="tabular-nums">{$(j.precio)}</span>,
              ])}
            />
          )
        )}

        {actual === "documentos" && (
          <div className="space-y-4">
            <Tarjeta titulo="Identidad (DNI y selfie)">
              <dl className="mb-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">DNI</dt><dd className="text-slate-800 dark:text-slate-100">{d.identidad.dni || "—"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Estado</dt><dd className="text-slate-800 dark:text-slate-100">{d.identidad.verificada ? "Verificada" : d.identidad.estadoKyc || "Sin verificar"}{d.identidad.verificadaEl ? ` el ${dia(d.identidad.verificadaEl)}` : ""}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Intentos fallidos</dt><dd className="text-slate-800 dark:text-slate-100">{d.identidad.intentos}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Selfie</dt><dd className="text-slate-800 dark:text-slate-100">{d.selfie.cargada ? "Cargada" : "No cargada"}</dd>
              </dl>
              {(d.identidad.tieneVerificacionDidit || d.identidad.tieneFotosDelDocumento || d.selfie.cargada) ? (
                <KycMediaViewer userId={u.id} hasDiditSession={d.identidad.tieneVerificacionDidit} localPhotos={d.identidad.fotosLocales} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No hay fotos ni verificación para mostrar.</p>
              )}
            </Tarjeta>

            <Tarjeta titulo="Matrícula" derecha={<Link to={`/admin/users?search=${u.id}`} className={`text-xs ${enlace}`}>Revisar en la lista</Link>}>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {d.matricula.verificada ? "Verificada" : d.matricula.cargada ? `Cargada, ${d.matricula.estado === "rejected" ? "rechazada" : "a revisar"}` : "No cargó matrícula"}
                {d.matricula.vence ? ` · vence ${dia(d.matricula.vence)}` : ""}
              </p>
              {d.matricula.motivoRechazo && <p className="mt-1 text-sm text-red-700 dark:text-red-300">Motivo del rechazo: {d.matricula.motivoRechazo}</p>}
            </Tarjeta>

            <Tarjeta titulo="Seguro" derecha={<Link to={`/admin/users?search=${u.id}`} className={`text-xs ${enlace}`}>Revisar en la lista</Link>}>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {d.seguro.verificado ? "Verificado" : d.seguro.cargado ? `Cargado, ${d.seguro.estado === "rejected" ? "rechazado" : "a revisar"}` : "No cargó seguro"}
              </p>
              {d.seguro.motivoRechazo && <p className="mt-1 text-sm text-red-700 dark:text-red-300">Motivo del rechazo: {d.seguro.motivoRechazo}</p>}
            </Tarjeta>
          </div>
        )}

        {actual === "dinero" && (
          <div className="space-y-5">
            <Tarjeta titulo="Movimientos de saldo" derecha={<span className="text-xs text-slate-500 dark:text-slate-400">Saldo actual {$(u.balanceArs)}</span>}>
              {e.dinero.movimientos.length === 0 ? <Vacio texto="Sin movimientos." /> : (
                <Tabla
                  columnas={["Fecha", "Detalle", "Monto", "Saldo después", "Estado"]}
                  filas={e.dinero.movimientos.map((m) => [
                    dia(m.fecha),
                    <span key="d">{m.descripcion}{procedencia(m)}{m.fueraDelSaldo && <em className="ml-1 text-xs text-slate-500">(pagado por fuera, no mueve el saldo)</em>}{m.disponibleDesde && new Date(m.disponibleDesde) > new Date() && <em className="ml-1 text-xs text-amber-700 dark:text-amber-400">(retirable desde {dia(m.disponibleDesde)})</em>}</span>,
                    <span key="m" className={`tabular-nums ${m.monto < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{$(m.monto)}</span>,
                    <span key="s" className="tabular-nums">{$(m.saldoDespues)}</span>,
                    estado(m.estado),
                  ])}
                />
              )}
            </Tarjeta>
            <Tarjeta titulo="Retiros">
              {e.dinero.retiros.length === 0 ? <Vacio texto="Nunca pidió un retiro." /> : (
                <Tabla
                  columnas={["Pedido", "Monto", "Estado", "Completado"]}
                  filas={e.dinero.retiros.map((r) => [dia(r.pedidoEl), <span key="m" className="tabular-nums">{$(r.monto)}</span>, <span key="e">{estado(r.estado)}{r.motivoRechazo ? ` — ${r.motivoRechazo}` : ""}</span>, dia(r.completadoEl)])}
                />
              )}
            </Tarjeta>
            <Tarjeta titulo="Pagos">
              {e.dinero.pagos.length === 0 ? <Vacio texto="Sin pagos." /> : (
                <Tabla
                  columnas={["Fecha", "Tipo", "Participó", "Monto", "Estado"]}
                  filas={e.dinero.pagos.map((p) => [dia(p.fecha), p.tipo, p.rol, <span key="m" className="tabular-nums">{$(p.monto)} {p.moneda}</span>, estado(p.estado)])}
                />
              )}
            </Tarjeta>
          </div>
        )}

        {actual === "actividad" && (
          e.actividad.length === 0 ? <Vacio texto="Ninguna acción de administración registrada sobre esta cuenta." /> : (
            <Tabla
              columnas={["Cuándo", "Acción", "Quién"]}
              filas={e.actividad.map((a) => [
                diaYHora(a.fecha),
                <span key="a"><strong className="font-medium">{a.accion}</strong><br /><span className="text-xs text-slate-500 dark:text-slate-400">{a.descripcion}</span></span>,
                a.quien?.name || "Sistema",
              ])}
            />
          )
        )}
      </PanelDePestana>
    </div>
  );
}
