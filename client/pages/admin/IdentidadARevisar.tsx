import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IdCard, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Cuentas que verificaron con Didit un DNI que YA usa otra cuenta.
 *
 * El DNI es la clave de la cuenta y no se repite, así que el sistema no cambia nada y deja el aviso (evento KYC_DNI_EN_USO). Acá
 * una persona de administración decide: casi siempre es una cuenta duplicada de la misma persona (hay que unificarlas o dar de
 * baja una), a veces un DNI mal tipeado en la otra, y rara vez un intento de identidad ajena. Al dar el caso por revisado hay que
 * escribir qué se resolvió: queda en el registro de auditoría.
 */

interface Conflicto {
  userId: string;
  nombre: string;
  email: string;
  dniDeLaCuenta: string | null;
  dniDeDidit: string | null;
  dniVerificado: boolean;
  otraCuenta: { id: string; nombre: string; email: string; dniVerificado: boolean } | null;
  otraSigueConEseDni: boolean;
  detectadoEl: string;
  estado: "pendiente" | "revisado";
  revisadoEl?: string;
  nota?: string | null;
}

const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function IdentidadARevisar() {
  const { token } = useAuth();
  const [filas, setFilas] = useState<Conflicto[]>([]);
  const [revisados, setRevisados] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorNota, setErrorNota] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hubs/identidad-a-revisar${revisados ? "?revisados=1" : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "No se pudo cargar la lista");
      setFilas(data.data || []);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar la lista");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisados]);

  const revisar = async (userId: string) => {
    setGuardando(true);
    setErrorNota(null);
    try {
      const res = await fetch(`/api/admin/hubs/identidad-a-revisar/${userId}/revisar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nota }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "No se pudo guardar");
      setAbierta(null);
      setNota("");
      await cargar();
    } catch (e: any) {
      setErrorNota(e.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const pendientes = filas.filter((f) => f.estado === "pendiente").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <IdCard className="h-6 w-6 text-sky-600" /> Identidad a revisar
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Cuentas que verificaron con Didit un DNI que <strong>ya usa otra cuenta</strong>. El sistema no cambió nada: el DNI no se repite. Revisá si es una
            cuenta duplicada de la misma persona (unificá o dá de baja una), un DNI mal cargado en la otra, o un intento de usar una identidad ajena.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={revisados} onChange={(e) => setRevisados(e.target.checked)} />
            Ver también los revisados
          </label>
          <button onClick={() => void cargar()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      ) : filas.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          No hay cuentas con DNI repetido pendientes de revisión.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Cuenta que verificó</th>
                <th className="px-4 py-3">DNI de la cuenta</th>
                <th className="px-4 py-3">DNI que leyó Didit</th>
                <th className="px-4 py-3">La otra cuenta</th>
                <th className="px-4 py-3">Detectado</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.userId} className="border-t border-slate-100 align-top dark:border-slate-700">
                  <td className="px-4 py-3">
                    <Link to={`/admin/users/${f.userId}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">{f.nombre}</Link>
                    <div className="text-xs text-slate-500">{f.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono">{f.dniDeLaCuenta || <span className="text-slate-400">sin DNI</span>}</td>
                  <td className="px-4 py-3 font-mono">{f.dniDeDidit || "—"}</td>
                  <td className="px-4 py-3">
                    {f.otraCuenta ? (
                      <>
                        <Link to={`/admin/users/${f.otraCuenta.id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">{f.otraCuenta.nombre}</Link>
                        <div className="text-xs text-slate-500">{f.otraCuenta.email}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.otraCuenta.dniVerificado && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">DNI verificado</span>}
                          {!f.otraSigueConEseDni && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">ya no tiene ese DNI</span>}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{fecha(f.detectadoEl)}</td>
                  <td className="px-4 py-3">
                    {f.estado === "revisado" ? (
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Revisado</span>
                        <div>{fecha(f.revisadoEl)}</div>
                        {f.nota && <div className="mt-1 max-w-xs italic">«{f.nota}»</div>}
                      </div>
                    ) : abierta === f.userId ? (
                      <div className="w-64 space-y-2">
                        <textarea
                          value={nota}
                          onChange={(e) => setNota(e.target.value)}
                          rows={3}
                          placeholder="Qué se resolvió (mínimo 10 caracteres). Queda en el registro."
                          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                        />
                        {errorNota && <p className="text-xs text-red-600">{errorNota}</p>}
                        <div className="flex gap-2">
                          <button disabled={guardando} onClick={() => void revisar(f.userId)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                            {guardando ? "Guardando…" : "Guardar"}
                          </button>
                          <button onClick={() => { setAbierta(null); setNota(""); setErrorNota(null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-600">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAbierta(f.userId); setNota(""); setErrorNota(null); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                        Pendiente · marcar revisado
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!cargando && filas.length > 0 && <p className="text-xs text-slate-500">{pendientes} pendiente(s).</p>}
    </div>
  );
}
