import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { User, CreditCard, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token, refreshUser } = useAuth();
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate DNI
    if (!dni || dni.length < 7 || dni.length > 8) {
      setError(t('auth.dniLengthError', 'DNI must be between 7 and 8 digits'));
      return;
    }

    if (!/^\d+$/.test(dni)) {
      setError(t('auth.dniNumericError', 'DNI must contain only numbers'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/complete-registration', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dni }),
      });

      const data = await response.json();

      if (data.success) {
        // Update user in localStorage
        if (user) {
          const updatedUser = { ...user, dni, needsDni: false };
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }

        // Refresh user data
        if (refreshUser) {
          await refreshUser();
        }

        // Redirect to home
        navigate('/', { replace: true });
      } else {
        setError(data.message || t('auth.completeRegistrationError', 'Error completing registration'));
      }
    } catch (err) {
      console.error('Error completing registration:', err);
      setError(t('auth.connectionError', 'Connection error. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('auth.completeRegistrationTitle', 'Complete Registration')} - DOAPP</title>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-sky-600 dark:text-sky-400">DOAPP</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {t('auth.freelancePlatform', 'Freelance work platform')}
            </p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t('auth.completeYourRegistration', 'Complete your registration')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                {t('auth.dniRequired', 'To continue, we need you to enter your DNI')}
              </p>
            </div>

            {/* Welcome message */}
            {user && (
              <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-sky-700 dark:text-sky-300">
                  {t('auth.welcomeMessage', 'Hello {{name}}, we are almost done. We just need your DNI to verify your identity.', { name: user.name })}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* DNI Input */}
              <div>
                <label htmlFor="dni" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('auth.dniLabel', 'DNI (National Identity Document)')}
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    id="dni"
                    value={dni}
                    onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="12345678"
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    maxLength={8}
                    required
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t('auth.dniHint', 'Enter your DNI without dots or spaces (7-8 digits)')}
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading || !dni}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold rounded-xl transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('common.saving', 'Saving...')}
                  </>
                ) : (
                  <>
                    {t('common.continue', 'Continue')}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* Info */}
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-6">
              {t('auth.dniPrivacy', 'Your DNI is used to verify your identity and comply with Argentine regulations. Your data is protected and will not be shared with third parties.')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
