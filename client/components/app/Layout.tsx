import { Outlet, useNavigate, useLocation, useNavigationType } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Header from "./Header";
import BetaBanner from "../BetaBanner";
import Footer from "./Footer";
import ErrorBoundary from "../ErrorBoundary";
import { useScrollDepth } from "@/hooks/useScrollDepth";
import KycWelcomeModal from "../KycWelcomeModal";
import AvisoCorreoSinConfirmar from "../AvisoCorreoSinConfirmar";
import PendingPostWorkRatingGate from "../user/PendingPostWorkRatingGate";

export default function Layout() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  useScrollDepth();

  // Los textos legales abren siempre desde el principio (pedido del dueño, 2026-11-15: desde el pie de la página se abrían a mitad de camino, con el scroll
  // de la página anterior). No se toca si la dirección trae un ancla (#…) ni al volver atrás, donde el navegador devuelve a la persona a donde estaba.
  const tipoDeNavegacion = useNavigationType();
  useEffect(() => {
    const esLegal = /^\/(legal|terms|privacy)(\/|$)/.test(location.pathname);
    if (!esLegal || location.hash || tipoDeNavegacion === "POP") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.hash, tipoDeNavegacion]);

  // Registro en pasos: mientras falte verificar la identidad y completar los datos, la persona sigue ese recorrido (en vez de entrar a la app
  // a medio registrar). Se dejan abiertas las pantallas del propio recorrido, los textos legales y la ayuda.
  useEffect(() => {
    if (!isAuthenticated || !(user as any)?.registrationPending) return;
    const libres = ['/complete-registration', '/kyc/callback', '/verify-email', '/legal', '/terms', '/privacy', '/contact', '/help', '/banned', '/login', '/register', '/baja-de-correos'];
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
      <AvisoCorreoSinConfirmar />
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
