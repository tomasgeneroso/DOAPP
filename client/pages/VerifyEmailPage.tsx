import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
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
          setMessage(data.message || t('auth.emailVerified'));
        } else {
          setStatus('error');
          setMessage(data.message || t('auth.invalidOrExpiredToken'));
        }
      })
      .catch(() => { setStatus('error'); setMessage(t('auth.connectionError')); });
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-sky-500 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">{t('auth.verifying')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-14 w-14 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('auth.emailVerified')}</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
            <Link
              to="/login"
              className="block w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl transition"
            >
              {t('auth.loginButton')}
            </Link>
          </>
        )}

        {(status === 'error' || status === 'noToken') && (
          <>
            <div className="flex justify-center mb-4">
              <XCircle className="h-14 w-14 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {status === 'noToken' ? t('auth.invalidLink') : t('auth.couldNotVerify')}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {status === 'noToken' ? t('auth.invalidLinkDesc') : message}
            </p>
            <Link
              to="/login"
              className="block w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl transition mb-3"
            >
              {t('auth.loginButton')}
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('auth.requestNewLink')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
