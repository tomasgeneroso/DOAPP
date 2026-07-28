import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { adminApi } from "@/lib/adminApi";
import { useAuth } from "@/hooks/useAuth";
import { Search, Download, Loader2, Database, Check, X } from "lucide-react";

interface UserRecord {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  dni: string;
  dniVerified: boolean;
  kycStatus: string;
  credibility: string;
  role: string;
  membershipTier: string;
  profession: string;
  licenseNumber: string;
  licenseVerified: boolean;
  insuranceVerified: boolean;
  city: string;
  state: string;
  balanceArs: number;
  completedJobs: number;
  rating: number;
  reviewsCount: number;
  kycName: string;
  kycDocument: string;
  createdAt: string;
  lastLoginAt: string | null;
}

const YesNo = ({ v }: { v: boolean }) =>
  v ? <Check className="h-4 w-4 text-emerald-500 inline" /> : <X className="h-4 w-4 text-slate-300 dark:text-slate-600 inline" />;

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("es-AR") : "—");

export default function UserData() {
  const { token } = useAuth();
  const [rows, setRows] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "incomplete" | "verified">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.userData.list({ page: String(page), limit: "25", search, status: status === "all" ? "" : status });
      if (res.success && res.data) {
        setRows(res.data as UserRecord[]);
        const p = (res as any).pagination;
        setTotalPages(p?.totalPages || 1);
        setTotal(p?.total || 0);
      }
    } catch { /* noop */ } finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ search, status: status === "all" ? "" : status }).toString();
      const res = await fetch(`/api/admin/user-data/export.csv?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `usuarios-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet><title>Datos de usuarios · Admin DoApp</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-sky-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Datos de usuarios</h1>
        </div>
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar CSV
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Padrón completo con identidad, KYC, datos profesionales y actividad. {total} usuarios.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, email, teléfono o DNI"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex gap-1">
          {([["all", "Todos"], ["incomplete", "Sin terminar"], ["verified", "Verificados"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setStatus(key); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${status === key ? "bg-sky-500 text-white" : "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 dark:bg-slate-900/50 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              {["Nombre", "Email", "Teléfono", "Teléfono verificado", "DNI", "DNI verificado", "Estado KYC", "Credibilidad", "Rol", "Membresía", "Profesión", "Matrícula verificada", "Seguro verificado", "Ciudad", "Provincia", "Balance", "Trabajos", "Rating", "Registro"].map((h) => (
                <th key={h} className="px-3 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {loading ? (
              <tr><td colSpan={19} className="px-3 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sky-500" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={19} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">Sin resultados.</td></tr>
            ) : rows.map((u) => (
              <tr key={u.id} className="text-gray-800 dark:text-gray-200">
                <td className="px-3 py-2 font-medium">{u.name}{u.username ? <span className="text-gray-400"> @{u.username}</span> : null}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.phone || "—"}</td>
                <td className="px-3 py-2 text-center"><YesNo v={u.phoneVerified} /></td>
                <td className="px-3 py-2">{u.dni || "—"}</td>
                <td className="px-3 py-2 text-center"><YesNo v={u.dniVerified} /></td>
                <td className="px-3 py-2">
                  {u.kycStatus === "Declined" || u.kycStatus === "In Review" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {u.kycStatus === "Declined" ? "Rechazado · sin terminar" : "En revisión"}
                    </span>
                  ) : (u.kycStatus || "—")}
                </td>
                <td className="px-3 py-2">{u.credibility}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.membershipTier}</td>
                <td className="px-3 py-2">{u.profession || "—"}</td>
                <td className="px-3 py-2 text-center"><YesNo v={u.licenseVerified} /></td>
                <td className="px-3 py-2 text-center"><YesNo v={u.insuranceVerified} /></td>
                <td className="px-3 py-2">{u.city || "—"}</td>
                <td className="px-3 py-2">{u.state || "—"}</td>
                <td className="px-3 py-2">${Number(u.balanceArs).toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-center">{u.completedJobs}</td>
                <td className="px-3 py-2">{Number(u.rating).toFixed(1)} ({u.reviewsCount})</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{fmtDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-40">Anterior</button>
          <span className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  );
}
