import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, FileText } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { estadoDePublicacion } from "../../../shared/jobs/estadoDePublicacion";
import { borrarBorrador, haceCuanto, leerBorrador } from "../../utils/borradorDeTrabajo";

interface TrabajoPropio {
  id: string;
  title: string;
  status: string;
}

/**
 * Las publicaciones propias que todavía NO están en el muro (sin pagar, con el pago en proceso, en revisión o pausadas).
 *
 * El muro solo muestra lo publicado: quien acaba de publicar no ve su trabajo ahí y no sabe por qué. Este aviso, arriba de la
 * lista, dice cuáles son, en qué están y qué sigue, con el enlace a «Mis trabajos». Si no hay ninguna, no se dibuja nada.
 */
const ESTADOS_QUE_NO_SE_VEN = ["draft", "pending_payment", "pending_approval", "paused"];

export default function MisPublicacionesSinPublicar() {
  const { token, user } = useAuth() as any;
  const [pendientes, setPendientes] = useState<TrabajoPropio[]>([]);
  // El borrador de un trabajo a medio crear vive en este navegador (utils/borradorDeTrabajo.ts).
  const [borrador, setBorrador] = useState(() => (user?.id ? leerBorrador(String(user.id)) : null));

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetch("/api/jobs/my-jobs", { credentials: "include", headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d?.success || !Array.isArray(d.jobs)) return;
        setPendientes(d.jobs.filter((j: TrabajoPropio) => ESTADOS_QUE_NO_SE_VEN.includes(j.status)).slice(0, 20));
      })
      .catch(() => {
        /* es un aviso informativo: sin respuesta no se muestra */
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  const descartarBorrador = () => {
    if (user?.id) borrarBorrador(String(user.id));
    setBorrador(null);
  };

  if (pendientes.length === 0 && !borrador) return null;

  const bloqueDelBorrador = borrador && (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-900 dark:text-amber-100 ${pendientes.length > 0 ? "mt-3 border-t border-amber-200 pt-3 dark:border-amber-800" : ""}`}>
      <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" aria-hidden="true" />
      <span className="font-medium">{borrador.title.trim() || "Trabajo sin título"}</span>
      <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium">Borrador sin publicar</span>
      <span className="text-xs text-amber-800/90 dark:text-amber-200/80">Guardado {haceCuanto(borrador.guardadoEl)}</span>
      <Link to="/contracts/create" className="text-xs font-semibold underline underline-offset-2">Continuar</Link>
      <button type="button" onClick={descartarBorrador} className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100">Descartar</button>
    </div>
  );

  // Solo hay un borrador y ningún trabajo pendiente: se muestra solo, sin el encabezado de «publicaciones que no están en el muro».
  if (pendientes.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 animate-fadeIn" role="status">
        {bloqueDelBorrador}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 animate-fadeIn" role="status">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {pendientes.length === 1 ? "Tenés 1 publicación que todavía no está en el muro" : `Tenés ${pendientes.length} publicaciones que todavía no están en el muro`}
      </p>
      <ul className="mt-2 space-y-1.5">
        {pendientes.slice(0, 3).map((j) => {
          const e = estadoDePublicacion(j);
          return (
            <li key={j.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-900 dark:text-amber-100">
              <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" aria-hidden="true" />
              <Link to="/my-jobs" className="font-medium underline-offset-2 hover:underline">{j.title}</Link>
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium">{e.etiqueta}</span>
              <span className="text-xs text-amber-800/90 dark:text-amber-200/80">{e.explicacion}</span>
              {e.accion && <Link to={e.accion.ruta} className="text-xs font-semibold underline underline-offset-2">{e.accion.texto}</Link>}
            </li>
          );
        })}
      </ul>
      <Link to="/my-jobs" className="mt-3 inline-block text-sm font-semibold text-amber-900 dark:text-amber-200 underline underline-offset-2">
        Ver todos en Mis trabajos
      </Link>
      {bloqueDelBorrador}
    </div>
  );
}
