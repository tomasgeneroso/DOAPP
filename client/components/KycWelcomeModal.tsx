import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldCheck, X } from "lucide-react";
import KycButton from "./KycButton";

const SEEN_KEY = "kycWelcomeSeen";

/**
 * One-time welcome modal shown right after registration to an unverified user,
 * explaining the KYC gate (what they can't do until they verify). Dismissible;
 * won't nag again once seen.
 */
export default function KycWelcomeModal() {
  const { user, isAuthenticated } = useAuth() as any;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (user.dniVerified) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    setOpen(true);
  }, [isAuthenticated, user]);

  const close = () => {
    localStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-900/30">
              <ShieldCheck className="h-5 w-5 text-sky-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verificá tu identidad</h2>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
          ¡Bienvenido{user?.name ? `, ${user.name}` : ""}! Tu cuenta ya está creada. Para operar en DoApp
          necesitás verificar tu identidad. Es rápido: documento + selfie.
        </p>

        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-3 text-sm text-amber-800 dark:text-amber-300 mb-4">
          <p className="font-semibold mb-1">Hasta verificarte, tu cuenta está limitada:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            <li>Podés <strong>crear</strong> trabajos, pero no <strong>publicarlos</strong>.</li>
            <li>No podés <strong>postularte</strong> a trabajos.</li>
            <li>No podés <strong>cobrar</strong> ni <strong>retirar</strong> dinero.</li>
            <li>Sí podés navegar y <strong>escribir en el blog</strong>.</li>
          </ul>
        </div>

        <KycButton verified={user?.dniVerified} kycStatus={user?.kycStatus} />

        <button onClick={close} className="mt-3 w-full text-center text-sm text-slate-500 dark:text-slate-400 hover:underline">
          Lo hago más tarde
        </button>
      </div>
    </div>
  );
}
