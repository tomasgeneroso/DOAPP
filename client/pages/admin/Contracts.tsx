import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FileText, Search, Filter, Eye, Ban, CheckCircle, XCircle, Plus, ArrowUpDown, ArrowUp, ArrowDown, Wifi, WifiOff, Bell, AlertTriangle, X, Calendar, Clock, Edit, Receipt, ExternalLink } from "lucide-react";
import { useSocket } from "../../hooks/useSocket";
import { useAuth } from "../../hooks/useAuth";

interface ContractChange {
  field: string;
  oldValue: any;
  newValue: any;
  changedAt: string;
  changedBy?: {
    id: string;
    name: string;
  };
  reason?: string;
  linkedDisputeId?: string;
}

interface PaymentProofInfo {
  id: string;
  fileUrl: string;
  status: string;
  uploadedAt: string;
}

interface PaymentInfo {
  id: string;
  status: string;
  amount: number;
  platformFee: number;
  proofs?: PaymentProofInfo[];
}

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
  originalPrice?: number;
  status: string;
  paymentStatus: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt?: string;
  description?: string;
  originalDescription?: string;
  changeHistory?: ContractChange[];
  hasChanges?: boolean;
  priceModifications?: any[];
  extensions?: any[];
  payment?: PaymentInfo;
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
  const [selectedContractChanges, setSelectedContractChanges] = useState<Contract | null>(null);
  const [changeStatusContract, setChangeStatusContract] = useState<Contract | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [changingStatus, setChangingStatus] = useState(false);
  const [linkedDisputeId, setLinkedDisputeId] = useState("");
  const [contractDisputes, setContractDisputes] = useState<any[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(false);

  const { registerAdminContractCreatedHandler, registerAdminContractUpdatedHandler, isConnected } = useSocket();
  const { user } = useAuth();

  // Helper to check if contract has changes
  const contractHasChanges = (contract: Contract): boolean => {
    return !!(
      (contract.originalPrice && contract.originalPrice !== contract.totalPrice) ||
      (contract.priceModifications && contract.priceModifications.length > 0) ||
      (contract.extensions && contract.extensions.length > 0) ||
      (contract.changeHistory && contract.changeHistory.length > 0)
    );
  };

  // Generate change list from contract data
  const getContractChanges = (contract: Contract): ContractChange[] => {
    const changes: ContractChange[] = [];

    // Price changes
    if (contract.originalPrice && contract.originalPrice !== contract.totalPrice) {
      changes.push({
        field: 'Precio',
        oldValue: `$${contract.originalPrice.toLocaleString()}`,
        newValue: `$${contract.totalPrice.toLocaleString()}`,
        changedAt: contract.updatedAt || contract.createdAt,
      });
    }

    // Price modifications history
    if (contract.priceModifications) {
      contract.priceModifications.forEach((mod: any) => {
        changes.push({
          field: 'Modificación de Precio',
          oldValue: `$${(mod.previousPrice || 0).toLocaleString()}`,
          newValue: `$${(mod.newPrice || 0).toLocaleString()}`,
          changedAt: mod.requestedAt || mod.createdAt,
          reason: mod.reason,
          changedBy: mod.requestedBy,
        });
      });
    }

    // Extensions
    if (contract.extensions) {
      contract.extensions.forEach((ext: any) => {
        changes.push({
          field: 'Extensión de Contrato',
          oldValue: ext.previousEndDate ? new Date(ext.previousEndDate).toLocaleDateString('es-AR') : '-',
          newValue: ext.newEndDate ? new Date(ext.newEndDate).toLocaleDateString('es-AR') : '-',
          changedAt: ext.requestedAt || ext.createdAt,
          reason: ext.reason,
          changedBy: ext.requestedBy,
        });
      });
    }

    // Change history
    if (contract.changeHistory) {
      changes.push(...contract.changeHistory);
    }

    return changes.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  };

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

  const fetchContractDisputes = async (contractId: string) => {
    setLoadingDisputes(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/disputes?contractId=${contractId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setContractDisputes(data.data || []);
      }
    } catch (error) {
      console.error("Error fetching disputes:", error);
      setContractDisputes([]);
    } finally {
      setLoadingDisputes(false);
    }
  };

  const handleChangeStatus = async () => {
    if (!changeStatusContract || !newStatus || !changeReason.trim() || changeReason.trim().length < 10) {
      alert("Debes seleccionar un estado y proporcionar una razón (mínimo 10 caracteres)");
      return;
    }

    setChangingStatus(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/contracts/${changeStatusContract.id}/change-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          reason: changeReason,
          linkedDisputeId: linkedDisputeId || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update contract in list
        setContracts(prev => prev.map(c =>
          c.id === changeStatusContract.id
            ? { ...c, status: newStatus }
            : c
        ));

        // Close modal
        setChangeStatusContract(null);
        setNewStatus("");
        setChangeReason("");
        setLinkedDisputeId("");
        setContractDisputes([]);

        alert("Estado del contrato actualizado correctamente. Las partes han sido notificadas.");
      } else {
        alert(data.message || "Error al cambiar el estado del contrato");
      }
    } catch (error) {
      console.error("Error changing contract status:", error);
      alert("Error al cambiar el estado del contrato");
    } finally {
      setChangingStatus(false);
    }
  };

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
    const contractId = contract.id || contract._id || '';
    const matchesSearch =
      searchQuery === "" ||
      contractId.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
              placeholder="Buscar por ID, título, cliente o doer..."
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

          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white text-sm"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white text-sm"
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
                  ID
                </th>
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
                  Fechas
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cambios
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Comprobante
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {getSortedAndFilteredContracts().length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No se encontraron contratos
                  </td>
                </tr>
              ) : (
                getSortedAndFilteredContracts().map((contract) => (
                  <tr key={contract.id || contract._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4">
                      <div className="text-xs font-mono text-gray-600 dark:text-gray-400" title={contract.id || contract._id}>
                        {(contract.id || contract._id || '').slice(-8).toUpperCase()}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {contract.job?.title || contract.title || 'Sin título'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(contract.createdAt).toLocaleDateString("es-AR")} {new Date(contract.createdAt).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
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
                      <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-green-500" />
                          <span>Inicio: {contract.startDate ? new Date(contract.startDate).toLocaleDateString('es-AR') : '-'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-red-500" />
                          <span>Fin: {contract.endDate ? new Date(contract.endDate).toLocaleDateString('es-AR') : '-'}</span>
                        </div>
                        {contract.startDate && contract.endDate && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <Clock className="h-3 w-3" />
                            <span>
                              {new Date(contract.startDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} - {new Date(contract.endDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {contractHasChanges(contract) ? (
                        <button
                          onClick={() => setSelectedContractChanges(contract)}
                          className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-full transition-colors"
                          title="Ver cambios"
                        >
                          <AlertTriangle className="h-5 w-5" />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {contract.payment?.proofs && contract.payment.proofs.length > 0 ? (
                        <a
                          href={contract.payment.proofs[0].fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                        >
                          <Receipt className="h-4 w-4" />
                          Ver
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Sin comprobante</span>
                      )}
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
                        {user?.adminRole === 'owner' && (
                          <button
                            onClick={() => {
                              setChangeStatusContract(contract);
                              setNewStatus(contract.status);
                              setLinkedDisputeId("");
                              fetchContractDisputes(contract.id || contract._id || "");
                            }}
                            className="p-1 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
                            title="Cambiar estado (Owner)"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Changes Modal */}
      {selectedContractChanges && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedContractChanges(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Historial de Cambios</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedContractChanges.job?.title || selectedContractChanges.title || 'Contrato'}
                </p>
              </div>
              <button
                onClick={() => setSelectedContractChanges(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {getContractChanges(selectedContractChanges).length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No hay cambios registrados</p>
              ) : (
                <div className="space-y-4">
                  {getContractChanges(selectedContractChanges).map((change, index) => (
                    <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded">
                              {change.field}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(change.changedAt).toLocaleDateString('es-AR')} {new Date(change.changedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block text-xs mb-1">Valor anterior:</span>
                              <span className="text-red-600 dark:text-red-400 font-medium line-through">{change.oldValue || '-'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400 block text-xs mb-1">Valor nuevo:</span>
                              <span className="text-green-600 dark:text-green-400 font-medium">{change.newValue || '-'}</span>
                            </div>
                          </div>
                          {change.reason && (
                            <div className="mt-2 text-sm">
                              <span className="text-gray-500 dark:text-gray-400">Razón: </span>
                              <span className="text-gray-700 dark:text-gray-300">{change.reason}</span>
                            </div>
                          )}
                          {change.linkedDisputeId && (
                            <div className="mt-2 text-sm">
                              <span className="text-gray-500 dark:text-gray-400">Disputa vinculada: </span>
                              <span className="text-sky-600 dark:text-sky-400 font-mono text-xs">{change.linkedDisputeId}</span>
                            </div>
                          )}
                          {change.changedBy && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Por: {change.changedBy.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSelectedContractChanges(null)}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal (Owner Only) */}
      {changeStatusContract && user?.adminRole === 'owner' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setChangeStatusContract(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cambiar Estado del Contrato</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {changeStatusContract.job?.title || changeStatusContract.title || 'Contrato'}
                </p>
              </div>
              <button
                onClick={() => setChangeStatusContract(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Current Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Estado actual:
                </label>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  changeStatusContract.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                  changeStatusContract.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                  changeStatusContract.status === 'disputed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                  changeStatusContract.status === 'cancelled' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300' :
                  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                }`}>
                  {changeStatusContract.status.toUpperCase()}
                </span>
              </div>

              {/* New Status */}
              <div>
                <label htmlFor="newStatus" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nuevo estado: *
                </label>
                <select
                  id="newStatus"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
                >
                  <option value="">Seleccionar estado...</option>
                  <option value="pending">PENDING (Pendiente)</option>
                  <option value="ready">READY (Listo)</option>
                  <option value="accepted">ACCEPTED (Aceptado)</option>
                  <option value="in_progress">IN_PROGRESS (En Progreso)</option>
                  <option value="awaiting_confirmation">AWAITING_CONFIRMATION (Esperando Confirmación)</option>
                  <option value="completed">COMPLETED (Completado)</option>
                  <option value="cancelled">CANCELLED (Cancelado)</option>
                  <option value="rejected">REJECTED (Rechazado)</option>
                  <option value="disputed">DISPUTED (En Disputa)</option>
                </select>
              </div>

              {/* Reason */}
              <div>
                <label htmlFor="changeReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Razón del cambio: * (mínimo 10 caracteres)
                </label>
                <textarea
                  id="changeReason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={4}
                  placeholder="Explica por qué estás cambiando el estado de este contrato..."
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {changeReason.length} / 10 caracteres mínimos
                </p>
              </div>

              {/* Linked Dispute (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Disputa relacionada (opcional):
                </label>

                {loadingDisputes ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin h-5 w-5 border-2 border-sky-500 border-t-transparent rounded-full"></div>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Cargando disputas...</span>
                  </div>
                ) : (
                  <>
                    {/* Dropdown for existing disputes */}
                    {contractDisputes.length > 0 && (
                      <div className="mb-3">
                        <select
                          value={linkedDisputeId}
                          onChange={(e) => setLinkedDisputeId(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
                        >
                          <option value="">Seleccionar disputa existente...</option>
                          {contractDisputes.map((dispute) => (
                            <option key={dispute.id} value={dispute.id}>
                              {dispute.disputeNumber || dispute.id} - {dispute.category || 'Sin categoría'} - {dispute.status}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {contractDisputes.length} disputa(s) encontrada(s) para este contrato
                        </p>
                      </div>
                    )}

                    {/* Manual input for dispute ID */}
                    <div>
                      <label htmlFor="manualDisputeId" className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        O ingresar ID de disputa manualmente:
                      </label>
                      <input
                        id="manualDisputeId"
                        type="text"
                        value={linkedDisputeId}
                        onChange={(e) => setLinkedDisputeId(e.target.value)}
                        placeholder="Ej: dispute-uuid-123"
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Warning */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>⚠️ Importante:</strong> Este cambio quedará registrado en el historial del contrato y ambas partes (cliente y trabajador) serán notificadas por email.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setChangeStatusContract(null)}
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangeStatus}
                disabled={changingStatus || !newStatus || changeReason.trim().length < 10}
                className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changingStatus ? 'Cambiando...' : 'Cambiar Estado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
