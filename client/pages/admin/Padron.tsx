import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { Search, Download, Loader2, Database, ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";

export interface PadronColumn {
  key: string;
  label: string;
  type?: "date" | "money" | "text" | "bool";
}

/** Severity a row can carry, worst first. Kept generic so any registry can opt in. */
export type PadronTone = "danger" | "warning" | "muted";

const TONE_ROW: Record<PadronTone, string> = {
  danger: "bg-red-50 dark:bg-red-900/20",
  warning: "bg-amber-50 dark:bg-amber-900/20",
  muted: "bg-slate-50 dark:bg-slate-900/40 text-gray-500 dark:text-gray-400",
};

const fmt = (v: any, type?: string) => {
  if (type === "bool") return v ? "Sí" : "No";
  if (v === null || v === undefined || v === "") return "—";
  if (type === "date") return new Date(v).toLocaleDateString("es-AR");
  if (type === "money") return `$${Number(v).toLocaleString("es-AR")}`;
  return String(v);
};

/**
 * Generic admin registry: paginated searchable table + CSV export for any
 * entity exposed under /api/admin/padrones/:entity.
 */
export default function Padron({
  entity,
  title,
  columns,
  searchable = true,
  rowTone,
  legend,
  statusOptions,
}: {
  entity: string; // 'jobs' | 'contracts' | 'disputes'
  title: string;
  columns: PadronColumn[];
  searchable?: boolean;
  /** Optional per-row severity tint, e.g. insurance about to expire. */
  rowTone?: (row: any) => PadronTone | null | undefined;
  /** Legend chips describing what the tints mean. */
  legend?: Array<{ tone: PadronTone; label: string }>;
  /** Values accepted by this registry's `status` filter, if it has one. */
  statusOptions?: Array<{ value: string; label: string }>;
}) {
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const authHeaders = { Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: "25",
        search,
        ...(status ? { status } : {}),
        ...(sortBy ? { sortBy, sortOrder } : {}),
      }).toString();
      const res = await fetch(`/api/admin/padrones/${entity}?${qs}`, { headers: authHeaders });
      const data = await res.json();
      if (data.success) {
        setRows(data.data || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch { /* noop */ } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, page, search, status, sortBy, sortOrder, token]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // reset when entity changes
  useEffect(() => { setPage(1); setSearch(""); setStatus(""); setSortBy(""); }, [entity]);

  /** Click a header: first click sorts descending, clicking again flips it. */
  const toggleSort = (key: string) => {
    setPage(1);
    if (sortBy !== key) { setSortBy(key); setSortOrder("desc"); return; }
    setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      // The export deliberately carries the same filters as the table: a CSV
      // that silently contains more rows than what is on screen is a trap.
      const qs = new URLSearchParams({ search, ...(status ? { status } : {}) }).toString();
      const res = await fetch(`/api/admin/padrones/${entity}/export.csv?${qs}`, { headers: authHeaders });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet><title>{title} · Admin DoApp</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Database className="h-6 w-6 text-sky-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>
        <button onClick={exportCsv} disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Exportar CSV
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{total} registros.</p>
        {legend?.map((l) => (
          <span key={l.tone} className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className={`inline-block h-3 w-3 rounded border border-gray-300 dark:border-gray-600 ${TONE_ROW[l.tone]}`} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {searchable && (
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white" />
          </div>
        )}

        {statusOptions?.length ? (
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
          >
            <option value="">Todos los estados</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : null}

        {(status || sortBy) && (
          <button
            type="button"
            onClick={() => { setStatus(""); setSortBy(""); setPage(1); }}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 dark:bg-slate-900/50 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              {columns.map((c) => {
                const active = sortBy === c.key;
                return (
                  <th key={c.key} className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      title={`Ordenar por ${c.label}`}
                      className={`inline-flex items-center gap-1 uppercase hover:text-sky-600 dark:hover:text-sky-400 transition-colors ${active ? "text-sky-600 dark:text-sky-400" : ""}`}
                    >
                      {c.label}
                      {active
                        ? (sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {loading ? (
              <tr><td colSpan={columns.length} className="px-3 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sky-500" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-12 text-center text-gray-500 dark:text-gray-400">Sin resultados.</td></tr>
            ) : rows.map((r) => {
              const tone = rowTone?.(r);
              return (
              <tr key={r.id} className={`text-gray-800 dark:text-gray-200 ${tone ? TONE_ROW[tone] : ""}`}>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 max-w-[280px] truncate" title={String(r[c.key] ?? "")}>
                    {fmt(r[c.key], c.type)}
                  </td>
                ))}
              </tr>
              );
            })}
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
