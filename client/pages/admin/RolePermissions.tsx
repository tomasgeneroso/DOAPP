import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Shield, Save, RotateCcw, Lock, AlertTriangle } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: readonly string[];
}

interface Permission {
  id: string;
  category: string;
  description: string;
}

interface RolePermissions {
  [roleId: string]: string[];
}

export default function RolePermissionsPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({});
  const [originalPermissions, setOriginalPermissions] = useState<RolePermissions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);

  const isOwner = user?.adminRole === "owner";
  const isSuperAdmin = user?.adminRole === "super_admin";
  const canEditRoles = isOwner || isSuperAdmin;

  useEffect(() => {
    fetchRolesAndPermissions();
  }, []);

  useEffect(() => {
    // Check if there are unsaved changes
    const changed = Object.keys(rolePermissions).some((roleId) => {
      const original = originalPermissions[roleId] || [];
      const current = rolePermissions[roleId] || [];
      return JSON.stringify(original.sort()) !== JSON.stringify(current.sort());
    });
    setHasChanges(changed);
  }, [rolePermissions, originalPermissions]);

  const fetchRolesAndPermissions = async () => {
    try {
      setLoading(true);
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

        // Initialize role permissions state
        const rolePerms: RolePermissions = {};
        data.data.roles.forEach((role: Role) => {
          rolePerms[role.id] = [...role.permissions];
        });
        setRolePermissions(rolePerms);
        setOriginalPermissions(JSON.parse(JSON.stringify(rolePerms)));

        // Select first editable role by default
        const firstEditableRole = data.data.roles.find((r: Role) => {
          if (isOwner) return r.id !== "owner"; // Owner can edit all except itself
          if (isSuperAdmin) return r.id !== "owner" && r.id !== "super_admin"; // SuperAdmin cannot edit owner or itself
          return false;
        });
        if (firstEditableRole) {
          setSelectedRole(firstEditableRole.id);
        }
      }
    } catch (error) {
      console.error("Error fetching roles:", error);
    } finally {
      setLoading(false);
    }
  };

  const canEditRole = (roleId: string): boolean => {
    if (!canEditRoles) return false;
    if (roleId === "owner") return false; // Nobody can edit owner permissions
    if (isSuperAdmin && roleId === "super_admin") return false; // SuperAdmin cannot edit their own role
    return true;
  };

  const togglePermission = (roleId: string, permissionId: string) => {
    if (!canEditRole(roleId)) return;

    setRolePermissions((prev) => {
      const currentPerms = prev[roleId] || [];
      const newPerms = currentPerms.includes(permissionId)
        ? currentPerms.filter((p) => p !== permissionId)
        : [...currentPerms, permissionId];
      return {
        ...prev,
        [roleId]: newPerms,
      };
    });
  };

  const selectAllPermissions = (roleId: string) => {
    if (!canEditRole(roleId)) return;

    setRolePermissions((prev) => ({
      ...prev,
      [roleId]: allPermissions.map((p) => p.id),
    }));
  };

  const clearAllPermissions = (roleId: string) => {
    if (!canEditRole(roleId)) return;

    setRolePermissions((prev) => ({
      ...prev,
      [roleId]: [],
    }));
  };

  const resetRole = (roleId: string) => {
    if (!canEditRole(roleId)) return;

    setRolePermissions((prev) => ({
      ...prev,
      [roleId]: [...(originalPermissions[roleId] || [])],
    }));
  };

  const saveRolePermissions = async (roleId: string) => {
    if (!canEditRole(roleId)) return;

    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          permissions: rolePermissions[roleId] || [],
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Permisos del rol ${roleId} actualizados exitosamente`);
        // Update original permissions
        setOriginalPermissions((prev) => ({
          ...prev,
          [roleId]: [...(rolePermissions[roleId] || [])],
        }));
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error saving permissions:", error);
      alert("Error al guardar los permisos");
    } finally {
      setSaving(false);
    }
  };

  const permissionsByCategory = allPermissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  const selectedRoleData = roles.find((r) => r.id === selectedRole);
  const selectedRolePerms = rolePermissions[selectedRole] || [];
  const isRoleEditable = canEditRole(selectedRole);
  const hasRoleChanges =
    JSON.stringify([...(originalPermissions[selectedRole] || [])].sort()) !==
    JSON.stringify([...selectedRolePerms].sort());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!canEditRoles) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-red-600 dark:text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-red-900 dark:text-red-100 mb-2">
            Acceso Denegado
          </h2>
          <p className="text-red-700 dark:text-red-300">
            Solo Owner y Super Admin pueden editar permisos de roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Permisos de Roles
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configura los permisos predefinidos para cada rol administrativo
          </p>
        </div>
        {hasChanges && (
          <div className="bg-yellow-100 dark:bg-yellow-900/20 px-4 py-2 rounded-lg border border-yellow-300 dark:border-yellow-700">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Tienes cambios sin guardar
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Role Selector Sidebar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Roles</h3>
          {roles.map((role) => {
            const editable = canEditRole(role.id);
            const roleHasChanges =
              JSON.stringify([...(originalPermissions[role.id] || [])].sort()) !==
              JSON.stringify([...(rolePermissions[role.id] || [])].sort());

            return (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id)}
                className={`w-full text-left px-4 py-3 rounded-lg transition ${
                  selectedRole === role.id
                    ? "bg-sky-100 dark:bg-sky-900/30 border-2 border-sky-500"
                    : "bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600"
                } ${!editable ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!editable}
              >
                <div className="flex items-center gap-2">
                  {!editable && <Lock className="h-4 w-4 text-gray-400" />}
                  <Shield
                    className={`h-4 w-4 ${
                      selectedRole === role.id ? "text-sky-600 dark:text-sky-400" : "text-gray-400"
                    }`}
                  />
                  <span className="font-medium text-gray-900 dark:text-white">{role.name}</span>
                  {roleHasChanges && (
                    <span className="ml-auto w-2 h-2 bg-yellow-500 rounded-full"></span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  {(rolePermissions[role.id] || []).length} permisos
                </p>
              </button>
            );
          })}
        </div>

        {/* Permissions Editor */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          {selectedRoleData && (
            <>
              {/* Role Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    {!isRoleEditable && <Lock className="h-6 w-6 text-gray-400" />}
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedRoleData.name}
                    </h2>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">
                    {selectedRoleData.description}
                  </p>
                  {!isRoleEditable && (
                    <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
                      🔒 No puedes editar este rol
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {isRoleEditable && (
                    <>
                      <button
                        onClick={() => selectAllPermissions(selectedRole)}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm"
                      >
                        Seleccionar Todo
                      </button>
                      <button
                        onClick={() => clearAllPermissions(selectedRole)}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition text-sm"
                      >
                        Borrar Todo
                      </button>
                      {hasRoleChanges && (
                        <button
                          onClick={() => resetRole(selectedRole)}
                          className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition text-sm flex items-center gap-2"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Resetear
                        </button>
                      )}
                      <button
                        onClick={() => saveRolePermissions(selectedRole)}
                        disabled={saving || !hasRoleChanges}
                        className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="h-4 w-4" />
                        {saving ? "Guardando..." : "Guardar Cambios"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Permissions by Category */}
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                {Object.entries(permissionsByCategory).map(([category, perms]) => (
                  <div key={category}>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 sticky top-0 bg-white dark:bg-gray-800 py-2">
                      {category}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {perms.map((permission) => (
                        <label
                          key={permission.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 transition ${
                            selectedRolePerms.includes(permission.id)
                              ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          } ${isRoleEditable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRolePerms.includes(permission.id)}
                            onChange={() => togglePermission(selectedRole, permission.id)}
                            disabled={!isRoleEditable}
                            className="mt-1 h-4 w-4 text-sky-600 rounded border-gray-300 focus:ring-sky-500"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              {permission.id}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {permission.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
