import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Home, Briefcase, PlusCircle, MessageCircle, User as UserIcon, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import { useSocket } from "../../hooks/useSocket";
import { features } from "../../../shared/featureFlags";

/**
 * Bottom navigation bar for mobile web (hidden on md+ screens).
 * Mirrors the native app's tab bar so mobile browser users get
 * persistent one-tap access to the main sections.
 */
export default function MobileBottomNav() {
  const { user, token } = useAuth();
  const { registerUnreadUpdateHandler } = useSocket();
  const location = useLocation();
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user || !token || !features.chat) return;
    fetch("/api/chat/unread-count", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setUnreadCount(data.unreadConversations || 0))
      .catch(() => {});
  }, [user, token]);

  useEffect(() => {
    registerUnreadUpdateHandler((count: number) => {
      setUnreadCount(count);
    });
  }, [registerUnreadUpdateHandler]);

  // Hide on chat conversation screens where the keyboard/input needs full height
  if (location.pathname.startsWith("/chat/") || location.pathname.startsWith("/messages/")) {
    return null;
  }

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const itemClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-[56px] transition-colors ${
      active
        ? "text-sky-600 dark:text-sky-400"
        : "text-slate-500 dark:text-slate-400"
    }`;

  const labelClass = "text-[10px] font-medium leading-none";

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-200 dark:border-slate-700 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <div className="flex items-stretch h-16">
        <Link to="/" className={itemClass(isActive("/"))} aria-label={t("nav.home")}>
          <Home className="h-6 w-6" strokeWidth={isActive("/") ? 2.5 : 2} />
          <span className={labelClass}>{t("nav.home")}</span>
        </Link>

        {user ? (
          <>
            <Link to="/my-jobs" className={itemClass(isActive("/my-jobs"))} aria-label={t("jobs.myJobs")}>
              <Briefcase className="h-6 w-6" strokeWidth={isActive("/my-jobs") ? 2.5 : 2} />
              <span className={labelClass}>{t("jobs.myJobs")}</span>
            </Link>

            {/* Center action: publish job */}
            <Link
              to="/contracts/create"
              className="flex flex-col items-center justify-center flex-1 min-w-[56px]"
              aria-label={t("nav.publishJob")}
            >
              <span className="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30">
                <PlusCircle className="h-7 w-7" />
              </span>
              <span className={`${labelClass} mt-0.5 text-slate-500 dark:text-slate-400`}>
                {t("jobs.publish")}
              </span>
            </Link>

            {features.chat && (
              <Link to="/messages" className={itemClass(isActive("/messages"))} aria-label={t("nav.messages")}>
                <span className="relative">
                  <MessageCircle className="h-6 w-6" strokeWidth={isActive("/messages") ? 2.5 : 2} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span className={labelClass}>{t("nav.messages")}</span>
              </Link>
            )}

            <Link
              to={`/profile/${user._id || (user as any).id}`}
              className={itemClass(isActive("/profile"))}
              aria-label={t("nav.profile")}
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className={`h-6 w-6 rounded-full object-cover ${isActive("/profile") ? "ring-2 ring-sky-500" : ""}`}
                />
              ) : (
                <UserIcon className="h-6 w-6" strokeWidth={isActive("/profile") ? 2.5 : 2} />
              )}
              <span className={labelClass}>{t("nav.profile")}</span>
            </Link>
          </>
        ) : (
          <>
            <Link to="/login" className={itemClass(isActive("/login"))} aria-label={t("nav.login")}>
              <LogIn className="h-6 w-6" strokeWidth={isActive("/login") ? 2.5 : 2} />
              <span className={labelClass}>{t("nav.login")}</span>
            </Link>
            <Link
              to="/register"
              className="flex flex-col items-center justify-center flex-1 min-w-[56px]"
              aria-label={t("nav.register")}
            >
              <span className="flex items-center justify-center w-12 h-12 -mt-4 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30">
                <UserIcon className="h-6 w-6" />
              </span>
              <span className={`${labelClass} mt-0.5 text-slate-500 dark:text-slate-400`}>
                {t("nav.register")}
              </span>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
