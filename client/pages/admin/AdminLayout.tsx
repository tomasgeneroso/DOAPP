import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  ShieldAlert,
  IdCard,
  BookOpen,
  CreditCard,
  Sliders,
  Mail,
  ArrowDownLeft,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Search,
  ShieldOff,
  Database,
  Star,
  BadgeCheck,
  ShieldCheck,
  Rocket,
  Sparkles,
  Calculator,
  Scale,
  GripVertical,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import Transicion from "@/components/ui/Transicion";
import { aplicarOrden, moverGrupo, moverUnLugar, leerOrdenGuardado, guardarOrden } from "../../../shared/admin/ordenDelMenu";

/** El almacenamiento del navegador, o null si está bloqueado (ventana privada, permisos): el orden entonces vale solo para esta sesión. */
const almacenDelNavegador = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

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
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { isConnected, reconnect } = useSocket();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['hubs', 'general', 'operations', 'padrones', 'finance', 'support']);

  /**
   * Orden de los GRUPOS del menú (Hubs, General, Operaciones, Padrones, Finanzas…), a gusto de cada administrador: se arrastran los grupos, no los elementos de adentro.
   * Se guarda en este navegador, por persona (shared/admin/ordenDelMenu.ts). Sin nada guardado queda el orden de siempre.
   */
  const [ordenGuardado, setOrdenGuardado] = useState<string[] | null>(() => leerOrdenGuardado(almacenDelNavegador(), user?.id));
  const [ordenando, setOrdenando] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobreEste, setSobreEste] = useState<string | null>(null);
  const [avisoDeOrden, setAvisoDeOrden] = useState('');
  useEffect(() => {
    setOrdenGuardado(leerOrdenGuardado(almacenDelNavegador(), user?.id));
  }, [user?.id]);

  /**
   * Contracargos que vencen pronto, para el contador de la barra lateral.
   *
   * Está en el menú y no sólo dentro del panel porque un contracargo tiene
   * fecha de vencimiento: si hay que acordarse de entrar a mirarlo, el día que
   * nadie se acuerde se pierde la plata. El número tiene que estar a la vista
   * desde cualquier pantalla del administrador.
   *
   * Se refresca cada cinco minutos. Si la consulta falla, el contador queda en
   * cero y el panel sigue estando: nunca bloquea el menú.
   */
  const [urgentes, setUrgentes] = useState(0);
  const [identidadesPendientes, setIdentidadesPendientes] = useState(0);
  /**
   * Si el modulo de pago al terminar esta encendido. Con el apagado la cola
   * de ordenes esta siempre vacia, y un item de menu que nunca tiene nada es
   * ruido que se aprende a ignorar -incluido el dia que si tiene algo-.
   */
  const [pagoAlTerminarActivo, setPagoAlTerminarActivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch('/api/payment-orders/estado-del-modulo')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j?.data) setPagoAlTerminarActivo(Boolean(j.data.activo));
      })
      .catch(() => {
        /* sin respuesta el item no aparece, que es el estado normal */
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.adminRole) return;
    let vivo = true;

    const traerIdentidades = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/hubs/identidad-a-revisar', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (vivo && typeof data?.pendientes === 'number') setIdentidadesPendientes(data.pendientes);
      } catch {
        /* el contador es informativo */
      }
    };

    const traer = async () => {
      void traerIdentidades();
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/hubs/financial/overview', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (vivo && data?.urgente) {
          setUrgentes(
            (data.urgente.contracargosAbiertos || 0) + (data.urgente.retencionesPorFraude || 0),
          );
        }
      } catch {
        /* el contador es informativo: que falle no puede romper el menú */
      }
    };

    traer();
    const id = setInterval(traer, 5 * 60 * 1000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [user?.adminRole]);

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
      label: "hubs",
      icon: LayoutDashboard,
      roles: ["owner", "super_admin", "admin", "support", "marketing"],
      items: [
        { path: "/admin/hubs/moderation", icon: AlertTriangle, label: '🚨 Moderation', roles: ["owner", "super_admin", "admin", "support"] },
        { path: "/admin/hubs/financial", icon: DollarSign, label: '💰 Financial', roles: ["owner", "super_admin"] },
        { path: "/admin/hubs/growth", icon: TrendingUp, label: '📈 Growth', roles: ["owner", "super_admin", "marketing"] },
      ]
    },
    {
      label: "general",
      icon: LayoutDashboard,
      roles: ["owner", "super_admin", "admin", "support", "marketing", "dpo"],
      items: [
        { path: "/admin", icon: LayoutDashboard, label: t('admin.sidebar.dashboard', 'Dashboard'), roles: ["owner", "super_admin", "admin", "support", "marketing", "dpo"] },
        // Manual del equipo y guía de errores en una sola entrada (pestañas): es donde se busca "cómo se hace esto" y
        // "qué significa este código" en vez de preguntar. La ven todos los roles; la guía de errores solo la lista de roles de dinero.
        { path: "/admin/ayuda", icon: BookOpen, label: t('admin.sidebar.help', 'Ayuda y manuales'), roles: ["owner", "super_admin", "admin", "support", "marketing", "dpo"] },
        { path: "/admin/search", icon: Search, label: t('admin.sidebar.search', 'Global Search'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/analytics", icon: BarChart3, label: t('admin.sidebar.analytics', 'Analytics'), roles: ["owner", "super_admin", "admin", "marketing"] },
        { path: "/admin/performance", icon: Activity, label: t('admin.sidebar.performance', 'Performance'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/audit-logs", icon: Shield, label: t('admin.sidebar.auditLogs', 'Registro de acciones'), roles: ["owner", "super_admin", "admin"] },
      ]
    },
    {
      label: "operations",
      icon: Briefcase,
      roles: ["owner", "super_admin", "admin", "marketing"],
      items: [
        { path: "/admin/users", icon: Users, label: t('admin.sidebar.users', 'Users'), roles: ["owner", "super_admin", "admin"] },
        // «A revisar» (un DNI que Didit leyó y ya usa otra cuenta) y «Baneadas» son una sola entrada con pestañas; el contador es de lo que hay para revisar.
        { path: "/admin/identidades", icon: IdCard, label: t('admin.sidebar.identities', 'Identidades'), roles: ["owner", "super_admin", "admin"], badge: identidadesPendientes > 0 ? String(identidadesPendientes) : undefined },
        // Un solo lugar para las publicaciones: vista general (estado final, contrato y pago de cada una), para atender y moderación. Antes eran dos entradas.
        { path: "/admin/jobs", icon: Briefcase, label: t('admin.sidebar.publications', 'Publicaciones'), roles: ["owner", "super_admin", "admin", "marketing", "support"] },
        { path: "/admin/contracts", icon: FileText, label: t('admin.sidebar.contracts', 'Contracts'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/blog", icon: FileText, label: t('admin.sidebar.blog', 'Blog'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/content-agent", icon: Sparkles, label: "Agente de contenido", roles: ["owner", "super_admin", "admin", "marketing"] },
        { path: "/admin/correos", icon: Mail, label: 'Correos a usuarios', roles: ["owner", "super_admin", "admin", "marketing"] },
      ]
    },
    {
      label: "padrones",
      icon: Database,
      roles: ["owner", "super_admin", "admin"],
      items: [
        { path: "/admin/user-data", icon: Database, label: t('admin.sidebar.userData', 'Datos de usuarios'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/jobs", icon: Briefcase, label: t('admin.sidebar.padronJobs', 'Padrón de trabajos'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/contracts", icon: FileText, label: t('admin.sidebar.padronContracts', 'Padrón de contratos'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/disputes", icon: AlertTriangle, label: t('admin.sidebar.padronDisputes', 'Padrón de disputas'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/payments", icon: CreditCard, label: t('admin.sidebar.padronPayments', 'Padrón de pagos'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/withdrawals", icon: ArrowDownLeft, label: t('admin.sidebar.padronWithdrawals', 'Padrón de retiros'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/reviews", icon: Star, label: t('admin.sidebar.padronReviews', 'Padrón de reseñas'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/tickets", icon: TicketIcon, label: t('admin.sidebar.padronTickets', 'Padrón de tickets'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/licenses", icon: BadgeCheck, label: t('admin.sidebar.padronLicenses', 'Padrón de matrículas'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/padrones/insurances", icon: ShieldCheck, label: t('admin.sidebar.padronInsurances', 'Padrón de seguros'), roles: ["owner", "super_admin", "admin"] },
      ]
    },
    {
      label: "finance",
      icon: DollarSign,
      roles: ["owner", "super_admin", "admin"],
      items: [
        // Va primero en Finanzas y con contador: es lo único de esta sección
        // que vence. Un pago por verificar espera; un contracargo, no.
        { path: "/admin/chargebacks", icon: AlertTriangle, label: t('admin.sidebar.chargebacks', 'Contracargos'), roles: ["owner", "super_admin", "admin"], badge: urgentes > 0 ? String(urgentes) : undefined },
        { path: "/admin/pending-payments", icon: CreditCard, label: t('admin.sidebar.pendingPayments', 'Pagos'), roles: ["owner", "super_admin", "admin"] },
        // Solo aparece con el modulo de pago al terminar encendido. Con el
        // apagado la lista esta siempre vacia y el item seria ruido.
        ...(pagoAlTerminarActivo
          ? [{ path: "/admin/ordenes-de-pago", icon: ShieldOff, label: t('admin.sidebar.paymentOrders', 'Órdenes de pago'), roles: ["owner", "super_admin", "admin"] }]
          : []),
        { path: "/admin/withdrawals", icon: ArrowDownLeft, label: t('admin.sidebar.withdrawals', 'Withdrawals'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/financial-transactions", icon: TrendingUp, label: t('admin.sidebar.transactions', 'Transactions'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/auditoria-saldos", icon: Scale, label: t('admin.sidebar.balanceAudit', 'Auditoría de saldos'), roles: ["owner", "super_admin"] },
        // Códigos de familia e invitaciones de influencers: una sola entrada con dos pestañas.
        { path: "/admin/codigos", icon: Gift, label: t('admin.sidebar.accessCodes', 'Códigos e invitaciones'), roles: ["owner"] },
        { path: "/admin/business-plan", icon: Calculator, label: t('admin.sidebar.businessPlan', 'Proyección de gastos'), roles: ["owner"] },
        { path: "/admin/unit-economics", icon: TrendingUp, label: t('admin.sidebar.unitEconomics', 'Economía unitaria'), roles: ["owner"] },
      ]
    },
    {
      label: "support",
      icon: TicketIcon,
      roles: ["owner", "super_admin", "admin", "support"],
      items: [
        { path: "/admin/disputes", icon: AlertTriangle, label: t('admin.sidebar.disputes', 'Disputes'), roles: ["owner", "super_admin", "admin", "support"] },
        { path: "/admin/usuarios-marcados", icon: ShieldAlert, label: t('admin.sidebar.flaggedUsers', 'Usuarios con advertencia'), roles: ["owner", "super_admin", "admin", "support"] },
        { path: "/admin/tickets", icon: TicketIcon, label: t('admin.sidebar.tickets', 'Tickets'), roles: ["owner", "super_admin", "admin", "support"] },
      ]
    },
    {
      label: "settings",
      icon: Settings,
      roles: ["owner", "super_admin"],
      items: [
        { path: "/admin/platform", icon: Rocket, label: "Fase de la plataforma", roles: ["owner"] },
        { path: "/admin/roles", icon: Shield, label: t('admin.sidebar.assignRoles', 'Assign Roles'), roles: ["owner", "super_admin", "admin"] },
        { path: "/admin/role-permissions", icon: Lock, label: t('admin.sidebar.permissions', 'Permissions'), roles: ["owner", "super_admin"] },
        { path: "/admin/security", icon: AlertTriangle, label: 'Seguridad', roles: ["owner", "super_admin"] },
        { path: "/admin/settings", icon: Settings, label: t('admin.sidebar.settings', 'Settings'), roles: ["owner", "super_admin"] },
        { path: "/admin/modules", icon: Sliders, label: 'Modules', roles: ["owner", "super_admin"] },
      ]
    },
  ];

  const groupLabels: Record<string, string> = {
    hubs: t('admin.sections.hubs', 'Hubs'),
    general: t('admin.sections.general', 'General'),
    operations: t('admin.sections.operations', 'Operations'),
    padrones: t('admin.sections.padrones', 'Padrones'),
    finance: t('admin.sections.finance', 'Finance'),
    support: t('admin.sections.support', 'Support'),
    settings: t('admin.sections.settings', 'Settings'),
  };

  // Filter groups and items by user role
  const visibleGroups = navGroups
    .filter(group => group.roles.includes(user.adminRole!))
    .map(group => ({
      ...group,
      items: group.items.filter(item => item.roles.includes(user.adminRole!))
    }))
    .filter(group => group.items.length > 0);

  // Los grupos en el orden de la persona (los que no conoce todavía van al final, en el orden de siempre).
  const ordenDeGrupos = aplicarOrden(visibleGroups.map(g => g.label), ordenGuardado);
  const gruposEnOrden = ordenDeGrupos.map(k => visibleGroups.find(g => g.label === k)!).filter(Boolean);

  const cambiarOrden = (nuevo: string[], quien?: string) => {
    setOrdenGuardado(nuevo);
    guardarOrden(almacenDelNavegador(), user?.id, nuevo);
    if (quien) setAvisoDeOrden(`${groupLabels[quien] ?? quien}: lugar ${nuevo.indexOf(quien) + 1} de ${nuevo.length}`);
  };
  const restablecerOrden = () => {
    setOrdenGuardado(null);
    guardarOrden(almacenDelNavegador(), user?.id, null);
    setAvisoDeOrden('Orden restablecido');
  };

  const isActivePath = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex bg-slate-50 dark:bg-slate-900" style={{ minHeight: '100vh' }}>
      {/* Sidebar — fijo a la altura de la pantalla (position: fixed + 100vh): los módulos hacen scroll
          adentro y «Volver a la app» / «Cerrar sesión» quedan siempre al pie de la pantalla, después de los
          módulos, aunque la página sea larga. No es `sticky` porque html/body tienen overflow (global.css) y
          con eso sticky no se pega. El espaciador ocupa el lugar de la barra en la fila. (Sin zoom: 100vh directo.) */}
      <div className="w-64 flex-shrink-0" aria-hidden="true" />
      <aside className="w-64 bg-white dark:bg-slate-800 shadow-md border-r border-slate-200 dark:border-slate-700 flex flex-col fixed inset-y-0 left-0 z-30 h-screen">
        <div className="p-4 flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
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
              title={isConnected ? t('admin.connectedRealtime', 'Connected in real-time') : t('admin.clickToReconnect', 'Click to reconnect')}
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
              {isDark ? t('admin.dark', 'Dark') : t('admin.light', 'Light')}
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

          {/* Ordenar el menú: se arrastran los grupos grandes (no los elementos de adentro). */}
          <div className="mb-2 px-2">
            <button
              type="button"
              onClick={() => { setOrdenando(v => !v); setAvisoDeOrden(''); }}
              aria-pressed={ordenando}
              className={`w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-medium rounded-lg border transition ${
                ordenando
                  ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                  : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {ordenando ? 'Listo' : 'Ordenar menú'}
            </button>
            <Transicion mostrar={ordenando}>
              <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 p-2 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <p>Arrastrá cada grupo a donde quieras, o usá las flechas. Se guarda en este navegador.</p>
                {ordenGuardado && (
                  <button type="button" onClick={restablecerOrden} className="text-sky-600 dark:text-sky-400 hover:underline">
                    Restablecer el orden de siempre
                  </button>
                )}
              </div>
            </Transicion>
            <p className="sr-only" role="status" aria-live="polite">{avisoDeOrden}</p>
          </div>

          {/* Grouped Navigation */}
          <nav className="space-y-2">
            {gruposEnOrden.map((group, posicion) => (
              <div
                key={group.label}
                draggable={ordenando}
                onDragStart={(e) => {
                  if (!ordenando) return;
                  setArrastrando(group.label);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', group.label);
                }}
                onDragOver={(e) => {
                  if (!ordenando || !arrastrando || arrastrando === group.label) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (sobreEste !== group.label) setSobreEste(group.label);
                }}
                onDrop={(e) => {
                  if (!ordenando || !arrastrando) return;
                  e.preventDefault();
                  cambiarOrden(moverGrupo(ordenDeGrupos, arrastrando, group.label), arrastrando);
                  setArrastrando(null);
                  setSobreEste(null);
                }}
                onDragEnd={() => { setArrastrando(null); setSobreEste(null); }}
                className={`rounded-lg transition ${ordenando ? 'border border-dashed border-slate-300 dark:border-slate-600 p-0.5 cursor-grab' : ''} ${arrastrando === group.label ? 'opacity-40' : ''} ${sobreEste === group.label ? 'ring-2 ring-sky-400' : ''}`}
              >
                {/* Group Header */}
                {ordenando ? (
                  <div className="flex items-center gap-1 px-1 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    <GripVertical className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="flex-1 truncate">{groupLabels[group.label]}</span>
                    <button
                      type="button"
                      onClick={() => cambiarOrden(moverUnLugar(ordenDeGrupos, group.label, -1), group.label)}
                      disabled={posicion === 0}
                      aria-label={`Subir el grupo ${groupLabels[group.label]}`}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cambiarOrden(moverUnLugar(ordenDeGrupos, group.label, 1), group.label)}
                      disabled={posicion === gruposEnOrden.length - 1}
                      aria-label={`Bajar el grupo ${groupLabels[group.label]}`}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
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
                )}

                {/* Group Items: mientras se ordena solo se ven los encabezados, para que arrastrar sea fácil */}
                {!ordenando && expandedGroups.includes(group.label) && (
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
          </div>

          {/* Bottom Actions: fijas al pie de la pantalla, después de los módulos */}
          <div className="shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <Link
              to="/"
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition border border-slate-200 dark:border-slate-600"
            >
              {t('admin.backToApp', 'Back to app')}
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-3 py-2 w-full text-sm text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              <LogOut className="h-4 w-4" />
              {t('nav.logout', 'Log Out')}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content — no internal overflow: the PAGE scrolls, so the row grows
          with the content and the sidebar stretches to match it. */}
      <main className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-900" style={{ minHeight: '100vh' }}>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
