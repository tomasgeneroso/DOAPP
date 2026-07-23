import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { User, CreditCard, ArrowRight, Loader2, AlertCircle, Upload, Camera, CheckCircle2, X } from 'lucide-react';

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token, refreshUser } = useAuth();

  const [dni, setDni] = useState('');
  const [photoFront, setPhotoFront] = useState<File | null>(null);
  const [photoBack, setPhotoBack] = useState<File | null>(null);
  const [previewFront, setPreviewFront] = useState<string | null>(null);
  const [previewBack, setPreviewBack] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (
    file: File | null,
    side: 'front' | 'back'
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError(t('completeReg.errorOnlyImages', 'Solo se aceptan imágenes (JPG, PNG) o PDF'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo no puede superar 10MB');
      return;
    }
    setError('');
    if (side === 'front') {
      setPhotoFront(file);
      setPreviewFront(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    } else {
      setPhotoBack(file);
      setPreviewBack(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!dni || dni.length < 7 || dni.length > 8) {
      setError(t('auth.dniLengthError', 'El DNI debe tener entre 7 y 8 dígitos'));
      return;
    }
    if (!/^\d+$/.test(dni)) {
      setError(t('auth.dniNumericError', 'El DNI debe contener solo números'));
      return;
    }
    if (!photoFront || !photoBack) {
      setError(t('completeReg.errorBothPhotos', 'Debés subir la foto del frente y dorso del DNI'));
      return;
    }

    setLoading(true);
    try {
      // Step 1: save DNI number
      const dniRes = await fetch('/api/auth/complete-registration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dni }),
      });
      const dniData = await dniRes.json();
      if (!dniData.success) {
        setError(dniData.message || 'Error al guardar DNI');
        return;
      }

      // Step 2: upload photos
      const formData = new FormData();
      formData.append('dniPhotoFront', photoFront);
      formData.append('dniPhotoBack', photoBack);

      const photoRes = await fetch('/api/auth/dni-photos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const photoData = await photoRes.json();
      if (!photoData.success) {
        setError(photoData.message || 'Error al subir las fotos del DNI');
        return;
      }

      if (user) {
        localStorage.setItem('user', JSON.stringify({ ...user, dni, needsDni: false }));
      }
      if (refreshUser) await refreshUser();
      navigate('/', { replace: true });
    } catch {
      setError(t('auth.connectionError', 'Error de conexión. Intentá de nuevo.'));
    } finally {
      setLoading(false);
    }
  };

  const PhotoUploadBox = ({
    side,
    label,
    preview,
    file,
    inputRef,
    onChange,
  }: {
    side: 'front' | 'back';
    label: string;
    preview: string | null;
    file: File | null;
    inputRef: React.RefObject<HTMLInputElement>;
    onChange: (f: File | null) => void;
  }) => (
    <div className="flex flex-col gap-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={e => onChange(e.target.files?.[0] || null)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-all overflow-hidden ${
          file
            ? 'border-green-400 dark:border-green-500 bg-green-50 dark:bg-green-900/10'
            : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/10'
        }`}
        style={{ minHeight: 120 }}
      >
        {preview ? (
          <>
            <img src={preview} alt={label} className="w-full h-32 object-cover" />
            <button
              type="button"
              onClick={ev => { ev.stopPropagation(); onChange(null); if (side === 'front') setPreviewFront(null); else setPreviewBack(null); }}
              className="absolute top-2 right-2 p-1 bg-white dark:bg-slate-700 rounded-full shadow"
            >
              <X className="w-3 h-3 text-slate-600 dark:text-slate-300" />
            </button>
          </>
        ) : file ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <p className="text-xs text-green-700 dark:text-green-400 font-medium text-center truncate max-w-full">{file.name}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-4">
            <Camera className="w-8 h-8 text-slate-400" />
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              {t('completeReg.tapToUpload', 'Tocá para subir')}<br />
              <span className="text-slate-400">{t('auth.fileHintJpgPngPdf', 'JPG, PNG o PDF · máx 10MB')}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>{t('completeReg.metaTitle', 'Completar registro - DOAPP')}</title>
      </Helmet>

      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 -z-10" aria-hidden="true" />
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-sky-600 dark:text-sky-400">DOAPP</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {t('auth.freelancePlatform', 'Plataforma de trabajos freelance')}
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-sky-600 dark:text-sky-400" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {t('completeReg.title', 'Completá tu registro')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mt-2">
                {t('completeReg.subtitle', 'Necesitamos verificar tu identidad con tu DNI')}
              </p>
            </div>

            {user && (
              <div className="rounded-xl p-4 mb-6 border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20">
                <p className="text-sm text-sky-700 dark:text-sky-300">
                  <Trans i18nKey="completeReg.greeting" values={{ name: user.name }} components={{ b: <strong /> }} defaults="Hola <b>{{name}}</b>, subí tu DNI para continuar usando la plataforma." />
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* DNI number */}
              <div>
                <label htmlFor="dni" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {t('completeReg.dniLabel', 'Número de DNI')}
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    id="dni"
                    value={dni}
                    onChange={e => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="12345678"
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                    maxLength={8}
                    required
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t('completeReg.dniHint', 'Sin puntos ni espacios (7-8 dígitos)')}
                </p>
              </div>

              {/* Photo uploads */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('completeReg.dniPhotos', 'Fotos del DNI')} <span className="text-red-500">*</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <PhotoUploadBox
                    side="front"
                    label={t('completeReg.front', 'Frente')}
                    preview={previewFront}
                    file={photoFront}
                    inputRef={frontInputRef}
                    onChange={f => handlePhotoChange(f, 'front')}
                  />
                  <PhotoUploadBox
                    side="back"
                    label={t('completeReg.back', 'Dorso')}
                    preview={previewBack}
                    file={photoBack}
                    inputRef={backInputRef}
                    onChange={f => handlePhotoChange(f, 'back')}
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t('completeReg.photosHint', 'Las fotos deben ser claras y legibles. Serán verificadas por el equipo.')}
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !dni || !photoFront || !photoBack}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold rounded-xl transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t('completeReg.saving', 'Guardando...')}
                  </>
                ) : (
                  <>
                    {t('completeReg.continue', 'Continuar')}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-6">
              {t('completeReg.privacyNote', 'Tus datos están protegidos y no serán compartidos con terceros. El DNI es requerido por regulaciones argentinas.')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
