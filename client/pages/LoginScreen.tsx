import { useState, FormEvent, ChangeEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Helmet } from "react-helmet-async";

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
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

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
      <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
            {isRegister ? "Crea tu cuenta" : "Inicia sesión en tu cuenta"}
          </h2>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          <div className="mb-4 border-b border-gray-200">
            <ul
              className="flex flex-wrap -mb-px text-sm font-medium text-center"
              role="tablist"
            >
              <li className="me-2" role="presentation">
                <button
                  className={`inline-block p-4 border-b-2 rounded-t-lg ${
                    mode === "login"
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent hover:text-gray-600 hover:border-gray-300"
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
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent hover:text-gray-600 hover:border-gray-300"
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
                  className="block text-sm font-medium leading-6 text-gray-900"
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
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium leading-6 text-gray-900"
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
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Contraseña
                </label>
                {!isRegister && (
                  <div className="text-sm">
                    <a
                      href="#"
                      className="font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      ¿Olvidaste tu contraseña?
                    </a>
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
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {isRegister && (
              <>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium leading-6 text-gray-900"
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
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <label
                    htmlFor="termsAccepted"
                    className="ml-3 block text-sm leading-6 text-gray-900"
                  >
                    Acepto los{" "}
                    <Link
                      to="/legal/terminos-y-condiciones"
                      target="_blank"
                      className="font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      Términos y Condiciones
                    </Link>
                  </label>
                </div>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
              >
                {isLoading
                  ? "Procesando..."
                  : isRegister
                  ? "Registrarme"
                  : "Iniciar Sesión"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
