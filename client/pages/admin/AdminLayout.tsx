import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useSocket } from "@/hooks/useSocket";
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
  Gift,
  Activity,
  Wifi,
  WifiOff,
  AlertTriangle,
  CreditCard,
  ArrowDownLeft,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface NavGroup {
  label: string;
  icon: any;
  roles: string[];
  items: NavItem[];
}

interface NavItem {
  path: string;
  icon: any;
  label: string;
  roles: string[];
  badge?: string;
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { isConnected, reconnect } = useSocket();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['general', 'operations', 'finance', 'support']);

  // Redirect if not admin
  if (!user?.adminRole) {
    navigate("/");
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupLabel)
        ? prev.filter(g => g !== groupLabel)
        : [...prev, groupLabel]
    );
  };

  // Grouped navigation structure
  const navGroups: NavGroup[] = [
    {
      label: "general",
      icon: LayoutDashboard,
      roles: ["owner", "super_admin", "admin", "support", "marketing", "dpo"],
      items: [
        { path: "/admin", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "super_admin", "admin", "support", "marketing", "dpo"] },
        { path: "/admin/analytics", icon: BarChart3, label: "Analytics", roles: ["owner", "super_admin", "admin", "marketing"] },
        { path: "/admin/performance", icon: Activity, label: "Rendimiento", roles: ["owner", "super_admin", "admin"] },
      ]
    },
    {
      label: "operations",
      icon: Briefcase,
      roles: ["owner", "super_admin", "admin", "marketing"],
      items: [
        { path: "/admin/users", icon: Users, label: "Usuarios", roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/jobs", icon: Briefcase, label: "Publicaciones", roles: ["owner", "super_admin", "admin", "marketing"] },
        { path: "/admin/contracts", icon: FileText, label: "Contratos", roles: ["owner", "super_admin", "admin"] },
      ]
    },
    {
      label: "finance",
      icon: DollarSign,
      roles: ["owner", "super_admin", "admin"],
      items: [
        { path: "/admin/pending-payments", icon: CreditCard, label: "Pagos Pendientes", roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/withdrawals", icon: ArrowDownLeft, label: "Retiros", roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/financial-transactions", icon: TrendingUp, label: "Movimientos", roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/family-codes", icon: Gift, label: "Códigos Familia", roles: ["owner"] },
      ]
    },
    {
      label: "support",
      icon: TicketIcon,
      roles: ["owner", "super_admin", "admin", "support"],
      items: [
        { path: "/admin/disputes", icon: AlertTriangle, label: "Disputas", roles: ["owner", "super_admin", "admin", "support"] },
        { path: "/admin/tickets", icon: TicketIcon, label: "Tickets", roles: ["owner", "super_admin", "admin", "support"] },
      ]
    },
    {
      label: "settings",
      icon: Settings,
      roles: ["owner", "super_admin"],
      items: [
        { path: "/admin/roles", icon: Shield, label: "Asignar Roles", roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/role-permissions", icon: Lock, label: "Permisos", roles: ["owner", "super_admin"] },
        { path: "/admin/settings", icon: Settings, label: "Configuración", roles: ["owner", "super_admin"] },
      ]
    },
  ];

  const groupLabels: Record<string, string> = {
    general: "General",
    operations: "Operaciones",
    finance: "Finanzas",
    support: "Soporte",
    settings: "Configuración",
  };

  // Filter groups and items by user role
  const visibleGroups = navGroups
    .filter(group => group.roles.includes(user.adminRole!))
    .map(group => ({
      ...group,
      items: group.items.filter(item => item.roles.includes(user.adminRole!))
    }))
    .filter(group => group.items.length > 0);

  const isActivePath = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className="w-64 min-h-screen bg-white dark:bg-slate-800 shadow-md border-r border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="p-4 sticky top-0 h-screen overflow-y-auto">
          {/* Header with connection status */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Shield className="h-7 w-7 text-sky-600" />
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Admin</h1>
            </div>
            {/* Real-time connection indicator */}
            <button
              onClick={reconnect}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                isConnected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50'
              }`}
              title={isConnected ? 'Conectado en tiempo real' : 'Click para reconectar'}
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span className="hidden sm:inline">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              )}
            </button>
          </div>

          {/* User Info - Compact */}
          <div className="mb-4 p-3 bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-sky-900/20 dark:to-indigo-900/20 rounded-lg border border-sky-100 dark:border-sky-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-sky-600 flex items-center justify-center text-white font-bold text-sm">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.name}</p>
                <span className="inline-block px-1.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 rounded">
                  {user.adminRole?.replace("_", " ").toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Theme Toggle - Compact */}
          <div className="mb-4 flex items-center justify-between px-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isDark ? "Oscuro" : "Claro"}
            </span>
            <button
              onClick={toggleTheme}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              style={{ backgroundColor: isDark ? '#0ea5e9' : '#cbd5e1' }}
            >
              <span
                className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                  isDark ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              >
                {isDark ? (
                  <Moon className="h-2.5 w-2.5 text-sky-600" />
                ) : (
                  <Sun className="h-2.5 w-2.5 text-amber-500" />
                )}
              </span>
            </button>
          </div>

          {/* Grouped Navigation */}
          <nav className="space-y-2">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-300 transition"
                >
                  <span>{groupLabels[group.label]}</span>
                  {expandedGroups.includes(group.label) ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Group Items */}
                {expandedGroups.includes(group.label) && (
                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                          isActivePath(item.path)
                            ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="ml-auto px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Bottom Actions */}
          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <Link
              to="/"
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition border border-slate-200 dark:border-slate-600"
            >
              Volver a la app
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-3 py-2 w-full text-sm text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
        <div className="p-6 min-h-[calc(100vh-1px)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
