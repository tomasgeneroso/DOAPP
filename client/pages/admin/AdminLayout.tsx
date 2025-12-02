import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import {
  LayoutDashboard,
  Users,
  FileText,
  TicketIcon,
  BarChart3,
  Settings,
  Shield,
  Lock,
  LogOut,
  DollarSign,
  Briefcase,
  Sun,
  Moon,
} from "lucide-react";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

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
    { path: "/admin", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "super_admin", "admin", "support", "marketing", "dpo"] },
    { path: "/admin/analytics", icon: BarChart3, label: "Analytics", roles: ["owner", "super_admin", "admin", "marketing"] },
    { path: "/admin/users", icon: Users, label: "Usuarios", roles: ["owner", "super_admin", "admin"] },
    { path: "/admin/jobs", icon: Briefcase, label: "Publicaciones", roles: ["owner", "super_admin", "admin", "marketing"] },
    { path: "/admin/roles", icon: Shield, label: "Asignar Roles", roles: ["owner", "super_admin", "admin"] },
    { path: "/admin/role-permissions", icon: Lock, label: "Permisos de Roles", roles: ["owner", "super_admin"] },
    { path: "/admin/contracts", icon: FileText, label: "Contratos", roles: ["owner", "super_admin", "admin"] },
    { path: "/admin/financial-transactions", icon: DollarSign, label: "Movimientos Financieros", roles: ["owner", "super_admin", "admin"] },
    { path: "/admin/disputes", icon: Shield, label: "Disputas", roles: ["owner", "super_admin", "admin", "support"] },
    { path: "/admin/tickets", icon: TicketIcon, label: "Tickets", roles: ["owner", "super_admin", "admin", "support"] },
    { path: "/admin/settings", icon: Settings, label: "Configuración", roles: ["owner", "super_admin"] },
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(user.adminRole!));

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 min-h-screen bg-white dark:bg-slate-800 shadow-md border-r border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="p-6 sticky top-0">
          <div className="flex items-center gap-2 mb-8">
            <Shield className="h-8 w-8 text-sky-600" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Panel Admin</h1>
          </div>

          {/* User Info */}
          <div className="mb-6 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{user.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 rounded">
              {user.adminRole?.replace("_", " ").toUpperCase()}
            </span>
          </div>

          {/* Theme Toggle */}
          <div className="mb-6 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isDark ? "Modo Oscuro" : "Modo Claro"}
              </span>
              <button
                onClick={toggleTheme}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                style={{ backgroundColor: isDark ? '#0ea5e9' : '#cbd5e1' }}
              >
                <span
                  className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-md transition-transform ${
                    isDark ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                >
                  {isDark ? (
                    <Moon className="h-3 w-3 text-sky-600" />
                  ) : (
                    <Sun className="h-3 w-3 text-amber-500" />
                  )}
                </span>
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1">
            {visibleItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 px-3 py-2 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-700 dark:hover:text-sky-400 transition"
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Back to App */}
          <Link
            to="/"
            className="flex items-center justify-center gap-2 px-3 py-2 mt-6 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition w-full border border-slate-200 dark:border-slate-600"
          >
            <span className="text-sm font-medium">Volver a la app</span>
          </Link>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 mt-3 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition w-full"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 min-h-screen">
        <div className="p-8 min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
