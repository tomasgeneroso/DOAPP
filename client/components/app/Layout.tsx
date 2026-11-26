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
import MomentosGlobales from "../momentos/MomentosGlobales";
import PendingPostWorkRatingGate from "../user/PendingPostWorkRatingGate";
import { desplazarSuave, desplazarAElemento } from "../../utils/desplazamientoSuave";

export default function Layout() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  useScrollDepth();

  // Cada pantalla nueva abre desde el principio, con un desplazamiento suave (pedido del dueño, 2026-11-15: los textos legales abrían a mitad de camino, con el scroll
  // de la página anterior, y todo saltaba de golpe). No se toca si la dirección trae un ancla (#…) ni al volver atrás, donde el navegador devuelve a la persona a donde estaba.
  const tipoDeNavegacion = useNavigationType();
  useEffect(() => {
    if (location.hash || tipoDeNavegacion === "POP") return;
    desplazarSuave(0);
  }, [location.pathname, location.hash, tipoDeNavegacion]);

  // Los enlaces a un lugar de la misma página («Cómo funciona», «#trabajos-disponibles») llevan hasta ahí con el mismo desplazamiento suave.
  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!enlace || (enlace.target && enlace.target !== "_self")) return;
      let destino: URL;
      try {
        destino = new URL(enlace.href, window.location.href);
      } catch {
        return;
      }
      if (destino.origin !== window.location.origin || destino.pathname !== window.location.pathname || !destino.hash || destino.hash === "#") return;
      let id = destino.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* queda como vino */
      }
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      desplazarAElemento(el);
      window.history.pushState(window.history.state, "", destino.hash);
    };
    document.addEventListener("click", alTocar);
    return () => document.removeEventListener("click", alTocar);
  }, []);

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
      <ErrorBoundary>
        <MomentosGlobales />
      </ErrorBoundary>
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
