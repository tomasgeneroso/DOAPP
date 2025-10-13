import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AnimatedButton } from "@/components/ui/Button";
import { ArrowLeft, Mail, CheckCircle, Smartphone } from "lucide-react";

type RecoveryMethod = "email" | "whatsapp";

export default function ForgotPassword() {
  const [method, setMethod] = useState<RecoveryMethod>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (method === "email") {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (data.success) {
          setSuccess(true);
        } else {
          setError(data.message || "Error al enviar el correo de recuperación");
        }
      } else {
        // WhatsApp recovery
        const response = await fetch("/api/auth/forgot-password-whatsapp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ phone }),
        });

        const data = await response.json();

        if (data.success) {
          // Navigate to WhatsApp code verification page
          navigate("/verify-whatsapp-code", { state: { phone } });
        } else {
          setError(data.message || "Error al enviar el código de WhatsApp");
        }
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <>
        <Helmet>
          <title>Email Enviado - Doers</title>
        </Helmet>
        <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-slate-900">
                {method === "email" ? "¡Email enviado!" : "¡Código enviado!"}
              </h2>
              <p className="mb-6 text-slate-600">
                {method === "email" ? (
                  <>
                    Si el email <strong>{email}</strong> está registrado,
                    recibirás un enlace para recuperar tu contraseña.
                  </>
                ) : (
                  <>
                    Si el teléfono <strong>{phone}</strong> está registrado,
                    recibirás un código de verificación por WhatsApp.
                  </>
                )}
              </p>
              <p className="mb-8 text-sm text-slate-500">
                {method === "email"
                  ? "Por favor revisa tu bandeja de entrada y también la carpeta de spam."
                  : "Por favor verifica tu WhatsApp para obtener el código."}
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio de sesión
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Recuperar Contraseña - Doers</title>
        <meta
          name="description"
          content="Recupera tu contraseña de Doers"
        />
      </Helmet>
      <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
          <div className="mb-8">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <div className="flex items-center justify-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                {method === "email" ? (
                  <Mail className="h-6 w-6 text-sky-600" />
                ) : (
                  <Smartphone className="h-6 w-6 text-sky-600" />
                )}
              </div>
            </div>
            <h2 className="text-center text-2xl font-bold text-slate-900">
              Recupera tu contraseña
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              {method === "email"
                ? "Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña"
                : "Ingresa tu teléfono y te enviaremos un código de verificación por WhatsApp"}
            </p>
          </div>

          {/* Method Selection Tabs */}
          <div className="mb-6 border-b border-gray-200">
            <ul
              className="flex flex-wrap -mb-px text-sm font-medium text-center"
              role="tablist"
            >
              <li className="flex-1" role="presentation">
                <button
                  className={`inline-block w-full p-4 border-b-2 rounded-t-lg ${
                    method === "email"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                  onClick={() => setMethod("email")}
                  type="button"
                  role="tab"
                  aria-selected={method === "email"}
                >
                  <Mail className="h-4 w-4 inline mr-2" />
                  Email
                </button>
              </li>
              <li className="flex-1" role="presentation">
                <button
                  className={`inline-block w-full p-4 border-b-2 rounded-t-lg ${
                    method === "whatsapp"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                  onClick={() => setMethod("whatsapp")}
                  type="button"
                  role="tab"
                  aria-selected={method === "whatsapp"}
                >
                  <Smartphone className="h-4 w-4 inline mr-2" />
                  WhatsApp
                </button>
              </li>
            </ul>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {method === "email" ? (
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@email.com"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium leading-6 text-slate-600"
                >
                  Teléfono (con código de país)
                </label>
                <div className="mt-2">
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+54 11 1234-5678"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Asegúrate de incluir el código de país (ej: +54 para
                  Argentina)
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div>
              <AnimatedButton
                type="submit"
                disabled={isLoading}
                className="h-12 w-full"
              >
                {isLoading
                  ? "Enviando..."
                  : method === "email"
                  ? "Enviar enlace de recuperación"
                  : "Enviar código por WhatsApp"}
              </AnimatedButton>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              ¿Recordaste tu contraseña?{" "}
              <Link
                to="/login"
                className="font-semibold text-sky-600 hover:text-sky-500"
              >
                Inicia sesión aquí
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
