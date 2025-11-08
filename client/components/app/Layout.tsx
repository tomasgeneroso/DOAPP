import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import Header from "./Header";
import Footer from "./Footer";

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
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
