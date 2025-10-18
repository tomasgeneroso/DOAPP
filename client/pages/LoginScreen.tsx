import { useState, FormEvent, ChangeEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFacebookLogin } from "../hooks/useFacebookLogin";
import { Helmet } from "react-helmet-async";
import { AnimatedButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input"; // Asegúrate que este componente se esté usando
import { Chrome, Facebook, Twitter, Eye, EyeOff, Home } from "lucide-react";
import TokenExpiredNotice from "../components/TokenExpiredNotice";

type FormMode = "login" | "register";

export default function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();

  // Automatically set mode to register if coming from /register route
  const initialMode: FormMode = location.pathname === '/register' ? 'register' : 'login';

  const [mode, setMode] = useState<FormMode>(initialMode);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    referralCode: "",
    termsAccepted: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, register } = useAuth();
  const { loginWithFacebook, isLoading: fbLoading, error: fbError, fbStatus } = useFacebookLogin();

  // Get redirect path from URL query params or location state
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect");
  const from = redirectParam ||
    (typeof location.state?.from === "string"
      ? location.state.from
      : location.state?.from?.pathname) || "/";

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        await login(formData.email, formData.password);
      } else {
        if (!formData.termsAccepted) {
          setError("Debes aceptar los términos y condiciones.");
          setIsLoading(false);
          return;
        }
        await register({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          referralCode: formData.referralCode || undefined,
          termsAccepted: formData.termsAccepted,
        });
      }
      navigate(from, { replace: true }); // Redirect to original page or home
    } catch (err: any) {
      setError(err.message || "Ocurrió un error. Por favor, intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <>
      <Helmet>
        <title>{isRegister ? "Registro" : "Iniciar Sesión"} - Doers</title>
        <meta
          name="description"
          content={
            isRegister
              ? "Crea tu cuenta en Doers."
              : "Inicia sesión en tu cuenta de Doers."
          }
        />
      </Helmet>
      <div className="flex min-h-full flex-col justify-center bg-slate-50 dark:bg-slate-900 px-6 py-12 lg:px-8">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-lg sm:p-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6"
          >
            <Home className="h-4 w-4" />
            Volver al inicio
          </Link>
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900 dark:text-white">
            {isRegister ? "Crea tu cuenta" : "Inicia sesión en tu cuenta"}
          </h2>

          {/* Mensaje de bienvenida para nuevos usuarios */}
          <div className="mb-6 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 p-4 text-center shadow-md">
            <p className="text-sm font-semibold text-white">
              ¡Los primeros 1000 usuarios tendrán servicio gratuito por un año! 🎉
            </p>
          </div>

          <TokenExpiredNotice />

          <div className="mb-4 border-b border-gray-200 dark:border-slate-700">
            <ul
              className="flex flex-wrap -mb-px text-sm font-medium text-center"
              role="tablist"
            >
              <li className="me-2" role="presentation">
                <button
                  className={`inline-block p-4 border-b-2 rounded-t-lg ${
                    mode === "login"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400"
                  }`}
                  onClick={() => setMode("login")}
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                >
                  Iniciar Sesión
                </button>
              </li>
              <li className="me-2" role="presentation">
                <button
                  className={`inline-block p-4 border-b-2 rounded-t-lg ${
                    mode === "register"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400"
                  }`}
                  onClick={() => setMode("register")}
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                >
                  Registro
                </button>
              </li>
            </ul>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {isRegister && (
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                >
                  Nombre completo
                </label>
                <div className="mt-2">
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required={isRegister}
                    onChange={handleInputChange}
                    value={formData.name}
                    placeholder="Juan Pérez"
                    className="h-12"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
              >
                Email
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  onChange={handleInputChange}
                  value={formData.email}
                  placeholder="tucorreo@email.com"
                  className="h-12"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                >
                  Contraseña
                </label>
                {!isRegister && (
                  <div className="text-sm">
                    <Link
                      to="/forgot-password"
                      className="font-semibold text-sky-600 hover:text-sky-500"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                )}
              </div>
              <div className="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  required
                  onChange={handleInputChange}
                  value={formData.password}
                  placeholder="••••••••"
                  className="h-12 pr-10"
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
            </div>

            {isRegister && (
              <>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    Teléfono
                  </label>
                  <div className="mt-2">
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required={isRegister}
                      onChange={handleInputChange}
                      value={formData.phone}
                      placeholder="+54 11 1234-5678"
                      className="h-12"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="referralCode"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    Código de referido <span className="text-slate-400">(opcional)</span>
                  </label>
                  <div className="mt-2">
                    <input
                      id="referralCode"
                      name="referralCode"
                      type="text"
                      onChange={handleInputChange}
                      value={formData.referralCode}
                      placeholder="ABC12345"
                      className="h-12 uppercase"
                      maxLength={8}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Si alguien te invitó, ingresa su código aquí
                  </p>
                </div>
                <div className="flex items-center">
                  <input
                    id="termsAccepted"
                    name="termsAccepted"
                    type="checkbox"
                    required={isRegister}
                    onChange={handleInputChange}
                    checked={formData.termsAccepted}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                  />
                  <label
                    htmlFor="termsAccepted"
                    className="ml-3 block text-sm leading-6 text-slate-600 dark:text-slate-300"
                  >
                    Acepto los{" "}
                    <Link
                      to="/legal/terminos-y-condiciones"
                      target="_blank"
                      className="font-semibold text-sky-600 hover:text-sky-500"
                    >
                      Términos y Condiciones
                    </Link>
                  </label>
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div>
              <AnimatedButton
                type="submit"
                disabled={isLoading}
                className="h-12 w-full"
              >
                {isLoading
                  ? "Procesando..."
                  : isRegister
                  ? "Registrarme"
                  : "Iniciar Sesión"}
              </AnimatedButton>
            </div>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
            <span className="text-sm text-slate-500 dark:text-slate-400">o continúa con</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
          </div>

          <div className="flex items-center justify-center gap-4">
            {/* Social Logins */}
            <button
              type="button"
              onClick={loginWithFacebook}
              disabled={fbLoading || isLoading}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xl text-sky-600 transition hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Ingresar con Facebook"
            >
              <Facebook className="h-5 w-5" />
            </button>
            <a
              href={`${import.meta.env.VITE_API_URL}/auth/google`}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xl transition hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              aria-label="Ingresar con Google"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </a>
            <a
              href={`${import.meta.env.VITE_API_URL}/auth/twitter`}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xl text-slate-900 dark:text-white transition hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              aria-label="Ingresar con X"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>

          {fbError && <p className="mt-4 text-sm text-center text-red-600">{fbError}</p>}
        </div>
      </div>
    </>
  );
}
