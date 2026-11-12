import { useLocation } from 'react-router-dom';
import { MailWarning } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Transicion from './ui/Transicion';
import EmailVerification from './EmailVerification';

/**
 * Aviso de «confirmá tu correo» (regla del dueño, 2026-11-12: para publicar o trabajar hay que confirmar el correo electrónico).
 *
 * Se ve en toda la app mientras la cuenta tenga un correo sin confirmar (`user.capabilities.correoConfirmado === false`, que viene del servidor), con el botón para pedir un enlace nuevo.
 * No aparece si el dato no llegó (una sesión vieja) ni en las pantallas del propio recorrido de registro y verificación.
 */
const SIN_AVISO = ['/verify-email', '/login', '/register', '/complete-registration', '/kyc/callback', '/baja-de-correos', '/banned'];

export default function AvisoCorreoSinConfirmar() {
  const { user, isAuthenticated } = useAuth() as any;
  const { pathname } = useLocation();
  const sinConfirmar = !!isAuthenticated && !!user?.email && user?.capabilities?.correoConfirmado === false && !SIN_AVISO.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <Transicion mostrar={sinConfirmar}>
      {sinConfirmar && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-start">
            <MailWarning className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400 sm:mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Confirmá tu correo para publicar o trabajar</p>
              <div className="mt-1 text-amber-800 dark:text-amber-300">
                <EmailVerification email={user.email} verified={false} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Transicion>
  );
}
