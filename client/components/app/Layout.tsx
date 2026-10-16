import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Header from "./Header";
import BetaBanner from "../BetaBanner";
import Footer from "./Footer";
import ErrorBoundary from "../ErrorBoundary";
import { useScrollDepth } from "@/hooks/useScrollDepth";
import KycWelcomeModal from "../KycWelcomeModal";
import PendingPostWorkRatingGate from "../user/PendingPostWorkRatingGate";

export default function Layout() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  useScrollDepth();

  // Registro en pasos: mientras falte verificar la identidad y completar los datos, la persona sigue ese recorrido (en vez de entrar a la app
  // a medio registrar). Se dejan abiertas las pantallas del propio recorrido, los textos legales y la ayuda.
  useEffect(() => {
    if (!isAuthenticated || !(user as any)?.registrationPending) return;
    const libres = ['/complete-registration', '/kyc/callback', '/verify-email', '/legal', '/terms', '/privacy', '/contact', '/help', '/banned', '/login', '/register'];
    if (libres.some((r) => location.pathname === r || location.pathname.startsWith(`${r}/`))) return;
    navigate('/complete-registration', { replace: true });
  }, [user, isAuthenticated, navigate, location.pathname]);

  useEffect(() => {
    // Check if user is banned and redirect to banned screen
    if (isAuthenticated && user?.isBanned && location.pathname !== '/banned') {
      navigate('/banned', { replace: true });
    }
  }, [user, isAuthenticated, navigate, location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F5F5] dark:bg-slate-900">
      {/* Skip to content link for keyboard users */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Ir al contenido principal
      </a>
      <KycWelcomeModal />
      <PendingPostWorkRatingGate />
      <ErrorBoundary>
        <Header />
      </ErrorBoundary>
      <BetaBanner />
      <main id="main-content" className="flex-1 flex flex-col" tabIndex={-1}>
        <ErrorBoundary>
          <div className="flex-1">
            <Outlet />
          </div>
        </ErrorBoundary>
      </main>
      <ErrorBoundary>
        <Footer />
      </ErrorBoundary>
    </div>
  );
}
