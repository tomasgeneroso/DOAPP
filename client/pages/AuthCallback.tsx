import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { tomarDestino } from "../utils/destinoDespuesDeGoogle";

export default function AuthCallback() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Desde que la sesión del ingreso social viaja en una cookie httpOnly, la dirección ya no trae `token`. Se sigue leyendo SOLO por
    // compatibilidad con un ingreso que arrancó antes de esta versión (el servidor viejo todavía lo ponía): si está, se usa y se borra.
    const token = searchParams.get("token");
    const error = searchParams.get("error");
    const needsDni = searchParams.get("needsDni") === "true";

    if (error) {
      // Redirigir al login con mensaje de error
      navigate(`/login?error=${error}`, { replace: true });
      return;
    }

    if (token) {
      localStorage.setItem("token", token);
    }

    // Si quedó algo en la dirección, se borra: de lo contrario la recarga completa de más abajo la deja como `document.referrer` de la
    // pantalla siguiente (y se la contaría a cualquier script de un tercero), y también queda en el historial del navegador.
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    } catch {
      /* sin History API no hay nada que borrar */
    }

    // La sesión está en la cookie: /auth/me la usa y devuelve el token que necesita el tiempo real (Socket.io).
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    fetch(`${apiUrl}/auth/me`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      credentials: 'include', // la cookie httpOnly con la sesión
    })
      .then(async (res) => {
        const cuerpo = await res.json().catch(() => null);
        return { estado: res.status, data: cuerpo };
      })
      .then(({ estado, data }) => {
        if (data?.success && data?.user) {
          if (data.token) localStorage.setItem("token", data.token);
          // Save user to localStorage for client-side access
          localStorage.setItem("user", JSON.stringify(data.user));

          // Check if user needs to complete registration (DNI)
          if (needsDni || data.user.needsDni || data.user.registrationPending) {
            // Redirect to complete registration page
            window.location.href = "/complete-registration";
          } else if (data.user.adminRole === "analista") {
            /**
             * El analista entra directo a lo único que puede ver.
             *
             * No es una comodidad: su cuenta no tiene panel ni razón para
             * usar la app como cliente o trabajador, así que dejarlo en la
             * portada lo obliga a saber de memoria una URL que nadie le
             * mostró. Entra con Google y aterriza donde trabaja.
             */
            window.location.href = "/analisis";
          } else {
            // Vuelve a donde estaba la persona antes de salir a Google/X (igual que el ingreso con correo);
            // sin destino guardado, a la portada. Recarga completa para que el contexto de sesión se actualice.
            window.location.href = tomarDestino() || "/";
          }
        } else {
          // El motivo viaja a la pantalla de ingreso: quien falla ve (y puede decirle a soporte) qué respondió el servidor.
          // Sin sesión y sin nada en la dirección (alguien que abrió /auth/callback a mano): se lo manda al ingreso sin alarmar.
          if (estado === 401 && !token && !needsDni) {
            navigate("/login", { replace: true });
            return;
          }
          const motivo = (data && data.code) || `http${estado}`;
          console.error("Auth callback: /auth/me respondió", estado, data?.message);
          navigate(`/login?error=auth_failed&motivo=${encodeURIComponent(String(motivo))}`, { replace: true });
        }
      })
      .catch((err) => {
        console.error("Auth callback error:", err);
        navigate(`/login?error=auth_failed&motivo=${encodeURIComponent(err?.name === "TypeError" ? "red" : "cliente")}`, { replace: true });
      });
  }, [searchParams, navigate]);

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400">{t('auth.processing')}</p>
      </div>
    </div>
  );
}
