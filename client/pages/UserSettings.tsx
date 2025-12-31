import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  User,
  MapPin,
  CreditCard,
  FileText,
  Save,
  AlertCircle,
  CheckCircle2,
  Tag,
  Bell,
  MessageCircle,
  HelpCircle,
  PlayCircle,
  Wallet,
  Link2,
  Unlink,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { JOB_CATEGORIES } from "../../shared/constants/categories";
import { useOnboarding } from "../hooks/useOnboarding";

type TabType = "basic" | "address" | "banking" | "payments" | "legal" | "interests" | "notifications" | "help";

export default function UserSettings() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { startOnboarding } = useOnboarding();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // MercadoPago OAuth state
  const [mpStatus, setMpStatus] = useState<{
    isLinked: boolean;
    prefersPayout: boolean;
    email: string | null;
    linkedAt: string | null;
  } | null>(null);
  const [mpLoading, setMpLoading] = useState(false);
  const [mpServiceAvailable, setMpServiceAvailable] = useState(false);

  // Handle tab from URL query parameter and MercadoPago callback
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["basic", "address", "banking", "payments", "legal", "interests", "notifications", "help"].includes(tabParam)) {
      setActiveTab(tabParam as TabType);
    }

    // Handle MercadoPago callback
    const mpLinked = searchParams.get("mp_linked");
    const mpError = searchParams.get("mp_error");
    const mpEmail = searchParams.get("mp_email");

    if (mpLinked === "true") {
      setMessage({
        type: "success",
        text: mpEmail
          ? `Cuenta de MercadoPago (${mpEmail}) vinculada exitosamente`
          : "Cuenta de MercadoPago vinculada exitosamente",
      });
      setActiveTab("payments");
      fetchMpStatus();
      // Clean URL
      navigate("/settings?tab=payments", { replace: true });
    } else if (mpError) {
      setMessage({
        type: "error",
        text: `Error al vincular MercadoPago: ${decodeURIComponent(mpError)}`,
      });
      setActiveTab("payments");
      navigate("/settings?tab=payments", { replace: true });
    }
  }, [searchParams]);

  // Basic info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");

  // Address
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Argentina");

  // Banking
  const [accountHolder, setAccountHolder] = useState("");
  const [bankType, setBankType] = useState<"mercadopago" | "otro">("mercadopago");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "checking">("savings");
  const [cbu, setCbu] = useState("");
  const [cbuMasked, setCbuMasked] = useState(""); // Original masked CBU from server
  const [alias, setAlias] = useState("");

  // Legal
  const [idType, setIdType] = useState<"dni" | "passport" | "cuit" | "cuil">("dni");
  const [idNumber, setIdNumber] = useState("");
  const [taxStatus, setTaxStatus] = useState<"freelancer" | "autonomo" | "monotributo" | "responsable_inscripto">("freelancer");
  const [taxId, setTaxId] = useState("");

  // Interests
  const [interests, setInterests] = useState<string[]>([]);

  // Notifications
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    push: true,
    sms: false,
    newMessage: true,
    jobUpdate: true,
    contractUpdate: true,
    paymentUpdate: true,
    marketing: false,
  });

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
      setBio(user.bio || "");
      setStreet(user.address?.street || "");
      setCity(user.address?.city || "");
      setState(user.address?.state || "");
      setPostalCode(user.address?.postalCode || "");
      setCountry(user.address?.country || "Argentina");
      setAccountHolder(user.bankingInfo?.accountHolder || "");
      setBankType(user.bankingInfo?.bankType || "mercadopago");
      setBankName(user.bankingInfo?.bankName || "");
      setAccountType(user.bankingInfo?.accountType || "savings");
      // CBU comes masked from server, store it separately
      setCbuMasked(user.bankingInfo?.cbu || "");
      setCbu(""); // Start with empty, user needs to re-enter to change
      setAlias(user.bankingInfo?.alias || "");
      setIdType(user.legalInfo?.idType || "dni");
      setIdNumber(user.legalInfo?.idNumber || "");
      setTaxStatus(user.legalInfo?.taxStatus || "freelancer");
      setTaxId(user.legalInfo?.taxId || "");
      setInterests(user.interests || []);
      if (user.notificationPreferences) {
        setNotifPrefs(user.notificationPreferences);
      }
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/auth/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          phone,
          bio,
          address: { street, city, state, postalCode, country },
          bankingInfo: {
            accountHolder,
            bankType,
            bankName,
            accountType,
            // Only send CBU if user entered a new one (22 digits)
            ...(cbu && cbu.length === 22 ? { cbu } : {}),
            alias,
          },
          legalInfo: { idType, idNumber, taxStatus, taxId },
          interests,
          notificationPreferences: notifPrefs,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al actualizar configuración");
      }

      setMessage({ type: "success", text: "Configuración actualizada correctamente" });
      await refreshUser();
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Error al actualizar" });
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (categoryId: string) => {
    setInterests((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Fetch MercadoPago status
  const fetchMpStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      const [statusRes, serviceRes] = await Promise.all([
        fetch("/api/mercadopago/status", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/mercadopago/service-status"),
      ]);

      const statusData = await statusRes.json();
      const serviceData = await serviceRes.json();

      if (statusData.success) {
        setMpStatus(statusData.data);
      }
      if (serviceData.success) {
        setMpServiceAvailable(serviceData.data.oauthAvailable);
      }
    } catch (error) {
      console.error("Error fetching MercadoPago status:", error);
    }
  };

  // Initial fetch of MercadoPago status
  useEffect(() => {
    if (user) {
      fetchMpStatus();
    }
  }, [user?.id]);

  // Link MercadoPago account
  const handleLinkMercadoPago = async () => {
    setMpLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/mercadopago/auth-url?returnUrl=/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success && data.data.authUrl) {
        window.location.href = data.data.authUrl;
      } else {
        setMessage({ type: "error", text: data.message || "Error al obtener URL de autorización" });
        setMpLoading(false);
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Error al conectar con MercadoPago" });
      setMpLoading(false);
    }
  };

  // Unlink MercadoPago account
  const handleUnlinkMercadoPago = async () => {
    if (!confirm("¿Estás seguro de desvincular tu cuenta de MercadoPago? Tus pagos se procesarán manualmente por transferencia bancaria.")) {
      return;
    }

    setMpLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/mercadopago/unlink", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: "Cuenta de MercadoPago desvinculada" });
        setMpStatus({ isLinked: false, prefersPayout: false, email: null, linkedAt: null });
        await refreshUser();
      } else {
        setMessage({ type: "error", text: data.message || "Error al desvincular" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Error al desvincular cuenta" });
    } finally {
      setMpLoading(false);
    }
  };

  // Update payout preference
  const handleUpdatePayoutPreference = async (prefersMercadopago: boolean) => {
    setMpLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/mercadopago/payout-preference", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prefersMercadopago }),
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
        setMpStatus((prev) => prev ? { ...prev, prefersPayout: prefersMercadopago } : prev);
        await refreshUser();
      } else {
        setMessage({ type: "error", text: data.message || "Error al actualizar preferencia" });
      }
    } catch (error: any) {
      setMessage({ type: "error", text: "Error al actualizar preferencia" });
    } finally {
      setMpLoading(false);
    }
  };

  const tabs = [
    { id: "basic", label: "Información Básica", icon: User },
    { id: "address", label: "Dirección", icon: MapPin },
    { id: "banking", label: "Información Bancaria", icon: CreditCard },
    { id: "payments", label: "Cobrar por MercadoPago", icon: Wallet },
    { id: "legal", label: "Información Legal", icon: FileText },
    { id: "interests", label: "Rubros de Interés", icon: Tag },
    { id: "notifications", label: "Notificaciones", icon: Bell },
    { id: "help", label: "Ayuda", icon: HelpCircle },
  ];

  return (
    <>
      <Helmet>
        <title>Configuración de Usuario - Doers</title>
      </Helmet>
      <div className="container mx-auto max-w-6xl py-8 px-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Configuración de Usuario
        </h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl flex items-center gap-2 ${
              message.type === "success"
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Tabs sidebar */}
          <div className="lg:col-span-1">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                      activeTab === tab.id
                        ? "bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 font-medium"
                        : "text-gray-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              {activeTab === "basic" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Información Básica
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      El correo electrónico no puede ser modificado. Si necesitas cambiarlo, contacta a soporte.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Nombre completo
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+54 9 11 1234-5678"
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Biografía
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      maxLength={500}
                      placeholder="Cuéntanos sobre ti..."
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {bio.length}/500 caracteres
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "address" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Dirección
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Calle y número
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Ej: Av. Corrientes 1234"
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Ciudad
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Ej: Buenos Aires"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Provincia/Estado
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder="Ej: CABA"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Código Postal
                      </label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="Ej: C1043"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        País
                      </label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "banking" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Información Bancaria
                  </h2>
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Esta información es confidencial y se utilizará únicamente para procesar pagos.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Titular de la cuenta
                    </label>
                    <input
                      type="text"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      placeholder="Nombre del titular"
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Tipo de cuenta bancaria
                    </label>
                    <select
                      value={bankType}
                      onChange={(e) => setBankType(e.target.value as "mercadopago" | "otro")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="mercadopago">Mercado Pago</option>
                      <option value="otro">Otro banco</option>
                    </select>
                  </div>

                  {/* Payment timing notes based on bank type */}
                  {bankType === "mercadopago" ? (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>Pagos rápidos:</strong> Al usar Mercado Pago, los pagos de los trabajos se acreditarán dentro de las <strong>48 horas</strong> posteriores a la finalización del trabajo.
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>Transferencia bancaria:</strong> Los pagos a cuentas de otros bancos pueden demorar hasta <strong>fin de mes</strong> y podrían incluir <strong>comisiones bancarias extras</strong> según la entidad.
                        </span>
                      </p>
                    </div>
                  )}

                  {bankType === "otro" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        Nombre del banco
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="Ej: Banco Galicia, Santander"
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Tipo de cuenta
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as "savings" | "checking")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="savings">Caja de Ahorro</option>
                      <option value="checking">Cuenta Corriente</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      CBU
                    </label>
                    {cbuMasked && !cbu && (
                      <p className="text-xs text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        CBU guardado: {cbuMasked}
                      </p>
                    )}
                    <input
                      type="text"
                      value={cbu}
                      onChange={(e) => {
                        // Only allow numbers
                        const value = e.target.value.replace(/\D/g, '');
                        setCbu(value);
                      }}
                      placeholder={cbuMasked ? "Ingresa nuevo CBU para cambiar" : "22 dígitos"}
                      maxLength={22}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                    {cbu && cbu.length !== 22 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        El CBU debe tener 22 dígitos ({cbu.length}/22)
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Alias (opcional)
                    </label>
                    <input
                      type="text"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      placeholder="tu.alias.bancario"
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              )}

              {activeTab === "payments" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Cobros Automáticos por MercadoPago
                  </h2>

                  <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
                    <p className="text-sm text-sky-800 dark:text-sky-300">
                      <strong>¿Cómo funciona?</strong> Al vincular tu cuenta de MercadoPago, cuando completes un trabajo y ambas partes confirmen,
                      recibirás el pago automáticamente en tu cuenta de MercadoPago. Si no vinculas tu cuenta,
                      los pagos se realizarán manualmente por transferencia bancaria.
                    </p>
                  </div>

                  {/* Service availability check */}
                  {!mpServiceAvailable && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        El servicio de vinculación con MercadoPago no está disponible en este momento. Contacta a soporte si el problema persiste.
                      </p>
                    </div>
                  )}

                  {/* MercadoPago Link Status */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-full ${mpStatus?.isLinked ? "bg-green-100 dark:bg-green-900/30" : "bg-slate-200 dark:bg-slate-600"}`}>
                          <Wallet className={`h-6 w-6 ${mpStatus?.isLinked ? "text-green-600 dark:text-green-400" : "text-slate-500 dark:text-slate-400"}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            Cuenta de MercadoPago
                          </h3>
                          {mpStatus?.isLinked ? (
                            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" />
                              Vinculada: {mpStatus.email}
                            </p>
                          ) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              No vinculada
                            </p>
                          )}
                        </div>
                      </div>

                      {mpStatus?.isLinked ? (
                        <button
                          onClick={handleUnlinkMercadoPago}
                          disabled={mpLoading}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {mpLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Unlink className="h-4 w-4" />
                          )}
                          Desvincular
                        </button>
                      ) : (
                        <button
                          onClick={handleLinkMercadoPago}
                          disabled={mpLoading || !mpServiceAvailable}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {mpLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                          Vincular MercadoPago
                        </button>
                      )}
                    </div>

                    {mpStatus?.linkedAt && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Vinculada el {new Date(mpStatus.linkedAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>

                  {/* Payout Preference */}
                  {mpStatus?.isLinked && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Preferencia de pago
                      </h3>

                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* MercadoPago Auto option */}
                        <button
                          onClick={() => handleUpdatePayoutPreference(true)}
                          disabled={mpLoading || mpStatus.prefersPayout}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            mpStatus.prefersPayout
                              ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                          } disabled:cursor-not-allowed`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-full ${mpStatus.prefersPayout ? "bg-sky-100 dark:bg-sky-900/30" : "bg-slate-100 dark:bg-slate-700"}`}>
                              <Wallet className={`h-5 w-5 ${mpStatus.prefersPayout ? "text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"}`} />
                            </div>
                            <span className={`font-medium ${mpStatus.prefersPayout ? "text-sky-700 dark:text-sky-300" : "text-gray-900 dark:text-white"}`}>
                              Pago Automático
                            </span>
                            {mpStatus.prefersPayout && (
                              <CheckCircle2 className="h-5 w-5 text-sky-500 ml-auto" />
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 ml-11">
                            Recibe el pago directamente en tu cuenta de MercadoPago al confirmar el trabajo
                          </p>
                          <div className="mt-2 ml-11 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Pago instantáneo
                          </div>
                        </button>

                        {/* Bank Transfer Manual option */}
                        <button
                          onClick={() => handleUpdatePayoutPreference(false)}
                          disabled={mpLoading || !mpStatus.prefersPayout}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            !mpStatus.prefersPayout
                              ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                          } disabled:cursor-not-allowed`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-full ${!mpStatus.prefersPayout ? "bg-sky-100 dark:bg-sky-900/30" : "bg-slate-100 dark:bg-slate-700"}`}>
                              <CreditCard className={`h-5 w-5 ${!mpStatus.prefersPayout ? "text-sky-600 dark:text-sky-400" : "text-slate-500 dark:text-slate-400"}`} />
                            </div>
                            <span className={`font-medium ${!mpStatus.prefersPayout ? "text-sky-700 dark:text-sky-300" : "text-gray-900 dark:text-white"}`}>
                              Transferencia Bancaria
                            </span>
                            {!mpStatus.prefersPayout && (
                              <CheckCircle2 className="h-5 w-5 text-sky-500 ml-auto" />
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 ml-11">
                            Recibe el pago por transferencia a tu cuenta bancaria
                          </p>
                          <div className="mt-2 ml-11 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertCircle className="h-3 w-3" />
                            Puede demorar hasta fin de mes
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Help section */}
                  <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      ¿Por qué vincular MercadoPago?
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Pagos instantáneos:</strong> Recibe tu dinero al momento de confirmar el trabajo</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Sin demoras:</strong> No tienes que esperar transferencias bancarias</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Seguro:</strong> MercadoPago protege tus datos y transacciones</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Flexible:</strong> Puedes cambiar tu preferencia en cualquier momento</span>
                      </li>
                    </ul>
                    <a
                      href="https://www.mercadopago.com.ar/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-sm text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      Más información sobre MercadoPago
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {activeTab === "legal" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Información Legal y Fiscal
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Tipo de documento
                    </label>
                    <select
                      value={idType}
                      onChange={(e) => setIdType(e.target.value as "dni" | "passport" | "cuit" | "cuil")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="dni">DNI</option>
                      <option value="passport">Pasaporte</option>
                      <option value="cuit">CUIT</option>
                      <option value="cuil">CUIL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Número de documento
                    </label>
                    <input
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="Sin puntos ni guiones"
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Situación fiscal
                    </label>
                    <select
                      value={taxStatus}
                      onChange={(e) => setTaxStatus(e.target.value as typeof taxStatus)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="freelancer">Freelancer</option>
                      <option value="autonomo">Autónomo</option>
                      <option value="monotributo">Monotributo</option>
                      <option value="responsable_inscripto">Responsable Inscripto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      CUIT/CUIL
                    </label>
                    <input
                      type="text"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="XX-XXXXXXXX-X"
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              )}

              {activeTab === "interests" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Rubros de Interés
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    Selecciona los rubros en los que estás interesado para recibir notificaciones de trabajos relevantes.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {JOB_CATEGORIES.map((category) => (
                      <button
                        key={category.id}
                        onClick={() => toggleInterest(category.id)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          interests.includes(category.id)
                            ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        <div className="text-3xl mb-2">{category.icon}</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {category.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Preferencias de Notificación
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Email</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Recibir notificaciones por email
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.email}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, email: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Push</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Notificaciones push en el navegador
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.push}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, push: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">SMS</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Recibir notificaciones por SMS
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.sms}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, sms: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Nuevos mensajes</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Notificar cuando recibas mensajes
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.newMessage}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, newMessage: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Actualizaciones de trabajos</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Notificar cambios en trabajos
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.jobUpdate}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, jobUpdate: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Actualizaciones de contratos</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Notificar cambios en contratos
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.contractUpdate}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, contractUpdate: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Actualizaciones de pagos</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Notificar transacciones y pagos
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.paymentUpdate}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, paymentUpdate: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Marketing</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Recibir ofertas y novedades
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.marketing}
                        onChange={(e) => setNotifPrefs({ ...notifPrefs, marketing: e.target.checked })}
                        className="h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "help" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Ayuda
                  </h2>
                  <div className="space-y-4">
                    {/* Tutorial restart */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <PlayCircle className="h-5 w-5 text-sky-500" />
                            Tutorial de la plataforma
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            Vuelve a ver el tutorial interactivo que te guía por las funciones principales de DOAPP.
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            startOnboarding();
                            navigate('/');
                          }}
                          className="flex-shrink-0 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Ver tutorial
                        </button>
                      </div>
                    </div>

                    {/* Support ticket */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <MessageCircle className="h-5 w-5 text-green-500" />
                            Contactar soporte
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            ¿Tienes algún problema o pregunta? Crea un ticket de soporte y te ayudaremos.
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/tickets/new')}
                          className="flex-shrink-0 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Crear ticket
                        </button>
                      </div>
                    </div>

                    {/* Help center link */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <HelpCircle className="h-5 w-5 text-amber-500" />
                            Centro de ayuda
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            Encuentra respuestas a preguntas frecuentes y guías de uso.
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/help')}
                          className="flex-shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Ver ayuda
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save button - only show for tabs that need saving */}
              {activeTab !== "help" && activeTab !== "payments" && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-white font-semibold shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Save className="h-5 w-5" />
                    {loading ? "Guardando..." : "Guardar Cambios"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
