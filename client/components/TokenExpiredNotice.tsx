import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export default function TokenExpiredNotice() {
  const [show, setShow] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const redirect = searchParams.get("redirect");

    // Show notice if there's a redirect parameter (indicates token expired)
    if (redirect && location.pathname === "/login") {
      setShow(true);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  if (!show) return null;

  return (
    <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Tu sesión ha expirado</p>
          <p className="text-xs">Por favor, inicia sesión nuevamente para continuar.</p>
        </div>
      </div>
    </div>
  );
}
