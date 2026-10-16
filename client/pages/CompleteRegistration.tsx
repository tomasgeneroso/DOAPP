import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { AlertCircle, ArrowRight, Camera, Check, CheckCircle2, CreditCard, Loader2, Upload, User as UserIcon, X } from 'lucide-react';
import Transicion from '../components/ui/Transicion';
import KycButton from '../components/KycButton';
import { FormField } from '../components/ui/FormField';

/**
 * Registro en pasos.
 *
 *   1. Correo y contraseña (o Google/X)         → ya hecho cuando se llega acá
 *   2. Verificación de identidad con Didit      → de ahí salen el nombre, el apellido y el DNI
 *   3. Revisar esos datos y completar lo que falta (usuario, teléfono; y el correo si la cuenta viene de X)
 *
 * Así el nombre y el DNI vienen del documento y no de lo que se tipeó a ciegas, y la persona solo corrige si Didit leyó mal.
 *
 * Las cuentas de antes que quedaron sin DNI (entraron con Google/X con el registro viejo) siguen su camino: DNI y luego Didit.
 */

interface DatosDelRegistro {
  pendiente: boolean;
  verificada: boolean;
  kycStatus: string | null;
  documento: { nombres: string; apellidos: string; dni: string } | null;
  sugerido: { nombres: string; apellidos: string; dni: string; username: string; telefono: string };
  faltan: string[];
  pedirCorreo: boolean;
}

const campo =
  'w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all';

function Pasos({ actual }: { actual: 1 | 2 | 3 }) {
  const pasos = ['Cuenta', 'Identidad', 'Tus datos'];
  return (
    <ol className="mb-6 flex items-center justify-center gap-2 text-xs" aria-label="Pasos del registro">
      {pasos.map((p, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const hecho = n < actual;
        const activo = n === actual;
        return (
          <li key={p} className="flex items-center gap-2" aria-current={activo ? 'step' : undefined}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                hecho ? 'bg-emerald-500 text-white' : activo ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}
            >
              {hecho ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
            </span>
            <span className={activo ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>{p}</span>
            {n < 3 && <span className="mx-1 h-px w-6 bg-slate-300 dark:bg-slate-600" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token, refreshUser, isLoading } = useAuth() as any;

  const pendiente = !!user?.registrationPending;
  const identidadHecha = !!user?.dniVerified || ['Approved', 'In Review'].includes(String(user?.kycStatus));
  const manualHabilitada = !!user?.capabilities?.manualKyc && !user?.dniVerified;

  // ── paso 3: datos
  const [datos, setDatos] = useState<DatosDelRegistro | null>(null);
  const [form, setForm] = useState({ nombres: '', apellidos: '', dni: '', username: '', phone: '', email: '' });
  const [errorDeCampo, setErrorDeCampo] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const cargado = useRef(false);

  // ── cuentas de antes sin DNI
  const [dniViejo, setDniViejo] = useState('');
  const [paso, setPaso] = useState<'dni' | 'verificar'>(user?.dni ? 'verificar' : 'dni');
  const [photoFront, setPhotoFront] = useState<File | null>(null);
  const [photoBack, setPhotoBack] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const auth = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (!pendiente || !identidadHecha || cargado.current || !token) return;
    cargado.current = true;
    setCargandoDatos(true);
    fetch('/api/auth/registro/datos', { headers: auth, credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) {
          setErrorDeCampo(d?.message || 'No pudimos traer los datos de tu documento.');
          return;
        }
        const x: DatosDelRegistro = d.data;
        setDatos(x);
        setForm({ nombres: x.sugerido.nombres, apellidos: x.sugerido.apellidos, dni: x.sugerido.dni, username: x.sugerido.username, phone: x.sugerido.telefono, email: '' });
      })
      .catch(() => setErrorDeCampo('Error de conexión. Intentá de nuevo.'))
      .finally(() => setCargandoDatos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente, identidadHecha, token]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-sky-600" aria-label="Cargando" />
      </div>
    );
  }
  if (!user) return <Navigate to="/register" replace />;
  if (!pendiente && (user.dni || !user.needsDni)) return <Navigate to="/" replace />;

  const cambiar = (nombre: keyof typeof form, valor: string) => {
    setForm((f) => ({ ...f, [nombre]: valor }));
    setErrores((e) => {
      if (!e[nombre]) return e;
      const { [nombre]: _quitado, ...resto } = e;
      return resto;
    });
  };

  const completar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDeCampo(null);
    setErrores({});
    setGuardando(true);
    try {
      const r = await fetch('/api/auth/registro/completar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        credentials: 'include',
        body: JSON.stringify({ ...form, dni: form.dni.replace(/\D/g, ''), ...(datos?.pedirCorreo ? {} : { email: undefined }) }),
      });
      const d = await r.json();
      if (!d.success) {
        if (d.field) setErrores({ [d.field]: d.message });
        else setErrorDeCampo(d.message || 'No pudimos completar tu registro.');
        return;
      }
      if (refreshUser) await refreshUser();
      navigate('/', { replace: true, state: { registroCompleto: true, enRevision: !!d.enRevision } });
    } catch {
      setErrorDeCampo(t('auth.connectionError', 'Error de conexión. Intentá de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  // ── camino de las cuentas de antes sin DNI
  const guardarDniViejo = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDeCampo(null);
    if (!/^\d{7,8}$/.test(dniViejo)) {
      setErrorDeCampo(t('auth.dniLengthError', 'El DNI debe tener entre 7 y 8 dígitos'));
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch('/api/auth/complete-registration', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth }, credentials: 'include', body: JSON.stringify({ dni: dniViejo }) });
      const d = await r.json();
      if (!d.success) {
        setErrorDeCampo(d.message || 'Error al guardar el DNI');
        return;
      }
      if (refreshUser) await refreshUser();
      setPaso('verificar');
    } catch {
      setErrorDeCampo(t('auth.connectionError', 'Error de conexión. Intentá de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const subirFotos = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDeCampo(null);
    if (!photoFront || !photoBack) {
      setErrorDeCampo(t('completeReg.errorBothPhotos', 'Debés subir la foto del frente y dorso del DNI'));
      return;
    }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('dniPhotoFront', photoFront);
      fd.append('dniPhotoBack', photoBack);
      const r = await fetch('/api/auth/dni-photos', { method: 'POST', headers: auth, body: fd });
      const d = await r.json();
      if (!d.success) {
        setErrorDeCampo(d.message || 'Error al subir las fotos del DNI');
        return;
      }
      if (refreshUser) await refreshUser();
      navigate('/', { replace: true });
    } catch {
      setErrorDeCampo(t('auth.connectionError', 'Error de conexión. Intentá de nuevo.'));
    } finally {
      setSubiendo(false);
    }
  };

  const manual = manualHabilitada && (
    <form onSubmit={subirFotos} className="space-y-4 border-t border-slate-200 dark:border-slate-700 pt-5">
      <div className="flex items-center gap-2">
        <Upload className="w-4 h-4 text-slate-500" aria-hidden="true" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {t('completeReg.manualTitle', 'La verificación automática no pudo completarse: cargá las fotos del DNI')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([
          { lado: 'Frente', archivo: photoFront, set: setPhotoFront, ref: frontRef },
          { lado: 'Dorso', archivo: photoBack, set: setPhotoBack, ref: backRef },
        ] as const).map((x) => (
          <div key={x.lado}>
            <input ref={x.ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(ev) => x.set(ev.target.files?.[0] || null)} />
            <button
              type="button"
              onClick={() => x.ref.current?.click()}
              className={`flex h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs ${x.archivo ? 'border-green-400 bg-green-50 text-green-700 dark:bg-green-900/10' : 'border-slate-300 text-slate-500 dark:border-slate-600'}`}
            >
              {x.archivo ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <Camera className="h-6 w-6" aria-hidden="true" />}
              <span className="max-w-full truncate px-2">{x.archivo ? x.archivo.name : `${x.lado} del DNI`}</span>
            </button>
            {x.archivo && (
              <button type="button" onClick={() => x.set(null)} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:underline">
                <X className="h-3 w-3" aria-hidden="true" /> Quitar
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="submit" disabled={subiendo || !photoFront || !photoBack} className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50 font-semibold rounded-xl">
        {subiendo ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Upload className="w-5 h-5" aria-hidden="true" />}
        {t('completeReg.sendPhotos', 'Enviar las fotos')}
      </button>
    </form>
  );

  const aviso = (
    <Transicion mostrar={!!errorDeCampo}>
      {errorDeCampo && (
        <div role="alert" className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">{errorDeCampo}</p>
        </div>
      )}
    </Transicion>
  );

  const pasoActual: 1 | 2 | 3 = pendiente ? (identidadHecha ? 3 : 2) : 2;

  return (
    <>
      <Helmet>
        <title>{t('completeReg.metaTitle', 'Completar registro - DOAPP')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 -z-10" aria-hidden="true" />
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-sky-600 dark:text-sky-400">DOAPP</h1>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 border border-slate-200 dark:border-slate-700">
            {pendiente && <Pasos actual={pasoActual} />}

            {/* ───────── Paso 2: verificar la identidad ───────── */}
            {pendiente && !identidadHecha && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Verificá tu identidad</h2>
                  <p className="mt-2 text-slate-600 dark:text-slate-400">
                    Con tu documento y una selfie. Tu nombre y tu DNI se completan solos desde el documento: después los revisás.
                  </p>
                </div>
                <KycButton verified={user.dniVerified} kycStatus={user.kycStatus} />
                {manual}
                {aviso}
              </div>
            )}

            {/* ───────── Paso 3: revisar y completar ───────── */}
            {pendiente && identidadHecha && (
              <form onSubmit={completar} className="space-y-4" noValidate>
                <div className="text-center">
                  <div className="w-14 h-14 bg-sky-100 dark:bg-sky-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <UserIcon className="w-7 h-7 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Revisá tus datos</h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    {datos?.documento
                      ? 'Esto es lo que leímos de tu documento. Si algo está mal, corregilo; y completá lo que falta.'
                      : 'Completá tus datos para terminar.'}
                  </p>
                </div>

                {cargandoDatos ? (
                  <div className="py-8 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" aria-label="Cargando tus datos" />
                  </div>
                ) : (
                  <>
                    {([
                      { id: 'nombres', etiqueta: 'Nombre/s', auto: 'given-name', origen: !!datos?.documento?.nombres },
                      { id: 'apellidos', etiqueta: 'Apellido/s', auto: 'family-name', origen: !!datos?.documento?.apellidos },
                    ] as const).map((c) => (
                      <div key={c.id}>
                        <label htmlFor={c.id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          {c.etiqueta} {c.origen && <span className="ml-1 text-xs font-normal text-emerald-600 dark:text-emerald-400">de tu documento</span>}
                        </label>
                        <input id={c.id} value={form[c.id]} onChange={(e) => cambiar(c.id, e.target.value)} autoComplete={c.auto} maxLength={60} className={campo} aria-invalid={!!errores[c.id]} />
                        {errores[c.id] && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores[c.id]}</p>}
                      </div>
                    ))}

                    <FormField
                      id="dni"
                      label={datos?.documento?.dni ? 'DNI (de tu documento)' : 'DNI'}
                      error={errores.dni}
                      privado
                      note="Se usa únicamente para verificar tu identidad y cumplir con la normativa de pagos. Nunca se muestra a otros usuarios."
                    >
                      {(field) => (
                        <input {...field} name="dni" inputMode="numeric" value={form.dni} onChange={(e) => cambiar('dni', e.target.value.replace(/\D/g, '').slice(0, 9))} className={campo} />
                      )}
                    </FormField>

                    {datos?.pedirCorreo && (
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Correo <span className="text-red-500">*</span></label>
                        <input id="email" type="email" value={form.email} onChange={(e) => cambiar('email', e.target.value)} autoComplete="email" className={campo} aria-invalid={!!errores.email} />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tu cuenta de X no tiene correo: lo necesitamos para avisarte de tus contratos.</p>
                        {errores.email && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.email}</p>}
                      </div>
                    )}

                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre de usuario <span className="text-red-500">*</span></label>
                      <input id="username" value={form.username} onChange={(e) => cambiar('username', e.target.value.toLowerCase())} autoComplete="username" maxLength={30} autoCapitalize="none" className={campo} aria-invalid={!!errores.username} />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Letras, números, puntos y guiones bajos. Es la dirección de tu perfil.</p>
                      {errores.username && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.username}</p>}
                    </div>

                    <FormField
                      id="phone"
                      label="Teléfono (opcional)"
                      error={errores.phone}
                      help="Con característica y sin el 15. Por ejemplo: +54 11 1234-5678."
                      privado
                      note="Solo lo usamos para avisarte de tus contratos y para que podamos contactarte si hay un problema con un trabajo. No aparece en tu perfil, no se lo damos a otros usuarios y no lo usamos para publicidad."
                    >
                      {(field) => (
                        <input {...field} name="phone" type="tel" value={form.phone} onChange={(e) => cambiar('phone', e.target.value)} autoComplete="tel" placeholder="+54 9 11 1234-5678" className={campo} />
                      )}
                    </FormField>

                    {datos?.documento && (
                      <p className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
                        Podés corregir un error de lectura (una letra, un acento). Si cambiás el nombre o el DNI por otros que no son los de tu documento, un administrador va a revisar tu identidad antes de verificarla.
                      </p>
                    )}

                    {aviso}

                    <button type="submit" disabled={guardando} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold rounded-xl transition-colors">
                      {guardando ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                          Guardando…
                        </>
                      ) : (
                        <>
                          Terminar mi registro
                          <ArrowRight className="w-5 h-5" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>
            )}

            {/* ───────── Cuentas de antes sin DNI ───────── */}
            {!pendiente && paso === 'dni' && (
              <form onSubmit={guardarDniViejo} className="space-y-5">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('completeReg.title', 'Completá tu registro')}</h2>
                  <p className="mt-2 text-slate-600 dark:text-slate-400">{t('completeReg.subtitle', 'Necesitamos tu número de DNI')}</p>
                </div>
                <div>
                  <label htmlFor="dniViejo" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('completeReg.dniLabel', 'Número de DNI')}</label>
                  <input id="dniViejo" inputMode="numeric" value={dniViejo} onChange={(e) => setDniViejo(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="12345678" maxLength={8} className={campo} required />
                </div>
                {aviso}
                <button type="submit" disabled={guardando || dniViejo.length < 7} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-semibold rounded-xl">
                  {guardando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : null}
                  {t('completeReg.continue', 'Continuar')}
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </form>
            )}
            {!pendiente && paso === 'verificar' && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Verificá tu identidad</h2>
                </div>
                <KycButton verified={user.dniVerified} kycStatus={user.kycStatus} />
                {user.dniVerified && (
                  <button type="button" onClick={() => navigate('/', { replace: true })} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl">
                    {t('completeReg.continue', 'Continuar')}
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </button>
                )}
                {manual}
                {aviso}
                {!user.dniVerified && (
                  <button type="button" onClick={() => navigate('/', { replace: true })} className="w-full text-center text-sm text-slate-500 dark:text-slate-400 hover:underline">
                    {t('completeReg.later', 'Lo hago más tarde')}
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-6">
              {t('completeReg.privacyNote', 'Tus datos están protegidos y no serán compartidos con terceros. El DNI es requerido por regulaciones argentinas.')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
