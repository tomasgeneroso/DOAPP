import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'noToken'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('noToken'); return; }

    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          setMessage(data.message || 'Email verificado correctamente.');
        } else {
          setStatus('error');
          setMessage(data.message || 'Token inválido o expirado.');
        }
      })
      .catch(() => { setStatus('error'); setMessage('Error de conexión. Intentá de nuevo.'); });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-sky-500 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Verificando tu email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-14 w-14 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">¡Email verificado!</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
            <Link
              to="/login"
              className="block w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl transition"
            >
              Iniciar sesión
            </Link>
          </>
        )}

        {(status === 'error' || status === 'noToken') && (
          <>
            <div className="flex justify-center mb-4">
              <XCircle className="h-14 w-14 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {status === 'noToken' ? 'Enlace inválido' : 'No pudimos verificar tu email'}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {status === 'noToken' ? 'El enlace de verificación no es válido.' : message}
            </p>
            <Link
              to="/login"
              className="block w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl transition mb-3"
            >
              Volver al inicio de sesión
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Desde el login podés solicitar un nuevo enlace de verificación.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
