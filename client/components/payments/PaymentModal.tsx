import { useState } from "react";
import { X } from "lucide-react";
import { PayPalButton } from "./PayPalButton";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  contractTitle: string;
  amount: number;
  recipientName: string;
  escrowEnabled?: boolean;
  onSuccess?: () => void;
}

export function PaymentModal({
  isOpen,
  onClose,
  contractId,
  contractTitle,
  amount,
  recipientName,
  escrowEnabled = false,
  onSuccess,
}: PaymentModalProps) {
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  if (!isOpen) return null;

  const platformFeePercentage = 5; // Should match backend config
  const platformFee = (amount * platformFeePercentage) / 100;
  const totalAmount = amount + platformFee;

  const handleSuccess = (captureId: string) => {
    console.log("Payment captured:", captureId);
    setPaymentSuccess(true);
    setTimeout(() => {
      onSuccess?.();
      onClose();
    }, 2000);
  };

  const handleError = (error: string) => {
    alert(`Error al procesar el pago: ${error}`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Realizar Pago</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {paymentSuccess ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Pago Exitoso!
              </h3>
              <p className="text-gray-600">
                {escrowEnabled
                  ? "Tu pago ha sido depositado en escrow de forma segura."
                  : "El pago ha sido procesado correctamente."}
              </p>
            </div>
          ) : (
            <>
              {/* Payment Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Detalles del Pago
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Contrato:</span>
                    <span className="font-medium text-gray-900">{contractTitle}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Destinatario:</span>
                    <span className="font-medium text-gray-900">{recipientName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Monto del servicio:</span>
                    <span className="font-medium text-gray-900">
                      ${amount.toFixed(2)} USD
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Tarifa de plataforma ({platformFeePercentage}%):
                    </span>
                    <span className="font-medium text-gray-900">
                      ${platformFee.toFixed(2)} USD
                    </span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-gray-900">Total a pagar:</span>
                      <span className="font-bold text-sky-600 text-lg">
                        ${totalAmount.toFixed(2)} USD
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Escrow Notice */}
              {escrowEnabled && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-blue-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-blue-800">
                        Pago protegido con Escrow
                      </h4>
                      <p className="text-sm text-blue-700 mt-1">
                        El dinero se mantendrá seguro hasta que confirmes que el trabajo
                        está completo. Solo entonces se liberará el pago al proveedor del
                        servicio.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* PayPal Button */}
              <div className="mb-4">
                <PayPalButton
                  contractId={contractId}
                  amount={totalAmount}
                  description={`Pago para: ${contractTitle}`}
                  onSuccess={handleSuccess}
                  onError={handleError}
                  onCancel={onClose}
                />
              </div>

              {/* Security Notice */}
              <div className="text-xs text-gray-500 text-center">
                <p>🔒 Pago seguro procesado por PayPal</p>
                <p className="mt-1">
                  Tus datos de pago están protegidos y encriptados
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
