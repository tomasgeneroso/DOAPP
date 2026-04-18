import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Briefcase,
  FileText,
  DollarSign,
  ArrowDownLeft,
  User,
  ExternalLink,
  AlertCircle,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

interface SearchResults {
  job: any | null;
  contracts: any[];
  payments: any[];
  withdrawal: any | null;
  users: any[];
}

export default function AdminSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleSearch = async () => {
    const id = query.trim();
    if (!id) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/search?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setResults(data.data);
        if (!data.found) {
          setError("No se encontraron resultados para ese ID");
        }
      } else {
        setError(data.message || "Error en la búsqueda");
      }
    } catch {
      setError("Error al conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      open: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
      in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      completed: "bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300",
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400",
      pending_verification: "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
      held_escrow: "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
      disputed: "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400",
    };
    return map[status] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  };

  const IdChip = ({ id }: { id: string }) => (
    <button
      onClick={() => copyId(id)}
      className="inline-flex items-center gap-1 font-mono text-xs text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
      title={id}
    >
      {id.slice(-10).toUpperCase()}
      {copied === id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Búsqueda Global</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Busca por ID (completo o parcial) de publicación, contrato, transacción, retiro o usuario
        </p>
      </div>

      {/* Search bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Ej: 7DE9F82A o ID completo"
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Buscar
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Acepta IDs parciales (ej: los últimos 8 caracteres mostrados en tablas) o UUIDs completos
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Users */}
          {results.users && results.users.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-purple-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Usuarios ({results.users.length})
                </h2>
              </div>
              <div className="space-y-2">
                {results.users.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                    <div className="grid grid-cols-3 gap-4 text-sm flex-1">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">ID</p>
                        <IdChip id={u.id} />
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Nombre</p>
                        <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Email</p>
                        <p className="text-gray-700 dark:text-gray-300 text-xs">{u.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/users?search=${encodeURIComponent(u.email)}`)}
                      className="ml-4 p-2 text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                      title="Ver usuario"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job */}
          {results.job && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-5 h-5 text-sky-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Publicación</h2>
              </div>
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-4 gap-4 text-sm flex-1">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">ID</p>
                    <IdChip id={results.job.id} />
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Título</p>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{results.job.title}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Estado</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(results.job.status)}`}>
                      {results.job.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Cliente</p>
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{results.job.client?.name || "—"}</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/admin/jobs`)}
                  className="ml-4 p-2 text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                  title="Ver en admin de publicaciones"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Contracts */}
          {results.contracts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-green-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Contratos ({results.contracts.length})
                </h2>
              </div>
              <div className="space-y-2">
                {results.contracts.map((contract: any) => (
                  <div key={contract.id} className="flex items-center justify-between border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                    <div className="grid grid-cols-5 gap-3 text-sm flex-1">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">ID</p>
                        <IdChip id={contract.id} />
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Trabajo</p>
                        <p className="font-medium text-gray-900 dark:text-white text-xs">{contract.job?.title || "—"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Estado</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(contract.status)}`}>
                          {contract.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Cliente</p>
                        <p className="text-gray-700 dark:text-gray-300 text-xs">{contract.client?.name || "—"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Doer</p>
                        <p className="text-gray-700 dark:text-gray-300 text-xs">{contract.doer?.name || "—"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/contracts?search=${contract.id}`)}
                      className="ml-4 p-2 text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                      title="Ver contrato en admin"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payments */}
          {results.payments.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5 text-amber-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Transacciones ({results.payments.length})
                </h2>
              </div>
              <div className="space-y-2">
                {results.payments.map((payment: any) => (
                  <div key={payment.id} className="flex items-center justify-between border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                    <div className="grid grid-cols-4 gap-3 text-sm flex-1">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">ID</p>
                        <IdChip id={payment.id} />
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Tipo</p>
                        <p className="font-medium text-gray-900 dark:text-white text-xs">{payment.paymentType}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Monto</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                          ${Number(payment.amount || 0).toLocaleString('es-AR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Estado</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(payment.status)}`}>
                          {payment.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/admin/financial-transactions`)}
                      className="ml-4 p-2 text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                      title="Ver en transacciones financieras"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Withdrawal */}
          {results.withdrawal && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
              <div className="flex items-center gap-2 mb-3">
                <ArrowDownLeft className="w-5 h-5 text-red-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Retiro</h2>
              </div>
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-4 gap-4 text-sm flex-1">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">ID</p>
                    <IdChip id={results.withdrawal.id} />
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Monto</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      ${Number(results.withdrawal.amount || 0).toLocaleString('es-AR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Estado</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(results.withdrawal.status)}`}>
                      {results.withdrawal.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs">Usuario</p>
                    <p className="text-gray-700 dark:text-gray-300">
                      {results.withdrawal.user?.name || results.withdrawal.User?.name || "—"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/admin/withdrawals")}
                  className="ml-4 p-2 text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                  title="Ver retiros"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
