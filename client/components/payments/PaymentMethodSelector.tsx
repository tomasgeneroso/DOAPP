import React, { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Building2, Copy, Check } from 'lucide-react';

export type PaymentMethod = 'mercadopago' | 'astropay' | 'binance' | 'bank_transfer';

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

function AstroPayLogo() {
  return (
    <span className="font-black text-[#16d39a] text-base tracking-tight leading-none">
      AP
    </span>
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
      id: 'astropay',
      label: 'AstroPay',
      sub: t('payments.astropayBadge', 'Tarjeta / local'),
      logo: <AstroPayLogo />,
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
    <div className="space-y-3">
      {/* ── Method picker ──────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {methods.map((m) => {
          const active = selectedMethod === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onMethodChange(m.id)}
              className={`
                relative flex flex-col items-center gap-1 rounded-lg border-2 px-1.5 py-3 transition-all duration-200
                ${active
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 shadow-md shadow-sky-500/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:-translate-y-0.5'}
              `}
            >
              {/* Selected dot */}
              {active && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sky-500" />
              )}
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700">
                {m.logo}
              </div>
              <span className={`text-[11px] font-semibold text-center leading-tight ${active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300'}`}>
                {m.label}
              </span>
              <span className={`text-[9px] ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'}`}>
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
            ? t('payments.dividerMercadopago', 'Pago seguro con MercadoPago')
            : selectedMethod === 'astropay'
            ? t('payments.dividerAstropay', 'Tarjeta, débito o métodos locales')
            : selectedMethod === 'binance'
            ? t('payments.dividerBinance', 'Transferencia de criptomonedas')
            : t('payments.dividerBank', 'Transferencia bancaria')}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* ── MercadoPago: redirect notice (no card form — el pago se completa en MercadoPago) ─────── */}
      {selectedMethod === 'mercadopago' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-start gap-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-4">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#00B1EA]">
              <span className="text-[10px] font-black text-white leading-none">MP</span>
            </div>
            <p className="text-sm text-sky-800 dark:text-sky-300 leading-snug">
              <Trans i18nKey="payments.mpRedirectNotice" components={{ b: <span className="font-semibold" /> }} defaults="<b>Serás redirigido a MercadoPago</b> para completar el pago de forma segura. Aceptás tarjetas de crédito/débito, transferencia bancaria y efectivo — no ingresás los datos de la tarjeta acá." />
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
              <span className="text-sm">{t('payments.calculatingConversion', 'Calculando conversión...')}</span>
            </div>
          ) : (
            <>
              {/* Conversion card */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('payments.amountArs', 'Monto en ARS')}</span>
                  <span className="text-base font-bold text-amber-900 dark:text-amber-100">
                    ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="h-px bg-amber-200 dark:bg-amber-700 mb-2" />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('payments.usdtEquivalent', 'Equivalente USDT')}</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {usdtAmount?.toFixed(2) || '0.00'} USDT
                  </span>
                </div>
                {usdtRate && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
                    {t('payments.usdtRate', 'Tasa: 1 USDT = ${{rate}} ARS', { rate: usdtRate.toLocaleString('es-AR') })}
                  </p>
                )}
              </div>

              {/* Binance ID & Nickname */}
              {(binanceInfo.binanceId || binanceInfo.binanceNickname) && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('payments.transferData', 'Datos para transferir:')}</p>
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
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-24 flex-shrink-0">{t('payments.amount', 'Monto')}</span>
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
                    {t('payments.yourBinanceId', 'Tu Binance ID / Nickname')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={binanceSenderUserId}
                    onChange={(e) => setBinanceSenderUserId(e.target.value)}
                    placeholder={t('payments.binanceIdPlaceholder', 'Ej: 123456789 o @tunombre')}
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
                    placeholder={t('payments.txIdPlaceholder', '0x1234abcd... o TxID de Binance')}
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
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('payments.transferDetails', 'Datos para Transferencia')}</span>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              {[
                { label: t('payments.holder', 'Titular'), value: 'DOAPP S.R.L.' },
                { label: 'CUIT', value: '30-12345678-9' },
                { label: t('payments.bank', 'Banco'), value: 'Banco Galicia' },
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
                <span className="text-slate-500 dark:text-slate-400">{t('payments.amountToTransfer', 'Monto a transferir')}</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
                </span>
              </div>
            </div>
          </div>

          {/* Bank name field */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {t('payments.issuingBank', 'Banco emisor')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={senderBankName}
              onChange={(e) => setSenderBankName(e.target.value)}
              placeholder={t('payments.issuingBankPlaceholder', 'Ej: Banco Galicia, Santander, BBVA...')}
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
              {t('payments.ownAccount', 'La cuenta bancaria está a mi nombre')}
            </span>
          </label>

          {!isOwnBankAccount && (
            <div className="animate-fadeIn">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                {t('payments.accountHolder', 'Titular de la cuenta')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={thirdPartyAccountHolder}
                onChange={(e) => setThirdPartyAccountHolder(e.target.value)}
                placeholder={t('payments.accountHolderPlaceholder', 'Nombre completo del titular')}
                className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-800 transition-all"
              />
            </div>
          )}

          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t('payments.verificationNotice', '⏱ Verificación en 24-48hs hábiles. El trabajo se publicará una vez aprobado el pago.')}
          </p>
        </div>
      )}
    </div>
  );
}
