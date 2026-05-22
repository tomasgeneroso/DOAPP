import React, { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useFacebookLogin } from "../hooks/useFacebookLogin";
import { Helmet } from "react-helmet-async";
import { AnimatedButton } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input"; // Asegúrate que este componente se esté usando
import { Chrome, Facebook, Twitter, Eye, EyeOff, Home, Upload, X, FileText, Image, Camera } from "lucide-react";
import TokenExpiredNotice from "../components/TokenExpiredNotice";
import MembershipOfferModal from "../components/MembershipOfferModal";
import CameraCapture from "../components/CameraCapture";
import { analytics, identifyUser } from "../utils/analytics";
import { ThemeToggle } from "../components/ui/ThemeToggle";

type FormMode = "login" | "register";

// ── Sub-component: DNI photo slot with gallery + camera options ───────────────
function DniPhotoSlot({
  label,
  photo,
  onPhoto,
  fileRef,
}: {
  label: string;
  photo: File | null;
  onPhoto: (f: File | null) => void;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  const [showCamera, setShowCamera] = useState(false);

  return (
    <div>
      {/* Gallery input */}
      <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden"
        onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />

      {/* Camera modal */}
      {showCamera && (
        <CameraCapture
          label={label}
          onCapture={(file) => { onPhoto(file); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {photo ? (
        /* Preview */
        <div className="rounded-lg border-2 border-sky-500 bg-sky-50 dark:bg-sky-900/20 overflow-hidden">
          <img src={URL.createObjectURL(photo)} alt={label} className="w-full h-20 object-cover" />
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] text-sky-600 dark:text-sky-400 truncate flex-1">{photo.name}</span>
            <button type="button" onClick={() => onPhoto(null)} className="text-red-500 hover:text-red-600 ml-1 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Pick options */
        <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
          <p className="text-[10px] text-center text-slate-500 dark:text-slate-400 pt-2 pb-0.5 font-medium px-1">{label}</p>
          <div className="flex gap-1 p-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-xs text-slate-600 dark:text-slate-300"
            >
              <Upload className="w-4 h-4" />
              <span>Galería</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors text-xs text-sky-700 dark:text-sky-300"
            >
              <Camera className="w-4 h-4" />
              <span>Cámara</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Get redirect path from URL query params or location state
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect");
  const from = redirectParam ||
    (typeof location.state?.from === "string"
      ? location.state.from
      : location.state?.from?.pathname) || "/";

  // Automatically set mode to register if coming from /register route
  const initialMode: FormMode = location.pathname === '/register' ? 'register' : 'login';

  const [mode, setMode] = useState<FormMode>(initialMode);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    phone: "",
    dni: "",
    referralCode: "",
    cbu: "",
    termsAccepted: false,
  });
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [usernameDebounce, setUsernameDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);
  // DNI photos
  const [dniMode, setDniMode] = useState<'images' | 'pdf'>('images');
  const [dniPhotoFront, setDniPhotoFront] = useState<File | null>(null);
  const [dniPhotoBack, setDniPhotoBack] = useState<File | null>(null);
  const [dniPdf, setDniPdf] = useState<File | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showMembershipOffer, setShowMembershipOffer] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [registrationPendingVerification, setRegistrationPendingVerification] = useState(false);
  const { login, register, user } = useAuth();
  const { loginWithFacebook, isLoading: fbLoading, error: fbError } = useFacebookLogin();

  // Check membership status after registration
  useEffect(() => {
    if (justRegistered && user) {
      console.log('🔍 Verificando estado de membresía después del registro:', user.email);
      console.log('📊 Membresía del usuario:', { hasMembership: user.hasMembership, membershipTier: user.membershipTier });

      const hasPremiumMembership = user.hasMembership && (user.membershipTier === 'pro' || user.membershipTier === 'super_pro');

      if (!hasPremiumMembership) {
        console.log('👤 Usuario no tiene membresía premium, mostrando modal de oferta');
        setShowMembershipOffer(true);
      } else {
        console.log('👑 Usuario ya es PRO/SUPER PRO, redirigiendo sin mostrar modal');
        navigate(from, { replace: true });
      }

      // Reset the flag
      setJustRegistered(false);
    }
  }, [justRegistered, user, navigate, from]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Check username availability with debounce
    if (name === 'username') {
      const usernameValue = value.toLowerCase().trim();

      // Clear previous debounce
      if (usernameDebounce) {
        clearTimeout(usernameDebounce);
      }

      // Validate format first
      if (usernameValue.length < 3) {
        setUsernameStatus('idle');
        return;
      }

      const usernameRegex = /^[a-z0-9._]{3,30}$/;
      if (!usernameRegex.test(usernameValue) || /^[._]|[._]$|[._]{2,}/.test(usernameValue)) {
        setUsernameStatus('idle');
        return;
      }

      setUsernameStatus('checking');
      const timeout = setTimeout(async () => {
        try {
          const response = await fetch(`/api/users/check-username/${usernameValue}`);
          const data = await response.json();
          setUsernameStatus(data.available ? 'available' : 'taken');
        } catch {
          setUsernameStatus('idle');
        }
      }, 500);
      setUsernameDebounce(timeout);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setErrorField(null);

    try {
      if (mode === "login") {
        try {
          const user = await login(formData.email, formData.password);
          analytics.login('email');
          if (user?.id) identifyUser(user.id);
          navigate(from, { replace: true });
        } catch (err: any) {
          if (err.emailNotVerified) {
            setEmailNotVerified(err.email || formData.email);
            setError(null);
          } else {
            throw err;
          }
        }
        return;
      } else {
        if (!formData.termsAccepted) {
          setError("Debes aceptar los términos y condiciones.");
          setIsLoading(false);
          return;
        }

        // Validar número de DNI obligatorio
        if (!formData.dni.trim()) {
          setError("El número de DNI es obligatorio.");
          setIsLoading(false);
          return;
        }
        if (!/^\d{7,9}$/.test(formData.dni.trim())) {
          setError("El DNI debe tener entre 7 y 9 dígitos.");
          setIsLoading(false);
          return;
        }

        // Validar fotos de DNI obligatorias
        const hasDniForValidation = dniMode === 'pdf' ? !!dniPdf : (!!dniPhotoFront && !!dniPhotoBack);
        if (!hasDniForValidation) {
          setError(dniMode === 'pdf'
            ? "El PDF del DNI es obligatorio."
            : "Debés subir la foto de frente Y dorso del DNI.");
          setIsLoading(false);
          return;
        }
        const newUser = await register({
          name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
          username: formData.username.toLowerCase().trim(),
          email: formData.email,
          password: formData.password,
          phone: formData.phone,
          dni: formData.dni,
          referralCode: formData.referralCode || undefined,
          cbu: formData.cbu || undefined,
          termsAccepted: formData.termsAccepted,
        });

        // Track signup event
        analytics.signup('email');
        if (newUser?.id) {
          identifyUser(newUser.id);
        }

        // Upload DNI photos if provided
        const hasDniFiles = dniMode === 'pdf' ? !!dniPdf : (!!dniPhotoFront || !!dniPhotoBack);
        if (hasDniFiles) {
          try {
            const token = localStorage.getItem('token');
            const fd = new FormData();
            if (dniMode === 'pdf' && dniPdf) {
              fd.append('dniPhotoFront', dniPdf);
            } else {
              if (dniPhotoFront) fd.append('dniPhotoFront', dniPhotoFront);
              if (dniPhotoBack) fd.append('dniPhotoBack', dniPhotoBack);
            }
            await fetch('/api/auth/dni-photos', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: fd,
            });
          } catch {
            // Non-blocking — user can upload later from profile
          }
        }

        // Show email verification pending screen instead of navigating
        setRegistrationPendingVerification(true);
      }
    } catch (err: any) {
      const errorMessage = err.message || "Ocurrió un error. Por favor, intenta de nuevo.";

      // Capturar el campo específico del error si está disponible
      if (err.field) {
        setErrorField(err.field);
      }

      // Check if error is about existing user
      const errorLower = errorMessage.toLowerCase();
      if (errorLower.includes('ya existe') ||
          errorLower.includes('ya está registrado') ||
          errorLower.includes('already exists') ||
          errorLower.includes('already registered')) {
        setError('user_exists');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMembershipOfferClose = () => {
    console.log('❌ Usuario cerró modal de membresía (Más tarde)');
    setShowMembershipOffer(false);
    // Solo navegar a home si el usuario cierra el modal sin seleccionar plan
    setTimeout(() => {
      navigate(from, { replace: true });
    }, 100);
  };

  const handleUpgradeClick = (plan: 'monthly' | 'quarterly' | 'super_pro') => {
    console.log('🚀 Usuario seleccionó plan:', plan);
    console.log('👤 Usuario actual:', user?.email);
    setShowMembershipOffer(false);

    // Navegar a checkout (el usuario está autenticado después del registro)
    setTimeout(() => {
      console.log('✅ Navegando a /membership/checkout?plan=' + plan);
      navigate(`/membership/checkout?plan=${plan}`, { replace: true });
    }, 100);
  };

  const handleResendVerification = async (emailAddr: string) => {
    setResendingVerification(true);
    setVerificationSent(false);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr }),
      });
      setVerificationSent(true);
    } finally {
      setResendingVerification(false);
    }
  };

  const isRegister = mode === "register";

  // ── Pantalla: registro completado, verificar email ───────────────────────
  if (registrationPendingVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="flex justify-center mb-5">
            <div className="h-16 w-16 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
              <span className="text-3xl">📧</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">¡Registrado!</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Te enviamos un email de verificación. Revisá tu casilla y hacé clic en el enlace para activar tu cuenta.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            No te va a llegar el correo? Revisá la carpeta de spam o solicitá un nuevo enlace.
          </p>
          {verificationSent && (
            <p className="text-sm text-green-600 dark:text-green-400 mb-4">✓ Nuevo enlace enviado.</p>
          )}
          <button
            onClick={() => handleResendVerification(formData.email)}
            disabled={resendingVerification}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl transition disabled:opacity-50 mb-3"
          >
            {resendingVerification ? 'Enviando...' : 'Reenviar email de verificación'}
          </button>
          <button
            onClick={() => {
              setRegistrationPendingVerification(false);
              setMode('login');
              setFormData({ firstName: '', lastName: '', username: '', email: '', password: '', phone: '', dni: '', referralCode: '', cbu: '', termsAccepted: false });
              setDniPhotoFront(null);
              setDniPhotoBack(null);
              setDniPdf(null);
              setError(null);
            }}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{isRegister ? t('auth.registerButton') : t('auth.loginButton')} - DOAPP</title>
        <meta
          name="description"
          content={
            isRegister
              ? `${t('auth.registerTitle')} - DOAPP`
              : `${t('auth.loginTitle')} - DOAPP`
          }
        />
      </Helmet>
      {/* Background layer: covers full viewport regardless of body zoom */}
      <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 -z-10" aria-hidden="true" />
      {/* Theme toggle fixed top-right */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="flex min-h-screen flex-col justify-center px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto w-full max-w-[95%] sm:max-w-md rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-lg sm:p-8 md:p-12 animate-scaleIn">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6"
          >
            <Home className="h-4 w-4" />
            {t('auth.backToHome')}
          </Link>
          <h2 className="mb-6 sm:mb-8 text-center text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
          </h2>

          {/* Mensaje de bienvenida para nuevos usuarios */}
          <div className="mb-4 sm:mb-6 rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 p-3 sm:p-4 text-center shadow-md">
            <p className="text-xs sm:text-sm font-semibold text-white">
              {t('auth.promoFirst1000')}
            </p>
          </div>

          <TokenExpiredNotice />

          <div className="mb-4 border-b border-gray-200 dark:border-slate-700">
            <ul
              className="flex -mb-px text-sm font-medium text-center"
              role="tablist"
            >
              <li className="flex-1" role="presentation">
                <button
                  className={`w-full inline-block p-3 sm:p-4 border-b-2 rounded-t-lg transition-colors ${
                    mode === "login"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400"
                  }`}
                  onClick={() => setMode("login")}
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                >
                  {t('auth.loginButton')}
                </button>
              </li>
              <li className="flex-1" role="presentation">
                <button
                  className={`w-full inline-block p-3 sm:p-4 border-b-2 rounded-t-lg transition-colors ${
                    mode === "register"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 text-slate-500 dark:text-slate-400"
                  }`}
                  onClick={() => setMode("register")}
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                >
                  {t('auth.registerButton')}
                </button>
              </li>
            </ul>
          </div>

          <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="firstName"
                      className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                    >
                      {t('auth.firstName', 'Nombre/s')} <span className="text-red-500">*</span>
                    </label>
                    <div className="mt-2">
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        autoComplete="given-name"
                        required={isRegister}
                        onChange={handleInputChange}
                        value={formData.firstName}
                        placeholder="Juan"
                        className="block w-full h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="lastName"
                      className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                    >
                      {t('auth.lastName', 'Apellido/s')} <span className="text-red-500">*</span>
                    </label>
                    <div className="mt-2">
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        autoComplete="family-name"
                        required={isRegister}
                        onChange={handleInputChange}
                        value={formData.lastName}
                        placeholder="Pérez"
                        className="block w-full h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {t('auth.username')} <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">@</span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required={isRegister}
                      onChange={handleInputChange}
                      value={formData.username}
                      placeholder="juanperez"
                      maxLength={30}
                      className={`block w-full h-12 rounded-lg border ${
                        usernameStatus === 'available' ? 'border-green-500 dark:border-green-500' :
                        usernameStatus === 'taken' ? 'border-red-500 dark:border-red-500' :
                        'border-slate-300 dark:border-slate-600'
                      } bg-white dark:bg-slate-700 pl-8 pr-10 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent lowercase`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameStatus === 'checking' && (
                        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                      )}
                      {usernameStatus === 'available' && (
                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {usernameStatus === 'taken' && (
                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {usernameStatus === 'taken'
                      ? 'Este nombre de usuario ya está en uso'
                      : 'Este será tu URL pública: doapp.com/u/tuusuario'}
                  </p>
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
              >
                {t('auth.email')} <span className="text-red-500">*</span>
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  onChange={handleInputChange}
                  value={formData.email}
                  placeholder="tucorreo@email.com"
                  className={`block w-full h-12 rounded-lg border ${
                    errorField === 'email'
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-sky-500'
                  } bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:border-transparent`}
                />
                {errorField === 'email' && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                >
                  {t('auth.password')} <span className="text-red-500">*</span>
                </label>
                {!isRegister && (
                  <div className="text-sm">
                    <Link
                      to="/forgot-password"
                      className="font-semibold text-sky-600 hover:text-sky-500"
                    >
                      {t('auth.forgotPassword')}
                    </Link>
                  </div>
                )}
              </div>
              <div className="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    isRegister ? "new-password" : "current-password"
                  }
                  required
                  onChange={handleInputChange}
                  value={formData.password}
                  placeholder="••••••••"
                  className={`block w-full h-12 rounded-lg border ${
                    errorField === 'password'
                      ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-sky-500'
                  } bg-white dark:bg-slate-700 px-3 py-2 pr-10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:border-transparent`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errorField === 'password' && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>

            {isRegister && (
              <>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {t('auth.phone')} <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2">
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      required={isRegister}
                      onChange={handleInputChange}
                      value={formData.phone}
                      placeholder="+54 11 1234-5678"
                      className="block w-full h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="dni"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {t('auth.dni')} <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-2">
                    <input
                      id="dni"
                      name="dni"
                      type="text"
                      autoComplete="off"
                      required={isRegister}
                      onChange={handleInputChange}
                      value={formData.dni}
                      placeholder="12345678"
                      maxLength={9}
                      className="block w-full h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('auth.dniHelper')}
                  </p>
                </div>

                {/* DNI Photos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
                      Foto del DNI <span className="text-red-500">*</span>
                    </label>
                    <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 text-xs">
                      <button
                        type="button"
                        onClick={() => { setDniMode('images'); setDniPdf(null); }}
                        className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${dniMode === 'images' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                      >
                        <Image className="w-3 h-3" /> 2 fotos
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDniMode('pdf'); setDniPhotoFront(null); setDniPhotoBack(null); }}
                        className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${dniMode === 'pdf' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                      >
                        <FileText className="w-3 h-3" /> PDF
                      </button>
                    </div>
                  </div>

                  {dniMode === 'images' ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* ── Frente ── */}
                      <DniPhotoSlot
                        label="Frente del DNI"
                        photo={dniPhotoFront}
                        onPhoto={setDniPhotoFront}
                        fileRef={frontInputRef}
                      />
                      {/* ── Dorso ── */}
                      <DniPhotoSlot
                        label="Dorso del DNI"
                        photo={dniPhotoBack}
                        onPhoto={setDniPhotoBack}
                        fileRef={backInputRef}
                      />
                    </div>
                  ) : (
                    <div>
                      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden"
                        onChange={(e) => setDniPdf(e.target.files?.[0] ?? null)} />
                      <button type="button" onClick={() => pdfInputRef.current?.click()}
                        className={`w-full h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-colors ${dniPdf ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-slate-300 dark:border-slate-600 hover:border-sky-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                      >
                        {dniPdf ? (
                          <>
                            <FileText className="w-6 h-6 text-sky-500" />
                            <span className="text-sky-600 dark:text-sky-400 font-medium truncate max-w-full px-2">{dniPdf.name}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-5 h-5 text-slate-400" />
                            <span className="text-slate-500 dark:text-slate-400">PDF con ambas caras del DNI</span>
                          </>
                        )}
                      </button>
                      {dniPdf && (
                        <button type="button" onClick={() => setDniPdf(null)} className="mt-1 text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
                          <X className="w-3 h-3" /> Quitar
                        </button>
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Requerido para verificar tu identidad y operar en la plataforma.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="referralCode"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {t('auth.referralCode')} <span className="text-slate-400">(opcional)</span>
                  </label>
                  <div className="mt-2">
                    <input
                      id="referralCode"
                      name="referralCode"
                      type="text"
                      onChange={handleInputChange}
                      value={formData.referralCode}
                      placeholder="ABC12345"
                      className="block w-full h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent uppercase"
                      maxLength={8}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t('auth.referralHelper')}
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="cbu"
                    className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {t('auth.cbu')} <span className="text-slate-400">(opcional)</span>
                  </label>
                  <div className="mt-2">
                    <input
                      id="cbu"
                      name="cbu"
                      type="text"
                      onChange={handleInputChange}
                      value={formData.cbu}
                      placeholder="0000000000000000000000"
                      className="block w-full h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      maxLength={22}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Tu CBU/CVU para recibir pagos por trabajos. Si no lo completás ahora, lo necesitarás cuando completes tu primer trabajo.
                  </p>
                </div>
                <div className="flex items-center">
                  <input
                    id="termsAccepted"
                    name="termsAccepted"
                    type="checkbox"
                    required={isRegister}
                    onChange={handleInputChange}
                    checked={formData.termsAccepted}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                  />
                  <label
                    htmlFor="termsAccepted"
                    className="ml-3 block text-sm leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {t('auth.termsAccept')}{" "}
                    <Link
                      to="/legal/terminos-y-condiciones"
                      target="_blank"
                      className="font-semibold text-sky-600 hover:text-sky-500"
                    >
                      {t('auth.termsAndConditions')}
                    </Link>
                  </label>
                </div>
              </>
            )}

            {/* Email not verified banner */}
            {emailNotVerified && (
              <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">📧 Email no verificado</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                  Debés verificar tu email antes de ingresar. Revisá tu casilla de correo (incluyendo spam).
                </p>
                {verificationSent && (
                  <p className="text-xs text-green-600 dark:text-green-400 mb-2">✓ Nuevo enlace enviado a {emailNotVerified}</p>
                )}
                <button
                  type="button"
                  onClick={() => handleResendVerification(emailNotVerified)}
                  disabled={resendingVerification}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                >
                  {resendingVerification ? 'Enviando...' : 'Reenviar email de verificación'}
                </button>
              </div>
            )}

            {error && !errorField && (
              <div className={`rounded-lg p-4 ${
                error === 'user_exists'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
                {error === 'user_exists' ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          {t('auth.alreadyRegistered')}
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                          ¿Ya tienes una cuenta? Inicia sesión para acceder.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                      }}
                      className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {t('auth.goToLogin')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <AnimatedButton
                type="submit"
                disabled={isLoading}
                className="h-12 w-full"
              >
                {isLoading
                  ? t('auth.processing')
                  : isRegister
                  ? t('auth.registerButton')
                  : t('auth.loginButton')}
              </AnimatedButton>
            </div>
          </form>

          <div className="my-4 sm:my-6 flex items-center gap-3 sm:gap-4">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
            <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{t('auth.continueWith')}</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700"></div>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-4">
            {/* Social Logins */}
            {/* Facebook temporarily disabled
            <button
              type="button"
              onClick={loginWithFacebook}
              disabled={fbLoading || isLoading}
              className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xl text-sky-600 transition hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Ingresar con Facebook"
            >
              <Facebook className="h-5 w-5" />
            </button>
            */}
            <a
              href={`${import.meta.env.VITE_API_URL}/auth/google`}
              className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xl transition hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              aria-label="Ingresar con Google"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </a>
<a
              href={`${import.meta.env.VITE_API_URL}/auth/twitter`}
              className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xl text-slate-900 dark:text-white transition hover:border-sky-300 hover:bg-slate-50 dark:hover:bg-slate-600"
              aria-label="Ingresar con X"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>

          {fbError && <p className="mt-4 text-sm text-center text-red-600">{fbError}</p>}
        </div>
      </div>

      {/* Membership Offer Modal */}
      <MembershipOfferModal
        isOpen={showMembershipOffer}
        onClose={handleMembershipOfferClose}
        onUpgrade={handleUpgradeClick}
      />
    </>
  );
}
