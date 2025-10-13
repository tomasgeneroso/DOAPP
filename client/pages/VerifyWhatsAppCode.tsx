import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AnimatedButton } from "@/components/ui/Button";
import { ArrowLeft, Smartphone, CheckCircle, RefreshCw } from "lucide-react";

export default function VerifyWhatsAppCode() {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [expiresIn, setExpiresIn] = useState(15); // 15 minutes
  const navigate = useNavigate();
  const location = useLocation();
  const phone = location.state?.phone || "";

  // Countdown timer
  useEffect(() => {
    if (expiresIn <= 0) return;

    const timer = setInterval(() => {
      setExpiresIn((prev) => Math.max(0, prev - 1));
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [expiresIn]);

  // Redirect if no phone number provided
  useEffect(() => {
    if (!phone) {
      navigate("/forgot-password");
    }
  }, [phone, navigate]);

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password-whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (data.success) {
        setExpiresIn(15);
        setError(null);
        alert("Código reenviado exitosamente");
      } else {
        setError(data.message || "Error al reenviar el código");
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/verify-whatsapp-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, newPassword }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      } else {
        setError(data.message || "Código inválido o expirado");
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
          <title>Contraseña Restablecida - Doers</title>
        </Helmet>
        <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
          <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="mb-4 text-2xl font-bold text-slate-900">
                ¡Contraseña restablecida!
              </h2>
              <p className="mb-6 text-slate-600">
                Tu contraseña ha sido actualizada exitosamente.
              </p>
              <p className="mb-8 text-sm text-slate-500">
                Serás redirigido al inicio de sesión en unos segundos...
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

  return (
    <>
      <Helmet>
        <title>Verificar Código de WhatsApp - Doers</title>
        <meta
          name="description"
          content="Ingresa tu código de verificación de WhatsApp"
        />
      </Helmet>
      <div className="flex min-h-full flex-col justify-center bg-slate-50 px-6 py-12 lg:px-8">
        <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-8 shadow-lg sm:p-12">
          <div className="mb-8">
            <Link
              to="/forgot-password"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <div className="flex items-center justify-center mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100">
                <Smartphone className="h-6 w-6 text-sky-600" />
              </div>
            </div>
            <h2 className="text-center text-2xl font-bold text-slate-900">
              Verificar código de WhatsApp
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              Ingresa el código de 6 dígitos que recibiste en tu WhatsApp
            </p>
            {phone && (
              <p className="mt-2 text-center text-sm text-slate-500">
                Enviado a: <strong>{phone}</strong>
              </p>
            )}
            {expiresIn > 0 && (
              <p className="mt-2 text-center text-xs text-amber-600">
                El código expirará en {expiresIn} minutos
              </p>
            )}
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium leading-6 text-slate-600"
              >
                Código de verificación
              </label>
              <div className="mt-2">
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    setCode(value);
                  }}
                  placeholder="123456"
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-2xl font-bold tracking-widest text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Ingresa el código de 6 dígitos
              </p>
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium leading-6 text-slate-600"
              >
                Nueva contraseña
              </label>
              <div className="mt-2">
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
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
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div>
              <AnimatedButton
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="h-12 w-full"
              >
                {isLoading ? "Verificando..." : "Restablecer contraseña"}
              </AnimatedButton>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              ¿No recibiste el código?{" "}
              <button
                onClick={handleResendCode}
                disabled={isLoading}
                className="inline-flex items-center gap-1 font-semibold text-sky-600 hover:text-sky-500 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Reenviar código
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-slate-600">
              ¿Prefieres usar email?{" "}
              <Link
                to="/forgot-password"
                className="font-semibold text-sky-600 hover:text-sky-500"
              >
                Cambiar método
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
