import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import { useSocket } from "@/hooks/useSocket";
import type { AdminUser } from "@/types/admin";
import { Search, Ban, CheckCircle, Trash2, Eye, Wifi, WifiOff, Bell, UserPlus } from "lucide-react";

export default function AdminUsers() {
  const navigate = useNavigate();
  const { isConnected, registerAdminUserCreatedHandler, registerAdminUserUpdatedHandler } = useSocket();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  // Real-time handlers
  const handleNewUser = useCallback((data: any) => {
    console.log('🔔 New user registered:', data);
    setRealtimeAlert(`Nuevo usuario registrado: ${data.user?.name || data.user?.email}`);
    // Add to beginning of list if on first page
    if (page === 1) {
      setUsers(prev => [data.user, ...prev.slice(0, 19)]);
    }
    setTimeout(() => setRealtimeAlert(null), 5000);
  }, [page]);

  const handleUserUpdated = useCallback((data: any) => {
    console.log('🔔 User updated:', data);
    setRealtimeAlert(`Usuario actualizado: ${data.user?.name || data.user?.email}`);
    setUsers(prev =>
      prev.map(u => (u.id === data.user?.id || u._id === data.user?._id) ? { ...u, ...data.user } : u)
    );
    setTimeout(() => setRealtimeAlert(null), 5000);
  }, []);

  useEffect(() => {
    registerAdminUserCreatedHandler(handleNewUser);
    registerAdminUserUpdatedHandler(handleUserUpdated);
  }, [registerAdminUserCreatedHandler, registerAdminUserUpdatedHandler, handleNewUser, handleUserUpdated]);

  useEffect(() => {
    loadUsers();
  }, [page, search]);

  const loadUsers = async () => {
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: "20",
      };
      if (search) params.search = search;

      const res = await adminApi.users.list(params);
      if (res.success && res.data) {
        setUsers(res.data);
        if (res.pagination) {
          setTotalPages(res.pagination.pages);
        }
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async (userId: string, userName: string) => {
    const reason = prompt(`¿Por qué quieres banear a ${userName}?`);
    if (!reason) return;

    try {
      await adminApi.users.ban(userId, reason);
      alert("Usuario baneado correctamente");
      loadUsers();
    } catch (error) {
      alert("Error al banear usuario");
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      await adminApi.users.unban(userId);
      alert("Usuario desbaneado correctamente");
      loadUsers();
    } catch (error) {
      alert("Error al desbanear usuario");
    }
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
      {/* Real-time Alert */}
      {realtimeAlert && (
        <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3 animate-pulse">
          <UserPlus className="h-5 w-5 text-green-600 dark:text-green-400" />
          <span className="text-green-800 dark:text-green-200 font-medium">{realtimeAlert}</span>
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isConnected
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Administra y modera usuarios de la plataforma</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Trust Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Fecha Registro
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => (
              <tr
                key={user.id || user._id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/profile/${user.id || user._id}`)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0">
                      {user.avatar ? (
                        <img className="h-10 w-10 rounded-full object-cover" src={user.avatar} alt="" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">
                            {user.name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400">{user.name}</div>
                      {user.adminRole && (
                        <div className="text-xs text-sky-600 dark:text-sky-400">{user.adminRole}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {user.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">{user.trustScore}/100</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.infractions} infracciones</div>
                </td>
                <td className="px-6 py-4">
                  {user.isBanned ? (
                    <div>
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Baneado
                      </span>
                      {user.banReason && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-xs">
                          <span className="font-medium">Razón:</span> {user.banReason}
                        </p>
                      )}
                      {user.banningAdmin && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                          <span className="font-medium">Por:</span> {user.banningAdmin.name}
                        </p>
                      )}
                      {user.bannedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {new Date(user.bannedAt).toLocaleDateString('es-AR')} {new Date(user.bannedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      Activo
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {user.createdAt ? (
                    <>
                      <div>{new Date(user.createdAt).toLocaleDateString('es-AR')}</div>
                      <div className="text-xs">{new Date(user.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/${user.id || user._id}`);
                      }}
                      className="text-sky-600 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
                      title="Ver perfil"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {user.isBanned ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnban(user.id || user._id!);
                        }}
                        className="text-green-600 hover:text-green-900"
                        title="Desbanear"
                      >
                        <CheckCircle className="h-5 w-5" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBan(user.id || user._id!, user.name);
                        }}
                        className="text-red-600 hover:text-red-900"
                        title="Banear"
                      >
                        <Ban className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 text-gray-900 dark:text-white"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-900 dark:text-white">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 text-gray-900 dark:text-white"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
