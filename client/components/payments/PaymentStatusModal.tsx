import { CheckCircle, Clock, AlertCircle, User } from 'lucide-react';

interface PaymentStatusModalProps {
  isOpen: boolean;
  paymentMethod: 'mercadopago' | 'astropay' | 'binance' | 'bank_transfer';
  needsAdminApproval: boolean;
  autoSelectedWorker: boolean;
  workerName?: string;
  onClose: () => void;
}

export default function PaymentStatusModal({
  isOpen,
  paymentMethod,
  needsAdminApproval,
  autoSelectedWorker,
  workerName,
  onClose
}: PaymentStatusModalProps) {
  if (!isOpen) return null;

  const paymentMethodLabels = {
    mercadopago: 'MercadoPago',
    astropay: 'AstroPay',
    binance: 'Binance Pay',
    bank_transfer: 'Transferencia Bancaria'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full shadow-xl animate-scaleIn">
        {/* Header */}
        <div className={`p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 ${
          needsAdminApproval
            ? 'bg-amber-50 dark:bg-amber-900/20'
            : 'bg-green-50 dark:bg-green-900/20'
        }`}>
          <div className="flex items-center gap-3">
            {needsAdminApproval ? (
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            )}
            <h3 className={`text-lg font-bold ${
              needsAdminApproval
                ? 'text-amber-900 dark:text-amber-100'
                : 'text-green-900 dark:text-green-100'
            }`}>
              {needsAdminApproval ? 'Pendiente de Aprobación' : 'Pago Aprobado'}
            </h3>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Payment Method */}
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">MÉTODO DE PAGO</p>
            <p className="text-base font-semibold text-slate-900 dark:text-white">
              {paymentMethodLabels[paymentMethod]}
            </p>
          </div>

          {/* Status Message */}
          <div className={`p-3 rounded-lg ${
            needsAdminApproval
              ? 'bg-amber-100/50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
              : 'bg-green-100/50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
          }`}>
            <p className={`text-sm ${
              needsAdminApproval
                ? 'text-amber-800 dark:text-amber-200'
                : 'text-green-800 dark:text-green-200'
            }`}>
              {needsAdminApproval ? (
                <>
                  Tu pago ha sido registrado pero requiere aprobación del administrador antes de que el trabajo comience.
                  <br />
                  <strong>Tiempo estimado:</strong> 24-48 horas
                </>
              ) : (
                <>
                  ¡Tu pago fue aprobado automáticamente! El trabajo puede comenzar inmediatamente.
                </>
              )}
            </p>
          </div>

          {/* Worker Auto-Selection */}
          {autoSelectedWorker && workerName && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Worker seleccionado automáticamente
                </p>
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>{workerName}</strong> ha sido asignado a este trabajo ya que fue la única propuesta.
              </p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">PRÓXIMOS PASOS</p>
            <div className="space-y-2">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    needsAdminApproval ? 'bg-amber-600' : 'bg-green-600'
                  }`}>
                    1
                  </div>
                  <div className="w-0.5 h-8 bg-slate-300 dark:bg-slate-600 mt-1" />
                </div>
                <div className="pt-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Pago procesado</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Tu dinero está asegurado en escrow</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    needsAdminApproval ? 'bg-slate-400' : 'bg-green-600'
                  }`}>
                    2
                  </div>
                  <div className="w-0.5 h-8 bg-slate-300 dark:bg-slate-600 mt-1" />
                </div>
                <div className="pt-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {needsAdminApproval ? 'Admin aprueba' : 'Aprobado automáticamente'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {needsAdminApproval ? 'En 24-48 horas' : 'Ya completado'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-slate-400">
                    3
                  </div>
                </div>
                <div className="pt-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Trabajo comienza</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Ambas partes aceptan el contrato</p>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
            <div className="flex gap-2 text-xs text-slate-700 dark:text-slate-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>
                Tu dinero está seguro. Será liberado cuando se complete el trabajo y ambas partes confirmen.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
