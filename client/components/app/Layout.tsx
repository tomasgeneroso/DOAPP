import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Header from "./Header";
import Footer from "./Footer";
import ErrorBoundary from "../ErrorBoundary";

export default function Layout() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if user is banned and redirect to banned screen
    if (isAuthenticated && user?.isBanned && location.pathname !== '/banned') {
      navigate('/banned', { replace: true });
    }
  }, [user, isAuthenticated, navigate, location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      {/* Skip to content link for keyboard users */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Ir al contenido principal
      </a>
      <ErrorBoundary>
        <Header />
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
