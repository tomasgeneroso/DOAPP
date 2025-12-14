import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import type { Ticket } from "@/types/admin";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortField = 'subject' | 'category' | 'priority' | 'status' | 'date' | 'user';
type SortDirection = 'asc' | 'desc' | null;

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  useEffect(() => {
    loadTickets();
  }, [page, search, statusFilter]);

  const loadTickets = async () => {
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: "20",
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const res = await adminApi.tickets.list(params);
      if (res.success && res.data) {
        setTickets(res.data);
      }
    } catch (error) {
      console.error("Error loading tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800";
      case "assigned":
        return "bg-purple-100 text-purple-800";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
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

  const getPriorityOrder = (priority: string): number => {
    const order: Record<string, number> = {
      'urgent': 4,
      'high': 3,
      'medium': 2,
      'low': 1
    };
    return order[priority] || 0;
  };

  const getStatusOrder = (status: string): number => {
    const order: Record<string, number> = {
      'open': 1,
      'assigned': 2,
      'in_progress': 3,
      'resolved': 4,
      'closed': 5
    };
    return order[status] || 0;
  };

  const getFilteredTickets = () => {
    return tickets.filter((ticket) => {
      const ticketDate = new Date(ticket.createdAt);
      const matchesDateFrom = !dateFrom || ticketDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || ticketDate <= new Date(dateTo + 'T23:59:59');
      return matchesDateFrom && matchesDateTo;
    });
  };

  const getSortedTickets = () => {
    const filtered = getFilteredTickets();
    if (!sortField || !sortDirection) return filtered;

    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'subject':
          comparison = a.subject.localeCompare(b.subject, 'es');
          break;
        case 'user':
          comparison = a.createdBy.name.localeCompare(b.createdBy.name, 'es');
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category, 'es');
          break;
        case 'priority':
          comparison = getPriorityOrder(a.priority) - getPriorityOrder(b.priority);
          break;
        case 'status':
          comparison = getStatusOrder(a.status) - getStatusOrder(b.status);
          break;
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-4 h-4" />
      : <ArrowDown className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tickets de Soporte</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Gestiona consultas y problemas de usuarios. Los usuarios crean tickets desde su panel.
          </p>
        </div>
        <Link
          to="/admin/tickets/create"
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition shadow-md hover:shadow-lg"
        >
          <Plus className="h-5 w-5" />
          Crear Ticket
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
        >
          <option value="">Todos los estados</option>
          <option value="open">Abiertos</option>
          <option value="assigned">Asignados</option>
          <option value="in_progress">En progreso</option>
          <option value="resolved">Resueltos</option>
          <option value="closed">Cerrados</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-gray-900 dark:text-white"
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Tickets List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Ticket
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('subject')}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Asunto
                  <SortIcon field="subject" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('category')}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Categoría
                  <SortIcon field="category" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('priority')}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Prioridad
                  <SortIcon field="priority" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Estado
                  <SortIcon field="status" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <button
                  onClick={() => handleSort('date')}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  Creado
                  <SortIcon field="date" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {getSortedTickets().map((ticket) => (
              <tr key={ticket.id || ticket._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    to={`/admin/tickets/${ticket.id || ticket._id}`}
                    className="text-sm font-medium text-sky-600 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
                  >
                    {ticket.ticketNumber}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 dark:text-white">{ticket.subject}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Por {ticket.createdBy?.name || ticket.user?.name || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {ticket.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getPriorityColor(
                      ticket.priority
                    )}`}
                  >
                    {ticket.priority}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                      ticket.status
                    )}`}
                  >
                    {ticket.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  <div>{new Date(ticket.createdAt).toLocaleDateString('es-AR')}</div>
                  <div className="text-xs">{new Date(ticket.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tickets.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow mt-6">
          <p className="text-gray-500 dark:text-gray-400">No hay tickets para mostrar</p>
        </div>
      )}
    </div>
  );
}
