import { useState, FormEvent, ChangeEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFacebookLogin } from "../hooks/useFacebookLogin";
import { Helmet } from "react-helmet-async";
import { AnimatedButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input"; // Asegúrate que este componente se esté usando
import { Chrome, Facebook, Twitter } from "lucide-react";

type FormMode = "login" | "register";

export default function LoginScreen() {
  const [mode, setMode] = useState<FormMode>("login");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    termsAccepted: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const {
    loginWithFacebook,
    isLoading: fbLoading,
    error: fbError,
    fbStatus,
  } = useFacebookLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
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
      <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900">
            {isRegister ? "Crea tu cuenta" : "Inicia sesión en tu cuenta"}
          </h2>

          <div className="mb-4 border-b border-gray-200">
            <ul
              className="flex flex-wrap -mb-px text-sm font-medium text-center"
              role="tablist"
            >
              <li className="me-2" role="presentation">
                <button
                  className={`inline-block p-4 border-b-2 rounded-t-lg ${
                    mode === "login"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent hover:text-slate-600 hover:border-slate-300"
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
                      : "border-transparent hover:text-slate-600 hover:border-slate-300"
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
                  className="block text-sm font-medium leading-6 text-slate-600"
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
                className="block text-sm font-medium leading-6 text-slate-600"
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
                  className="block text-sm font-medium leading-6 text-slate-600"
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
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  required
                  onChange={handleInputChange}
                  value={formData.password}
                  placeholder="••••••••"
                  className="h-12"
                />
              </div>
            </div>

            {isRegister && (
              <>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium leading-6 text-slate-600"
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
                    className="ml-3 block text-sm leading-6 text-slate-600"
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
            <div className="h-px flex-1 bg-slate-200"></div>
            <span className="text-sm text-slate-500">o continúa con</span>
            <div className="h-px flex-1 bg-slate-200"></div>
          </div>

          <div className="flex items-center justify-center gap-4">
            {/* Social Logins */}
            <button
              type="button"
              onClick={loginWithFacebook}
              disabled={fbLoading || isLoading}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-sky-600 transition hover:border-sky-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Ingresar con Facebook"
            >
              <Facebook className="h-5 w-5" />
            </button>
            <a
              href={`${import.meta.env.VITE_API_URL}/auth/google`}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-amber-500 transition hover:border-sky-300 hover:bg-slate-50"
              aria-label="Ingresar con Google"
            >
              <Chrome className="h-5 w-5" />
            </a>
            <a
              href={`${import.meta.env.VITE_API_URL}/auth/twitter`}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-sky-400 transition hover:border-sky-300 hover:bg-slate-50"
              aria-label="Ingresar con Twitter"
            >
              <Twitter className="h-5 w-5" />
            </a>
          </div>

          {fbError && (
            <p className="mt-4 text-sm text-center text-red-600">{fbError}</p>
          )}
        </div>
      </div>
    </>
  );
}
