import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Building2, Copy, Check } from 'lucide-react';

export type PaymentMethod = 'mercadopago' | 'binance' | 'bank_transfer';

export interface BinancePaymentData {
  transactionId: string;
  senderUserId: string;
}

export interface BankTransferPaymentData {
  isOwnBankAccount: boolean;
  thirdPartyAccountHolder: string;
  senderBankName: string;
}

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  amount: number;
  currency?: string;
  onBinanceDataChange?: (data: BinancePaymentData) => void;
  onBankTransferDataChange?: (data: BankTransferPaymentData) => void;
}

/* ── Brand logos ─────────────────────────────── */

function MercadoPagoLogo() {
  return (
    <svg viewBox="0 0 48 20" className="h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 0C16.27 0 9.6 4.48 9.6 10S16.27 20 24 20s14.4-4.48 14.4-10S31.73 0 24 0z" fill="#00B1EA"/>
      <path d="M24 3.5c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5 6.5-2.91 6.5-6.5-2.91-6.5-6.5-6.5z" fill="#fff"/>
      <path d="M24 6c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" fill="#00B1EA"/>
    </svg>
  );
}

function BinanceLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#F3BA2F" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0L7.33 4.67 9.5 6.83 12 4.33l2.5 2.5 2.17-2.16L12 0zm4.67 7.33L14.5 9.5l2.17 2.17L14.5 13.83l2.17 2.17L21.33 12 16.67 7.33zM7.33 7.33L2.67 12l4.66 4.67 2.17-2.17L7.33 12.33l2.17-2.17-2.17-2.83zm7.34 7.34L12 17.17l-2.67-2.5-2.17 2.16L12 22l4.84-5-2.17-2.33z"/>
    </svg>
  );
}

function BankIcon() {
  return <Building2 className="h-5 w-5 text-slate-600 dark:text-slate-300" />;
}

/* ── Credit card flip display ─────────────────── */

function CardDisplay({ cardHolder, cardNumber, expiry }: { cardHolder: string; cardNumber: string; expiry: string }) {
  const fmt = (n: string) => {
    const digits = n.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim() || '0000 0000 0000 0000';
  };
  const fmtExpiry = (e: string) => e || 'MM/YY';

  return (
    <div className="relative h-40 w-full rounded-2xl overflow-hidden select-none"
      style={{ background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 60%, #1d4ed8 100%)' }}>
      {/* Glare */}
      <div className="absolute inset-0 opacity-20"
        style={{ background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.6), transparent 60%)' }} />
      {/* Chip */}
      <div className="absolute top-5 left-5 h-8 w-11 rounded-md bg-amber-300/80"
        style={{ boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.4)' }} />
      {/* Logo */}
      <div className="absolute top-5 right-5 flex items-center gap-1">
        <div className="h-6 w-6 rounded-full bg-red-500 opacity-90" />
        <div className="-ml-3 h-6 w-6 rounded-full bg-orange-400 opacity-80" />
      </div>
      {/* Number */}
      <div className="absolute bottom-14 left-5 font-mono text-base tracking-widest text-white/90 font-semibold">
        {fmt(cardNumber)}
      </div>
      {/* Bottom row */}
      <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
        <div>
          <p className="text-white/50 text-[9px] uppercase tracking-widest mb-0.5">Card Holder</p>
          <p className="text-white font-semibold text-sm tracking-wide truncate max-w-[160px]">
            {cardHolder || 'NOMBRE APELLIDO'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white/50 text-[9px] uppercase tracking-widest mb-0.5">Expires</p>
          <p className="text-white font-semibold text-sm">{fmtExpiry(expiry)}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Copy button ─────────────────────────────── */

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ── Main component ──────────────────────────── */

export default function PaymentMethodSelector({
  selectedMethod,
  onMethodChange,
  amount,
  currency = 'ARS',
  onBinanceDataChange,
  onBankTransferDataChange,
}: PaymentMethodSelectorProps) {
  const { t } = useTranslation();

  // Card form state (MercadoPago visual)
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  // Binance state
  const [usdtAmount, setUsdtAmount] = useState<number | null>(null);
  const [usdtRate, setUsdtRate] = useState<number | null>(null);
  const [binanceInfo, setBinanceInfo] = useState<{ binanceId: string | null; binanceNickname: string | null }>({ binanceId: null, binanceNickname: null });
  const [loadingConversion, setLoadingConversion] = useState(false);
  const [binanceTransactionId, setBinanceTransactionId] = useState('');
  const [binanceSenderUserId, setBinanceSenderUserId] = useState('');

  // Bank transfer state
  const [isOwnBankAccount, setIsOwnBankAccount] = useState(true);
  const [thirdPartyAccountHolder, setThirdPartyAccountHolder] = useState('');
  const [senderBankName, setSenderBankName] = useState('');

  useEffect(() => {
    if (selectedMethod === 'binance' && onBinanceDataChange) {
      onBinanceDataChange({ transactionId: binanceTransactionId, senderUserId: binanceSenderUserId });
    }
  }, [binanceTransactionId, binanceSenderUserId, selectedMethod, onBinanceDataChange]);

  useEffect(() => {
    if (selectedMethod === 'bank_transfer' && onBankTransferDataChange) {
      onBankTransferDataChange({ isOwnBankAccount, thirdPartyAccountHolder, senderBankName });
    }
  }, [isOwnBankAccount, thirdPartyAccountHolder, senderBankName, selectedMethod, onBankTransferDataChange]);

  useEffect(() => {
    if (selectedMethod !== 'binance' || currency !== 'ARS') return;
    let cancelled = false;
    setLoadingConversion(true);
    fetch(`/api/payments/conversion/usdt?amount=${amount}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success) {
          setUsdtAmount(data.conversion.amountUSDT);
          setUsdtRate(data.conversion.rate);
          setBinanceInfo(data.binanceInfo);
        }
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoadingConversion(false); });
    return () => { cancelled = true; };
  }, [selectedMethod, amount, currency]);

  const fmtCardNum = (v: string) =>
    v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const fmtExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const methods: { id: PaymentMethod; label: string; sub: string; logo: React.ReactNode }[] = [
    {
      id: 'mercadopago',
      label: 'MercadoPago',
      sub: t('payments.mercadopagoBadge', 'Recomendado AR'),
      logo: (
        <span className="font-black text-[#00B1EA] text-base tracking-tight leading-none">
          MP
        </span>
      ),
    },
    {
      id: 'binance',
      label: 'Binance Pay',
      sub: 'Crypto',
      logo: <BinanceLogo />,
    },
    {
      id: 'bank_transfer',
      label: t('payments.bankTransfer', 'Transferencia'),
      sub: '24-48hs',
      logo: <BankIcon />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Method picker ──────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {methods.map((m) => {
          const active = selectedMethod === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMethodChange(m.id)}
              className={`
                relative flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-4 transition-all duration-200
                ${active
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 shadow-md shadow-sky-500/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5'}
              `}
            >
              {/* Selected dot */}
              {active && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-sky-500" />
              )}
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
                {m.logo}
              </div>
              <span className={`text-xs font-semibold text-center leading-tight ${active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300'}`}>
                {m.label}
              </span>
              <span className={`text-[10px] ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {m.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Divider ────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
          {selectedMethod === 'mercadopago'
            ? 'o pagar con tarjeta de crédito'
            : selectedMethod === 'binance'
            ? 'Transferencia de criptomonedas'
            : 'Transferencia bancaria'}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* ── MercadoPago: card preview form ─────── */}
      {selectedMethod === 'mercadopago' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Virtual card */}
          <CardDisplay cardHolder={cardHolder} cardNumber={cardNumber} expiry={expiry} />

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Nombre del titular
              </label>
              <input
                type="text"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                placeholder="Nombre completo"
                className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Número de tarjeta
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(fmtCardNum(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-4 pr-10 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-sans focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
                />
                <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Vencimiento
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={expiry}
                  onChange={(e) => setExpiry(fmtExpiry(e.target.value))}
                  placeholder="MM/AA"
                  maxLength={5}
                  className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-sans focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  CVV
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="• • •"
                  maxLength={4}
                  className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-sans focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
                />
              </div>
            </div>
          </div>

          {/* MP info banner */}
          <div className="flex items-start gap-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-3">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#00B1EA]">
              <span className="text-[11px] font-black text-white leading-none">MP</span>
            </div>
            <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
              <span className="font-semibold">Serás redirigido a MercadoPago</span> para completar el pago de forma segura. Aceptamos tarjetas de crédito/débito, transferencia bancaria y efectivo (Rapipago, Pago Fácil).
            </p>
          </div>
        </div>
      )}

      {/* ── Binance ────────────────────────────── */}
      {selectedMethod === 'binance' && (
        <div className="space-y-4 animate-fadeIn">
          {loadingConversion ? (
            <div className="flex items-center justify-center gap-3 py-8 text-slate-500 dark:text-slate-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <span className="text-sm">Calculando conversión...</span>
            </div>
          ) : (
            <>
              {/* Conversion card */}
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Monto en ARS</span>
                  <span className="text-lg font-bold text-amber-900 dark:text-amber-100">
                    ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="h-px bg-amber-200 dark:bg-amber-700 mb-3" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Equivalente USDT</span>
                  <span className="text-xl font-bold text-green-600 dark:text-green-400">
                    {usdtAmount?.toFixed(2) || '0.00'} USDT
                  </span>
                </div>
                {usdtRate && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Tasa: 1 USDT = ${usdtRate.toLocaleString('es-AR')} ARS
                  </p>
                )}
              </div>

              {/* Binance ID & Nickname */}
              {(binanceInfo.binanceId || binanceInfo.binanceNickname) && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Datos para transferir:</p>
                  {binanceInfo.binanceId && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 w-24 flex-shrink-0">Binance ID</span>
                      <code className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-mono text-slate-800 dark:text-slate-200 truncate">
                        {binanceInfo.binanceId}
                      </code>
                      <CopyBtn value={binanceInfo.binanceId} />
                    </div>
                  )}
                  {binanceInfo.binanceNickname && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 w-24 flex-shrink-0">Nickname</span>
                      <code className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-mono text-slate-800 dark:text-slate-200 truncate">
                        @{binanceInfo.binanceNickname}
                      </code>
                      <CopyBtn value={binanceInfo.binanceNickname} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-24 flex-shrink-0">Monto</span>
                    <code className="flex-1 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-1.5 text-sm font-mono font-bold text-green-800 dark:text-green-300">
                      {usdtAmount?.toFixed(2) || '0.00'} USDT
                    </code>
                    <CopyBtn value={usdtAmount?.toFixed(2) || '0.00'} />
                  </div>
                </div>
              )}

              {/* Binance fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Tu Binance ID / Nickname <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={binanceSenderUserId}
                    onChange={(e) => setBinanceSenderUserId(e.target.value)}
                    placeholder="Ej: 123456789 o @tunombre"
                    className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Transaction ID / Hash <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={binanceTransactionId}
                    onChange={(e) => setBinanceTransactionId(e.target.value)}
                    placeholder="0x1234abcd... o TxID de Binance"
                    className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm font-mono text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-sans focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 transition-all"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Bank Transfer ──────────────────────── */}
      {selectedMethod === 'bank_transfer' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Account info */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <Building2 className="h-5 w-5 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Datos para Transferencia</span>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              {[
                { label: 'Titular', value: 'DOAPP S.R.L.' },
                { label: 'CUIT', value: '30-12345678-9' },
                { label: 'Banco', value: 'Banco Galicia' },
                { label: 'Alias', value: 'DOAPP.PAGOS' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 w-16 flex-shrink-0">{label}</span>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{value}</span>
                    <CopyBtn value={value} />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 w-16 flex-shrink-0">CBU</span>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <code className="font-mono text-xs text-slate-700 dark:text-slate-300">0070099920000123...</code>
                  <CopyBtn value="00700999200001234567" />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Monto a transferir</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                </span>
              </div>
            </div>
          </div>

          {/* Bank name field */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Banco emisor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={senderBankName}
              onChange={(e) => setSenderBankName(e.target.value)}
              placeholder="Ej: Banco Galicia, Santander, BBVA..."
              className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
            />
          </div>

          {/* Own account toggle */}
          <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
            <input
              type="checkbox"
              checked={isOwnBankAccount}
              onChange={(e) => setIsOwnBankAccount(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              La cuenta bancaria está a mi nombre
            </span>
          </label>

          {!isOwnBankAccount && (
            <div className="animate-fadeIn">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Titular de la cuenta <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={thirdPartyAccountHolder}
                onChange={(e) => setThirdPartyAccountHolder(e.target.value)}
                placeholder="Nombre completo del titular"
                className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
              />
            </div>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500">
            ⏱ Verificación en 24-48hs hábiles. El trabajo se publicará una vez aprobado el pago.
          </p>
        </div>
      )}
    </div>
  );
}
