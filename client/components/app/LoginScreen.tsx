import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TermsModal } from "@/components/ui/TermsModal";
import { useAuth } from "@/hooks/useAuth";
import { clsx } from "clsx";
import { Chrome, Facebook, Twitter } from "lucide-react";

import type { ScreenId } from "./types";

interface LoginScreenProps {
  onNavigate: (screen: ScreenId) => void;
  onLogin?: () => void;
}

const providers = [
  {
    id: "facebook",
    icon: Facebook,
    accent: "text-sky-600",
  },
  {
    id: "google",
    icon: Chrome,
    accent: "text-amber-500",
  },
  {
    id: "twitter",
    icon: Twitter,
    accent: "text-sky-400",
  },
];

export function LoginScreen({ onNavigate, onLogin }: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleLogin = () => {
    onLogin?.();
    onNavigate("jobs");
  };

  const handleRegister = () => {
    if (!termsAccepted) {
      alert("Debes aceptar los términos y condiciones para registrarte");
      return;
    }
    onLogin?.();
    onNavigate("jobs");
  };

  return (
    <div className="w-full rounded-3xl bg-white p-8 shadow-xl sm:p-12">
      <div className="flex flex-col">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 text-3xl font-bold text-white shadow-lg shadow-sky-500/30">
          DD
        </div>
        <h2 className="mb-2 text-center text-2xl font-bold text-slate-900">
          {isRegistering ? "Crear cuenta" : "Bienvenido a Doers"}
        </h2>
        <p className="mb-8 text-center text-sm text-slate-600">
          {isRegistering
            ? "Únete a nuestra comunidad"
            : "Conecta con profesionales cerca tuyo"}
        </p>
        <form className="flex flex-col gap-6">
          {isRegistering && (
            <Field label="Nombre completo">
              <Input type="text" placeholder="Juan Pérez" className="h-12" />
            </Field>
          )}
          <Field label="Correo electrónico">
            <Input
              type="email"
              placeholder="tucorreo@email.com"
              className="h-12"
            />
          </Field>
          <Field label="Contraseña">
            <Input type="password" placeholder="••••••••" className="h-12" />
          </Field>
          {isRegistering && (
            <Field label="Teléfono (opcional)">
              <Input
                type="tel"
                placeholder="+54 11 1234-5678"
                className="h-12"
              />
            </Field>
          )}
          {isRegistering ? (
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
              />
              <span>
                Acepto los{" "}
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="font-medium text-sky-500 hover:text-sky-600 hover:underline"
                >
                  términos y condiciones
                </button>{" "}
                de uso de la plataforma
              </span>
            </label>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" className="rounded border-slate-300" />
                Recordarme
              </label>
              <button
                type="button"
                className="font-medium text-sky-500 hover:text-sky-600"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}
          <Button
            type="button"
            className="h-12"
            size="lg"
            onClick={isRegistering ? handleRegister : handleLogin}
          >
            {isRegistering ? "Crear cuenta" : "Ingresar"}
          </Button>
        </form>
        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200"></div>
          <span className="text-sm text-slate-500">o continúa con</span>
          <div className="h-px flex-1 bg-slate-200"></div>
        </div>
        <div className="flex items-center justify-center gap-4">
          {providers.map((provider) => {
            const Icon = provider.icon;
            return (
              <button
                key={provider.id}
                type="button"
                className={clsx(
                  "flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-slate-600 transition hover:border-sky-300 hover:bg-slate-50",
                  provider.accent,
                )}
                aria-label={`Ingresar con ${provider.id}`}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
        <div className="mt-8 text-center text-sm text-slate-600">
          {isRegistering ? (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                className="font-semibold text-sky-500 hover:text-sky-600"
                onClick={() => setIsRegistering(false)}
              >
                Inicia sesión
              </button>
            </>
          ) : (
            <>
              ¿No tienes cuenta?{" "}
              <button
                type="button"
                className="font-semibold text-sky-500 hover:text-sky-600"
                onClick={() => setIsRegistering(true)}
              >
                Regístrate aquí
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modal de Términos y Condiciones */}
      <TermsModal
        isOpen={showTerms}
        onClose={() => setShowTerms(false)}
        type="app"
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-slate-600">
      <span>{label}</span>
      {children}
    </label>
  );
}
