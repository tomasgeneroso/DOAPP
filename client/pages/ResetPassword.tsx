import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Lock, ArrowLeft, CheckCircle2, AlertCircle, Home, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token inválido o faltante. Por favor, solicita un nuevo enlace de recuperación.");
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validaciones
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

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

      if (!response.ok) {
        throw new Error(data.message || "Error al restablecer la contraseña");
      }

      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error. Por favor, intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Restablecer Contraseña - DoApp</title>
        <meta
          name="description"
          content="Crea una nueva contraseña para tu cuenta de DoApp"
        />
      </Helmet>
      <div className="flex min-h-full flex-col justify-center bg-slate-50 dark:bg-slate-900 px-6 py-12 lg:px-8">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <Home className="h-4 w-4" />
              Inicio
            </Link>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-lg sm:p-12">
            {!success ? (
              <>
                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-6 ${
                  error && !token
                    ? "bg-red-100 dark:bg-red-900/30"
                    : "bg-sky-100 dark:bg-sky-900/30"
                }`}>
                  {error && !token ? (
                    <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                  ) : (
                    <Lock className="h-8 w-8 text-sky-600 dark:text-sky-400" />
                  )}
                </div>

                <h2 className="mb-2 text-center text-2xl font-bold text-slate-900 dark:text-white">
                  Restablecer contraseña
                </h2>
                <p className="mb-8 text-center text-sm text-slate-600 dark:text-slate-400">
                  Ingresa tu nueva contraseña
                </p>

                {error && !token ? (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm mb-6">
                    <p className="font-medium mb-2">{error}</p>
                    <Link
                      to="/forgot-password"
                      className="text-sm underline hover:no-underline"
                    >
                      Solicitar nuevo enlace
                    </Link>
                  </div>
                ) : (
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium leading-6 text-slate-700 dark:text-slate-300 mb-2"
                      >
                        Nueva contraseña
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          minLength={6}
                          className="block w-full rounded-lg border-0 py-3 px-4 pr-10 text-slate-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Mínimo 6 caracteres
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="confirmPassword"
                        className="block text-sm font-medium leading-6 text-slate-700 dark:text-slate-300 mb-2"
                      >
                        Confirmar contraseña
                      </label>
                      <div className="relative">
                        <input
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          minLength={6}
                          className="block w-full rounded-lg border-0 py-3 px-4 pr-10 text-slate-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {error && token && (
                      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || !token}
                      className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {isLoading ? "Restableciendo..." : "Restablecer contraseña"}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>

                <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
                  ¡Contraseña restablecida!
                </h2>
                <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                  Tu contraseña ha sido actualizada correctamente. Serás redirigido al inicio de sesión en unos segundos...
                </p>

                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 transition-all"
                >
                  Ir al inicio de sesión
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
