import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ESTADOS_CON_CAMBIOS } from "@/components/contracts/SolicitudesDeCambioCard";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type Tipo = "modify" | "cancel";

interface ContratoResumen {
  id: string;
  status: string;
  clientId?: string;
  doerId?: string;
  client?: { id: string };
  doer?: { id: string };
  startDate?: string;
  endDate?: string;
  job?: { title?: string };
}

/**
 * Pedir un cambio o la cancelación de un contrato (`/contracts/:id/request-changes`).
 *
 * La pantalla no existía: el botón del chat apuntaba acá y el modal que debía crearla nunca se abría, así que no había
 * forma de pedir un cambio desde la web. Las reglas son las del servidor (`services/solicitudesDeCambio.ts`): la otra parte
 * responde, el precio no se cambia por acá y cancelar abre una cancelación de mutuo acuerdo que revisa un administrador.
 */
export default function ContractRequestChange() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [contrato, setContrato] = useState<ContratoResumen | null | undefined>(undefined);
  const [tipo, setTipo] = useState<Tipo>("modify");
  const [motivo, setMotivo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [enviada, setEnviada] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) return;
    let vigente = true;
    fetch(`${API_URL}/contracts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => vigente && setContrato(d?.success === true ? (d.contract as ContratoResumen) : null))
      .catch(() => vigente && setContrato(null));
    return () => {
      vigente = false;
    };
  }, [id, token]);

  const esParte = !!contrato && !!user && [contrato.client?.id ?? contrato.clientId, contrato.doer?.id ?? contrato.doerId].map(String).includes(String(user.id));
  const admite = !!contrato && ESTADOS_CON_CAMBIOS.includes(contrato.status);
  const sinEmpezar = !!contrato && contrato.status !== "in_progress";

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (motivo.trim().length < 5) return setError("Contá brevemente el motivo (al menos 5 caracteres).");
    const body: Record<string, unknown> = { contractId: id, type: tipo, reason: motivo.trim() };
    if (tipo === "modify") {
      if (!inicio && !fin && !nota.trim()) return setError("Indicá qué querés cambiar: la fecha de inicio, la de fin o una nota.");
      body.newTerms = {
        ...(inicio ? { startDate: new Date(inicio).toISOString() } : {}),
        ...(fin ? { endDate: new Date(fin).toISOString() } : {}),
        ...(nota.trim() ? { description: nota.trim() } : {}),
      };
    }
    setEnviando(true);
    try {
      const r = await fetch(`${API_URL}/contract-change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.success === true) setEnviada(data.changeRequest?.id ?? "");
      else setError(data.message || "No se pudo enviar la solicitud. Probá de nuevo.");
    } catch {
      setError("No se pudo conectar. Revisá tu conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const campo = "w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent";
  const tarjeta = "max-w-xl mx-auto p-4 sm:p-8";
  const caja = "bg-white dark:bg-slate-800 rounded-2xl shadow p-6 sm:p-8";

  let cuerpo: React.ReactNode;
  if (contrato === undefined) {
    cuerpo = <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;
  } else if (contrato === null || !esParte) {
    cuerpo = (
      <div className="text-center">
        <p className="text-slate-700 dark:text-slate-200 mb-4">No encontramos ese contrato, o no sos parte de él.</p>
        <Link to="/contracts" className="text-sky-600 underline">Ir a mis contratos</Link>
      </div>
    );
  } else if (!admite) {
    cuerpo = (
      <div className="text-center">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <p className="text-slate-700 dark:text-slate-200 mb-4">Este contrato ya no admite cambios: está terminado, cancelado, en revisión o en disputa.</p>
        <Link to={`/contracts/${id}`} className="text-sky-600 underline">Volver al contrato</Link>
      </div>
    );
  } else if (enviada !== null) {
    cuerpo = (
      <div className="text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Solicitud enviada</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          La otra parte tiene 2 días para responder. Si no responde, la solicitud pasa a soporte.
        </p>
        <button onClick={() => navigate(`/contracts/${id}`)} className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium">
          Volver al contrato
        </button>
      </div>
    );
  } else {
    cuerpo = (
      <form onSubmit={enviar} className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Pedir un cambio al contrato</h1>
          {!!contrato.job?.title && <p className="text-sm text-slate-500 dark:text-slate-400">{contrato.job.title}</p>}
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex gap-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <p>La otra parte tiene que aceptar. Si no responde en 2 días, la solicitud pasa a soporte.</p>
        </div>

        <fieldset>
          <legend className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Qué querés pedir</legend>
          <div className="flex gap-3">
            {([["modify", "Cambiar fechas o agregar una nota"], ["cancel", "Cancelar el contrato"]] as const).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTipo(valor)}
                aria-pressed={tipo === valor}
                className={`flex-1 px-3 py-3 rounded-lg text-sm font-semibold transition-all ${
                  tipo === valor
                    ? valor === "cancel" ? "bg-red-600 text-white shadow" : "bg-sky-600 text-white shadow"
                    : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-2 border-slate-300 dark:border-slate-600"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="motivo" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Motivo {tipo === "cancel" ? "de la cancelación" : "del cambio"}
          </label>
          <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} rows={4} className={`${campo} resize-none`} />
        </div>

        {tipo === "modify" ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Podés pedir mover la fecha de fin, la de inicio (solo antes de empezar) o agregar una nota. El precio no se cambia desde acá:
              escribinos desde el <Link to="/help" className="underline">Centro de ayuda</Link>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sinEmpezar && (
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nuevo inicio
                  <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className={`mt-1 ${campo}`} />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Nuevo fin
                <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className={`mt-1 ${campo}`} />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nota (opcional)
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={2} className={`mt-1 ${campo} resize-none`} />
            </label>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Si la otra parte acepta, se abre una cancelación de mutuo acuerdo que revisa un administrador: es quien resuelve el dinero según los
            términos. El contrato sigue como está hasta entonces.
          </p>
        )}

        {!!error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Link to={`/contracts/${id}`} className="flex-1 text-center px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-medium">
            Volver
          </Link>
          <button
            type="submit"
            disabled={enviando}
            className={`flex-1 px-5 py-2.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60 ${tipo === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-sky-600 hover:bg-sky-700"}`}
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Enviar solicitud
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <Helmet>
        <title>Pedir un cambio al contrato - DOAPP</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className={tarjeta}>
        <div className={caja}>{cuerpo}</div>
      </div>
    </>
  );
}
