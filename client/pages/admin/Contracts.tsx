import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FileText, Search, Filter, Eye, Ban, CheckCircle, XCircle, Plus, ArrowUpDown, ArrowUp, ArrowDown, Wifi, WifiOff, Bell } from "lucide-react";
import { useSocket } from "../../hooks/useSocket";

interface Contract {
  id: string;
  _id?: string;
  title?: string;
  job?: {
    id?: string;
    title: string;
  } | null;
  client: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
  };
  doer: {
    id?: string;
    _id?: string;
    name: string;
    email: string;
  };
  price: number;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

type SortField = 'job' | 'client' | 'doer' | 'price' | 'date' | 'status' | 'payment';
type SortDirection = 'asc' | 'desc' | null;

export default function AdminContracts() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [newContractAlert, setNewContractAlert] = useState<string | null>(null);

  const { registerAdminContractCreatedHandler, registerAdminContractUpdatedHandler, isConnected } = useSocket();

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();

      if (statusFilter !== "all") params.append("status", statusFilter);
      if (paymentFilter !== "all") params.append("paymentStatus", paymentFilter);

      const response = await fetch(`/api/admin/contracts?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setContracts(data.data || data.contracts || []);
      }
    } catch (error) {
      console.error("Error fetching contracts:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, paymentFilter]);

  // Handle real-time contract creation
  const handleNewContract = useCallback((data: any) => {
    console.log("🆕 Real-time: New contract created", data);
    setNewContractAlert(`Nuevo contrato: ${data.contract?.job?.title || 'Sin título'}`);
    // Add contract to the list
    if (data.contract) {
      setContracts(prev => {
        // Check if contract already exists
        if (prev.some(c => c.id === data.contract.id)) return prev;
        return [data.contract, ...prev];
      });
    }
    // Auto-hide alert after 5 seconds
    setTimeout(() => setNewContractAlert(null), 5000);
  }, []);

  // Handle real-time contract updates
  const handleContractUpdated = useCallback((data: any) => {
    console.log("📝 Real-time: Contract updated", data);
    if (data.contract) {
      setContracts(prev => {
        const exists = prev.some(c => c.id === data.contract.id);
        if (exists) {
          // Update existing contract
          return prev.map(c => c.id === data.contract.id ? { ...c, ...data.contract } : c);
        } else {
          // Add new contract if not in list
          return [data.contract, ...prev];
        }
      });
    }
  }, []);

  // Register socket handlers
  useEffect(() => {
    registerAdminContractCreatedHandler(handleNewContract);
    registerAdminContractUpdatedHandler(handleContractUpdated);
  }, [registerAdminContractCreatedHandler, registerAdminContractUpdatedHandler, handleNewContract, handleContractUpdated]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

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

  const getSortedAndFilteredContracts = () => {
    let result = [...filteredContracts];

    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let comparison = 0;

        switch (sortField) {
          case 'job':
            comparison = (a.job?.title || a.title || '').localeCompare(b.job?.title || b.title || '', 'es');
            break;
          case 'client':
            comparison = a.client.name.localeCompare(b.client.name, 'es');
            break;
          case 'doer':
            comparison = a.doer.name.localeCompare(b.doer.name, 'es');
            break;
          case 'price':
            comparison = a.totalPrice - b.totalPrice;
            break;
          case 'date':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
          case 'status':
            comparison = a.status.localeCompare(b.status);
            break;
          case 'payment':
            comparison = a.paymentStatus.localeCompare(b.paymentStatus);
            break;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      in_progress: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      awaiting_confirmation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
      disputed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return badges[status] || badges.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      accepted: "Aceptado",
      in_progress: "En Progreso",
      awaiting_confirmation: "Esperando Confirmación",
      completed: "Completado",
      cancelled: "Cancelado",
      disputed: "En Disputa",
    };
    return labels[status] || status;
  };

  const getPaymentBadge = (paymentStatus: string) => {
    const badges: Record<string, string> = {
      pending: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
      held: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      escrow: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      released: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      refunded: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
    return badges[paymentStatus] || badges.pending;
  };

  const filteredContracts = contracts.filter((contract) => {
    const jobTitle = contract.job?.title || contract.title || '';
    const matchesSearch =
      searchQuery === "" ||
      jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.doer?.name?.toLowerCase().includes(searchQuery.toLowerCase());

    // Filtro por fecha
    const contractDate = new Date(contract.createdAt);
    const matchesDateFrom = !dateFrom || contractDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || contractDate <= new Date(dateTo + 'T23:59:59');

    return matchesSearch && matchesDateFrom && matchesDateTo;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* New Contract Alert */}
      {newContractAlert && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 bg-green-600 text-white rounded-lg shadow-lg animate-pulse">
          <Bell className="h-5 w-5" />
          <span className="font-medium">{newContractAlert}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Contratos</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Administra todos los contratos de la plataforma
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-600 dark:text-green-400">Tiempo real</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">Sin conexión</span>
              </>
            )}
          </div>
          <Link
            to="/admin/contracts/create"
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition shadow-md hover:shadow-lg"
          >
            <Plus className="h-5 w-5" />
            Crear Contrato
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título, cliente o doer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="accepted">Aceptado</option>
              <option value="in_progress">En Progreso</option>
              <option value="awaiting_confirmation">Esperando Confirmación</option>
              <option value="completed">Completado</option>
              <option value="cancelled">Cancelado</option>
              <option value="disputed">En Disputa</option>
            </select>
          </div>

          {/* Payment Filter */}
          <div>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            >
              <option value="all">Todos los pagos</option>
              <option value="pending">Pago Pendiente</option>
              <option value="escrow">En Escrow</option>
              <option value="held">Retenido</option>
              <option value="released">Liberado</option>
              <option value="refunded">Reembolsado</option>
              <option value="completed">Completado</option>
            </select>
          </div>

          {/* Date From Filter */}
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Desde"
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            />
          </div>

          {/* Date To Filter */}
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Hasta"
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Contratos</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{contracts.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">En Progreso</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {contracts.filter((c) => c.status === "in_progress").length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">Completados</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {contracts.filter((c) => c.status === "completed").length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">En Disputa</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {contracts.filter((c) => c.status === "disputed").length}
          </div>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('job')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Trabajo
                    <SortIcon field="job" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('client')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Cliente
                    <SortIcon field="client" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('doer')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Doer
                    <SortIcon field="doer" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('price')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Precio
                    <SortIcon field="price" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('status')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Estado
                    <SortIcon field="status" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <button
                    onClick={() => handleSort('payment')}
                    className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Pago
                    <SortIcon field="payment" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {getSortedAndFilteredContracts().length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No se encontraron contratos
                  </td>
                </tr>
              ) : (
                getSortedAndFilteredContracts().map((contract) => (
                  <tr key={contract.id || contract._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {contract.job?.title || contract.title || 'Sin título'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(contract.createdAt).toLocaleDateString("es-AR")}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">{contract.client?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{contract.client?.email || ''}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">{contract.doer?.name || 'N/A'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{contract.doer?.email || ''}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        ${(contract.totalPrice || contract.price || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(contract.status)}`}>
                        {getStatusLabel(contract.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPaymentBadge(contract.paymentStatus)}`}>
                        {contract.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Link
                          to={`/contracts/${contract.id || contract._id}`}
                          className="p-1 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
