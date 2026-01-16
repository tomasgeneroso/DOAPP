import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Mail, ArrowLeft, CheckCircle2, Home } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al enviar el correo");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error. Por favor, intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Recuperar Contraseña - DoApp</title>
        <meta
          name="description"
          content="Recupera tu contraseña de DoApp"
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
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30 mb-6">
                  <Mail className="h-8 w-8 text-sky-600 dark:text-sky-400" />
                </div>

                <h2 className="mb-2 text-center text-2xl font-bold text-slate-900 dark:text-white">
                  ¿Olvidaste tu contraseña?
                </h2>
                <p className="mb-8 text-center text-sm text-slate-600 dark:text-slate-400">
                  No te preocupes. Ingresa tu email y te enviaremos un enlace para recuperarla.
                </p>

                <form className="space-y-6" onSubmit={handleSubmit}>
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium leading-6 text-slate-700 dark:text-slate-300 mb-2"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tucorreo@email.com"
                      className="block w-full rounded-lg border-0 py-3 px-4 text-slate-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                    />
                  </div>

                  {error && (
                    <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? "Enviando..." : "Enviar enlace de recuperación"}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>

                <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
                  ¡Email enviado!
                </h2>
                <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                  Si existe una cuenta asociada a <strong>{email}</strong>, recibirás un correo con instrucciones para restablecer tu contraseña.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                  Revisa también tu carpeta de spam o correo no deseado.
                </p>

                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-700 px-6 py-3 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver al inicio de sesión
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
