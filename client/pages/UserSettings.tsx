import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
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
} from "lucide-react";
import { JOB_CATEGORIES } from "../../shared/constants/categories";
import { useOnboarding } from "../hooks/useOnboarding";

type TabType = "basic" | "address" | "banking" | "legal" | "interests" | "notifications" | "help";

const API_URL = import.meta.env.VITE_API_URL || '/api';

function PasswordSection() {
  const { t } = useTranslation();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [isOAuth, setIsOAuth] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/auth/has-password`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setHasPassword(data.hasPassword);
          setIsOAuth(data.isOAuth);
        }
      } catch { /* ignore */ }
    };
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (newPassword.length < 6) {
      setMsg({ type: 'error', text: t('auth.passwordMinLength') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: t('settings.password.mismatch', 'Passwords do not match') });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint = hasPassword ? '/auth/change-password' : '/auth/set-password';
      const body = hasPassword
        ? { currentPassword, newPassword }
        : { newPassword };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        setMsg({ type: 'success', text: data.message });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true);
      } else {
        setMsg({ type: 'error', text: data.message || 'Error' });
      }
    } catch {
      setMsg({ type: 'error', text: t('auth.connectionError') });
    } finally {
      setLoading(false);
    }
  };

  if (hasPassword === null) return null;

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {hasPassword
          ? t('settings.password.change', 'Change password')
          : t('settings.password.set', 'Set password')}
      </h3>
      {!hasPassword && isOAuth && (
        <div className="mb-4 p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
          <p className="text-sm text-sky-800 dark:text-sky-300">
            {t('settings.password.oauthHint', 'You signed up with Google. Set a password to also log in with email and password.')}
          </p>
        </div>
      )}
      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
          {msg.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {hasPassword && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              {t('settings.password.current', 'Current password')}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            {t('settings.password.new', 'New password')}
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            {t('settings.password.confirm', 'Confirm new password')}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? t('common.loading') : hasPassword ? t('settings.password.changeBtn', 'Change password') : t('settings.password.setBtn', 'Set password')}
        </button>
      </form>
    </div>
  );
}

export default function UserSettings() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { startOnboarding } = useOnboarding();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Handle tab from URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["basic", "address", "banking", "legal", "interests", "notifications", "help"].includes(tabParam)) {
      setActiveTab(tabParam as TabType);
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

  const tabs = [
    { id: "basic", label: t('settings.tabs.basic'), icon: User },
    { id: "address", label: t('settings.tabs.address'), icon: MapPin },
    { id: "banking", label: t('settings.tabs.banking'), icon: CreditCard },
    { id: "legal", label: t('settings.tabs.legal'), icon: FileText },
    { id: "interests", label: t('settings.tabs.interests'), icon: Tag },
    { id: "notifications", label: t('settings.tabs.notifications'), icon: Bell },
    { id: "help", label: t('settings.tabs.help'), icon: HelpCircle },
  ];

  return (
    <>
      <Helmet>
        <title>{t('settings.pageTitle')} - DoApp</title>
      </Helmet>
      <div className="container mx-auto max-w-6xl py-8 px-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          {t('settings.pageTitle')}
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
                    {t('settings.tabs.basic')}
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.basic.email')}
                    </label>
                    <input
                      type="email"
                      value={user?.email || ""}
                      disabled
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {t('settings.basic.emailHint')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.basic.fullName')}
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
                      {t('settings.basic.phone')}
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
                      {t('settings.basic.bio')}
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      maxLength={500}
                      placeholder={t('settings.basic.bioPlaceholder')}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {bio.length}/500 {t('settings.basic.bioChars')}
                    </p>
                  </div>

                  {/* Password Section */}
                  <PasswordSection />
                </div>
              )}

              {activeTab === "address" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t('settings.tabs.address')}
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.address.street')}
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder={t('settings.address.streetPlaceholder')}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        {t('settings.address.city')}
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder={t('settings.address.cityPlaceholder')}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        {t('settings.address.state')}
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        placeholder={t('settings.address.statePlaceholder')}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        {t('settings.address.postalCode')}
                      </label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder={t('settings.address.postalCodePlaceholder')}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        {t('settings.address.country')}
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
                    {t('settings.tabs.banking')}
                  </h2>
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {t('settings.banking.confidentialNote')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.banking.accountHolder')}
                    </label>
                    <input
                      type="text"
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      placeholder={t('settings.banking.accountHolderPlaceholder')}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.banking.bankType')}
                    </label>
                    <select
                      value={bankType}
                      onChange={(e) => setBankType(e.target.value as "mercadopago" | "otro")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="mercadopago">Mercado Pago</option>
                      <option value="otro">{t('settings.banking.otherBank')}</option>
                    </select>
                  </div>

                  {/* Payment timing notes based on bank type */}
                  {bankType === "mercadopago" ? (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-300 flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>{t('settings.banking.fastPayments')}:</strong> {t('settings.banking.mercadopagoNote')}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                          <strong>{t('settings.banking.bankTransfer')}:</strong> {t('settings.banking.bankTransferNote')}
                        </span>
                      </p>
                    </div>
                  )}

                  {bankType === "otro" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        {t('settings.banking.bankName')}
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder={t('settings.banking.bankNamePlaceholder')}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.banking.accountType')}
                    </label>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value as "savings" | "checking")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="savings">{t('settings.banking.savings')}</option>
                      <option value="checking">{t('settings.banking.checking')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.banking.cbu')}
                    </label>
                    {cbuMasked && !cbu && (
                      <p className="text-xs text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('settings.banking.cbuSaved')}: {cbuMasked}
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
                      placeholder={cbuMasked ? t('settings.banking.cbuChangePlaceholder') : t('settings.banking.cbuPlaceholder')}
                      maxLength={22}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                    {cbu && cbu.length !== 22 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {t('settings.banking.cbuError')} ({cbu.length}/22)
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.banking.alias')}
                    </label>
                    <input
                      type="text"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      placeholder={t('settings.banking.aliasPlaceholder')}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              )}

              {activeTab === "legal" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {t('settings.legal.title')}
                  </h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.legal.idType')}
                    </label>
                    <select
                      value={idType}
                      onChange={(e) => setIdType(e.target.value as "dni" | "passport" | "cuit" | "cuil")}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="dni">{t('settings.legal.idTypeDni')}</option>
                      <option value="passport">{t('settings.legal.idTypePassport')}</option>
                      <option value="cuit">{t('settings.legal.idTypeCuit')}</option>
                      <option value="cuil">{t('settings.legal.idTypeCuil')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.legal.idNumber')}
                    </label>
                    <input
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder={t('settings.legal.idNumberPlaceholder')}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.legal.taxStatus')}
                    </label>
                    <select
                      value={taxStatus}
                      onChange={(e) => setTaxStatus(e.target.value as typeof taxStatus)}
                      className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="freelancer">{t('settings.legal.freelancer')}</option>
                      <option value="autonomo">{t('settings.legal.autonomo')}</option>
                      <option value="monotributo">{t('settings.legal.monotributo')}</option>
                      <option value="responsable_inscripto">{t('settings.legal.responsableInscripto')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      {t('settings.banking.taxId')}
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
                    {t('settings.tabs.interests')}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400">
                    {t('settings.interests.description')}
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
                    {t('settings.notifications.title')}
                  </h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.email')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.emailDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.push')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.pushDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.sms')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.smsDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.newMessages')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.newMessagesDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.jobUpdates')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.jobUpdatesDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.contractUpdates')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.contractUpdatesDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.paymentUpdates')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.paymentUpdatesDesc')}
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
                        <p className="font-medium text-gray-900 dark:text-white">{t('settings.notifications.marketing')}</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {t('settings.notifications.marketingDesc')}
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
                    {t('settings.help.title')}
                  </h2>
                  <div className="space-y-4">
                    {/* Tutorial restart */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <PlayCircle className="h-5 w-5 text-sky-500" />
                            {t('settings.help.tutorial')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            {t('settings.help.tutorialDesc')}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            startOnboarding();
                            navigate('/');
                          }}
                          className="flex-shrink-0 px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          {t('settings.help.seeTutorial')}
                        </button>
                      </div>
                    </div>

                    {/* Support ticket */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <MessageCircle className="h-5 w-5 text-green-500" />
                            {t('settings.help.contactSupport')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            {t('settings.help.contactSupportDesc')}
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/tickets/new')}
                          className="flex-shrink-0 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          {t('settings.help.createTicket')}
                        </button>
                      </div>
                    </div>

                    {/* Help center link */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <HelpCircle className="h-5 w-5 text-amber-500" />
                            {t('settings.help.helpCenter')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                            {t('settings.help.helpCenterDesc')}
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/help')}
                          className="flex-shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          {t('settings.help.seeHelp')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* FAQ */}
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      {t('settings.help.faqTitle')}
                    </h3>
                    <div className="space-y-3">
                      {[
                        {
                          q: t('settings.faq.howItWorks'),
                          a: t('settings.faq.howItWorksAnswer'),
                        },
                        {
                          q: t('settings.faq.moneyProtection'),
                          a: t('settings.faq.moneyProtectionAnswer'),
                        },
                        {
                          q: t('settings.faq.commissions'),
                          a: t('settings.faq.commissionsAnswer'),
                        },
                        {
                          q: t('settings.faq.howToPublish'),
                          a: t('settings.faq.howToPublishAnswer'),
                        },
                        {
                          q: t('settings.faq.howToApply'),
                          a: t('settings.faq.howToApplyAnswer'),
                        },
                        {
                          q: t('settings.faq.howToGetPaid'),
                          a: t('settings.faq.howToGetPaidAnswer'),
                        },
                        {
                          q: t('settings.faq.problemWithJob'),
                          a: t('settings.faq.problemWithJobAnswer'),
                        },
                        {
                          q: t('settings.faq.confirmationSystem'),
                          a: t('settings.faq.confirmationSystemAnswer'),
                        },
                      ].map((faq, i) => (
                        <details
                          key={i}
                          className="group bg-slate-50 dark:bg-slate-700/50 rounded-lg overflow-hidden"
                        >
                          <summary className="flex items-center justify-between cursor-pointer p-4 text-sm font-medium text-gray-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                            {faq.q}
                            <svg className="h-4 w-4 text-gray-500 group-open:rotate-180 transition-transform flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div className="px-4 pb-4">
                            <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
                              {faq.a}
                            </p>
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Save button - only show for tabs that need saving */}
              {activeTab !== "help" && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-white font-semibold shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Save className="h-5 w-5" />
                    {loading ? t('common.saving') : t('common.save')}
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
