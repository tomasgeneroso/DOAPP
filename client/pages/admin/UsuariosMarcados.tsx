import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Usuarios con proporción alta de disputas, contracargos o cancelaciones sobre
 * lo que hicieron. No bloquea nada: es la lista que una persona mira antes de
 * resolver la próxima disputa o devolución de ese usuario.
 */

interface Perfil {
  userId: string;
  nombre: string;
  email: string;
  ventanaDias: number;
  contratos: number;
  contratosComoCliente: number;
  contratosComoTrabajador: number;
  disputasAbiertas: number;
  disputasPerdidas: number;
  disputasGanadas: number;
  contracargos: number;
  cancelacionesPropias: number;
  motivos: string[];
  nivel: "ok" | "advertencia" | "revisar";
}

const NIVEL: Record<Perfil["nivel"], { rotulo: string; clase: string }> = {
  revisar: { rotulo: "Revisar", clase: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" },
  advertencia: { rotulo: "Advertencia", clase: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  ok: { rotulo: "OK", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
};

export default function UsuariosMarcados() {
  const { token } = useAuth();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [umbrales, setUmbrales] = useState<Record<string, number>>({});
  const [dias, setDias] = useState(90);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hubs/usuarios-marcados?dias=${dias}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "No se pudo cargar");
      setPerfiles(data.data);
      setUmbrales(data.umbrales || {});
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, token]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-rose-500" />
            Usuarios con advertencia
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Proporción alta de disputas, contracargos o cancelaciones sobre sus contratos en los últimos{" "}
            {dias} días. No están bloqueados: son los que conviene mirar antes de resolver su próxima
            disputa o devolución. Umbrales: {Math.round((umbrales.DISPUTAS_ABIERTAS || 0) * 100)}% de disputas,{" "}
            {Math.round((umbrales.CONTRACARGOS || 0) * 100)}% de contracargos,{" "}
            {Math.round((umbrales.CANCELACIONES || 0) * 100)}% de cancelaciones, con al menos{" "}
            {umbrales.MINIMO_CONTRATOS || 3} contratos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5"
          >
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
            <option value={180}>180 días</option>
            <option value={365}>1 año</option>
          </select>
          <button
            onClick={cargar}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}

      {cargando ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Calculando…
        </div>
      ) : perfiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-slate-500">
          Nadie supera los umbrales en este período.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nivel</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Contratos</th>
                <th className="px-4 py-3">Disputas</th>
                <th className="px-4 py-3">Contracargos</th>
                <th className="px-4 py-3">Canceló</th>
                <th className="px-4 py-3">Por qué</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
              {perfiles.map((p) => (
                <tr key={p.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${NIVEL[p.nivel].clase}`}>
                      {NIVEL[p.nivel].rotulo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/users/${p.userId}`} className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
                      {p.nombre}
                    </Link>
                    <p className="text-xs text-slate-400">{p.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular-nums">
                    {p.contratos}
                    <p className="text-xs text-slate-400">{p.contratosComoCliente} cli · {p.contratosComoTrabajador} trab</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular-nums">
                    {p.disputasAbiertas}
                    {p.disputasAbiertas > 0 && (
                      <p className="text-xs text-slate-400">
                        {p.disputasPerdidas} perdidas · {p.disputasGanadas} ganadas
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className={p.contracargos > 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-700 dark:text-slate-200"}>
                      {p.contracargos}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200 tabular-nums">{p.cancelacionesPropias}</td>
                  <td className="px-4 py-3">
                    <ul className="space-y-1">
                      {p.motivos.map((m, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
