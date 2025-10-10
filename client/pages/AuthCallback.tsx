import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get("token");
    const error = searchParams.get("error");

    if (error) {
      // Redirigir al login con mensaje de error
      navigate(`/login?error=${error}`, { replace: true });
      return;
    }

    if (token) {
      // Fetch user data with the token
      fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            // Save token and user to localStorage
            localStorage.setItem("token", token);
            localStorage.setItem("user", JSON.stringify(data.user));
            // Redirect to home
            navigate("/", { replace: true });
            // Reload to update auth context
            window.location.reload();
          } else {
            navigate("/login?error=auth_failed", { replace: true });
          }
        })
        .catch(() => {
          navigate("/login?error=auth_failed", { replace: true });
        });
    } else {
      // Si no hay token ni error, redirigir al login
      navigate("/login", { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4"></div>
        <p className="text-slate-600">Iniciando sesión...</p>
      </div>
    </div>
  );
}
