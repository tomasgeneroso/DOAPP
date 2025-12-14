import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth';
import { User, CreditCard, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { user, token, refreshUser } = useAuth();
  const [dni, setDni] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate DNI
    if (!dni || dni.length < 7 || dni.length > 8) {
      setError('El DNI debe tener entre 7 y 8 dígitos');
      return;
    }

    if (!/^\d+$/.test(dni)) {
      setError('El DNI debe contener solo números');
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
        setError(data.message || 'Error al completar el registro');
      }
    } catch (err) {
      console.error('Error completing registration:', err);
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Completar Registro - DOAPP</title>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-sky-600 dark:text-sky-400">DOAPP</h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Plataforma de trabajo freelance
            </p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Completa tu registro
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                Para continuar, necesitamos que ingreses tu DNI
              </p>
            </div>

            {/* Welcome message */}
            {user && (
              <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-sky-700 dark:text-sky-300">
                  Hola <strong>{user.name}</strong>, ya casi terminamos. Solo necesitamos tu DNI para verificar tu identidad.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* DNI Input */}
              <div>
                <label htmlFor="dni" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  DNI (Documento Nacional de Identidad)
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
                  Ingresa tu DNI sin puntos ni espacios (7-8 dígitos)
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
                    Guardando...
                  </>
                ) : (
                  <>
                    Continuar
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* Info */}
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-6">
              Tu DNI se utiliza para verificar tu identidad y cumplir con las regulaciones argentinas.
              Tus datos están protegidos y no serán compartidos con terceros.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
