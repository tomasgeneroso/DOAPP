import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { Briefcase, Calendar, DollarSign, User, Clock, ArrowUpDown, ArrowUp, ArrowDown, Wifi, WifiOff } from "lucide-react";

interface Contract {
  id: string;
  job: {
    id: string;
    title: string;
  };
  client: {
    id: string;
    name: string;
    avatar: string;
  };
  doer: {
    id: string;
    name: string;
    avatar: string;
  };
  price: number;
  totalPrice: number;
  status: string;
  startDate: string;
  createdAt: string;
  paymentStatus?: string;
}

type SortField = 'job' | 'client' | 'doer' | 'price' | 'date' | 'status' | 'payment';
type SortDirection = 'asc' | 'desc' | null;

export default function ContractsScreen() {
  const { user } = useAuth();
  const { isConnected, registerContractUpdateHandler, registerContractsRefreshHandler } = useSocket();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Memoize the fetch function
  const fetchContracts = useCallback(async (pageNum: number = 1, reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      console.log('📡 Fetching contracts from API, page:', pageNum);
      const response = await fetch(`/api/contracts?page=${pageNum}&limit=10`, {
        credentials: 'include',
      });
      const data = await response.json();
      console.log('📦 API Response:', data);

      if (data.success) {
        console.log('✅ Contratos recibidos:', data.contracts?.length || 0);
        if (reset) {
          setContracts(data.contracts || []);
        } else {
          setContracts(prev => [...prev, ...(data.contracts || [])]);
        }
        setHasMore(data.hasMore || false);
        setPage(pageNum);
      } else {
        console.error('❌ API returned success: false', data);
      }
    } catch (error) {
      console.error("❌ Error fetching contracts:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    console.log('🔄 ContractsScreen: Componente montado, iniciando carga de contratos...');
    fetchContracts(1, true);
  }, [fetchContracts]);

  // Register socket handlers for real-time updates
  useEffect(() => {
    // Handler for individual contract updates
    registerContractUpdateHandler((data: any) => {
      console.log("📝 ContractsScreen: Contract updated via socket:", data);
      // Update the specific contract in the list
      setContracts(prev => prev.map(contract =>
        contract.id === data.contractId ? { ...contract, ...data.contract } : contract
      ));
      // Also refresh the full list to ensure consistency
      fetchContracts(1, true);
    });

    // Handler for general contracts refresh
    registerContractsRefreshHandler((data: any) => {
      console.log("🔄 ContractsScreen: Contracts refresh triggered via socket");
      fetchContracts(1, true);
    });
  }, [fetchContracts, registerContractUpdateHandler, registerContractsRefreshHandler]);

  const handleLoadMore = () => {
    fetchContracts(page + 1, false);
  };

  const handleSort = (field: SortField) => {
    let newDirection: SortDirection = 'asc';

    if (sortField === field) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
      }
    }

    setSortField(newDirection === null ? null : field);
    setSortDirection(newDirection);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
      case "accepted":
        return "bg-sky-100 text-sky-800 dark:bg-sky-900/20 dark:text-sky-400";
      case "in_progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      accepted: "Aceptado",
      in_progress: "En Progreso",
      completed: "Completado",
      cancelled: "Cancelado",
    };
    return labels[status] || status;
  };

  const getFilteredAndSortedContracts = () => {
    // First filter
    const filtered = contracts.filter((contract) => {
      if (filter === "active") {
        return ["pending", "accepted", "in_progress"].includes(contract.status);
      }
      if (filter === "completed") {
        return contract.status === "completed";
      }
      return true;
    });

    // Then sort if needed
    if (!sortField || !sortDirection) return filtered;

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'job':
          comparison = a.job.title.localeCompare(b.job.title, 'es');
          break;
        case 'client':
          comparison = a.client.name.localeCompare(b.client.name, 'es');
          break;
        case 'doer':
          comparison = a.doer.name.localeCompare(b.doer.name, 'es');
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'payment':
          const paymentA = a.paymentStatus || 'pending';
          const paymentB = b.paymentStatus || 'pending';
          comparison = paymentA.localeCompare(paymentB);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const filteredContracts = getFilteredAndSortedContracts();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando contratos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Mis Contratos
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Administra todos tus contratos activos y completados
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">Tiempo real</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Sin conexión</span>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "all"
                ? "bg-sky-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "active"
                ? "bg-sky-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === "completed"
                ? "bg-sky-500 text-white"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            Completados
          </button>
        </div>

        {/* Contracts List */}
        {filteredContracts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <Briefcase className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              No tienes contratos {filter === "all" ? "" : filter === "active" ? "activos" : "completados"} en este momento
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {filteredContracts.map((contract) => {
                const isClient = contract.client.id === user?.id;
                const otherParty = isClient ? contract.doer : contract.client;

                return (
                  <Link
                    key={contract.id}
                    to={`/contracts/${contract.id}`}
                    className="block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                          {contract.job.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              contract.status
                            )}`}
                          >
                            {getStatusLabel(contract.status)}
                          </span>
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            {isClient ? "Como Cliente" : "Como Freelancer"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-sky-600">
                          ${contract.totalPrice.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Precio total
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <img
                          src={otherParty.avatar}
                          alt={otherParty.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <span>{otherParty.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(contract.startDate).toLocaleDateString("es-AR")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>
                          Creado {new Date(contract.createdAt).toLocaleDateString("es-AR")}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Cargando...</span>
                    </div>
                  ) : (
                    "Cargar más contratos"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
