import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  FileText,
  TicketIcon,
  BarChart3,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect if not admin
  if (!user?.adminRole) {
    navigate("/");
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navItems = [
    { path: "/admin", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "super_admin", "admin", "support", "marketing"] },
    { path: "/admin/users", icon: Users, label: "Usuarios", roles: ["owner", "super_admin", "admin"] },
    { path: "/admin/contracts", icon: FileText, label: "Contratos", roles: ["owner", "super_admin", "admin"] },
    { path: "/admin/tickets", icon: TicketIcon, label: "Tickets", roles: ["owner", "super_admin", "admin", "support"] },
    { path: "/admin/analytics", icon: BarChart3, label: "Analíticas", roles: ["owner", "super_admin", "admin", "marketing"] },
    { path: "/admin/settings", icon: Settings, label: "Configuración", roles: ["owner", "super_admin"] },
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(user.adminRole!));

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <Shield className="h-8 w-8 text-sky-600" />
            <h1 className="text-xl font-bold text-gray-900">Panel Admin</h1>
          </div>

          {/* User Info */}
          <div className="mb-6 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
            <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold text-sky-700 bg-sky-100 rounded">
              {user.adminRole?.replace("_", " ").toUpperCase()}
            </span>
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            {visibleItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 px-3 py-2 text-gray-700 rounded-lg hover:bg-sky-50 hover:text-sky-700 transition"
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 mt-6 text-red-600 rounded-lg hover:bg-red-50 transition w-full"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
