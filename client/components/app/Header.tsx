import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useSocket } from "../../hooks/useSocket";
import {
  LogOut,
  User as UserIcon,
  PlusCircle,
  Wallet,
  LayoutDashboard,
  Settings,
  ChevronDown,
  MessageCircle,
  Shield,
  HelpCircle,
  AlertCircle,
  Gift,
  FileText,
  Briefcase,
  Heart,
} from "lucide-react";
import { ThemeToggleCompact } from "../ui/ThemeToggle";
import { useState, useRef, useEffect } from "react";
import { usePermissions } from "../../hooks/usePermissions";
import InvitationCodesModal from "../InvitationCodesModal";
import NotificationDropdown from "../NotificationDropdown";

export default function Header() {
  const { user, logout } = useAuth();
  const { registerUnreadUpdateHandler } = useSocket();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    navigate("/");
    setIsMenuOpen(false);
  };

  // Fetch initial unread count
  useEffect(() => {
    if (user) {
      fetchUnreadCount();
    }
  }, [user]);

  // Register real-time unread count updates
  useEffect(() => {
    registerUnreadUpdateHandler((count: number) => {
      console.log("💬 Unread count updated in header:", count);
      setUnreadCount(count);
    });
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch("/api/chat/unread-count", {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        // Use unreadConversations (number of chats with unread messages)
        setUnreadCount(data.unreadConversations || 0);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  // Cerrar menú cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg">
      <div className="w-full max-w-[100vw] mx-auto flex h-16 items-center justify-between px-3 sm:px-4">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 group flex-shrink-0" data-onboarding="logo">
          {/* Logo Icon */}
          <div className="relative flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-600 shadow-lg shadow-sky-500/30 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-sky-500/50 group-hover:scale-105">
            <span className="text-lg sm:text-2xl font-black text-white tracking-tight">
              DO
            </span>
          </div>

          {/* Logo Text */}
          <span className="text-xl sm:text-2xl font-black bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent dark:from-sky-400 dark:to-blue-400 tracking-tight">
            APP
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {user ? (
            <>
              {/* Free Contracts Counter */}
              {(() => {
                const freeContractsRemaining = user.freeContractsRemaining || 0;
                const proContractsUsed = user.proContractsUsedThisMonth || 0;
                let monthlyFreeLimit = 0;
                if (user.membershipTier === 'super_pro') monthlyFreeLimit = 2;
                else if (user.membershipTier === 'pro') monthlyFreeLimit = 1;
                const monthlyFreeRemaining = Math.max(0, monthlyFreeLimit - proContractsUsed);
                const totalFreeRemaining = freeContractsRemaining + monthlyFreeRemaining;

                // Mostrar siempre el contador
                if (totalFreeRemaining > 0) {
                  // Usuario con contratos gratis disponibles
                  const isFreeUser = !user.membershipTier || user.membershipTier === 'free';

                  return (
                    <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <div className="flex flex-col">
                        {isFreeUser ? (
                          // Usuario FREE: mensaje simple
                          <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                            {totalFreeRemaining} contrato{totalFreeRemaining !== 1 ? 's' : ''} gratis disponible{totalFreeRemaining !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          // Usuario PRO/SUPER PRO: con desglose
                          <>
                            <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                              {totalFreeRemaining} contrato{totalFreeRemaining !== 1 ? 's' : ''} gratis
                            </span>
                            {freeContractsRemaining > 0 && (
                              <span className="text-[10px] text-green-600 dark:text-green-400">
                                {freeContractsRemaining} inicial{freeContractsRemaining !== 1 ? 'es' : ''}
                              </span>
                            )}
                            {monthlyFreeRemaining > 0 && (
                              <span className="text-[10px] text-green-600 dark:text-green-400">
                                {monthlyFreeRemaining} este mes
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  // Usuario sin contratos gratis - mostrar comisión
                  let commissionRate = 8;
                  if (user.hasFamilyPlan) commissionRate = 0;
                  else if (user.membershipTier === 'super_pro') commissionRate = 2;
                  else if (user.membershipTier === 'pro') commissionRate = 3;

                  // Si tiene Plan Familia, mostrar badge especial
                  if (user.hasFamilyPlan) {
                    return (
                      <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800">
                        <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400 fill-pink-500" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">
                            Sin comisión
                          </span>
                          <span className="text-[10px] text-pink-600 dark:text-pink-400">
                            PLAN FAMILIA
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <Link
                      to="/membership/pricing"
                      className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors cursor-pointer"
                    >
                      <FileText className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                          Comisión {commissionRate}%
                        </span>
                        <span className="text-[10px] text-orange-600 dark:text-orange-400">
                          {user.membershipTier === 'super_pro' ? 'SUPER PRO' : user.membershipTier === 'pro' ? 'PRO' : 'FREE'}
                        </span>
                      </div>
                    </Link>
                  );
                }
              })()}

              <Link
                to="/contracts/create"
                className="inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg sm:rounded-xl bg-slate-900 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 whitespace-nowrap"
                data-onboarding="create-job"
              >
                <PlusCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Publicar trabajo</span>
                <span className="inline sm:hidden">Publicar</span>
              </Link>

              {user.adminRole && (
                <Link
                  to="/admin"
                  className="inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg sm:rounded-xl bg-sky-600 dark:bg-sky-700 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-sky-700 dark:hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                  title="Panel de Administración"
                >
                  <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden lg:inline">Admin Panel</span>
                </Link>
              )}
            </>
          ) : null}

          <ThemeToggleCompact />

          {/* Messages Button */}
          {user && (
            <Link
              to="/messages"
              className="relative flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              aria-label="Mensajes"
              data-onboarding="messages"
            >
              <MessageCircle className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )}

          {user && <NotificationDropdown />}

          {user ? (
            <div className="relative" ref={menuRef} data-onboarding="profile-menu">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 p-2 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <span className="hidden font-medium text-slate-700 dark:text-slate-300 md:block">
                  {user.name}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-500 transition-transform ${
                    isMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Menú desplegable */}
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden z-[100]">
                  <div className="py-1">
                    <Link
                      to="/dashboard"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                    <Link
                      to={`/profile/${user._id}`}
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <UserIcon className="h-4 w-4" />
                      Mi Perfil
                    </Link>
                    <Link
                      to="/my-jobs"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Briefcase className="h-4 w-4" />
                      Mis Trabajos
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      Configuración
                    </Link>
                    <Link
                      to="/help"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Ayuda y Soporte
                    </Link>
                    <Link
                      to="/referrals"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    >
                      <Gift className="h-4 w-4" />
                      Códigos de Invitación
                      {user.invitationCodesRemaining &&
                        user.invitationCodesRemaining > 0 && (
                          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-purple-500 px-1.5 text-xs font-bold text-white">
                            {user.invitationCodesRemaining}
                          </span>
                        )}
                    </Link>
                    {user.adminRole && (
                      <>
                        <hr className="my-1 border-slate-200 dark:border-slate-700" />
                        <Link
                          to="/admin"
                          onClick={() => setIsMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors font-medium"
                        >
                          <Shield className="h-4 w-4" />
                          Panel de Admin
                        </Link>
                      </>
                    )}
                    <hr className="my-1 border-slate-200 dark:border-slate-700" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                to="/login"
                className="rounded-lg sm:rounded-xl px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/register"
                className="rounded-lg sm:rounded-xl bg-sky-500 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-sky-600 whitespace-nowrap"
              >
                Registrarme
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Códigos de Invitación */}
      <InvitationCodesModal
        isOpen={showInvitationModal}
        onClose={() => setShowInvitationModal(false)}
      />
    </header>
  );
}
