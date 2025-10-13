import { useState, FormEvent, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AnimatedButton } from "@/components/ui/Button";
import { ArrowLeft, Lock, CheckCircle, AlertCircle } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  // Validar token al cargar la página
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError("Token no proporcionado");
        setValidatingToken(false);
        return;
      }

      // Por ahora solo verificamos que exista el token
      // El backend validará si es válido cuando se envíe la nueva contraseña
      setTokenValid(true);
      setValidatingToken(false);
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validaciones
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (!token) {
      setError("Token no válido");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          newPassword: password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        // Redirigir al login después de 3 segundos
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      } else {
        setError(data.message || "Error al restablecer la contraseña");
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud");
    } finally {
      setIsLoading(false);
    }
  };

  // Pantalla de validación
  if (validatingToken) {
    return (
      <>
        <Helmet>
          <title>Validando... - Doers</title>
        </Helmet>
        <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600"></div>
              </div>
              <p className="text-slate-600">Validando token...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Token inválido o no proporcionado
  if (!tokenValid || !token) {
    return (
      <>
        <Helmet>
          <title>Link Inválido - Doers</title>
        </Helmet>
        <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-slate-900">
                Link inválido o expirado
              </h2>
              <p className="mb-8 text-slate-600">
                El enlace de recuperación no es válido o ha expirado. Por favor
                solicita uno nuevo.
              </p>
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-6 py-3 text-white font-medium hover:bg-sky-700 transition-colors"
              >
                Solicitar nuevo enlace
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Éxito
  if (success) {
    return (
      <>
        <Helmet>
          <title>Contraseña Actualizada - Doers</title>
        </Helmet>
        <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-slate-900">
                ¡Contraseña actualizada!
              </h2>
              <p className="mb-6 text-slate-600">
                Tu contraseña ha sido restablecida correctamente.
              </p>
              <p className="mb-8 text-sm text-slate-500">
                Todas tus sesiones activas han sido cerradas por seguridad.
                Redirigiendo al inicio de sesión...
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Ir al inicio de sesión
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Formulario de nueva contraseña
  return (
    <>
      <Helmet>
        <title>Nueva Contraseña - Doers</title>
        <meta name="description" content="Crea una nueva contraseña para tu cuenta" />
      </Helmet>
      <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
          <div className="mb-8">
            <div className="flex items-center justify-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                <Lock className="h-6 w-6 text-sky-600" />
              </div>
            </div>
            <h2 className="text-center text-2xl font-bold text-slate-900">
              Crear nueva contraseña
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              Ingresa tu nueva contraseña. Debe tener al menos 6 caracteres.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium leading-6 text-slate-600"
              >
                Nueva contraseña
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium leading-6 text-slate-600"
              >
                Confirmar contraseña
              </label>
              <div className="mt-2">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <AnimatedButton
                type="submit"
                disabled={isLoading}
                className="h-12 w-full"
              >
                {isLoading ? "Actualizando..." : "Restablecer contraseña"}
              </AnimatedButton>
            </div>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
