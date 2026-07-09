import { useState, useEffect } from "react";
import { getImageUrl } from '@/utils/imageUrl';
import { useTranslation } from "react-i18next";
import { Shield, UserCog, Search, Check, X, Lock, Eye, EyeOff, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const isOwner = currentUser?.adminRole === "owner";

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

  // Password confirmation modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalRole, setPasswordModalRole] = useState<"owner" | "admin">("admin");
  const [rolePassword, setRolePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Security settings (owner only)
  const [showSecuritySettings, setShowSecuritySettings] = useState(false);
  const [securityRole, setSecurityRole] = useState<"owner" | "admin">("admin");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ ownerPasswordSet: boolean; adminPasswordSet: boolean; emergencyPasswordSet: boolean } | null>(null);
  // Verification for CHANGING an already-set role password
  const [currentPassword, setCurrentPassword] = useState("");
  const [emergencyPassword, setEmergencyPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [requestingCode, setRequestingCode] = useState(false);
  // Emergency password configuration (gated by owner account password)
  const [showEmergencySettings, setShowEmergencySettings] = useState(false);
  const [emergencyNewPassword, setEmergencyNewPassword] = useState("");
  const [emergencyConfirm, setEmergencyConfirm] = useState("");
  const [ownerAccountPassword, setOwnerAccountPassword] = useState("");
  const [savingEmergency, setSavingEmergency] = useState(false);

  useEffect(() => {
    fetchRolesAndPermissions();
    fetchUsers();
    if (isOwner) fetchPasswordStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fetchPasswordStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/roles/security/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setPasswordStatus(data.data);
    } catch {}
  };

  const handleAssignRole = async (password?: string) => {
    if (!selectedUser || !newRole) return;

    // Roles that require password
    if ((newRole === "owner" || newRole === "admin") && !password) {
      setPasswordModalRole(newRole as "owner" | "admin");
      setRolePassword("");
      setPasswordError("");
      setShowPasswordModal(true);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/roles/users/${selectedUser._id}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminRole: newRole, rolePassword: password }),
      });

      const data = await response.json();
      if (data.success) {
        setShowRoleModal(false);
        setShowPasswordModal(false);
        setRolePassword("");
        fetchUsers();
      } else {
        if (password) {
          setPasswordError(data.message || "Contraseña incorrecta");
        } else {
          alert(data.message || t('admin.roles.errorAssigningRole', 'Error assigning role'));
        }
      }
    } catch (error) {
      console.error("Error assigning role:", error);
      alert(t('admin.roles.errorAssigningRole', 'Error assigning role'));
    }
  };

  const handlePasswordConfirm = async () => {
    if (!rolePassword.trim()) {
      setPasswordError("Ingresá la contraseña");
      return;
    }
    setPasswordError("");
    await handleAssignRole(rolePassword);
  };

  const handleSaveSecurityPassword = async () => {
    if (newPassword.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }
    setSavingPassword(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/roles/security/passwords", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: securityRole,
          newPassword,
          confirmPassword,
          // Sent only when changing an already-configured password:
          currentPassword: currentPassword || undefined,
          emergencyPassword: emergencyPassword || undefined,
          resetToken: resetToken || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewPassword("");
        setConfirmPassword("");
        setCurrentPassword("");
        setEmergencyPassword("");
        setResetToken("");
        setShowSecuritySettings(false);
        fetchPasswordStatus();
        alert(`Contraseña para rol '${securityRole}' guardada correctamente`);
      } else {
        alert(data.message || "Error al guardar contraseña");
      }
    } catch {
      alert("Error al guardar contraseña");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRequestResetCode = async () => {
    setRequestingCode(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/roles/security/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: securityRole }),
      });
      const data = await res.json();
      alert(data.message || (data.success ? "Código enviado" : "Error al enviar el código"));
    } catch {
      alert("Error al enviar el código");
    } finally {
      setRequestingCode(false);
    }
  };

  const handleSaveEmergencyPassword = async () => {
    if (emergencyNewPassword.length < 10) {
      alert("La contraseña de emergencia debe tener al menos 10 caracteres");
      return;
    }
    if (emergencyNewPassword !== emergencyConfirm) {
      alert("Las contraseñas no coinciden");
      return;
    }
    if (!ownerAccountPassword) {
      alert("Ingresá la contraseña de tu cuenta de owner para autorizar el cambio");
      return;
    }
    setSavingEmergency(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/roles/security/emergency-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          newPassword: emergencyNewPassword,
          confirmPassword: emergencyConfirm,
          ownerAccountPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmergencyNewPassword("");
        setEmergencyConfirm("");
        setOwnerAccountPassword("");
        setShowEmergencySettings(false);
        fetchPasswordStatus();
        alert("Contraseña de emergencia guardada correctamente");
      } else {
        alert(data.message || "Error al guardar la contraseña de emergencia");
      }
    } catch {
      alert("Error al guardar la contraseña de emergencia");
    } finally {
      setSavingEmergency(false);
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
        alert(t('admin.roles.permissionsUpdatedSuccess', 'Permissions updated successfully'));
        setShowPermissionsModal(false);
        fetchUsers();
      } else {
        alert(data.message || t('admin.roles.errorUpdatingPermissions', 'Error updating permissions'));
      }
    } catch (error) {
      console.error("Error updating permissions:", error);
      alert(t('admin.roles.errorUpdatingPermissions', 'Error updating permissions'));
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
            {t('admin.roles.rolesAndPermissions', 'Roles and Permissions')}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t('admin.roles.manageRolesDescription', 'Manage administrative roles and user permissions')}
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
              {role.permissions.length} {t('admin.roles.permissions', 'permissions')}
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
            placeholder={t('admin.roles.searchPlaceholder', 'Search by name or email...')}
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
          <option value="all">{t('admin.roles.allRoles', 'All roles')}</option>
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
                  {t('admin.roles.user', 'User')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t('admin.roles.adminRole', 'Admin Role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t('admin.roles.permissions', 'Permissions')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t('admin.roles.statusLabel', 'Status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t('admin.roles.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    {t('common.loading', 'Loading...')}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    {t('admin.roles.noUsersFound', 'No users found')}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <img
                          src={getImageUrl(user.avatar)}
                          alt={user.name}
                          className="h-8 w-8 rounded-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`;
                          }}
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
                        <span className="text-sm text-slate-400">{t('admin.roles.noAdminRole', 'No admin role')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {user.permissions?.length || 0} {t('admin.roles.permissions', 'permissions')}
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
                          {t('admin.roles.assignRole', 'Assign Role')}
                        </button>
                        <button
                          onClick={() => openPermissionsModal(user)}
                          className="px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                        >
                          {t('admin.roles.permissions', 'Permissions')}
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
                {t('admin.roles.assignRoleTo', 'Assign Role to')} {selectedUser.name}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('admin.roles.selectRole', 'Select Role')}
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="none">{t('admin.roles.noAdminRole', 'No admin role')}</option>
                    {isOwner && <option value="owner">Owner 🔒</option>}
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin 🔒</option>
                    <option value="support">Support</option>
                    <option value="marketing">Marketing</option>
                    <option value="dpo">Data Protection Officer</option>
                  </select>
                  {(newRole === "owner" || newRole === "admin") && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                      <Lock className="h-3 w-3" />
                      Este rol requiere contraseña de seguridad al asignar
                    </p>
                  )}
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
                  onClick={() => handleAssignRole()}
                  className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
                >
                  {t('admin.roles.assign', 'Assign')}
                </button>
                <button
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password confirmation modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Contraseña requerida
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rol: <span className="font-semibold capitalize">{passwordModalRole}</span>
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Para asignar el rol <strong>{passwordModalRole}</strong> ingresá la contraseña de seguridad configurada por el owner.
            </p>
            <div className="relative mb-2">
              <input
                type={showPassword ? "text" : "password"}
                value={rolePassword}
                onChange={e => { setRolePassword(e.target.value); setPasswordError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePasswordConfirm()}
                placeholder="Contraseña de seguridad"
                autoFocus
                className={`w-full px-4 py-2.5 pr-10 border rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 ${passwordError ? "border-red-400 focus:ring-red-400" : "border-slate-200 dark:border-slate-700 focus:ring-sky-500"}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-red-500 mb-3 flex items-center gap-1">
                <X className="h-3 w-3" /> {passwordError}
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowPasswordModal(false); setRolePassword(""); setPasswordError(""); }}
                className="flex-1 px-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handlePasswordConfirm}
                className="flex-1 px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security settings (owner only) */}
      {isOwner && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Contraseñas de seguridad</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Protegen la asignación de roles críticos
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSecuritySettings(v => !v)}
              className="px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg transition font-medium"
            >
              {showSecuritySettings ? "Cerrar" : "Configurar"}
            </button>
          </div>

          {passwordStatus && (
            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${passwordStatus.ownerPasswordSet ? "bg-green-500" : "bg-red-400"}`} />
                <span className="text-slate-600 dark:text-slate-400">
                  Owner: {passwordStatus.ownerPasswordSet ? "configurada" : "no configurada"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${passwordStatus.adminPasswordSet ? "bg-green-500" : "bg-red-400"}`} />
                <span className="text-slate-600 dark:text-slate-400">
                  Admin: {passwordStatus.adminPasswordSet ? "configurada" : "no configurada"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${passwordStatus.emergencyPasswordSet ? "bg-green-500" : "bg-red-400"}`} />
                <span className="text-slate-600 dark:text-slate-400">
                  Emergencia: {passwordStatus.emergencyPasswordSet ? "configurada" : "no configurada"}
                </span>
              </div>
            </div>
          )}

          {showSecuritySettings && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Configurar contraseña para rol
                </label>
                <div className="flex gap-2 mb-3">
                  {(["owner", "admin"] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setSecurityRole(r)}
                      className={`px-4 py-1.5 text-sm rounded-lg font-medium transition ${
                        securityRole === r
                          ? "bg-amber-500 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                      }`}
                    >
                      {r === "owner" ? "Owner" : "Admin"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Nueva contraseña (mín. 8 caracteres)
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña"
                    className="w-full px-4 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repetir contraseña"
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              {(securityRole === "owner" ? passwordStatus?.ownerPasswordSet : passwordStatus?.adminPasswordSet) && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-3">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Esta contraseña ya está configurada. Para cambiarla necesitás <b>una</b> de estas opciones:
                  </p>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      1) Contraseña actual del rol
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Contraseña actual"
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      2) Contraseña de emergencia {!passwordStatus?.emergencyPasswordSet && "(no configurada aún)"}
                    </label>
                    <input
                      type="password"
                      value={emergencyPassword}
                      onChange={e => setEmergencyPassword(e.target.value)}
                      placeholder="Contraseña de emergencia"
                      disabled={!passwordStatus?.emergencyPasswordSet}
                      className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                      3) Código enviado al correo del owner
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={resetToken}
                        onChange={e => setResetToken(e.target.value.toUpperCase())}
                        placeholder="Código de 8 caracteres"
                        className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 tracking-widest"
                      />
                      <button
                        type="button"
                        onClick={handleRequestResetCode}
                        disabled={requestingCode}
                        className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition whitespace-nowrap"
                      >
                        {requestingCode ? "Enviando..." : "Enviar código"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={handleSaveSecurityPassword}
                disabled={savingPassword || !newPassword || !confirmPassword}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition"
              >
                {savingPassword ? "Guardando..." : `Guardar contraseña de ${securityRole}`}
              </button>
            </div>
          )}

          {/* Emergency password configuration (gated by owner account password) */}
          <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Contraseña de emergencia</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Sirve para cambiar las contraseñas de rol si perdés la actual. Cambiarla requiere la contraseña de tu cuenta de owner.
                </p>
              </div>
              <button
                onClick={() => setShowEmergencySettings(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 font-medium whitespace-nowrap"
              >
                {showEmergencySettings ? "Cerrar" : passwordStatus?.emergencyPasswordSet ? "Cambiar" : "Configurar"}
              </button>
            </div>
            {showEmergencySettings && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Nueva contraseña de emergencia (mín. 10 caracteres)
                  </label>
                  <input
                    type="password"
                    value={emergencyNewPassword}
                    onChange={e => setEmergencyNewPassword(e.target.value)}
                    placeholder="Contraseña de emergencia"
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Confirmar</label>
                  <input
                    type="password"
                    value={emergencyConfirm}
                    onChange={e => setEmergencyConfirm(e.target.value)}
                    placeholder="Repetir contraseña de emergencia"
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Contraseña de tu cuenta de owner (para autorizar)
                  </label>
                  <input
                    type="password"
                    value={ownerAccountPassword}
                    onChange={e => setOwnerAccountPassword(e.target.value)}
                    placeholder="Tu contraseña de login"
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <button
                  onClick={handleSaveEmergencyPassword}
                  disabled={savingEmergency || !emergencyNewPassword || !emergencyConfirm || !ownerAccountPassword}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition"
                >
                  {savingEmergency ? "Guardando..." : "Guardar contraseña de emergencia"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('admin.roles.customPermissions', 'Custom Permissions')} - {selectedUser.name}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {t('admin.roles.selectSpecificPermissions', 'Select specific permissions for this user')}
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={selectAllPermissions}
                  className="px-4 py-2 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded-lg hover:bg-sky-200 dark:hover:bg-sky-900/50 transition text-sm font-medium"
                >
                  {t('admin.roles.selectAll', 'Select All')}
                </button>
                <button
                  onClick={clearAllPermissions}
                  className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition text-sm font-medium"
                >
                  {t('admin.roles.clearAll', 'Clear All')}
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
                {t('admin.roles.saveChanges', 'Save Changes')}
              </button>
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
