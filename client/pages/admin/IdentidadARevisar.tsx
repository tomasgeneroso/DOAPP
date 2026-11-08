import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IdCard, Loader2, RefreshCw, CheckCircle2, Link2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Identidades para revisar. Dos motivos:
 *
 *  - DNI repetido: una cuenta verificó con Didit un DNI que YA usa otra. El DNI es la clave de la cuenta y no se repite, así que el sistema no cambia nada y
 *    deja el aviso (evento KYC_DNI_EN_USO).
 *  - Misma persona: el nombre y la fecha de nacimiento del documento coinciden con los de otra cuenta aunque el número de documento sea otro (la misma persona con
 *    su DNI y su pasaporte, o con el documento argentino y el italiano). El registro siguió normal; queda el aviso (evento IDENTIDAD_POSIBLE_DUPLICADA).
 *
 * Una persona de administración decide: casi siempre es una cuenta duplicada de la misma persona (hay que UNIRLAS), a veces un DNI mal tipeado en la otra, y rara vez
 * un intento de identidad ajena. Al dar el caso por revisado, o al unir las cuentas, hay que escribir el porqué: queda en el registro de auditoría.
 */

interface Conflicto {
  tipo: "dni_repetido" | "misma_persona";
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

const MOTIVO: Record<Conflicto["tipo"], { texto: string; clase: string }> = {
  dni_repetido: { texto: "DNI repetido", clase: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  misma_persona: { texto: "Misma persona (nombre y nacimiento)", clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
};

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

  // Unir cuentas
  const [uniendo, setUniendo] = useState<Conflicto | null>(null);
  const [principal, setPrincipal] = useState<"esta" | "otra">("otra");
  const [notaUnion, setNotaUnion] = useState("");
  const [confirmaMismaPersona, setConfirmaMismaPersona] = useState(false);
  const [unionEnCurso, setUnionEnCurso] = useState(false);
  const [errorUnion, setErrorUnion] = useState<string | null>(null);
  const [motivosUnion, setMotivosUnion] = useState<string[]>([]);

  const clave = (f: Conflicto) => `${f.tipo}:${f.userId}:${f.otraCuenta?.id ?? ""}`;

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hubs/identidad-a-revisar${revisados ? "?revisados=1" : ""}`, { credentials: "include", headers: { Authorization: `Bearer ${token}` } });
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

  const revisar = async (f: Conflicto) => {
    setGuardando(true);
    setErrorNota(null);
    try {
      const res = await fetch(`/api/admin/hubs/identidad-a-revisar/${f.userId}/revisar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nota, tipo: f.tipo, otraCuentaId: f.otraCuenta?.id }),
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

  const abrirUnion = (f: Conflicto) => {
    setUniendo(f);
    // Por defecto queda como principal la OTRA cuenta (la que ya estaba): la que acaba de verificar es la que se suma.
    setPrincipal("otra");
    setNotaUnion("");
    setConfirmaMismaPersona(false);
    setErrorUnion(null);
    setMotivosUnion([]);
  };

  const unir = async () => {
    if (!uniendo?.otraCuenta) return;
    setUnionEnCurso(true);
    setErrorUnion(null);
    setMotivosUnion([]);
    const principalId = principal === "esta" ? uniendo.userId : uniendo.otraCuenta.id;
    const secundariaId = principal === "esta" ? uniendo.otraCuenta.id : uniendo.userId;
    try {
      const res = await fetch("/api/admin/hubs/identidad-a-revisar/unir", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ principalId, secundariaId, nota: notaUnion, confirmarMismaPersona: confirmaMismaPersona }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setErrorUnion(data.message || "No se pudieron unir las cuentas");
        setMotivosUnion(Array.isArray(data.motivos) ? data.motivos.filter((m: string) => !m.startsWith("no_coincide")) : []);
        if (Array.isArray(data.motivos) && data.motivos.includes("no_coincide_la_clave")) setConfirmaMismaPersona(false);
        return;
      }
      setUniendo(null);
      await cargar();
    } catch (e: any) {
      setErrorUnion(e.message || "No se pudieron unir las cuentas");
    } finally {
      setUnionEnCurso(false);
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
            Cuentas que verificaron un documento que <strong>ya usa otra cuenta</strong> (DNI repetido) o cuyo <strong>nombre y fecha de nacimiento coinciden</strong> con los de otra
            (la misma persona con otro documento: doble ciudadanía o una cuenta duplicada). El registro siguió normal y el sistema no cambió nada. Si es la misma persona, <strong>uní las
            cuentas</strong>; si no, marcá el caso como revisado y escribí por qué.
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
          No hay identidades pendientes de revisión.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Cuenta que verificó</th>
                <th className="px-4 py-3">DNI de la cuenta</th>
                <th className="px-4 py-3">DNI que leyó Didit</th>
                <th className="px-4 py-3">La otra cuenta</th>
                <th className="px-4 py-3">Detectado</th>
                <th className="px-4 py-3">Qué hacer</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={clave(f)} className="border-t border-slate-100 align-top dark:border-slate-700">
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${MOTIVO[f.tipo].clase}`}>{MOTIVO[f.tipo].texto}</span>
                  </td>
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
                          {f.otraCuenta.dniVerificado && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Identidad verificada</span>}
                          {f.tipo === "dni_repetido" && !f.otraSigueConEseDni && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">ya no tiene ese DNI</span>}
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
                    ) : abierta === clave(f) ? (
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
                          <button disabled={guardando} onClick={() => void revisar(f)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                            {guardando ? "Guardando…" : "Guardar"}
                          </button>
                          <button onClick={() => { setAbierta(null); setNota(""); setErrorNota(null); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-600">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-2">
                        {f.otraCuenta && (
                          <button onClick={() => abrirUnion(f)} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">
                            <Link2 className="h-3.5 w-3.5" /> Unir cuentas
                          </button>
                        )}
                        <button onClick={() => { setAbierta(clave(f)); setNota(""); setErrorNota(null); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                          No son la misma · marcar revisado
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!cargando && filas.length > 0 && <p className="text-xs text-slate-500">{pendientes} pendiente(s).</p>}

      {uniendo && uniendo.otraCuenta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="unir-titulo">
          <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="flex items-start justify-between gap-3">
              <h2 id="unir-titulo" className="text-lg font-bold text-slate-900 dark:text-white">Unir cuentas de la misma persona</h2>
              <button onClick={() => setUniendo(null)} aria-label="Cerrar" className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Elegí cuál cuenta queda como <strong>principal</strong>. La otra deja de iniciar sesión; su historial se conserva y no se mueve nada. Solo se pueden unir si la que
              se une no tiene saldo, contratos, trabajos ni retiros sin resolver. <strong>Sus contratos libres de comisión no se suman a la principal.</strong>
            </p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Cuenta principal</legend>
              {([
                ["otra", uniendo.otraCuenta.nombre, uniendo.otraCuenta.email],
                ["esta", uniendo.nombre, uniendo.email],
              ] as const).map(([valor, nombre, correo]) => (
                <label key={valor} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${principal === valor ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20" : "border-slate-200 dark:border-slate-600"}`}>
                  <input type="radio" name="principal" checked={principal === valor} onChange={() => setPrincipal(valor)} />
                  <span>
                    <strong>{nombre}</strong> <span className="text-slate-500">· {correo}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">{principal === valor ? "queda como principal" : "se une a la principal"}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <textarea
              value={notaUnion}
              onChange={(e) => setNotaUnion(e.target.value)}
              rows={3}
              placeholder="Por qué se unen (mínimo 10 caracteres). Queda en el registro."
              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
            {uniendo.tipo === "dni_repetido" && (
              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" className="mt-1" checked={confirmaMismaPersona} onChange={(e) => setConfirmaMismaPersona(e.target.checked)} />
                Confirmo que son la misma persona aunque los documentos no lo muestren por sí solos.
              </label>
            )}
            {errorUnion && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                <p className="font-semibold">{errorUnion}</p>
                {motivosUnion.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {motivosUnion.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setUniendo(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-600">Cancelar</button>
              <button disabled={unionEnCurso} onClick={() => void unir()} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
                {unionEnCurso && <Loader2 className="h-4 w-4 animate-spin" />} Unir cuentas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
