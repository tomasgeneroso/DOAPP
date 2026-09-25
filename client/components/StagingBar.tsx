import { useEffect, useState } from "react";
import { FlaskConical, Rocket, Loader2, X, AlertTriangle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "./ui/Toast";

/**
 * La barra que avisa que esto no es producción, y el botón que promueve.
 *
 * Por qué está siempre visible y no escondida en el panel de admin: el riesgo
 * real de tener una copia idéntica de la app no es técnico, es que alguien
 * pruebe en staging creyendo que está en producción —o al revés— y reporte,
 * compre o cancele en el lugar equivocado. Una franja fija abajo, del color
 * más molesto disponible, cuesta poco y resuelve eso.
 *
 * El botón de promover sólo lo ve el dueño, y aun así pide la contraseña de
 * acción: publicar una versión a todos los usuarios no puede depender de que
 * una sesión haya quedado abierta.
 *
 * En producción este componente no dibuja nada. No se apoya en una variable de
 * build para saberlo —si dependiera del build, staging y producción serían dos
 * artefactos distintos y se pierde todo el sentido de tener staging— sino en
 * lo que el propio servidor contesta en tiempo de ejecución.
 */

interface Info {
  entorno: "desarrollo" | "staging" | "produccion";
  commit?: string;
  commitCorto?: string;
  rama?: string;
  fechaDelCommit?: string;
  asunto?: string;
  arrancado?: string;
}

export default function StagingBar() {
  const { user, token } = useAuth();
  const toast = useToast();

  const [info, setInfo] = useState<Info | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [salida, setSalida] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/deploy/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j?.data) setInfo(j.data);
      })
      .catch(() => {
        // Sin respuesta no se dibuja nada. Una barra informativa no puede ser
        // el motivo por el que una pantalla se rompe.
      });
    return () => {
      vivo = false;
    };
  }, []);

  const esStaging = info?.entorno === "staging";

  /**
   * La barra es `fixed`, así que tapa el final de la página. Se compensa con
   * relleno en el `body` en vez de tocar cada pantalla: son 60 y ninguna
   * debería saber que esto existe.
   */
  useEffect(() => {
    if (!esStaging) return;
    const antes = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "3.25rem";
    return () => {
      document.body.style.paddingBottom = antes;
    };
  }, [esStaging]);

  if (!esStaging) return null;

  // `adminRole`, no `role`: el rol administrativo viaja aparte del rol de uso
  // (cliente / trabajador), y es el que decide quién puede publicar.
  const esDueno = user?.adminRole === "owner";

  async function promover() {
    if (!info?.commit) return;
    setEnviando(true);
    setSalida(null);
    try {
      const res = await fetch("/api/admin/staging/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commit: info.commit, password }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        // El detalle del fallo se muestra entero: cuando un deploy se cae, lo
        // único que sirve es en qué paso se cayó.
        setSalida(json?.message || `Error ${res.status}`);
        toast.error("No se promovió", json?.message || `Error ${res.status}`);
        return;
      }

      setSalida(json?.data?.salida || json?.message || "Listo.");
      toast.success("Producción actualizada", json?.message);
      setPassword("");
    } catch (e: any) {
      // Un deploy tarda; si el navegador corta antes, lo peor es creer que no
      // pasó nada cuando sí pasó.
      setSalida(
        `La conexión se cortó antes de terminar (${e?.message || "sin detalle"}). ` +
          "Puede que el deploy haya seguido en el servidor: revisá el registro de auditoría " +
          "y pm2 antes de volver a intentar.",
      );
      toast.error("Se cortó la conexión", "Revisá el registro antes de reintentar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-[60] flex items-center gap-3 border-t border-amber-600 bg-amber-500 px-4 py-2 text-sm text-amber-950 shadow-[0_-2px_8px_rgba(0,0,0,.15)]"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
        role="status"
      >
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-semibold">STAGING</span>
        <span className="hidden sm:inline">— esto no es producción, nada de lo que hagas acá es real.</span>

        {info.commitCorto && (
          <span className="ml-auto hidden font-mono text-xs opacity-80 md:inline" title={info.asunto}>
            {info.rama}@{info.commitCorto}
          </span>
        )}

        {esDueno && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-950 md:ml-4"
          >
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            Promover a producción
          </button>
        )}
      </div>

      {abierto && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promover-titulo"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="promover-titulo" className="text-lg font-bold text-slate-900 dark:text-white">
                Promover a producción
              </h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/50">
              <p className="text-slate-600 dark:text-slate-300">
                Se va a publicar <strong>exactamente este commit</strong>, no la última versión de
                la rama:
              </p>
              <p className="mt-2 font-mono text-xs text-slate-900 dark:text-slate-100">
                {info.rama}@{info.commitCorto}
              </p>
              {info.asunto && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{info.asunto}</p>
              )}
            </div>

            <div className="mb-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Producción se reinicia y corre las migraciones pendientes. Si el build falla, la
                base no se toca y producción sigue con la versión anterior. Tarda varios minutos: no
                cierres esta pantalla.
              </span>
            </div>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="promover-password">
              Contraseña de promoción
            </label>
            <input
              id="promover-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No es la de tu sesión. Es la de esta acción en particular.
            </p>

            {salida && (
              <pre className="mt-4 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                {salida}
              </pre>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                disabled={enviando}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={promover}
                disabled={enviando || !password}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {enviando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Publicando…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" aria-hidden="true" />
                    Publicar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
