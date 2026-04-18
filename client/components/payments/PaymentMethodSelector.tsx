import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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

interface PaymentMethodOption {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: string;
  badge?: string;
  processing_time: string;
}

interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  amount: number;
  currency?: string;
  onBinanceDataChange?: (data: BinancePaymentData) => void;
  onBankTransferDataChange?: (data: BankTransferPaymentData) => void;
}


export default function PaymentMethodSelector({
  selectedMethod,
  onMethodChange,
  amount,
  currency = 'ARS',
  onBinanceDataChange,
  onBankTransferDataChange,
}: PaymentMethodSelectorProps) {
  const { t } = useTranslation();

  const PAYMENT_METHODS: PaymentMethodOption[] = [
    {
      id: 'mercadopago',
      name: 'MercadoPago',
      description: t('payments.mercadopagoDesc', 'Credit/debit card, bank transfer, cash'),
      icon: '💳',
      badge: t('payments.mercadopagoBadge', 'Recommended AR'),
      processing_time: t('payments.immediate', 'Immediate'),
    },
    {
      id: 'binance',
      name: 'Binance Pay',
      description: t('payments.binanceDesc', 'Pay with crypto (USDT, BTC, ETH, BNB)'),
      icon: '💰',
      badge: t('payments.cryptoBadge', 'Crypto'),
      processing_time: '5-15 min',
    },
    {
      id: 'bank_transfer',
      name: t('payments.bankTransfer', 'Bank Transfer'),
      description: t('payments.bankTransferDesc', 'Direct transfer from your bank'),
      icon: '🏦',
      processing_time: '24-48hs',
    },
  ];

  const [usdtAmount, setUsdtAmount] = useState<number | null>(null);
  const [usdtRate, setUsdtRate] = useState<number | null>(null);
  const [binanceInfo, setBinanceInfo] = useState<{ binanceId: string | null; binanceNickname: string | null }>({ binanceId: null, binanceNickname: null });
  const [loadingConversion, setLoadingConversion] = useState(false);

  // Binance payment data
  const [binanceTransactionId, setBinanceTransactionId] = useState('');
  const [binanceSenderUserId, setBinanceSenderUserId] = useState('');

  // Bank transfer payment data
  const [isOwnBankAccount, setIsOwnBankAccount] = useState(true);
  const [thirdPartyAccountHolder, setThirdPartyAccountHolder] = useState('');
  const [senderBankName, setSenderBankName] = useState('');

  // Update parent component when Binance data changes
  useEffect(() => {
    if (selectedMethod === 'binance' && onBinanceDataChange) {
      onBinanceDataChange({
        transactionId: binanceTransactionId,
        senderUserId: binanceSenderUserId,
      });
    }
  }, [binanceTransactionId, binanceSenderUserId, selectedMethod, onBinanceDataChange]);

  // Update parent component when bank transfer data changes
  useEffect(() => {
    if (selectedMethod === 'bank_transfer' && onBankTransferDataChange) {
      onBankTransferDataChange({
        isOwnBankAccount,
        thirdPartyAccountHolder,
        senderBankName,
      });
    }
  }, [isOwnBankAccount, thirdPartyAccountHolder, senderBankName, selectedMethod, onBankTransferDataChange]);

  // Fetch USDT conversion when Binance is selected
  useEffect(() => {
    if (selectedMethod !== 'binance' || currency !== 'ARS') {
      return;
    }

    let cancelled = false;

    const fetchConversion = async () => {
      try {
        const res = await fetch(`/api/payments/conversion/usdt?amount=${amount}`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setUsdtAmount(data.conversion.amountUSDT);
          setUsdtRate(data.conversion.rate);
          setBinanceInfo(data.binanceInfo);
        }
      } catch (error) {
        console.error('Error fetching USDT conversion:', error);
      } finally {
        if (!cancelled) {
          setLoadingConversion(false);
        }
      }
    };

    setLoadingConversion(true);
    fetchConversion();

    return () => {
      cancelled = true;
    };
  }, [selectedMethod, amount, currency]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('payments.paymentMethod', 'Payment Method')}
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Total: {currency === 'ARS' ? '$' : currency}{' '}
          {amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="grid gap-3">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.id}
            type="button"
            onClick={() => onMethodChange(method.id)}
            className={`
              relative p-4 rounded-lg border-2 transition-all text-left
              ${
                selectedMethod === method.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">{method.icon}</span>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    {method.name}
                  </h4>
                  {method.badge && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                      {method.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {method.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {method.processing_time}
                  </span>
                </div>
              </div>

              {/* Radio indicator */}
              <div className="ml-4 flex-shrink-0">
                <div
                  className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${
                      selectedMethod === method.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }
                  `}
                >
                  {selectedMethod === method.id && (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Information cards based on selected method */}
      {selectedMethod === 'mercadopago' && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>MercadoPago</strong> - {t('payments.mercadopagoInfo', 'We accept all payment methods: credit/debit cards, bank transfer, cash at payment points (Rapipago, Pago Facil).')}
          </p>
        </div>
      )}

      {selectedMethod === 'binance' && (
        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border-2 border-yellow-200 dark:border-yellow-800">
          <p className="text-sm text-yellow-900 dark:text-yellow-100 mb-3 font-semibold">
            💰 Pago con Binance (Transferencia Manual)
          </p>

          {loadingConversion ? (
            <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-800 dark:border-yellow-200"></div>
              {t('payments.calculatingConversion', 'Calculating conversion...')}
            </div>
          ) : (
            <>
              {/* Conversion info */}
              <div className="mb-3 p-3 bg-white dark:bg-yellow-950 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">{t('payments.amountInARS', 'Amount in ARS')}:</span>
                  <span className="text-lg font-bold text-yellow-900 dark:text-yellow-100">${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">{t('payments.equivalentInUSDT', 'Equivalent in USDT')}:</span>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">{usdtAmount?.toFixed(2) || '0.00'} USDT</span>
                </div>
                {usdtRate && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                    Tasa: 1 USDT = ${usdtRate.toLocaleString('es-AR')} ARS
                  </p>
                )}
              </div>

              {/* Transfer instructions */}
              <div className="bg-white dark:bg-yellow-950 rounded-lg p-3 mb-3">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  {t('payments.transferInstructions', 'Transfer instructions')}:
                </p>
                {binanceInfo.binanceId && (
                  <div className="mb-2">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-1">Binance ID:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded text-sm font-mono">
                        {binanceInfo.binanceId}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(binanceInfo.binanceId || '')}
                        className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
                        title={t('payments.copyBinanceId', 'Copy Binance ID')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                {binanceInfo.binanceNickname && (
                  <div className="mb-2">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-1">Nickname:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 rounded text-sm font-mono">
                        @{binanceInfo.binanceNickname}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(binanceInfo.binanceNickname || '')}
                        className="p-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors"
                        title={t('payments.copyNickname', 'Copy Nickname')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-1">{t('payments.amountToTransfer', 'Amount to transfer')}:</p>
                  <code className="block px-2 py-1 bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100 rounded text-sm font-mono font-bold">
                    {usdtAmount?.toFixed(2) || '0.00'} USDT
                  </code>
                </div>
              </div>

              {/* Additional info */}
              <div className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1 bg-white dark:bg-yellow-950 rounded-lg p-3 mb-3">
                <p className="font-semibold mb-2">{t('payments.importantInfo', 'Important information')}:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>{t('payments.binanceInstr1', 'Send the exact amount in USDT (or its equivalent in Argentine pesos)')}</li>
                  <li>{t('payments.binanceInstr2', 'Accepted cryptocurrencies: USDT, BTC, ETH, BNB, BUSD')}</li>
                  <li>{t('payments.binanceInstr3', 'Recommended network: BSC (BEP20) for lower fees')}</li>
                  <li>{t('payments.binanceInstr4', 'After transferring, fill in the fields below with the transaction details')}</li>
                  <li>{t('payments.binanceInstr5', 'Payment will be verified in 5-15 minutes')}</li>
                </ul>
              </div>

              {/* Transaction Details Input */}
              <div className="bg-white dark:bg-yellow-950 rounded-lg p-3 space-y-3">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                  {t('payments.yourTransferData', 'Your transfer details')}:
                </p>

                <div>
                  <label className="block text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                    {t('payments.yourBinanceId', 'Your Binance ID / Nickname')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={binanceSenderUserId}
                    onChange={(e) => setBinanceSenderUserId(e.target.value)}
                    placeholder={t('payments.binanceIdPlaceholder', 'E.g.: 123456789 or @yourname')}
                    className="w-full px-3 py-2 bg-yellow-50 dark:bg-yellow-900/40 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-900 dark:text-yellow-100 placeholder-yellow-600 dark:placeholder-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                  />
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    {t('payments.binanceIdHelp', 'Your Binance ID or nickname from which you sent the funds')}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                    Transaction ID / Hash <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={binanceTransactionId}
                    onChange={(e) => setBinanceTransactionId(e.target.value)}
                    placeholder={t('payments.txIdPlaceholder', 'E.g.: 0x1234abcd... or Binance TxID')}
                    className="w-full px-3 py-2 bg-yellow-50 dark:bg-yellow-900/40 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-900 dark:text-yellow-100 placeholder-yellow-600 dark:placeholder-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm font-mono"
                  />
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                    {t('payments.txIdHelp', 'The blockchain transaction ID or hash (you can find it in your Binance history)')}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {selectedMethod === 'bank_transfer' && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
          <p className="text-sm text-gray-900 dark:text-gray-100 mb-2">
            <strong>{t('payments.bankTransfer', 'Bank Transfer')}</strong> - {t('payments.bankTransferInfo', 'Make the payment from your bank.')}
          </p>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 mb-4">
            <li>• {t('payments.bankInstr1', 'We will send you the bank details by email')}</li>
            <li>• {t('payments.bankInstr2', 'Processing time: 24-48 business hours')}</li>
            <li>• {t('payments.bankInstr3', 'Send the receipt to soporte@doapp.com')}</li>
          </ul>

          {/* Bank Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('payments.bankName', 'Bank name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={senderBankName}
              onChange={(e) => setSenderBankName(e.target.value)}
              placeholder={t('payments.bankNamePlaceholder', 'E.g.: Banco Galicia, Santander, BBVA, etc.')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('payments.bankNameHelp', 'Name of the bank from which you will make the transfer')}
            </p>
          </div>

          {/* Account Ownership Toggle */}
          <div className="p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isOwnBankAccount}
                onChange={(e) => setIsOwnBankAccount(e.target.checked)}
                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('payments.accountInMyName', 'The bank account is in my name')}
              </span>
            </label>
          </div>

          {/* Third Party Account Holder Field */}
          {!isOwnBankAccount && (
            <div className="animate-fadeIn">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('payments.accountHolderName', 'Account holder name')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={thirdPartyAccountHolder}
                onChange={(e) => setThirdPartyAccountHolder(e.target.value)}
                placeholder={t('payments.accountHolderPlaceholder', 'Full name of the account holder')}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('payments.thirdPartyHelp', 'If the transfer is made by a third party, indicate the account holder name')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
