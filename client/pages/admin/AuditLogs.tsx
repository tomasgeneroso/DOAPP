import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Search, Loader2, RefreshCw } from 'lucide-react';
import IdBadge from '../../components/admin/IdBadge';

interface AuditLog {
  id: string;
  action: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  targetModel?: string;
  targetId?: string;
  targetIdentifier?: string;
  ip?: string;
  adminRole?: string;
  admin?: { id: string; name: string; email: string } | null;
  createdAt: string;
}

const CATEGORIES = ['all', 'payment', 'user', 'contract', 'ticket', 'role', 'permission', 'system'];
const SEVERITIES = ['all', 'low', 'medium', 'high', 'critical'];

const severityStyles: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const categoryStyles: Record<string, string> = {
  payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  user: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  contract: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  role: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  permission: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  ticket: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  system: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (category !== 'all') params.append('category', category);
      if (severity !== 'all') params.append('severity', severity);
      if (search.trim()) params.append('search', search.trim());
      const res = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs || []);
        setPages(data.data.pagination?.pages || 1);
        setTotal(data.data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, category, severity, search]);

  useEffect(() => {
    const h = setTimeout(load, 300);
    return () => clearTimeout(h);
  }, [load]);

  useEffect(() => { setPage(1); }, [category, severity, search]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500" /> Registro de acciones
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Auditoría de acciones de administradores (todos los roles). {total} registros.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por acción, descripción o ID..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'all' ? 'Todas las categorías' : c}</option>)}
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
          {SEVERITIES.map((s) => <option key={s} value={s}>{s === 'all' ? 'Toda severidad' : s}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-gray-500 dark:text-gray-400 text-sm">No hay acciones registradas para este filtro.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {['Fecha', 'Admin', 'Acción', 'Descripción', 'Objetivo', 'IP'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">{new Date(log.createdAt).toLocaleString('es-AR')}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900 dark:text-white">{log.admin?.name || '—'}</div>
                    {log.adminRole && <div className="text-xs text-indigo-500">{log.adminRole}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-800 dark:text-gray-200">{log.action}</div>
                    <div className="mt-1 flex gap-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${categoryStyles[log.category] || categoryStyles.system}`}>{log.category}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${severityStyles[log.severity] || severityStyles.low}`}>{log.severity}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{log.description}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {log.targetModel && <div className="text-xs text-gray-500 dark:text-gray-400">{log.targetModel}</div>}
                    {log.targetId && <IdBadge id={log.targetId} />}
                    {log.targetIdentifier && <div className="text-xs text-gray-400">{log.targetIdentifier}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono">{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40">Anterior</button>
          <span className="text-sm text-gray-500 dark:text-gray-400">Página {page} de {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40">Siguiente</button>
        </div>
      )}
    </div>
  );
}
