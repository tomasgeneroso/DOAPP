import { useState, useEffect } from "react";
import { Shield, UserCog, Search, Check, X, ChevronDown } from "lucide-react";

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  adminRole?: string;
  permissions: string[];
  role: string;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  lastLogin?: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

interface Permission {
  id: string;
  category: string;
  description: string;
}

export default function RoleManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [newRole, setNewRole] = useState<string>("");
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

  useEffect(() => {
    fetchRolesAndPermissions();
    fetchUsers();
  }, [selectedRole, searchQuery]);

  const fetchRolesAndPermissions = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/admin/roles/permissions", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setRoles(data.data.roles);
        setAllPermissions(data.data.allPermissions);
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedRole && selectedRole !== "all") params.append("role", selectedRole);

      const response = await fetch(`/api/admin/roles/users?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setUsers(data.data.users);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !newRole) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/roles/users/${selectedUser._id}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminRole: newRole }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Rol asignado exitosamente");
        setShowRoleModal(false);
        fetchUsers();
      } else {
        alert(data.message || "Error al asignar rol");
      }
    } catch (error) {
      console.error("Error assigning role:", error);
      alert("Error al asignar rol");
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/roles/users/${selectedUser._id}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ permissions: customPermissions }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Permisos actualizados exitosamente");
        setShowPermissionsModal(false);
        fetchUsers();
      } else {
        alert(data.message || "Error al actualizar permisos");
      }
    } catch (error) {
      console.error("Error updating permissions:", error);
      alert("Error al actualizar permisos");
    }
  };

  const openRoleModal = (user: User) => {
    setSelectedUser(user);
    setNewRole(user.adminRole || "none");
    setShowRoleModal(true);
  };

  const openPermissionsModal = (user: User) => {
    setSelectedUser(user);
    setCustomPermissions(user.permissions || []);
    setShowPermissionsModal(true);
  };

  const togglePermission = (permissionId: string) => {
    setCustomPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((p) => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const selectAllPermissions = () => {
    setCustomPermissions(allPermissions.map(p => p.id));
  };

  const clearAllPermissions = () => {
    setCustomPermissions([]);
  };

  const permissionsByCategory = allPermissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Roles y Permisos
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Gestiona roles administrativos y permisos de usuarios
          </p>
        </div>
      </div>

      {/* Role Descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.slice(1).map((role) => ( // Skip owner role
          <div
            key={role.id}
            className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-sky-600" />
              <h3 className="font-semibold text-slate-900 dark:text-white">{role.name}</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              {role.description}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {role.permissions.length} permisos
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="all">Todos los roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="support">Support</option>
          <option value="marketing">Marketing</option>
          <option value="dpo">DPO</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Rol Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Permisos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    Cargando...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    No se encontraron usuarios
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar || "/default-avatar.png"}
                          alt={user.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.adminRole ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300">
                          {user.adminRole.replace("_", " ").toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">Sin rol admin</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {user.permissions?.length || 0} permisos
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {user.isVerified && (
                          <span title="Verificado">
                            <Check className="h-4 w-4 text-green-600" />
                          </span>
                        )}
                        {user.isBanned && (
                          <span title="Baneado">
                            <X className="h-4 w-4 text-red-600" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openRoleModal(user)}
                          className="px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded transition"
                        >
                          Asignar Rol
                        </button>
                        <button
                          onClick={() => openPermissionsModal(user)}
                          className="px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                        >
                          Permisos
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Role Modal */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full m-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Asignar Rol a {selectedUser.name}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Seleccionar Rol
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="none">Sin rol admin</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="support">Support</option>
                    <option value="marketing">Marketing</option>
                    <option value="dpo">Data Protection Officer</option>
                  </select>
                </div>
                {newRole !== "none" && (
                  <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {roles.find((r) => r.id === newRole)?.description}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleAssignRole}
                  className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
                >
                  Asignar
                </button>
                <button
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Permisos Personalizados - {selectedUser.name}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Selecciona permisos específicos para este usuario
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={selectAllPermissions}
                  className="px-4 py-2 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded-lg hover:bg-sky-200 dark:hover:bg-sky-900/50 transition text-sm font-medium"
                >
                  Seleccionar Todo
                </button>
                <button
                  onClick={clearAllPermissions}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition text-sm font-medium"
                >
                  Borrar Todo
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                  <div key={category}>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {permissions.map((permission) => (
                        <label
                          key={permission.id}
                          className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition"
                        >
                          <input
                            type="checkbox"
                            checked={customPermissions.includes(permission.id)}
                            onChange={() => togglePermission(permission.id)}
                            className="mt-0.5 h-4 w-4 text-sky-600 border-slate-300 dark:border-slate-600 rounded focus:ring-sky-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {permission.id}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {permission.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex gap-3">
              <button
                onClick={handleUpdatePermissions}
                className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
              >
                Guardar Cambios
              </button>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
